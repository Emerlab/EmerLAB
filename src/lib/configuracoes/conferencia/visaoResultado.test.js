import { describe, expect, it } from 'vitest'
import {
    agruparPorTutor,
    avisoDePeriodo,
    camposIguais,
    contarAbas,
    linhaPertenceAba,
    resumoDePares,
} from './visaoResultado.js'

const par = (i, extra = {}) => ({
    id: `p${i}`,
    status: 'OK',
    honorarios: {},
    mellis: {},
    tutor_honorarios: `Tutor ${i}`,
    tutor_mellislab: `Tutor ${i}`,
    data_honorarios: '2026-09-21',
    data_mellislab: '2026-09-21',
    ...extra,
})
const orfaoLab = (i, data = '2026-10-16') => ({
    id: `l${i}`,
    status: 'ORFAO_MELLISLAB',
    mellis: {},
    tutor_mellislab: `Lab ${i}`,
    data_mellislab: data,
})
const orfaoPlano = (i, data = '2026-09-21') => ({
    id: `o${i}`,
    status: 'ORFAO_HONORARIOS',
    honorarios: {},
    tutor_honorarios: `Plano ${i}`,
    data_honorarios: data,
})

describe('abas do resultado', () => {
    it('conta cada aba e separa órfãos por lado', () => {
        const r = [
            par(1),
            par(2, { status: 'DATA_DIVERGENTE' }),
            par(3, { status: 'VALOR_DIVERGENTE' }),
            par(4, { status: 'REVISAO_MANUAL' }),
            par(5, { status: 'VALOR_ACEITO', aprendido: 'valor_aceito' }),
            orfaoLab(1),
            orfaoPlano(1),
            { ...orfaoPlano(2), revisao: { ignorar: true } },
        ]
        const c = contarAbas(r)
        expect(c).toMatchObject({
            precisam: 5,
            data: 1,
            revisao: 1,
            orf_lab: 1,
            orf_plano: 1,
            valores: 1,
            memoria: 1,
            ok: 2,
            todos: 8,
        })
        expect(linhaPertenceAba(r[5], 'orf_lab')).toBe(true)
    })
})

describe('aviso de período', () => {
    it('avisa quando as faixas de data não se sobrepõem', () => {
        const r = [
            ...Array.from({ length: 12 }, (_, i) => orfaoPlano(i, '2026-09-20')),
            ...Array.from({ length: 12 }, (_, i) => orfaoLab(i, '2026-10-20')),
        ]
        const a = avisoDePeriodo(r)
        expect(a.semSobreposicao).toBe(true)
        expect(a.faixaPlano.de).toBe('2026-09-20')
        expect(a.faixaLab.ate).toBe('2026-10-20')
    })

    it('avisa quando quase nada encontra par, mesmo com datas sobrepostas', () => {
        const r = [
            par(1),
            ...Array.from({ length: 15 }, (_, i) => orfaoPlano(i, '2026-09-21')),
            ...Array.from({ length: 15 }, (_, i) => orfaoLab(i, '2026-09-22')),
        ]
        expect(avisoDePeriodo(r)).toMatchObject({ semSobreposicao: false, pares: 1 })
    })

    it('não avisa quando a maioria forma par ou há poucas linhas', () => {
        expect(avisoDePeriodo(Array.from({ length: 20 }, (_, i) => par(i)))).toBeNull()
        expect(avisoDePeriodo([orfaoLab(1), orfaoPlano(1)])).toBeNull()
    })
})

describe('resumo por pares', () => {
    it('não conta órfãos como conferidos', () => {
        const r = resumoDePares([par(1), par(2, { status: 'DATA_DIVERGENTE' }), orfaoLab(1), orfaoPlano(1)])
        expect(r).toEqual({ pares: 2, paresOk: 1, paresComDiferenca: 1, orfaosLab: 1, orfaosPlano: 1 })
    })
})

describe('comparação de campos', () => {
    it('ignora acento e caixa em texto, mas não troca de nome', () => {
        expect(camposIguais.texto('JOÃO Silva', 'joao  silva')).toBe(true)
        expect(camposIguais.texto('TAIS RIBEIRO PISTORE', 'TAIS PISTORE')).toBe(false)
    })
    it('compara datas ISO e valores com centavos', () => {
        expect(camposIguais.data('2026-09-21', '2026-09-21T00:00:00')).toBe(true)
        expect(camposIguais.data('2026-09-21', '2026-10-16')).toBe(false)
        expect(camposIguais.valor(46, '46.00')).toBe(true)
        expect(camposIguais.valor(46, 52)).toBe(false)
    })
})

describe('agrupar por tutor', () => {
    it('junta quem tem 2+ linhas na posição da primeira e deixa as demais soltas', () => {
        const a = par(1, { tutor_honorarios: 'TERESINHA', tutor_mellislab: 'TERESINHA F' })
        const b = par(2)
        const c = par(3, { tutor_honorarios: 'Teresinha', tutor_mellislab: 'TERESINHA F' })
        const itens = agruparPorTutor([a, b, c])
        expect(itens.map((i) => i.tipo)).toEqual(['grupo', 'linha'])
        expect(itens[0].rows).toEqual([a, c])
        expect(itens[1].r).toBe(b)
    })
})
