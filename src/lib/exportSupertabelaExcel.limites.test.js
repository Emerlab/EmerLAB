import { afterEach, describe, expect, it, vi } from 'vitest'
import ExcelJS from 'exceljs'
import { mapearPlanos } from './planosHierarquia.js'
import { montarLinhasMatriz } from './matrizCarenciasLimites.js'
import { exportarTabelaPlanosLimitesParaExcel } from './exportSupertabelaExcel.js'

const planos = [
    { id: 1, nome: 'Básico' },
    { id: 2, nome: 'Clássico' },
    { id: 3, nome: 'Avançado' },
    { id: 4, nome: 'Ultra' },
]
const mapaPlanos = mapearPlanos(planos)

const capturar = () => {
    const blobs = []
    vi.stubGlobal('document', { createElement: () => ({ click() {}, remove() {} }), body: { appendChild() {} } })
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => (blobs.push(blob), 'blob:teste'))
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    return blobs
}

afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
})

describe('exportarTabelaPlanosLimitesParaExcel (matriz)', () => {
    it('gera cabeçalho de 2 níveis e 8 colunas de valores por procedimento', async () => {
        const blobs = capturar()
        const linhas = montarLinhasMatriz({
            procedimentos: [{ id: 1, codigo: 'AAA-001', nome: 'Base Avançado', categoria_id: 23, plano_base_id: 3 }],
            configRows: [{ id: 1, plano_id: 3, procedimento: 'AAA-001', limite: '5', carencia: '60 Dias' }],
            planos, mapaPlanos, categorias: [{ id: 23, nome: 'Cirurgias', usa_limite_grupo: false }], limitesGrupoRows: [],
        })
        await exportarTabelaPlanosLimitesParaExcel([{ categoriaId: 23, categoriaNome: 'Cirurgias', linhas }], 'teste')

        const wb = new ExcelJS.Workbook()
        await wb.xlsx.load(await blobs[0].arrayBuffer())
        const ws = wb.worksheets[0]
        expect(ws.getCell(1, 1).value).toBe('Cirurgias')
        expect(ws.getCell(2, 1).value).toBe('Código')
        expect(ws.getCell(2, 3).value).toBe('Básico')
        expect(ws.getCell(2, 9).value).toBe('Ultra')
        expect(ws.getCell(3, 3).value).toBe('Limite')
        expect(ws.getCell(3, 4).value).toBe('Carência')
        const dados = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((c) => ws.getCell(4, c).value)
        expect(dados).toEqual([
            'AAA-001', 'Base Avançado',
            'Avançado Acima', 'Avançado Acima', 'Avançado Acima', 'Avançado Acima', '5', '60 Dias', '', '',
        ])
    })

    it('sem seções escreve a mensagem de vazio', async () => {
        const blobs = capturar()
        await exportarTabelaPlanosLimitesParaExcel([], 'vazio')
        const wb = new ExcelJS.Workbook()
        await wb.xlsx.load(await blobs[0].arrayBuffer())
        expect(wb.worksheets[0].getCell(1, 1).value).toBe('Sem dados para exportar.')
    })
})
