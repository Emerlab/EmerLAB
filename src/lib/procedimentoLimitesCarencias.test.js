import { describe, expect, it } from 'vitest'
import { criarBancoFalso } from './bancoFalsoMemoria.testutil.js'
import { mapearPlanos } from './planosHierarquia.js'
import {
    calcularPendencias,
    calcularPendenciasDasLinhas,
    indexarPlanosConfig,
    limiteGrupoAtivoNoPlano,
    planoIdsAplicaveis,
    salvarLimitesCarenciasProcedimento,
} from './procedimentoLimitesCarencias.js'

const mapaPlanos = mapearPlanos([
    { id: 1, nome: 'Básico' },
    { id: 2, nome: 'Clássico' },
    { id: 3, nome: 'Avançado' },
    { id: 4, nome: 'Ultra' },
    { id: 5, nome: 'Apenas Loja' },
])

const cfg = (plano_id, procedimento, limite = '5', carencia = '30 Dias') => ({
    id: plano_id * 10, plano_id, procedimento, limite, carencia,
})

const contexto = (rows, extra = {}) => ({
    mapaPlanos,
    indiceConfigs: indexarPlanosConfig(rows),
    categorias: [{ id: 23, usa_limite_grupo: false }],
    limitesGrupoRows: [],
    ...extra,
})

const proc = (extra = {}) => ({ codigo: 'OUT2-005', categoriaId: 23, planoBaseId: 2, procedimentoId: 7, ...extra })

describe('planoIdsAplicaveis', () => {
    it('vai do plano base ao Ultra', () => {
        expect(planoIdsAplicaveis(2, mapaPlanos)).toEqual([2, 3, 4])
    })
    it('Apenas loja não tem planos aplicáveis', () => {
        expect(planoIdsAplicaveis(5, mapaPlanos)).toEqual([])
    })
})

describe('calcularPendencias', () => {
    it('base Clássico sem nenhuma linha → pendências nos planos 2, 3 e 4 com faltaLinha', () => {
        const r = calcularPendencias(proc(), contexto([]))
        expect(r.map((p) => [p.planoId, p.faltaLinha])).toEqual([[2, true], [3, true], [4, true]])
    })

    it('tudo preenchido → []', () => {
        const rows = [2, 3, 4].map((p) => cfg(p, 'OUT2-005'))
        expect(calcularPendencias(proc(), contexto(rows))).toEqual([])
    })

    it('carência em branco só no Ultra → uma pendência só de carência', () => {
        const rows = [cfg(2, 'OUT2-005'), cfg(3, 'OUT2-005'), cfg(4, 'OUT2-005', '5', '')]
        expect(calcularPendencias(proc(), contexto(rows))).toEqual([
            { planoId: 4, faltaLinha: false, faltaLimite: false, faltaCarencia: true },
        ])
    })

    it('limite em branco sem limite de grupo → faltaLimite', () => {
        const rows = [cfg(2, 'OUT2-005', ''), cfg(3, 'OUT2-005'), cfg(4, 'OUT2-005')]
        expect(calcularPendencias(proc(), contexto(rows))).toEqual([
            { planoId: 2, faltaLinha: false, faltaLimite: true, faltaCarencia: false },
        ])
    })

    const comGrupo = {
        categorias: [{ id: 23, usa_limite_grupo: true }],
        limitesGrupoRows: [2, 3, 4].map((plano_id) => ({ categoria_id: 23, plano_id, limite: '10' })),
    }
    const rowsSemLimite = [2, 3, 4].map((p) => cfg(p, 'OUT2-005', ''))

    it('limite em branco com limite de grupo ativo no plano → não falta limite', () => {
        expect(calcularPendencias(proc(), contexto(rowsSemLimite, comGrupo))).toEqual([])
    })

    it('procedimento isento (id 23) exige limite individual mesmo com limite de grupo', () => {
        const r = calcularPendencias(proc({ procedimentoId: 23 }), contexto(rowsSemLimite, comGrupo))
        expect(r.map((p) => [p.planoId, p.faltaLimite])).toEqual([[2, true], [3, true], [4, true]])
    })

    it('Apenas loja como plano base → []', () => {
        expect(calcularPendencias(proc({ planoBaseId: 5 }), contexto([]))).toEqual([])
    })

    it('plano_base_id nulo → avalia os 4 planos (Review Focus 1)', () => {
        const r = calcularPendencias(proc({ planoBaseId: null }), contexto([]))
        expect(r.map((p) => p.planoId)).toEqual([1, 2, 3, 4])
    })

    it('código gravado em minúsculas casa com o código maiúsculo (Review Focus 2)', () => {
        const rows = [2, 3, 4].map((p) => cfg(p, 'out2-005'))
        expect(calcularPendencias(proc(), contexto(rows))).toEqual([])
    })

    it('valor só com espaços ou null conta como em branco (Review Focus 3)', () => {
        const rows = [cfg(2, 'OUT2-005', '   ', null), cfg(3, 'OUT2-005'), cfg(4, 'OUT2-005')]
        expect(calcularPendencias(proc(), contexto(rows))).toEqual([
            { planoId: 2, faltaLinha: false, faltaLimite: true, faltaCarencia: true },
        ])
    })
})

describe('indexarPlanosConfig', () => {
    it('indexa por código em maiúsculas e plano; null vira string vazia', () => {
        const idx = indexarPlanosConfig([{ id: 9, plano_id: 3, procedimento: 'abc-001', limite: null, carencia: '30 Dias' }])
        expect(idx.get('ABC-001').get(3)).toEqual({ id: 9, limite: '', carencia: '30 Dias' })
    })
})

describe('limiteGrupoAtivoNoPlano', () => {
    const categorias = [{ id: 23, usa_limite_grupo: true }, { id: 24, usa_limite_grupo: false }]
    const rows = [{ categoria_id: 23, plano_id: 4, limite: ' 10 ' }, { categoria_id: 24, plano_id: 4, limite: '3' }]
    it('devolve o limite do grupo quando a categoria usa e há valor no plano', () => {
        expect(limiteGrupoAtivoNoPlano(categorias, rows, 23, 4)).toBe('10')
    })
    it("devolve '' quando a categoria não usa limite de grupo ou não há linha no plano", () => {
        expect(limiteGrupoAtivoNoPlano(categorias, rows, 24, 4)).toBe('')
        expect(limiteGrupoAtivoNoPlano(categorias, rows, 23, 3)).toBe('')
    })
})

describe('salvarLimitesCarenciasProcedimento', () => {
    const itens = [
        { planoId: 2, limite: '5', carencia: '60 Dias' },
        { planoId: 3, limite: '8', carencia: '60 Dias' },
        { planoId: 4, limite: '10', carencia: '45 Dias' },
    ]

    it('grava todos os planos informados', async () => {
        const { supabase, tab } = criarBancoFalso()
        const r = await salvarLimitesCarenciasProcedimento(supabase, { codigo: 'OUT2-005', itens })
        expect(r).toEqual({ erros: [] })
        expect(tab('planos_config').map((x) => x.plano_id)).toEqual([2, 3, 4])
    })

    it('falha em um plano não impede os demais (Review Focus 4)', async () => {
        const { supabase, tab, falhar } = criarBancoFalso()
        falhar('planos_config', 'insert', (p) => p.plano_id === 3, 'sem permissão')
        const r = await salvarLimitesCarenciasProcedimento(supabase, { codigo: 'OUT2-005', itens })
        expect(r.erros).toEqual([{ planoId: 3, mensagem: 'sem permissão' }])
        expect(tab('planos_config').map((x) => x.plano_id)).toEqual([2, 4])
    })

    it('item só com carência não apaga o limite existente (Important 1)', async () => {
        const { supabase, tab } = criarBancoFalso()
        tab('planos_config').push({ id: 1, plano_id: 4, procedimento: 'OUT2-005', limite: '10', carencia: '' })
        await salvarLimitesCarenciasProcedimento(supabase, { codigo: 'OUT2-005', itens: [{ planoId: 4, carencia: '45 Dias' }] })
        expect(tab('planos_config')[0]).toMatchObject({ limite: '10', carencia: '45 Dias' })
    })

    it('itens vazio → nenhuma chamada ao banco e erros vazio', async () => {
        const { supabase, db } = criarBancoFalso()
        const r = await salvarLimitesCarenciasProcedimento(supabase, { codigo: 'OUT2-005', itens: [] })
        expect(r).toEqual({ erros: [] })
        expect(db.chamadas).toEqual([])
    })
})

describe('calcularPendenciasDasLinhas', () => {
    it('ignora linhas cuja categoria não é exibida e devolve Map por código (Important 2)', () => {
        const linhas = [
            { codigo: 'AAA-001', categoriaId: 23, planoBaseChave: 'ultra', procedimentoId: 1 },
            { codigo: 'BBB-001', categoriaId: 1, planoBaseChave: 'ultra', procedimentoId: 2 },
            { codigo: 'CCC-001', categoriaId: null, planoBaseChave: 'ultra', procedimentoId: 3 },
        ]
        const ctx = { ...contexto([]), categorias: [{ id: 23, usa_limite_grupo: false }] }
        const mapa = calcularPendenciasDasLinhas(linhas, ctx)
        expect([...mapa.keys()]).toEqual(['AAA-001'])
        expect(mapa.get('AAA-001').map((p) => p.planoId)).toEqual([4])
    })
})
