import { describe, expect, it } from 'vitest'
import {
    ALTURA_CABECALHO_BLOCO,
    alturasItensBloco,
    PADDING_FINAL_BLOCO,
    desenharBlocoInformacoes,
    medirBlocoInformacoes,
    planejarFatiaBlocoInformacoes,
    quantosItensCabem,
} from './blocoInformacoesPdf.js'

// altura do item já inclui o espaçamento final
const medirItem = () => 30

describe('blocoInformacoesPdf', () => {
    it('constantes do cabeçalho e padding', () => {
        expect(ALTURA_CABECALHO_BLOCO).toBe(8 + 1 + 8 + 10 + 8)
        expect(PADDING_FINAL_BLOCO).toBe(4)
    })

    it('mede 0 sem itens', () => {
        expect(medirBlocoInformacoes({ itens: [], innerW: 500, medirItem })).toBe(0)
    })

    it('mede cabeçalho + alturas dos itens + padding final', () => {
        const itens = [{ titulo: 'a', mensagem: 'x' }, { titulo: 'b', mensagem: 'y' }]
        expect(medirBlocoInformacoes({ itens, innerW: 500, medirItem })).toBe(
            ALTURA_CABECALHO_BLOCO + 2 * 30 + PADDING_FINAL_BLOCO,
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
        expect(quantosItensCabem({ alturasItens, alturaDisponivel: base + 30 + 30 })).toBe(2)
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
            [54, y0 - 30, 2, 476],
        ])
    })

    it('numeroInicial continua a numeração ao medir e desenhar', () => {
        const vistos = []
        const medir = (item) => {
            vistos.push(item.numero)
            return 30
        }
        const itens = [{ titulo: 'c', mensagem: 'z' }, { titulo: 'd', mensagem: 'w' }]
        medirBlocoInformacoes({ itens, innerW: 500, medirItem: medir, numeroInicial: 3 })
        expect(vistos).toEqual([3, 4])
        const desenhados = []
        const page = { drawLine: () => {}, drawText: () => {} }
        const fonts = { bold: { widthOfTextAtSize: () => 50 } }
        desenharBlocoInformacoes(page, fonts, {
            x: 0,
            yTop: 500,
            innerW: 500,
            itens,
            medirItem: medir,
            numeroInicial: 3,
            desenharItem: (p, f, x, y, item) => desenhados.push(item.numero),
        })
        expect(desenhados).toEqual([3, 4])
    })

    it('planejarFatiaBlocoInformacoes: tudo cabe, parte cabe, nada cabe, forçar um', () => {
        const base = ALTURA_CABECALHO_BLOCO + PADDING_FINAL_BLOCO
        const alturasItens = [30, 40, 50]
        expect(
            planejarFatiaBlocoInformacoes({ alturasItens, inicio: 0, alturaDisponivel: 1000 }),
        ).toEqual({ inicio: 0, fim: 3, altura: base + 120, completo: true })
        expect(
            planejarFatiaBlocoInformacoes({ alturasItens, inicio: 0, alturaDisponivel: base + 75 }),
        ).toEqual({ inicio: 0, fim: 2, altura: base + 70, completo: false })
        expect(
            planejarFatiaBlocoInformacoes({ alturasItens, inicio: 2, alturaDisponivel: base + 50 }),
        ).toEqual({ inicio: 2, fim: 3, altura: base + 50, completo: true })
        expect(
            planejarFatiaBlocoInformacoes({ alturasItens, inicio: 1, alturaDisponivel: base + 10 }),
        ).toEqual({ inicio: 1, fim: 1, altura: 0, completo: false })
        expect(
            planejarFatiaBlocoInformacoes({
                alturasItens,
                inicio: 1,
                alturaDisponivel: base + 10,
                forcarAoMenosUm: true,
            }),
        ).toEqual({ inicio: 1, fim: 2, altura: base + 40, completo: false })
    })

    it('alturasItensBloco numera antes de medir e usa a largura do bloco', () => {
        const alturas = alturasItensBloco({
            itens: [{ titulo: 'a', mensagem: 'x' }, { titulo: 'b', mensagem: 'y' }],
            innerW: 500,
            medirItem: (item, larg) => item.numero * 1000 + larg,
        })
        expect(alturas).toEqual([1476, 2476])
    })
})
