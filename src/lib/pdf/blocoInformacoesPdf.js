import { rgb } from 'pdf-lib'
import { COR_NAVY } from './estiloTabelaPdf.js'

const FONT_SIZE_INFO = 10
const OBS_PADDING = 12
const INFO_SEP_GAP = 8
const INFO_TITLE_GAP = 8
const COR_SEP = rgb(170 / 255, 200 / 255, 220 / 255)

/** Separador + título "Informações" (medidas próprias deste módulo, mais compactas que as do bloco do Descontos). */
export const ALTURA_CABECALHO_BLOCO =
    INFO_SEP_GAP + 1 + INFO_TITLE_GAP + FONT_SIZE_INFO + INFO_TITLE_GAP
export const PADDING_FINAL_BLOCO = 4

/**
 * Quantas das últimas linhas da seção vão para a página seguinte junto com o bloco: as N linhas
 * que acompanham o bloco quando nenhum item dele cabe.
 */
export const LINHAS_QUE_ACOMPANHAM_BLOCO = 2

/**
 * Quantas das últimas linhas da seção nesta página vão para a seguinte junto com o bloco
 * Informações: só quando nenhum item do bloco cabe (fatia vazia), e sempre deixando ao menos
 * uma linha da seção nesta página.
 */
export function linhasALevarComBloco({
    linhasNestaPagina,
    fatiaVazia,
    max = LINHAS_QUE_ACOMPANHAM_BLOCO,
}) {
    if (!fatiaVazia || linhasNestaPagina <= 1) return 0
    return Math.min(max, linhasNestaPagina - 1)
}

/**
 * Guarda de viabilidade da regra "manter junto": só leva linhas se o primeiro item do bloco
 * couber na página de continuação logo após as linhas levadas. alturaUtilBloco = espaço entre
 * o topo das linhas de uma página de continuação (título + cabeçalho) e MARGIN_BOTTOM.
 */
export function blocoCabeComLinhasLevadas({
    alturaPrimeiroItem,
    alturaLinhasLevadas,
    alturaUtilBloco,
}) {
    const alturaBloco = ALTURA_CABECALHO_BLOCO + alturaPrimeiroItem + PADDING_FINAL_BLOCO
    return alturaBloco <= alturaUtilBloco - alturaLinhasLevadas
}

function numerar(itens, numeroInicial = 1) {
    return (itens || []).map((item, i) => ({ ...item, numero: numeroInicial + i }))
}

/**
 * Altura total do bloco (0 se não há itens).
 * Os geradores injetam medirItem(item, largura); a altura devolvida por
 * medirItem JÁ inclui o espaçamento final do item (OBS_ITEM_GAP), então o
 * bloco não soma espaçamento próprio entre itens.
 */
export function medirBlocoInformacoes({ itens, innerW, medirItem, numeroInicial = 1 }) {
    const lista = numerar(itens, numeroInicial)
    if (!lista.length) return 0
    const larguraTexto = innerW - OBS_PADDING * 2
    let h = ALTURA_CABECALHO_BLOCO
    lista.forEach((item) => {
        h += medirItem(item, larguraTexto)
    })
    return h + PADDING_FINAL_BLOCO
}

/**
 * Altura de cada item (já numerado 1..n, na mesma largura usada pelo bloco),
 * para alimentar quantosItensCabem/planejarFatiaBlocoInformacoes.
 */
export function alturasItensBloco({ itens, innerW, medirItem }) {
    const larguraTexto = innerW - OBS_PADDING * 2
    return numerar(itens).map((item) => medirItem(item, larguraTexto))
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

/**
 * Planeja a fatia de itens [inicio, fim) que entra num espaço (cabeçalho e
 * padding final incluídos). Com forcarAoMenosUm, uma página nova sempre recebe
 * ao menos um item (item maior que a página não trava a paginação).
 * altura = altura da fatia desenhada (0 se nenhum item entra).
 */
export function planejarFatiaBlocoInformacoes({
    alturasItens,
    inicio = 0,
    alturaDisponivel,
    forcarAoMenosUm = false,
}) {
    const todas = alturasItens || []
    const resto = todas.slice(inicio)
    let n = quantosItensCabem({ alturasItens: resto, alturaDisponivel })
    if (n === 0 && forcarAoMenosUm && resto.length) n = 1
    const fim = inicio + n
    const altura = n
        ? ALTURA_CABECALHO_BLOCO +
          resto.slice(0, n).reduce((acc, h) => acc + h, 0) +
          PADDING_FINAL_BLOCO
        : 0
    return { inicio, fim, altura, completo: fim >= todas.length }
}

/** Desenha separador, título e itens; devolve o yBottom (com padding final). */
export function desenharBlocoInformacoes(
    page,
    fonts,
    { x, yTop, innerW, itens, desenharItem, medirItem, numeroInicial = 1 },
) {
    const lista = numerar(itens, numeroInicial)
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
