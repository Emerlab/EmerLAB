import { describe, expect, it } from 'vitest'
import {
    parsearValorMonetario,
    matrizDeHtmlTabela,
    matrizDeWorksheetXmlXlsx,
    linhaConferenciaTemRegistro,
    normalizarNomeExame,
} from './conferenciaLaboratorioExcel.js'
import { precoNegociacaoUtil } from './conferenciaLaboratorioPrecos.js'

describe('parsearValorMonetario', () => {
    it('parseia BR', () => {
        expect(parsearValorMonetario('R$ 1.234,56')).toBeCloseTo(1234.56)
    })
})

describe('matrizDeHtmlTabela', () => {
    it('lê tabela HTML de relatório', () => {
        const html = `<html><table>
          <tr><td>Tutor</td><td>Animal</td><td>Data</td><td>Exame</td></tr>
          <tr><td>Ana</td><td>Thor</td><td>01/08/2026</td><td>ALT</td></tr>
        </table></html>`
        const m = matrizDeHtmlTabela(html)
        expect(m[0]).toEqual(['Tutor', 'Animal', 'Data', 'Exame'])
        expect(m[1][0]).toBe('Ana')
        expect(m[1][3]).toBe('ALT')
    })
})

describe('matrizDeWorksheetXmlXlsx', () => {
    it('resolve shared strings e colunas esparsas', () => {
        const xml = `<worksheet><sheetData>
          <row r="1">
            <c r="A1" t="s"><v>0</v></c>
            <c r="C1"><v>45812</v></c>
          </row>
        </sheetData></worksheet>`
        const m = matrizDeWorksheetXmlXlsx(xml, ['Tutor'])
        expect(m[0][0]).toBe('Tutor')
        expect(m[0][1]).toBe('')
        expect(m[0][2]).toBe('45812')
    })

    it('não trata shared string vazia como índice 0', () => {
        const xml = `<worksheet><sheetData>
          <row r="2">
            <c r="A2" t="s"><v></v></c>
            <c r="B2" t="s"><v>  </v></c>
          </row>
        </sheetData></worksheet>`
        const m = matrizDeWorksheetXmlXlsx(xml, ['NAO_DEVE_APARECER'])
        expect(m.length).toBe(0)
    })
})

describe('linhaConferenciaTemRegistro', () => {
    it('aceita tutor + exame com nome', () => {
        expect(
            linhaConferenciaTemRegistro({
                tutor: 'Ana Silva',
                pet: 'Thor',
                exame: 'ALT',
            }),
        ).toBe(true)
    })

    it('rejeita linha só com número / placeholder', () => {
        expect(linhaConferenciaTemRegistro({ tutor: '', pet: '', exame: '97' })).toBe(false)
        expect(linhaConferenciaTemRegistro({ tutor: '--', pet: '-', exame: '—' })).toBe(false)
        expect(linhaConferenciaTemRegistro({ tutor: 'Total', pet: '', exame: 'ALT' })).toBe(false)
        expect(linhaConferenciaTemRegistro({ tutor: 'Ana', pet: 'Thor', exame: '' })).toBe(false)
        expect(linhaConferenciaTemRegistro({ tutor: 'Ana', pet: 'Thor', exame: '--' })).toBe(false)
    })
})


describe('preço da negociação zerado', () => {
    it('precoNegociacaoUtil ignora 0 e usa o código', () => {
        const planoNome = 'Hemograma + Plaquetas'
        const mapa = new Map([
            [normalizarNomeExame(planoNome), 0],
            [normalizarNomeExame('ELAB-035'), 18.75],
        ])
        expect(precoNegociacaoUtil(mapa, planoNome)).toBe(null)
        expect(precoNegociacaoUtil(mapa, planoNome, 'ELAB-035')).toBe(18.75)
    })
})
