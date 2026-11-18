import { describe, it, expect, vi, beforeEach } from 'vitest'

const estado = { respostas: [], upserts: [], opcoes: [], sessao: { user: { id: 'u1' } } }

function builder() {
    const b = {
        select: () => b,
        eq: () => b,
        in: () => b,
        maybeSingle: () => b,
        upsert: (row, opts) => {
            estado.upserts.push(row)
            estado.opcoes.push(opts)
            return b
        },
        then: (res, rej) => Promise.resolve(estado.respostas.shift() ?? { data: null, error: null }).then(res, rej),
    }
    return b
}

vi.mock('../supabase.js', () => ({
    supabase: {
        from: () => builder(),
        auth: { getSession: async () => ({ data: { session: estado.sessao } }) },
    },
}))

import {
    aplicarSelecaoModo,
    montarSelecaoDeCategorias,
    buscarModoImpressaoHonorarios,
    salvarModoImpressaoHonorarios,
    rotuloModoImpressaoHonorarios,
} from './modoImpressaoHonorarios.js'

const cats = () => [
    { id: 1, nome: 'A', ativa: true, linhas: [{ codigo: '10', checked: true }, { codigo: 11, checked: false }] },
    { id: 2, nome: 'B', ativa: false, linhas: [{ codigo: '20', checked: true }] },
]

beforeEach(() => {
    estado.respostas = []
    estado.upserts = []
    estado.opcoes = []
    estado.sessao = { user: { id: 'u1' } }
})

describe('montarSelecaoDeCategorias', () => {
    it('gera v, ordem e mapas por código', () => {
        expect(montarSelecaoDeCategorias([cats()[1], cats()[0]])).toEqual({
            v: 1,
            ordemCategorias: [2, 1],
            categorias: {
                2: { ativa: false, linhas: { 20: true } },
                1: { ativa: true, linhas: { 10: true, 11: false } },
            },
        })
    })
})

describe('aplicarSelecaoModo', () => {
    it('reordena e aplica ativa/checked', () => {
        const sel = montarSelecaoDeCategorias([
            { ...cats()[1], ativa: true, linhas: [{ codigo: '20', checked: false }] },
            cats()[0],
        ])
        const r = aplicarSelecaoModo(cats(), sel)
        expect(r.map((c) => c.id)).toEqual([2, 1])
        expect(r[0].ativa).toBe(true)
        expect(r[0].linhas[0].checked).toBe(false)
        expect(r[1].linhas.map((l) => l.checked)).toEqual([true, false])
    })

    it('categoria nova vai ao fim ativa; procedimento novo entra marcado', () => {
        const sel = montarSelecaoDeCategorias([cats()[1], cats()[0]])
        const atual = [
            { id: 3, nome: 'C', ativa: false, linhas: [{ codigo: '30', checked: false }] },
            { ...cats()[0], linhas: [...cats()[0].linhas, { codigo: '12', checked: false }] },
            cats()[1],
        ]
        const r = aplicarSelecaoModo(atual, sel)
        expect(r.map((c) => c.id)).toEqual([2, 1, 3])
        expect(r[2].ativa).toBe(true)
        expect(r[1].linhas.find((l) => l.codigo === '12').checked).toBe(true)
    })

    it('ignora categoria/código removido', () => {
        const sel = montarSelecaoDeCategorias([...cats(), { id: 9, nome: 'X', ativa: true, linhas: [{ codigo: '90', checked: true }] }])
        sel.categorias[1].linhas['99'] = false
        const r = aplicarSelecaoModo(cats(), sel)
        expect(r.map((c) => c.id)).toEqual([1, 2])
        expect(r[0].linhas).toHaveLength(2)
    })

    it('selecao vazia, null ou inválida devolve iguais', () => {
        for (const s of [{}, null, undefined, 'x', [], { v: 1 }]) {
            expect(aplicarSelecaoModo(cats(), s)).toEqual(cats())
        }
    })

    it('não muta a entrada', () => {
        const entrada = cats()
        const copia = JSON.parse(JSON.stringify(entrada))
        aplicarSelecaoModo(entrada, montarSelecaoDeCategorias([cats()[1], { ...cats()[0], ativa: false }]))
        expect(entrada).toEqual(copia)
    })
})

describe('buscarModoImpressaoHonorarios', () => {
    it('null quando a tabela não existe', async () => {
        estado.respostas = [{ data: null, error: { code: '42P01', message: 'x' } }]
        expect(await buscarModoImpressaoHonorarios(5)).toBeNull()
    })

    it('null quando não há registro', async () => {
        estado.respostas = [{ data: null, error: null }]
        expect(await buscarModoImpressaoHonorarios(5)).toBeNull()
    })

    it('mapeia a linha', async () => {
        const selecao = { v: 1, ordemCategorias: [1], categorias: {} }
        estado.respostas = [
            { data: { selecao, atualizado_em: '2026-11-18T10:00:00Z', atualizado_por: 'u1' }, error: null },
            { data: { name: 'Ana' }, error: null },
        ]
        expect(await buscarModoImpressaoHonorarios(5)).toEqual({
            selecao,
            atualizadoEm: '2026-11-18T10:00:00Z',
            atualizadoPor: 'u1',
            atualizadoPorNome: 'Ana',
        })
    })

    it('lança para erro de permissão', async () => {
        estado.respostas = [{ data: null, error: { code: '42501', message: 'permission denied for table' } }]
        await expect(buscarModoImpressaoHonorarios(5)).rejects.toMatchObject({ code: '42501' })
    })
})

describe('salvarModoImpressaoHonorarios', () => {
    it('faz upsert por cidade_id com usuário da sessão', async () => {
        estado.respostas = [{ data: null, error: null }]
        const r = await salvarModoImpressaoHonorarios(7, cats())
        expect(estado.opcoes[0]).toEqual({ onConflict: 'cidade_id' })
        expect(estado.upserts[0]).toMatchObject({
            cidade_id: 7,
            atualizado_por: 'u1',
            selecao: montarSelecaoDeCategorias(cats()),
        })
        expect(r.selecao).toEqual(montarSelecaoDeCategorias(cats()))
        expect(r.atualizadoPor).toBe('u1')
    })

    it('lança em erro', async () => {
        estado.respostas = [{ data: null, error: { code: '42501', message: 'denied' } }]
        await expect(salvarModoImpressaoHonorarios(7, cats())).rejects.toMatchObject({ code: '42501' })
    })
})

describe('rotuloModoImpressaoHonorarios', () => {
    it('sem modo', () => {
        expect(rotuloModoImpressaoHonorarios(null)).toBe('Ainda sem modo salvo para esta cidade.')
    })
    it('com data e autor', () => {
        const r = rotuloModoImpressaoHonorarios({ atualizadoEm: new Date().toISOString(), atualizadoPorNome: 'Ana' })
        expect(r).toBe('Último PDF: salvo agora · por Ana')
        const h = rotuloModoImpressaoHonorarios({ atualizadoEm: new Date(Date.now() - 2 * 3600_000).toISOString() })
        expect(h).toBe('Último PDF: salvo há 2 h')
    })
})
