import { describe, expect, it } from 'vitest'
import { mapearPlanos } from './planosHierarquia.js'
import {
    CHAVES_PLANOS_MATRIZ,
    distribuirColagemMatriz,
    linhaTemPendencia,
    montarLinhasMatriz,
    valoresExportacaoLinha,
} from './matrizCarenciasLimites.js'

const planos = [
    { id: 1, nome: 'Básico' },
    { id: 2, nome: 'Clássico' },
    { id: 3, nome: 'Avançado' },
    { id: 4, nome: 'Ultra' },
    { id: 5, nome: 'Apenas Loja' },
]
const mapaPlanos = mapearPlanos(planos)

const procedimentos = [
    { id: 1, codigo: 'AAA-001', nome: 'Base Avançado', categoria_id: 23, plano_base_id: 3 },
    { id: 2, codigo: 'BBB-001', nome: 'Base Básico', categoria_id: 23, plano_base_id: 1 },
    { id: 3, codigo: 'LOJ-001', nome: 'Só loja', categoria_id: 23, plano_base_id: 5 },
    { id: 23, codigo: 'ISE-001', nome: 'Isento', categoria_id: 24, plano_base_id: 1 },
]
const categorias = [
    { id: 23, nome: 'Cirurgias', usa_limite_grupo: false },
    { id: 24, nome: 'Exames', usa_limite_grupo: true },
]
const limitesGrupoRows = [{ categoria_id: 24, plano_id: 4, limite: '10' }]

const montar = (configRows = [], extra = {}) =>
    montarLinhasMatriz({ procedimentos, configRows, planos, mapaPlanos, categorias, limitesGrupoRows, ...extra })

const porCodigo = (linhas, codigo) => linhas.find((l) => l.codigo === codigo)

describe('montarLinhasMatriz', () => {
    it('base Avançado: Básico e Clássico são "acima" derivados, Avançado e Ultra são editáveis', () => {
        const l = porCodigo(montar(), 'AAA-001')
        expect(CHAVES_PLANOS_MATRIZ).toEqual(['basico', 'classico', 'avancado', 'ultra'])
        expect(l.celulas.basico).toMatchObject({ planoId: 1, modo: 'acima', limite: 'Avançado Acima', carencia: 'Avançado Acima' })
        expect(l.celulas.classico).toMatchObject({ modo: 'acima', limite: 'Avançado Acima' })
        expect(l.celulas.avancado).toMatchObject({ planoId: 3, modo: 'editavel', limite: '', carencia: '', configId: null })
        expect(l.celulas.ultra.modo).toBe('editavel')
    })

    it('base Básico: 4 células editáveis; Apenas loja: 4 editáveis e apenasLoja', () => {
        const linhas = montar()
        expect(CHAVES_PLANOS_MATRIZ.map((c) => porCodigo(linhas, 'BBB-001').celulas[c].modo)).toEqual(Array(4).fill('editavel'))
        const loja = porCodigo(linhas, 'LOJ-001')
        expect(loja.apenasLoja).toBe(true)
        expect(CHAVES_PLANOS_MATRIZ.map((c) => loja.celulas[c].modo)).toEqual(Array(4).fill('editavel'))
    })

    it('preenche a célula com a linha de planos_config mesmo gravada em caixa diferente', () => {
        const l = porCodigo(montar([{ id: 77, plano_id: 3, procedimento: 'aaa-001', limite: '5', carencia: '60 Dias' }]), 'AAA-001')
        expect(l.celulas.avancado).toMatchObject({ configId: 77, limite: '5', carencia: '60 Dias' })
    })

    it('limite de grupo ativo vira limiteGrupo; procedimento isento (id 23) fica sem', () => {
        const linhas = montar()
        expect(porCodigo(linhas, 'ISE-001').celulas.ultra.limiteGrupo).toBe('')
        const outros = montarLinhasMatriz({
            procedimentos: [{ id: 9, codigo: 'EXA-009', nome: 'Exame', categoria_id: 24, plano_base_id: 1 }],
            configRows: [], planos, mapaPlanos, categorias, limitesGrupoRows,
        })
        expect(outros[0].celulas.ultra.limiteGrupo).toBe('10')
        expect(outros[0].celulas.avancado.limiteGrupo).toBe('')
    })

    it('ordena por categoria e depois por código', () => {
        expect(montar().map((l) => l.codigo)).toEqual(['AAA-001', 'BBB-001', 'LOJ-001', 'ISE-001'])
    })
})

describe('linhaTemPendencia', () => {
    const completa = (codigo) => {
        const rows = [1, 2, 3, 4].map((p) => ({ id: p, plano_id: p, procedimento: codigo, limite: '5', carencia: '30 Dias' }))
        return porCodigo(montar(rows), codigo)
    }

    it('tudo preenchido → false', () => {
        expect(linhaTemPendencia(completa('BBB-001'))).toBe(false)
    })
    it('carência em branco numa célula editável → true', () => {
        const l = completa('BBB-001')
        l.celulas.classico = { ...l.celulas.classico, carencia: '   ' }
        expect(linhaTemPendencia(l)).toBe(true)
    })
    it('só células acima preenchidas e editáveis vazias → true; células acima não contam', () => {
        expect(linhaTemPendencia(porCodigo(montar(), 'AAA-001'))).toBe(true)
    })
    it('limite vazio coberto por limite de grupo não conta (Review Focus 6)', () => {
        const linhas = montarLinhasMatriz({
            procedimentos: [{ id: 9, codigo: 'EXA-009', nome: 'Exame', categoria_id: 24, plano_base_id: 4 }],
            configRows: [{ id: 1, plano_id: 4, procedimento: 'EXA-009', limite: '', carencia: '30 Dias' }],
            planos, mapaPlanos, categorias, limitesGrupoRows,
        })
        expect(linhaTemPendencia(linhas[0])).toBe(false)
    })
})

describe('distribuirColagemMatriz', () => {
    const linhas = montar()

    it('cola 2 linhas × 2 colunas a partir de Avançado.limite e ignora células "acima"', () => {
        const r = distribuirColagemMatriz({
            linhas, linhaInicial: 0, chaveInicial: 'avancado', campoInicial: 'limite',
            texto: '5\t60 Dias\n8\t45 Dias',
        })
        expect(r).toEqual([
            { linhaIndex: 0, chave: 'avancado', campo: 'limite', valor: '5' },
            { linhaIndex: 0, chave: 'avancado', campo: 'carencia', valor: '60 Dias' },
            { linhaIndex: 1, chave: 'avancado', campo: 'limite', valor: '8' },
            { linhaIndex: 1, chave: 'avancado', campo: 'carencia', valor: '45 Dias' },
        ])
    })

    it('começando em célula acima da base, descarta as não editáveis (Review Focus 4)', () => {
        const r = distribuirColagemMatriz({
            linhas, linhaInicial: 0, chaveInicial: 'basico', campoInicial: 'limite', texto: 'x\ty\tz\tw\tk\tm',
        })
        expect(r.map((i) => `${i.chave}.${i.campo}=${i.valor}`)).toEqual(['avancado.limite=k', 'avancado.carencia=m'])
    })

    it('ignora o excedente além do Ultra e das linhas, linhas vazias e \\r', () => {
        const r = distribuirColagemMatriz({
            linhas, linhaInicial: 1, chaveInicial: 'ultra', campoInicial: 'carencia',
            texto: 'a\tb\tc\r\n\r\nd\r\n',
        })
        expect(r).toEqual([
            { linhaIndex: 1, chave: 'ultra', campo: 'carencia', valor: 'a' },
            { linhaIndex: 2, chave: 'ultra', campo: 'carencia', valor: 'd' },
        ])
    })

    it('ignora valores vazios e limite coberto por grupo', () => {
        const comGrupo = montarLinhasMatriz({
            procedimentos: [{ id: 9, codigo: 'EXA-009', nome: 'Exame', categoria_id: 24, plano_base_id: 1 }],
            configRows: [], planos, mapaPlanos, categorias, limitesGrupoRows,
        })
        const r = distribuirColagemMatriz({
            linhas: comGrupo, linhaInicial: 0, chaveInicial: 'ultra', campoInicial: 'limite', texto: '99\t45 Dias',
        })
        expect(r).toEqual([{ linhaIndex: 0, chave: 'ultra', campo: 'carencia', valor: '45 Dias' }])
        expect(distribuirColagemMatriz({
            linhas, linhaInicial: 0, chaveInicial: 'ultra', campoInicial: 'limite', texto: '\t',
        })).toEqual([])
    })
})

describe('valoresExportacaoLinha', () => {
    it('devolve 8 textos: Acima, grupo e valores nas posições certas', () => {
        const rows = [{ id: 1, plano_id: 3, procedimento: 'AAA-001', limite: '5', carencia: '60 Dias' }]
        const l = porCodigo(montar(rows), 'AAA-001')
        expect(valoresExportacaoLinha(l, 'Cirurgias')).toEqual([
            'Avançado Acima', 'Avançado Acima', 'Avançado Acima', 'Avançado Acima', '5', '60 Dias', '', '',
        ])
        const exame = montarLinhasMatriz({
            procedimentos: [{ id: 9, codigo: 'EXA-009', nome: 'Exame', categoria_id: 24, plano_base_id: 1 }],
            configRows: [], planos, mapaPlanos, categorias, limitesGrupoRows,
        })[0]
        expect(valoresExportacaoLinha(exame, 'Exames')[6]).toBe('Limite 10 no grupo de Exames')
    })
})
