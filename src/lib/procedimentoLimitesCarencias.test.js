import { describe, expect, it } from 'vitest'
import { criarBancoFalso } from './bancoFalsoMemoria.testutil.js'
import { mapearPlanos } from './planosHierarquia.js'
import {
    calcularPendencias,
    calcularPendenciasDasLinhas,
    diagnosticarAcima,
    ehParAcima,
    indexarPlanosConfig,
    limiteGrupoAtivoNoPlano,
    planoIdsAbaixoDaBase,
    planoIdsAplicaveis,
    salvarLimitesCarenciasProcedimento,
    sincronizarAcimaProcedimento,
    textoAcima,
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
    it('Apenas loja tem as 4 colunas aplicáveis', () => {
        expect(planoIdsAplicaveis(5, mapaPlanos)).toEqual([1, 2, 3, 4])
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

    it('Apenas loja como plano base → avalia os 4 planos', () => {
        expect(calcularPendencias(proc({ planoBaseId: 5 }), contexto([])).map((p) => p.planoId)).toEqual([1, 2, 3, 4])
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

const planosLista = [
    { id: 1, nome: 'Básico' },
    { id: 2, nome: 'Clássico' },
    { id: 3, nome: 'Avançado' },
    { id: 4, nome: 'Ultra' },
    { id: 5, nome: 'Apenas Loja' },
]
const ctxAcima = (rows) => ({ mapaPlanos, planos: planosLista, indiceConfigs: indexarPlanosConfig(rows) })

describe('textoAcima / ehParAcima', () => {
    it('monta o texto com o nome do plano base', () => {
        expect(textoAcima('Avançado')).toBe('Avançado Acima')
    })
    it('par Acima é reconhecido sem distinguir caixa', () => {
        expect(ehParAcima('Avançado Acima', 'avançado acima')).toBe(true)
    })
    it('só um dos campos com Acima não é par (Review Focus 3)', () => {
        expect(ehParAcima('Avançado Acima', '45 Dias')).toBe(false)
        expect(ehParAcima('', '')).toBe(false)
    })
})

describe('planoIdsAbaixoDaBase', () => {
    it('base Avançado → Básico e Clássico', () => {
        expect(planoIdsAbaixoDaBase(3, mapaPlanos)).toEqual([1, 2])
    })
    it('Básico e Apenas loja não têm planos abaixo (Review Focus 1)', () => {
        expect(planoIdsAbaixoDaBase(1, mapaPlanos)).toEqual([])
        expect(planoIdsAbaixoDaBase(5, mapaPlanos)).toEqual([])
    })
})

describe('diagnosticarAcima', () => {
    const proc3 = { codigo: 'OUT2-005', planoBaseId: 3 }

    it('base Avançado sem linhas → faltando nos planos 1 e 2 com o texto Acima', () => {
        expect(diagnosticarAcima(proc3, ctxAcima([]))).toEqual([
            { planoId: 1, tipo: 'faltando', limite: 'Avançado Acima', carencia: 'Avançado Acima' },
            { planoId: 2, tipo: 'faltando', limite: 'Avançado Acima', carencia: 'Avançado Acima' },
        ])
    })

    it('linha abaixo da base com texto de outro plano → divergente', () => {
        const rows = [cfg(1, 'OUT2-005', 'Avançado Acima', 'Avançado Acima'), cfg(2, 'OUT2-005', 'Clássico Acima', 'Clássico Acima')]
        expect(diagnosticarAcima(proc3, ctxAcima(rows))).toEqual([
            { planoId: 2, tipo: 'divergente', limite: 'Avançado Acima', carencia: 'Avançado Acima' },
        ])
    })

    it('par Acima velho em plano editável → acima-velho com valores em branco', () => {
        const rows = [
            cfg(1, 'OUT2-005', 'Avançado Acima', 'Avançado Acima'),
            cfg(2, 'OUT2-005', 'Avançado Acima', 'Avançado Acima'),
            cfg(3, 'OUT2-005', 'Clássico Acima', 'Clássico Acima'),
        ]
        expect(diagnosticarAcima(proc3, ctxAcima(rows))).toEqual([
            { planoId: 3, tipo: 'acima-velho', limite: '', carencia: '' },
        ])
    })

    it('Acima em só um dos campos num plano editável não é tocado (Review Focus 3)', () => {
        const rows = [
            cfg(1, 'OUT2-005', 'Avançado Acima', 'Avançado Acima'),
            cfg(2, 'OUT2-005', 'Avançado Acima', 'Avançado Acima'),
            cfg(3, 'OUT2-005', '5', 'Clássico Acima'),
        ]
        expect(diagnosticarAcima(proc3, ctxAcima(rows))).toEqual([])
    })
})

describe('sincronizarAcimaProcedimento', () => {
    const base = (id) => ({ codigo: 'OUT2-005', planoBaseId: id, mapaPlanos, planos: planosLista })

    it('base Avançado, banco vazio → cria as linhas Acima dos planos 1 e 2', async () => {
        const { supabase, tab } = criarBancoFalso()
        const r = await sincronizarAcimaProcedimento(supabase, base(3))
        expect(r).toEqual({ erros: [] })
        expect(tab('planos_config').map(({ id, ...x }) => x)).toEqual([
            { plano_id: 1, procedimento: 'OUT2-005', limite: 'Avançado Acima', carencia: 'Avançado Acima' },
            { plano_id: 2, procedimento: 'OUT2-005', limite: 'Avançado Acima', carencia: 'Avançado Acima' },
        ])
    })

    it('troca de base Avançado → Clássico: plano 1 vira Clássico Acima e o 2 é zerado (Review Focus 2)', async () => {
        const { supabase, tab } = criarBancoFalso()
        tab('planos_config').push(
            { id: 1, plano_id: 1, procedimento: 'OUT2-005', limite: 'Avançado Acima', carencia: 'Avançado Acima' },
            { id: 2, plano_id: 2, procedimento: 'OUT2-005', limite: 'Avançado Acima', carencia: 'Avançado Acima' },
        )
        await sincronizarAcimaProcedimento(supabase, base(2))
        expect(tab('planos_config')).toEqual([
            { id: 1, plano_id: 1, procedimento: 'OUT2-005', limite: 'Clássico Acima', carencia: 'Clássico Acima' },
            { id: 2, plano_id: 2, procedimento: 'OUT2-005', limite: '', carencia: '' },
        ])
    })

    it('base Básico → nenhuma escrita (Review Focus 1)', async () => {
        const { supabase, db } = criarBancoFalso()
        await sincronizarAcimaProcedimento(supabase, base(1))
        expect(db.chamadas.filter((c) => c.startsWith('insert') || c.startsWith('update'))).toEqual([])
    })

    it('falha no plano 1 não impede o plano 2 e vem em erros', async () => {
        const { supabase, tab, falhar } = criarBancoFalso()
        falhar('planos_config', 'insert', (p) => p.plano_id === 1, 'sem permissão')
        const r = await sincronizarAcimaProcedimento(supabase, base(3))
        expect(r.erros).toEqual([{ planoId: 1, mensagem: 'sem permissão' }])
        expect(tab('planos_config').map((x) => x.plano_id)).toEqual([2])
    })
})
