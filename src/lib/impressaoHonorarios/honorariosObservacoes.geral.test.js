import { describe, it, expect, vi, beforeEach } from 'vitest'

const respostas = []
const selects = []
const rowsGravadas = []
let rpcChamado = 0

function builder(resolver) {
    const b = {
        select: (sel) => {
            if (typeof sel === 'string') selects.push(sel)
            return b
        },
        order: () => b,
        eq: () => b,
        single: () => b,
        update: (row) => {
            rowsGravadas.push(row)
            return b
        },
        insert: (row) => {
            rowsGravadas.push(row)
            return b
        },
        delete: () => b,
        then: (res, rej) => Promise.resolve(resolver()).then(res, rej),
    }
    return b
}

vi.mock('../supabase.js', () => ({
    supabase: {
        from: () => builder(() => respostas.shift() ?? { data: [], error: null }),
        rpc: async () => {
            rpcChamado += 1
            return { data: null, error: { code: 'PGRST202', message: 'function does not exist' } }
        },
    },
    buscarTodosPaginado: vi.fn(),
}))

import {
    listarHonorariosObservacoes,
    salvarHonorariosObservacao,
    resolverObservacoesHonorariosPorSecoes,
    chaveGrupoHonorarios,
} from './honorariosObservacoes.js'

const linhaRow = (id, geral, codigos = ['A1']) => ({
    id,
    titulo: 'T' + id,
    mensagem: 'M' + id,
    ativa: true,
    ordem: id,
    ...(geral === undefined ? {} : { geral }),
    honorarios_observacoes_procedimentos: codigos.map((c) => ({ procedimento_codigo: c })),
})

beforeEach(() => {
    respostas.length = 0
    selects.length = 0
    rowsGravadas.length = 0
    rpcChamado = 0
})

describe('listarHonorariosObservacoes', () => {
    it('mapeia geral true/false quando a coluna existe', async () => {
        respostas.push({ data: [linhaRow(1, true), linhaRow(2, false)], error: null })
        const r = await listarHonorariosObservacoes()
        expect(r.ok).toBe(true)
        expect(r.itens.map((i) => i.geral)).toEqual([true, false])
        expect(selects[0]).toContain('geral')
    })

    it('refaz o select sem geral quando a coluna não existe', async () => {
        respostas.push({ data: null, error: { code: '42703' } })
        respostas.push({ data: [linhaRow(1), linhaRow(2)], error: null })
        const r = await listarHonorariosObservacoes()
        expect(r.ok).toBe(true)
        expect(r.itens.map((i) => i.geral)).toEqual([false, false])
        expect(selects).toHaveLength(2)
        expect(selects[1]).not.toContain('geral')
    })
})

describe('salvarHonorariosObservacao', () => {
    it('geral não exige procedimentos e grava geral = true', async () => {
        respostas.push({ data: { id: 5 }, error: null })
        respostas.push({ data: [], error: null })
        respostas.push({ error: null })
        const r = await salvarHonorariosObservacao({
            titulo: 'T',
            mensagem: 'M',
            geral: true,
            codigosProcedimentos: [],
        })
        expect(r).toEqual({ ok: true, id: 5 })
        expect(rpcChamado).toBe(0)
        expect(rowsGravadas[0].geral).toBe(true)
    })

    it('não geral sem procedimentos continua com erro', async () => {
        const r = await salvarHonorariosObservacao({ titulo: 'T', mensagem: 'M', codigosProcedimentos: [] })
        expect(r.ok).toBe(false)
        expect(r.erro).toMatch(/Vincule ao menos um procedimento/)
    })

    it('geral com coluna ausente devolve erro de migração', async () => {
        respostas.push({ data: null, error: { code: '42703' } })
        const r = await salvarHonorariosObservacao({
            titulo: 'T',
            mensagem: 'M',
            geral: true,
            codigosProcedimentos: [],
        })
        expect(r).toEqual({
            ok: false,
            erro: 'Coluna geral ausente no banco. Aplique a migração de observações gerais.',
        })
    })

    it('não geral com coluna ausente regrava sem geral', async () => {
        respostas.push({ data: null, error: { code: '42703' } })
        respostas.push({ data: { id: 7 }, error: null })
        respostas.push({ data: [], error: null })
        respostas.push({ error: null })
        respostas.push({ error: null })
        const r = await salvarHonorariosObservacao({
            titulo: 'T',
            mensagem: 'M',
            codigosProcedimentos: ['A1'],
        })
        expect(r).toEqual({ ok: true, id: 7 })
        expect('geral' in rowsGravadas[1]).toBe(false)
    })
})

describe('resolverObservacoesHonorariosPorSecoes', () => {
    const secoes = [
        { categoriaNome: 'Cat A', linhas: [{ codigo: 'A1' }] },
        { nome: 'Sec B', linhas: [{ codigo: 'A1' }, { codigo: 'B1' }] },
        { linhas: [{ codigo: 'C1', checked: false }] },
    ]

    it('chaveGrupoHonorarios usa categoriaNome, nome ou Categoria', () => {
        expect(chaveGrupoHonorarios(secoes[0])).toBe('Cat A')
        expect(chaveGrupoHonorarios(secoes[1])).toBe('Sec B')
        expect(chaveGrupoHonorarios({})).toBe('Categoria')
    })

    it('geral só em gerais; vinculada vai ao grupo dos seus procedimentos', async () => {
        respostas.push({
            data: [linhaRow(1, true, []), linhaRow(2, false, ['A1']), linhaRow(3, false, ['B1'])],
            error: null,
        })
        const r = await resolverObservacoesHonorariosPorSecoes(secoes)
        expect(r.gerais).toEqual([{ titulo: 'T1', mensagem: 'M1' }])
        // A1 existe nas duas seções → T2 sai nas duas; B1 só na 'Sec B'.
        expect(r.porGrupo['Cat A']).toEqual([{ titulo: 'T2', mensagem: 'M2' }])
        expect(r.porGrupo['Sec B']).toEqual([
            { titulo: 'T2', mensagem: 'M2' },
            { titulo: 'T3', mensagem: 'M3' },
        ])
    })

    it('observação ligada a procedimentos de dois grupos aparece nos dois', async () => {
        respostas.push({ data: [linhaRow(4, false, ['A1', 'B1'])], error: null })
        const r = await resolverObservacoesHonorariosPorSecoes(secoes)
        expect(r.porGrupo['Cat A']).toEqual([{ titulo: 'T4', mensagem: 'M4' }])
        expect(r.porGrupo['Sec B']).toEqual([{ titulo: 'T4', mensagem: 'M4' }])
        expect(r.gerais).toEqual([])
    })

    it('ignora linhas desmarcadas', async () => {
        respostas.push({ data: [linhaRow(2, false, ['C1'])], error: null })
        expect(await resolverObservacoesHonorariosPorSecoes(secoes)).toEqual({ porGrupo: {}, gerais: [] })
    })

    it('falha na listagem devolve vazio', async () => {
        respostas.push({ data: null, error: { message: 'boom' } })
        expect(await resolverObservacoesHonorariosPorSecoes(secoes)).toEqual({ porGrupo: {}, gerais: [] })
    })
})
