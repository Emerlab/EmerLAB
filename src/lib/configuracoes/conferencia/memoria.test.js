import { describe, expect, it } from 'vitest'
import {
    aplicarValoresAceitos,
    chaveValorAceito,
    mapaColunasCompativel,
    mapaColunasParaNomes,
    regraValorAceitoDe,
    resumoDeAprendizado,
} from './memoria.js'

const par = (extra = {}) => ({
    id: 'p1',
    status: 'VALOR_DIVERGENTE',
    honorarios: { exame: 'Ureia' },
    mellis: { exame: 'UREIA' },
    exame_honorarios: 'Ureia',
    valor_honorarios: 46,
    valor_mellislab: 52,
    ...extra,
})

describe('valor aceito lembrado', () => {
    it('chave ignora caixa/acento e usa centavos', () => {
        expect(chaveValorAceito('Ureia', 46, 52)).toBe(chaveValorAceito('UREIA', '46.00', 52.0))
        expect(chaveValorAceito('', 1, 2)).toBe('')
    })

    it('aplica só quando exame e AMBOS os valores batem', () => {
        const regras = [{ exame: 'ureia', valorPlano: 46, valorLab: 52, justificativa: 'tabela nova' }]
        const { resultados, aplicadas } = aplicarValoresAceitos(
            [par(), par({ id: 'p2', valor_mellislab: 53 }), par({ id: 'p3', status: 'OK' })],
            regras,
        )
        expect(aplicadas).toBe(1)
        expect(resultados[0].status).toBe('VALOR_ACEITO')
        expect(resultados[0].aprendido).toBe('valor_aceito')
        expect(resultados[0].motivo).toContain('tabela nova')
        // valor diferente do aceito continua divergente: a memória não esconde diferença nova
        expect(resultados[1].status).toBe('VALOR_DIVERGENTE')
        expect(resultados[2].status).toBe('OK')
    })

    it('sem regras devolve os mesmos resultados', () => {
        const base = [par()]
        expect(aplicarValoresAceitos(base, []).resultados).toBe(base)
    })

    it('regraValorAceitoDe monta a regra a partir da linha', () => {
        expect(regraValorAceitoDe(par())).toMatchObject({ exame: 'Ureia', valorPlano: 46, valorLab: 52 })
        expect(regraValorAceitoDe(par({ valor_mellislab: null }))).toBeNull()
    })
})

describe('colunas lembradas', () => {
    const headers = ['Data', 'Tutor', 'Pet', 'Exame', 'Valor']
    it('converte índices em nomes e volta', () => {
        const nomes = mapaColunasParaNomes({ data: 0, tutor: 1, exame: 3, pet: -1 }, headers)
        expect(nomes).toEqual({ data: 'Data', tutor: 'Tutor', exame: 'Exame' })
        expect(mapaColunasCompativel(nomes, ['EXAME', 'data', 'Tutor', 'x'])).toEqual({ data: 1, tutor: 2, exame: 0 })
    })
    it('arquivo com coluna faltando não reaproveita o mapa', () => {
        expect(mapaColunasCompativel({ data: 'Data', valor: 'Valor total' }, headers)).toBeNull()
        expect(mapaColunasCompativel({}, headers)).toBeNull()
    })
})

describe('resumo de aprendizado', () => {
    it('conta sozinhas, pela memória e as que precisam do usuário', () => {
        const r = resumoDeAprendizado([
            { status: 'OK' },
            { status: 'VALOR_ACEITO', aprendido: 'valor_aceito' },
            { status: 'VALOR_DIVERGENTE' },
            { status: 'ORFAO_MELLISLAB' },
        ])
        expect(r).toMatchObject({ total: 4, sozinhas: 2, percentualSozinhas: 50, precisamDeVoce: 2, resolvidasPelaMemoria: 1 })
    })
})
