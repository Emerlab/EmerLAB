import { beforeEach, describe, expect, it, vi } from 'vitest'

// Cliente Supabase falso: registra filtros e upserts e permite simular o banco sem a coluna `finalidade`.
const chamadas = []
let semColuna = false
let linhaPorFinalidade = {}

function tabela(nome) {
    const filtros = {}
    const registro = { nome, filtros, upserts: [] }
    chamadas.push(registro)
    const erroColuna = { code: '42703', message: 'column impressao_planos_modos.finalidade does not exist' }
    const resultadoLeitura = () => {
        if (semColuna && 'finalidade' in filtros) return { data: null, error: erroColuna }
        const alvo = filtros.finalidade ?? 'impressao'
        const linha = linhaPorFinalidade[alvo]
        return { data: linha ?? null, error: null }
    }
    const b = {
        select: () => b,
        eq: (k, v) => ((filtros[k] = v), b),
        in: () => Promise.resolve({ data: [], error: null }),
        upsert: (row, opcoes) => {
            registro.upserts.push({ row, opcoes })
            if (semColuna && 'finalidade' in row) return { select: () => ({ maybeSingle: async () => ({ data: null, error: erroColuna }) }) }
            return { select: () => ({ maybeSingle: async () => ({ data: { selecao: row.selecao, atualizado_em: row.atualizado_em, atualizado_por: null }, error: null }) }) }
        },
        maybeSingle: async () => (nome === 'profiles' ? { data: null, error: null } : resultadoLeitura()),
        then: (res, rej) => Promise.resolve(resultadoLeitura().error ? resultadoLeitura() : { data: Object.values(linhaPorFinalidade).filter(Boolean), error: null }).then(res, rej),
    }
    return b
}

vi.mock('../supabase.js', () => ({
    supabase: {
        from: (nome) => tabela(nome),
        auth: { getSession: async () => ({ data: { session: { user: { id: 'u1' } } } }) },
    },
}))

const cats = [{ linhas: [{ linhaKey: 'A1|base', checked: true }] }]

let mod
beforeEach(async () => {
    chamadas.length = 0
    semColuna = false
    linhaPorFinalidade = {
        impressao: { selecao: { 'A1|base': true }, atualizado_em: '2026-11-18T10:00:00Z', atualizado_por: null },
        site: { selecao: { 'B2|base': true }, atualizado_em: '2026-11-18T11:00:00Z', atualizado_por: null },
    }
    mod = await import('./modoImpressaoPlanos.js')
})

const doModos = () => chamadas.filter((c) => c.nome === 'impressao_planos_modos')

describe('finalidade nos filtros e no upsert', () => {
    it('padrão continua impressao', async () => {
        const r = await mod.buscarModoImpressaoPlanos(1, 2)
        expect(doModos()[0].filtros.finalidade).toBe('impressao')
        expect(r.selecao).toEqual({ 'A1|base': true })
    })

    it('finalidade site chega ao filtro e devolve a seleção do site', async () => {
        const r = await mod.buscarModoImpressaoPlanos(1, 2, 'site')
        expect(doModos()[0].filtros.finalidade).toBe('site')
        expect(r.selecao).toEqual({ 'B2|base': true })
    })

    it('listarModosDaCidade filtra pela finalidade', async () => {
        await mod.listarModosDaCidade(2, 'site')
        expect(doModos()[0].filtros).toMatchObject({ cidade_id: 2, finalidade: 'site' })
    })

    it('salvar grava a finalidade e usa o conflito com a finalidade', async () => {
        await mod.salvarModoImpressaoPlanos(1, 2, cats, 'site')
        const up = doModos()[0].upserts[0]
        expect(up.row.finalidade).toBe('site')
        expect(up.opcoes.onConflict).toBe('plano_id,cidade_id,finalidade')
    })
})

describe('banco sem a coluna finalidade (antes da migração)', () => {
    beforeEach(() => {
        semColuna = true
    })

    it('buscar/listar com impressao refazem sem o filtro', async () => {
        const r = await mod.buscarModoImpressaoPlanos(1, 2, 'impressao')
        expect(r.selecao).toBeTruthy()
        expect(doModos().some((c) => !('finalidade' in c.filtros))).toBe(true)
        const l = await mod.listarModosDaCidade(2, 'impressao')
        expect(Array.isArray(l)).toBe(true)
    })

    it('buscar/listar com site devolvem vazio, sem erro', async () => {
        expect(await mod.buscarModoImpressaoPlanos(1, 2, 'site')).toBeNull()
        expect(await mod.listarModosDaCidade(2, 'site')).toEqual([])
    })

    it('salvar impressao refaz o upsert antigo; salvar site retorna o erro da migração', async () => {
        await mod.salvarModoImpressaoPlanos(1, 2, cats, 'impressao')
        const ups = doModos().flatMap((c) => c.upserts)
        expect(ups[ups.length - 1].opcoes.onConflict).toBe('plano_id,cidade_id')
        expect(ups[ups.length - 1].row).not.toHaveProperty('finalidade')
        await expect(mod.salvarModoImpressaoPlanos(1, 2, cats, 'site')).rejects.toThrow('Coluna finalidade ausente no banco. Aplique a migração do preset do site.')
    })
})

describe('copiarModoParaFinalidade', () => {
    it('grava em `para` a seleção lida de `de`', async () => {
        await mod.copiarModoParaFinalidade(1, 2, 'impressao', 'site')
        const up = doModos().flatMap((c) => c.upserts).pop()
        expect(up.row.finalidade).toBe('site')
        expect(up.row.selecao).toEqual({ 'A1|base': true })
    })
})

describe('rotuloModoImpressao', () => {
    it('o texto do PDF não mudou e o do site diz qual é', () => {
        expect(mod.rotuloModoImpressao(null)).toBe('Ainda sem modo salvo para este plano e cidade.')
        expect(mod.rotuloModoImpressao(null, 'site')).toContain('site')
    })
})
