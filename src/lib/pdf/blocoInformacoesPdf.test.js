import { describe, expect, it } from 'vitest'
import {
    ALTURA_CABECALHO_BLOCO,
    PADDING_FINAL_BLOCO,
    desenharBlocoInformacoes,
    medirBlocoInformacoes,
    quantosItensCabem,
} from './blocoInformacoesPdf.js'
import { OBS_ITEM_GAP } from './observacoesModeloPdf.js'

const medirItem = () => 30

describe('blocoInformacoesPdf', () => {
    it('constantes do cabeçalho e padding', () => {
        expect(ALTURA_CABECALHO_BLOCO).toBe(14 + 1 + 12 + 10 + 12)
        expect(PADDING_FINAL_BLOCO).toBe(12)
    })

    it('mede 0 sem itens', () => {
        expect(medirBlocoInformacoes({ itens: [], innerW: 500, medirItem })).toBe(0)
    })

    it('mede cabeçalho + itens + espaçamento + padding final', () => {
        const itens = [{ titulo: 'a', mensagem: 'x' }, { titulo: 'b', mensagem: 'y' }]
        expect(medirBlocoInformacoes({ itens, innerW: 500, medirItem })).toBe(
            ALTURA_CABECALHO_BLOCO + 2 * 30 + OBS_ITEM_GAP + PADDING_FINAL_BLOCO,
        )
    })

    it('numera itens e usa largura menos 2*12 ao medir', () => {
        const vistos = []
        medirBlocoInformacoes({
            itens: [{ titulo: 'a', mensagem: 'x' }, { titulo: 'b', mensagem: 'y' }],
            innerW: 500,
            medirItem: (item, larg) => {
                vistos.push([item.numero, larg])
                return 30
            },
        })
        expect(vistos).toEqual([[1, 476], [2, 476]])
    })

    it('quantosItensCabem', () => {
        const base = ALTURA_CABECALHO_BLOCO + PADDING_FINAL_BLOCO
        const alturasItens = [30, 30, 30]
        expect(quantosItensCabem({ alturasItens, alturaDisponivel: base + 30 + OBS_ITEM_GAP + 30 })).toBe(2)
        expect(quantosItensCabem({ alturasItens, alturaDisponivel: base + 29 })).toBe(0)
        expect(quantosItensCabem({ alturasItens, alturaDisponivel: base + 30 })).toBe(1)
        expect(quantosItensCabem({ alturasItens, alturaDisponivel: 100000 })).toBe(3)
        expect(quantosItensCabem({ alturasItens: [], alturaDisponivel: 100000 })).toBe(0)
    })

    it('desenha e devolve yTop - altura medida', () => {
        const chamadas = { lines: 0, texts: 0, itens: [] }
        const page = {
            drawLine: () => { chamadas.lines += 1 },
            drawText: () => { chamadas.texts += 1 },
        }
        const fonts = { bold: { widthOfTextAtSize: () => 50 } }
        const itens = [{ titulo: 'a', mensagem: 'x' }, { titulo: 'b', mensagem: 'y' }]
        const yBottom = desenharBlocoInformacoes(page, fonts, {
            x: 42,
            yTop: 700,
            innerW: 500,
            itens,
            medirItem,
            desenharItem: (p, f, x, yTop, item, larg) => {
                chamadas.itens.push([x, yTop, item.numero, larg])
            },
        })
        expect(yBottom).toBe(700 - medirBlocoInformacoes({ itens, innerW: 500, medirItem }))
        expect(chamadas.lines).toBe(1)
        expect(chamadas.texts).toBe(1)
        const y0 = 700 - ALTURA_CABECALHO_BLOCO
        expect(chamadas.itens).toEqual([
            [54, y0, 1, 476],
            [54, y0 - 30 - OBS_ITEM_GAP, 2, 476],
        ])
    })
})
