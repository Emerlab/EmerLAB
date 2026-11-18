import { rgb } from 'pdf-lib'
import { COR_NAVY } from './estiloTabelaPdf.js'

const FONT_SIZE_INFO = 10
const OBS_PADDING = 12
const INFO_SEP_GAP = 14
const INFO_TITLE_GAP = 12
const COR_SEP = rgb(170 / 255, 200 / 255, 220 / 255)

/** Separador + título "Informações" (mesmas medidas do bloco do Descontos). */
export const ALTURA_CABECALHO_BLOCO =
    INFO_SEP_GAP + 1 + INFO_TITLE_GAP + FONT_SIZE_INFO + INFO_TITLE_GAP
export const PADDING_FINAL_BLOCO = OBS_PADDING

function numerar(itens) {
    return (itens || []).map((item, i) => ({ ...item, numero: i + 1 }))
}

/**
 * Altura total do bloco (0 se não há itens).
 * Os geradores injetam medirItem(item, largura); a altura devolvida por
 * medirItem JÁ inclui o espaçamento final do item (OBS_ITEM_GAP), então o
 * bloco não soma espaçamento próprio entre itens.
 */
export function medirBlocoInformacoes({ itens, innerW, medirItem }) {
    const lista = numerar(itens)
    if (!lista.length) return 0
    const larguraTexto = innerW - OBS_PADDING * 2
    let h = ALTURA_CABECALHO_BLOCO
    lista.forEach((item) => {
        h += medirItem(item, larguraTexto)
    })
    return h + PADDING_FINAL_BLOCO
}

/**
 * Quantos itens iniciais cabem, sem cortar item. alturaDisponivel é o espaço
 * TOTAL (cabeçalho, itens e padding final incluídos). Cada altura de
 * alturasItens já inclui o espaçamento do item.
 */
export function quantosItensCabem({ alturasItens, alturaDisponivel }) {
    let usado = ALTURA_CABECALHO_BLOCO + PADDING_FINAL_BLOCO
    let n = 0
    for (let i = 0; i < (alturasItens || []).length; i += 1) {
        usado += alturasItens[i]
        if (usado > alturaDisponivel) break
        n += 1
    }
    return n
}

/** Desenha separador, título e itens; devolve o yBottom (com padding final). */
export function desenharBlocoInformacoes(
    page,
    fonts,
    { x, yTop, innerW, itens, desenharItem, medirItem },
) {
    const lista = numerar(itens)
    if (!lista.length) return yTop

    const sepW = Math.min(120, innerW * 0.28)
    const sepY = yTop - INFO_SEP_GAP
    page.drawLine({
        start: { x: x + (innerW - sepW) / 2, y: sepY },
        end: { x: x + (innerW + sepW) / 2, y: sepY },
        thickness: 1.2,
        color: COR_SEP,
    })

    const titulo = 'Informações'
    const titW = fonts.bold.widthOfTextAtSize(titulo, FONT_SIZE_INFO)
    page.drawText(titulo, {
        x: x + (innerW - titW) / 2,
        y: sepY - INFO_TITLE_GAP - FONT_SIZE_INFO,
        size: FONT_SIZE_INFO,
        font: fonts.bold,
        color: COR_NAVY,
    })

    const larguraTexto = innerW - OBS_PADDING * 2
    let y = yTop - ALTURA_CABECALHO_BLOCO
    lista.forEach((item) => {
        desenharItem(page, fonts, x + OBS_PADDING, y, item, larguraTexto)
        y -= medirItem(item, larguraTexto)
    })
    return y - PADDING_FINAL_BLOCO
}
