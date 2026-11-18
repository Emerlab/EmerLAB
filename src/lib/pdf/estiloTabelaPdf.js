import { rgb } from 'pdf-lib'

// Estilo de tabela compartilhado pelos PDFs de Planos, Honorários e Descontos.
export const COR_NAVY = rgb(0x1e / 255, 0x31 / 255, 0x48 / 255) // #1E3148
export const COR_BRANCO = rgb(1, 1, 1)
// Linhas alternam entre branco e um branco levemente acinzentado (#FCFCFC).
export const COR_ZEBRA = rgb(252 / 255, 252 / 255, 252 / 255)
export const COR_BORDA = rgb(218 / 255, 220 / 255, 225 / 255) // #DADCE1

export const CARD_RADIUS = 14
export const TITLE_BAR_HEIGHT = 44
export const TABLE_HEADER_HEIGHT = 36
export const ROW_BASE_HEIGHT = 34
export const ROW_DIVIDER_INSET = 14
export const CARD_PADDING_BOTTOM = 12
export const FONT_SIZE_BODY = 10
export const FONT_SIZE_HEADER = 11
export const FONT_SIZE_TITLE = 15

/**
 * Caminho SVG (y para baixo, a partir de 0,0) de um retângulo arredondado.
 * `soTopo` arredonda só os cantos superiores. O raio é limitado a metade da menor dimensão.
 */
export function caminhoRetanguloArredondado({ width, height, raio, soTopo = false }) {
    const r = Math.max(0, Math.min(raio, width / 2, height / 2))
    const w = width
    const h = height
    return soTopo
        ? `M 0 ${h} L 0 ${r} A ${r} ${r} 0 0 1 ${r} 0 L ${w - r} 0 A ${r} ${r} 0 0 1 ${w} ${r} L ${w} ${h} Z`
        : `M ${r} 0 L ${w - r} 0 A ${r} ${r} 0 0 1 ${w} ${r} L ${w} ${h - r} A ${r} ${r} 0 0 1 ${w - r} ${h} L ${r} ${h} A ${r} ${r} 0 0 1 0 ${h - r} L 0 ${r} A ${r} ${r} 0 0 1 ${r} 0 Z`
}

/** pdf-lib ignora borderRadius em drawRectangle; desenha por caminho SVG a partir de yTop. */
export function desenharRetanguloArredondado(
    page,
    { x, yTop, width, height, raio, color, soTopo = false },
) {
    const d = caminhoRetanguloArredondado({ width, height, raio, soTopo })
    page.drawSvgPath(d, { x, y: yTop, color, borderWidth: 0 })
}

/** Baseline para centralizar pelas maiúsculas em torno de yMeio. */
export function yBaselineCentro(yMeio, fontSize) {
    return yMeio - fontSize * 0.36
}

/** Baseline da primeira linha de um bloco de texto centralizado verticalmente entre yBottom e yTop. */
export function yPrimeiraLinhaBloco(yTop, yBottom, numLinhas, fontSize, leading) {
    const h = yTop - yBottom
    const blockH = (Math.max(1, numLinhas) - 1) * leading + fontSize
    // Sobe 0,14·corpo: centraliza pelas maiúsculas, não pela linha de base.
    return yBottom + (h + blockH) / 2 - fontSize + fontSize * 0.14
}

function sanitizar(texto) {
    return String(texto ?? '')
        .replace(/https?:\/\/\S+/gi, '')
        .replace(/www\.\S+/gi, '')
        .trim()
}

/**
 * Limite inferior (y) para linhas de dados: a margem da folha mais o respiro do card,
 * para o card inteiro (linhas + padding) nunca invadir a margem.
 */
export function limiteInferiorLinhas(marginBottom) {
    return marginBottom + CARD_PADDING_BOTTOM
}

/**
 * Quantas linhas (na ordem) cabem em `espaco`; mesma regra do laço de desenho
 * (uma linha cabe quando a soma acumulada não passa do espaço).
 */
export function contarLinhasQueCabem(alturas, espaco) {
    let acc = 0
    let n = 0
    for (const h of alturas) {
        acc += h
        if (acc > espaco) break
        n += 1
    }
    return n
}

/** Parte o grupo entre páginas só com linhas suficientes aqui e sobra suficiente na seguinte. */
export function decidirPartirGrupo({ linhasQueCabem, restantes, minAqui = 5, minResto = 2 }) {
    return linhasQueCabem >= minAqui && restantes >= minResto
}

/**
 * Texto de destaque ajustado a larguraMax: primeira linha por palavras; se algo foi cortado
 * ou a linha ainda é mais larga que o espaço, corta por caracteres e termina com "…".
 */
export function ajustarDestaqueAoTitulo(texto, font, size, larguraMax) {
    const palavras = sanitizar(texto).split(/\s+/).filter(Boolean)
    if (!palavras.length) return ''
    const linha = primeiraLinhaQueCabe(texto, font, size, larguraMax)
    const cortouPalavras = linha.split(' ').length < palavras.length
    const largura = (t) => font.widthOfTextAtSize(t, size)
    if (!cortouPalavras && largura(linha) <= larguraMax) return linha
    let base = linha
    while (base.length > 0 && largura(`${base}…`) > larguraMax) base = base.slice(0, -1)
    return `${base.trimEnd()}…`
}

/** Primeira linha (quebra por palavras) do texto que cabe em larguraMax. */
function primeiraLinhaQueCabe(texto, font, size, larguraMax) {
    const palavras = sanitizar(texto).split(/\s+/).filter(Boolean)
    if (!palavras.length) return ''
    let atual = ''
    for (const palavra of palavras) {
        const teste = atual ? `${atual} ${palavra}` : palavra
        if (font.widthOfTextAtSize(teste, size) <= larguraMax || !atual) {
            atual = teste
        } else {
            break
        }
    }
    return atual
}

/**
 * Barra de título navy (só cantos de cima arredondados): barrinha vertical, prefixo Light, destaque Bold.
 */
export function desenharBarraTitulo(page, fonts, { x, yTop, innerW, prefixo, destaque }) {
    const y = yTop - TITLE_BAR_HEIGHT
    desenharRetanguloArredondado(page, {
        x,
        yTop,
        width: innerW,
        height: TITLE_BAR_HEIGHT,
        raio: CARD_RADIUS,
        color: COR_NAVY,
        soTopo: true,
    })

    const baseY = y + (TITLE_BAR_HEIGHT - FONT_SIZE_TITLE) / 2 + 2
    const fontPrefixo = fonts.light || fonts.regular
    page.drawLine({
        start: { x: x + 16, y: y + 11 },
        end: { x: x + 16, y: y + TITLE_BAR_HEIGHT - 11 },
        thickness: 0.8,
        color: rgb(0.78, 0.82, 0.88),
    })
    const textoX = x + 28
    page.drawText(prefixo, {
        x: textoX,
        y: baseY,
        size: FONT_SIZE_TITLE,
        font: fontPrefixo,
        color: COR_BRANCO,
    })
    const prefixoW = fontPrefixo.widthOfTextAtSize(prefixo, FONT_SIZE_TITLE)
    const texto =
        ajustarDestaqueAoTitulo(destaque, fonts.bold, FONT_SIZE_TITLE, innerW - 28 - prefixoW - 14) ||
        '—'
    page.drawText(texto, {
        x: textoX + prefixoW,
        y: baseY,
        size: FONT_SIZE_TITLE,
        font: fonts.bold,
        color: COR_BRANCO,
    })
}

/** Divisória horizontal no topo de uma linha, recuada nas laterais. */
export function desenharDivisoria(page, { x, innerW, y }) {
    page.drawLine({
        start: { x: x + ROW_DIVIDER_INSET, y },
        end: { x: x + innerW - ROW_DIVIDER_INSET, y },
        thickness: 0.8,
        color: COR_BORDA,
    })
}
