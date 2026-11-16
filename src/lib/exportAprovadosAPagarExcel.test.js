import { describe, expect, it } from 'vitest'
import { montarLinhasAprovadosAPagar } from './exportAprovadosAPagarExcel.js'

const grupo = (tipoRepasse, valores) => ({
    prestadorNome: 'Dra. Teste',
    tipoRepasse,
    chavePix: 'pix@x',
    meses: valores.map((valor, i) => ({ id: String(i), mes: i + 1, ano: 2026, valor, atualizadoEm: null })),
})

describe('exportação de Aprovados a pagar', () => {
    it('RPA: desconta 11% em cada mês, não sobre o total', () => {
        const { resumo, meses } = montarLinhasAprovadosAPagar([grupo('rpa', ['100.00', '33.33', '50.55'])])
        expect(meses.map((m) => m.aPagar)).toEqual([89, 29.66, 44.99])
        expect(resumo[0].bruto).toBe(183.88)
        expect(resumo[0].aPagar).toBe(163.65)
        expect(resumo[0].desconto).toBe(20.23)
        expect(resumo[0].qtdMeses).toBe(3)
    })

    it('nota: sem desconto', () => {
        const { resumo } = montarLinhasAprovadosAPagar([grupo('nota', ['100', '200'])])
        expect(resumo[0]).toMatchObject({ bruto: 300, desconto: 0, aPagar: 300 })
    })
})
