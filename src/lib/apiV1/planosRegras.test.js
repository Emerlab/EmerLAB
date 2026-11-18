import { describe, expect, it } from 'vitest'
import { codigosMarcados, escolherSelecao, montarTabelaPublica } from './planosRegras.js'

const PLANOS = [
    { id: 1, nome: 'Básico' },
    { id: 2, nome: 'Clássico' },
    { id: 3, nome: 'Avançado' },
    { id: 4, nome: 'Ultra' },
    { id: 9, nome: 'Apenas loja' },
]

const CATEGORIAS = [
    { id: 10, nome: 'Consultas', usa_limite_grupo: false },
    { id: 20, nome: 'Exames', usa_limite_grupo: true },
    { id: 30, nome: 'Vazia', usa_limite_grupo: false },
]

function entradaBase(extra = {}) {
    const procedimentos = [
        { id: 1, codigo: 'A1', nome: 'Consulta clínica', categoria_id: 10, plano_base_id: 1 },
        { id: 2, codigo: 'B1', nome: 'Radiografia simples', categoria_id: 20, plano_base_id: 1 },
        { id: 23, codigo: 'B2', nome: 'Hemograma', categoria_id: 20, plano_base_id: 1 },
        { id: 4, codigo: 'C1', nome: 'Produto loja', categoria_id: 10, plano_base_id: 9 },
        { id: 5, codigo: 'D1', nome: 'Pouco realizado', categoria_id: 30, plano_base_id: 1 },
    ]
    return {
        cidade: { id: 7, nome: 'Curitiba', uf: 'PR' },
        planoId: 2,
        planos: PLANOS,
        categorias: CATEGORIAS,
        procedimentos,
        diferencaPorCodigo: new Map([
            ['A1', 0],
            ['B1', 35.5],
            ['B2', 10],
            ['C1', 0],
            ['D1', 0],
        ]),
        configPorCodigo: new Map([
            ['A1', { limite: '2 por ano', carencia: '30 dias' }],
            ['B1', { limite: '1 por ano', carencia: '' }],
            ['B2', { limite: '3 por ano', carencia: '60 dias' }],
        ]),
        limitesGrupo: [{ categoria_id: 20, plano_id: 2, limite: '5 por ano' }],
        realizadoresPorCodigo: new Map([
            ['A1', [1, 2, 3]],
            ['B1', [1, 2, 3, 4]],
            ['B2', [1, 2, 3]],
            ['C1', [1, 2, 3, 4, 5]],
            ['D1', [1, 2]],
        ]),
        nomesAlternativosPorCodigo: new Map([['B1', ['Raio-X']]]),
        modoSite: null,
        modoImpressao: null,
        observacoes: [],
        ...extra,
    }
}

const codigosExibidos = (tabela) => tabela.grupos.flatMap((g) => g.procedimentos.map((p) => p.codigo))
const procedimento = (tabela, codigo) =>
    tabela.grupos.flatMap((g) => g.procedimentos).find((p) => p.codigo === codigo)

describe('codigosMarcados', () => {
    it('null para seleção nula ou vazia', () => {
        expect(codigosMarcados(null)).toBeNull()
        expect(codigosMarcados({})).toBeNull()
    })

    it('códigos maiúsculos das chaves marcadas', () => {
        const s = codigosMarcados({ 'a1|base': true, 'B1|base': false, 'B2|raio x': true })
        expect([...s].sort()).toEqual(['A1', 'B2'])
    })
})

describe('escolherSelecao', () => {
    const site = { selecao: { 'A1|base': true } }
    const impressao = { selecao: { 'B1|base': true } }

    it('prefere site, depois impressão, depois padrão', () => {
        expect(escolherSelecao({ modoSite: site, modoImpressao: impressao }).origem).toBe('site')
        expect([...escolherSelecao({ modoSite: site, modoImpressao: impressao }).codigos]).toEqual(['A1'])
        expect(escolherSelecao({ modoSite: null, modoImpressao: impressao }).origem).toBe('impressao')
        expect(escolherSelecao({ modoSite: { selecao: {} }, modoImpressao: impressao }).origem).toBe('impressao')
        const padrao = escolherSelecao({ modoSite: null, modoImpressao: null })
        expect(padrao).toEqual({ origem: 'padrao', codigos: null })
    })
})

describe('montarTabelaPublica', () => {
    it('com modo salvo marcando A1|base, só A1 aparece', () => {
        const t = montarTabelaPublica(entradaBase({ modoImpressao: { selecao: { 'A1|base': true } } }))
        expect(t.origem_selecao).toBe('impressao')
        expect(codigosExibidos(t)).toEqual(['A1'])
    })

    it('sem modo, aparece quem tem 3 ou mais realizadores e não quem tem 2', () => {
        const t = montarTabelaPublica(entradaBase())
        expect(t.origem_selecao).toBe('padrao')
        expect(codigosExibidos(t)).toEqual(['A1', 'B1', 'B2'])
        expect(codigosExibidos(t)).not.toContain('D1')
    })

    it('procedimento marcado mas sem realizador não aparece', () => {
        const e = entradaBase({ modoSite: { selecao: { 'A1|base': true, 'B1|base': true } } })
        e.realizadoresPorCodigo.set('B1', [])
        const t = montarTabelaPublica(e)
        expect(codigosExibidos(t)).toEqual(['A1'])
    })

    it('"apenas loja" não aparece, mesmo marcado', () => {
        const t1 = montarTabelaPublica(entradaBase())
        expect(codigosExibidos(t1)).not.toContain('C1')
        const t2 = montarTabelaPublica(entradaBase({ modoSite: { selecao: { 'C1|base': true, 'A1|base': true } } }))
        expect(codigosExibidos(t2)).toEqual(['A1'])
    })

    it('categoria sem procedimento exibido some; grupos na ordem das categorias e procedimentos por código', () => {
        const t = montarTabelaPublica(entradaBase())
        expect(t.grupos.map((g) => g.id)).toEqual([10, 20])
        expect(t.grupos[1].procedimentos.map((p) => p.codigo)).toEqual(['B1', 'B2'])
    })

    it('limite de grupo substitui o individual; procedimento 23 usa o individual', () => {
        const t = montarTabelaPublica(entradaBase())
        const exames = t.grupos.find((g) => g.id === 20)
        expect(exames.limite_grupo).toBe('5 por ano')
        expect(procedimento(t, 'B1').limite).toBe('Limite 5 por ano no grupo de Exames')
        expect(procedimento(t, 'B2').limite).toBe('3 por ano')
        expect(procedimento(t, 'A1').limite).toBe('2 por ano')
        expect(t.grupos.find((g) => g.id === 10).limite_grupo).toBeNull()
    })

    it('campos do procedimento: carência, diferença em número, realizadores', () => {
        const t = montarTabelaPublica(entradaBase())
        const b1 = procedimento(t, 'B1')
        expect(b1).toMatchObject({ codigo: 'B1', nome: 'Radiografia simples', carencia: null, diferenca: 35.5, realizadores: 4 })
        expect(procedimento(t, 'A1').carencia).toBe('30 dias')
        expect(t.plano).toEqual({ id: 2, chave: 'classico', nome: 'Clássico' })
        expect(t.cidade).toEqual({ id: 7, nome: 'Curitiba', uf: 'PR' })
    })

    it('observações: vínculo só com exibidos, geral ativa em observacoes_gerais, inativa e vazia não saem', () => {
        const observacoes = [
            { id: 1, titulo: 'Liga A1 e D1', mensagem: 'msg 1', ativa: true, geral: false, ordem: 1, codigosProcedimentos: ['A1', 'D1'] },
            { id: 2, titulo: 'Só não exibido', mensagem: 'msg 2', ativa: true, geral: false, ordem: 2, codigosProcedimentos: ['D1'] },
            { id: 3, titulo: 'Geral', mensagem: 'msg 3', ativa: true, geral: true, ordem: 3, codigosProcedimentos: ['A1'] },
            { id: 4, titulo: 'Inativa', mensagem: 'msg 4', ativa: false, geral: false, ordem: 4, codigosProcedimentos: ['A1'] },
            { id: 5, titulo: 'Vazia', mensagem: '  ', ativa: true, geral: false, ordem: 5, codigosProcedimentos: ['A1'] },
            { id: 6, titulo: 'Geral inativa', mensagem: 'msg 6', ativa: false, geral: true, ordem: 6, codigosProcedimentos: [] },
        ]
        const t = montarTabelaPublica(entradaBase({ observacoes }))
        expect(procedimento(t, 'A1').observacoes).toEqual([1])
        expect(procedimento(t, 'B1').observacoes).toEqual([])
        expect(t.observacoes_gerais).toEqual([3])
        expect(Object.keys(t.observacoes).sort()).toEqual(['1', '3'])
        expect(t.observacoes['1']).toEqual({ id: 1, titulo: 'Liga A1 e D1', mensagem: 'msg 1', geral: false })
        expect(t.observacoes['3'].geral).toBe(true)
    })

    it('observação ligada a A1 e B1 com só A1 exibido sai uma vez, em A1', () => {
        const observacoes = [
            { id: 8, titulo: 'T', mensagem: 'm', ativa: true, geral: false, ordem: 1, codigosProcedimentos: ['a1', 'B1'] },
        ]
        const t = montarTabelaPublica(entradaBase({ observacoes, modoSite: { selecao: { 'A1|base': true } } }))
        expect(codigosExibidos(t)).toEqual(['A1'])
        expect(procedimento(t, 'A1').observacoes).toEqual([8])
        expect(Object.keys(t.observacoes)).toEqual(['8'])
    })

    it('nome alternativo "Raio-X" vira termo', () => {
        const t = montarTabelaPublica(entradaBase())
        expect(procedimento(t, 'B1').termos).toContain('raio-x')
        expect(procedimento(t, 'B1').termos).toContain('raio x')
    })

    it('cidade sem nenhum procedimento selecionável devolve grupos vazios', () => {
        const e = entradaBase()
        e.realizadoresPorCodigo = new Map()
        const t = montarTabelaPublica(e)
        expect(t.grupos).toEqual([])
        expect(t.observacoes_gerais).toEqual([])
    })
})
