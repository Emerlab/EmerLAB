import { PDFDocument, rgb, PDFString } from 'pdf-lib'
import { blobDePdfLib } from '../pdf/serializarPdf.js'
import { embedMontserratNoPdf } from '../impressaoPlanos/montserratPdfFonts.js'
import { formatarCarimboDataHora } from '../pdf/formatarCarimboEmissao.js'
import {
    CARD_PADDING_BOTTOM,
    CARD_RADIUS,
    COR_BRANCO,
    COR_NAVY,
    COR_ZEBRA,
    FONT_SIZE_BODY,
    FONT_SIZE_HEADER,
    ROW_BASE_HEIGHT,
    TABLE_HEADER_HEIGHT,
    TITLE_BAR_HEIGHT,
    desenharBarraTitulo,
    desenharDivisoria,
    desenharRetanguloArredondado,
    limiteInferiorLinhas,
    yBaselineCentro,
    yPrimeiraLinhaBloco as yPrimeiraLinhaBlocoBase,
} from '../pdf/estiloTabelaPdf.js'
import urlEstetoscopioSvg from '../../assets/planos/estetoscopio.svg?url'
import urlHonorariosPdf from '../../assets/honorarios/honorarios.pdf?url'

const ICON_CAB_SIZE_PT = 14
const ICON_CAB_GAP_PT = 4
const ICON_RASTER_PX = 64

const TEMPLATE_PAGE_INDEX = 1
const COVER_INDEX = 0
const OBS_INDEX = 2

const MARGIN_X = 42
const MARGIN_TOP = 86
const MARGIN_BOTTOM = 58
// Limite das linhas: margem + respiro do card.
const LIMITE_LINHAS = limiteInferiorLinhas(MARGIN_BOTTOM)
const SECTION_GAP = 16
const LINE_LEADING = 12
const FONT_SIZE_TITLE_CAT = 10
const FONT_SIZE_STAMP = 7
const FONT_SIZE_OBS = 9
const FONT_SIZE_OBS_TITLE = 9.5
const FONT_SIZE_OBS_H1 = 18
const FONT_SIZE_DUVIDAS = 9
const GAP_CARIMBO = 12
const OBS_ITEM_GAP = 12
const OBS_NESTED_INDENT = 18
const OBS_H1_GAP = 22
const DUVIDAS_GAP = 18

const LINK_WHATSAPP = 'https://wa.me/555499041695'
const LINK_VIDEO = 'https://www.youtube.com/watch?v=rUNF0hKrO20'

const COR_TEXTO = rgb(58 / 255, 63 / 255, 75 / 255)
const COR_TEXTO_OBS = rgb(90 / 255, 96 / 255, 108 / 255)
const COR_STAMP = rgb(0.72, 0.72, 0.72)
const COR_LINK = rgb(30 / 255, 100 / 255, 180 / 255)
const COR_INFO_TEXTO = rgb(30 / 255, 70 / 255, 120 / 255)
const COR_INFO_ICON = rgb(100 / 255, 170 / 255, 220 / 255)

/** Nome | Porte P | Porte M | Porte G */
const COL_FRAC = [0.46, 0.18, 0.18, 0.18]

function fontCorpo(fonts) {
    return fonts.light || fonts.regular
}

function sanitizarTextoPdf(texto) {
    return String(texto ?? '')
        .replace(/https?:\/\/\S+/gi, '')
        .replace(/www\.\S+/gi, '')
        .trim()
}

function formatarValorPorte(valor) {
    if (valor === '' || valor == null) return '—'
    if (typeof valor === 'string') {
        const t = valor.trim()
        if (!t || t === '—') return '—'
        // Já formatado (ex.: "12,50")
        if (/^\d{1,3}(\.\d{3})*,\d{2}$/.test(t) || /^\d+,\d{2}$/.test(t)) return t
    }
    const n = Number(valor)
    if (!Number.isFinite(n)) return String(valor)
    return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function sanitizarObservacoesPdf(texto) {
    return String(texto ?? '')
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .replace(/[^\S\n]+/g, ' ')
        .replace(/ +\n/g, '\n')
        .replace(/\n +/g, '\n')
        .replace(/^\n+/, '')
        .replace(/\n+$/, '')
}

function quebrarTexto(texto, font, size, larguraMax) {
    const bruto = sanitizarTextoPdf(texto) || '—'
    const palavras = bruto.split(/\s+/).filter(Boolean)
    if (!palavras.length) return ['—']
    const linhas = []
    let atual = ''
    for (const palavra of palavras) {
        const teste = atual ? `${atual} ${palavra}` : palavra
        if (font.widthOfTextAtSize(teste, size) <= larguraMax) {
            atual = teste
        } else {
            if (atual) linhas.push(atual)
            atual = palavra
        }
    }
    if (atual) linhas.push(atual)
    return linhas
}

function normalizarListaObservacoes(observacoes) {
    if (observacoes == null) return []
    const lista = Array.isArray(observacoes) ? observacoes : [observacoes]
    return lista
        .map((item, idx) => {
            if (item == null) return null
            if (typeof item === 'string') {
                const mensagem = sanitizarObservacoesPdf(item)
                if (!mensagem) return null
                return { numero: idx + 1, titulo: '', mensagem }
            }
            const titulo = sanitizarTextoPdf(item.titulo || item.title || '')
            const mensagem = sanitizarObservacoesPdf(item.mensagem || item.texto || item.body || '')
            if (!mensagem && !titulo) return null
            return {
                numero: Number(item.numero) > 0 ? Number(item.numero) : idx + 1,
                titulo,
                mensagem,
            }
        })
        .filter(Boolean)
        .map((item, idx) => ({ ...item, numero: idx + 1 }))
}

const URL_TOKEN_RE = /(https?:\/\/[^\s<>[\]()]+|www\.[^\s<>[\]()]+)/gi

function normalizarUrlToken(raw) {
    let t = String(raw || '')
    while (t.length > 4) {
        if (/[.,;:!?]$/.test(t)) {
            t = t.slice(0, -1)
            continue
        }
        if (t.endsWith(')')) {
            const opens = (t.match(/\(/g) || []).length
            const closes = (t.match(/\)/g) || []).length
            if (closes > opens) {
                t = t.slice(0, -1)
                continue
            }
        }
        break
    }
    return t
}

function hrefDeUrlExibida(raw) {
    const t = normalizarUrlToken(raw)
    if (!t) return null
    if (/^https?:\/\//i.test(t)) return t
    if (/^www\./i.test(t)) return `https://${t}`
    return null
}

function expandirSegmentosComLinks(segmentos) {
    const out = []
    for (const seg of segmentos || []) {
        const texto = String(seg.text || '')
        if (!texto) continue
        const bold = Boolean(seg.bold)
        let last = 0
        const re = new RegExp(URL_TOKEN_RE.source, 'gi')
        let m
        let found = false
        while ((m = re.exec(texto)) !== null) {
            found = true
            if (m.index > last) {
                out.push({ text: texto.slice(last, m.index), bold })
            }
            const urlText = normalizarUrlToken(m[0])
            const href = hrefDeUrlExibida(urlText)
            out.push(href ? { text: urlText, bold, href } : { text: urlText, bold })
            last = m.index + m[0].length
        }
        if (!found) {
            out.push({ text: texto, bold })
        } else if (last < texto.length) {
            out.push({ text: texto.slice(last), bold })
        }
    }
    return out
}

/** Linhas do corpo: bullets com "- " / "• " e trechos **negrito**. */
function parseLinhasCorpoObservacao(mensagem) {
    const bruto = sanitizarObservacoesPdf(mensagem)
    if (!bruto) return []
    return bruto.split('\n').map((linha) => {
        const raw = String(linha || '')
        const bulletMatch = raw.match(/^\s*([-•*]|\d+[.)])\s+(.*)$/)
        const texto = bulletMatch ? bulletMatch[2] : raw.trimEnd()
        const nested = Boolean(bulletMatch)
        const segmentos = []
        const re = /\*\*(.+?)\*\*/g
        let last = 0
        let m
        while ((m = re.exec(texto)) !== null) {
            if (m.index > last) {
                segmentos.push({ text: texto.slice(last, m.index), bold: false })
            }
            segmentos.push({ text: m[1], bold: true })
            last = m.index + m[0].length
        }
        if (last < texto.length) segmentos.push({ text: texto.slice(last), bold: false })
        if (!segmentos.length && texto) segmentos.push({ text: texto, bold: false })
        return { nested, segmentos: expandirSegmentosComLinks(segmentos) }
    })
}

function quebrarSegmentosEmLinhas(segmentos, fonts, size, larguraMax, larguraPrimeiraLinha = null) {
    const palavras = []
    for (const seg of segmentos || []) {
        if (seg.href) {
            palavras.push({ text: seg.text, bold: Boolean(seg.bold), href: seg.href })
            continue
        }
        const partes = String(seg.text || '').split(/(\s+)/)
        for (const parte of partes) {
            if (!parte) continue
            palavras.push({ text: parte, bold: Boolean(seg.bold) })
        }
    }
    if (!palavras.length) return [[]]

    const limitePrimeira =
        larguraPrimeiraLinha != null && larguraPrimeiraLinha > 0
            ? larguraPrimeiraLinha
            : larguraMax

    const linhas = []
    let atual = []
    let larguraAtual = 0
    let primeiraLinha = true
    for (const palavra of palavras) {
        const font = palavra.bold ? fonts.bold : fontCorpo(fonts)
        const w = font.widthOfTextAtSize(palavra.text, size)
        const limite = primeiraLinha ? limitePrimeira : larguraMax
        if (atual.length && larguraAtual + w > limite && !/^\s+$/.test(palavra.text)) {
            while (atual.length && /^\s+$/.test(atual[atual.length - 1].text)) atual.pop()
            linhas.push(atual)
            atual = []
            larguraAtual = 0
            primeiraLinha = false
            if (/^\s+$/.test(palavra.text)) continue
        }
        atual.push(palavra)
        larguraAtual += w
    }
    if (atual.length) {
        while (atual.length && /^\s+$/.test(atual[atual.length - 1].text)) atual.pop()
        linhas.push(atual)
    }
    return linhas.length ? linhas : [[]]
}

function desenharSegmentos(page, fonts, x, y, segmentos, size, color) {
    let cursorX = x
    for (const seg of segmentos || []) {
        const texto = String(seg.text || '')
        if (!texto) continue
        const font = seg.bold ? fonts.bold : fontCorpo(fonts)
        const isLink = Boolean(seg.href)
        const cor = isLink ? COR_LINK : color
        page.drawText(texto, { x: cursorX, y, size, font, color: cor })
        const tw = font.widthOfTextAtSize(texto, size)
        if (isLink) {
            page.drawLine({
                start: { x: cursorX, y: y - 1 },
                end: { x: cursorX + tw, y: y - 1 },
                thickness: 0.6,
                color: COR_LINK,
            })
            adicionarLinkUri(page, seg.href, {
                x: cursorX,
                y: y - 2,
                width: tw,
                height: size + 4,
            })
        }
        cursorX += tw
    }
    return cursorX
}

function medirItemObservacaoModelo(item, fonts, larguraMax) {
    const tituloFont = fonts.bold
    const prefixo = `${item.numero}) `
    const titulo = item.titulo ? `${item.titulo}:` : ''
    const prefixoW = tituloFont.widthOfTextAtSize(prefixo + titulo, FONT_SIZE_OBS_TITLE)
    // Título ocupa a 1ª linha; corpo começa na mesma linha se couber, senão abaixo.
    const linhasCorpo = parseLinhasCorpoObservacao(item.mensagem)
    let h = FONT_SIZE_OBS_TITLE + 2
    const corpoLead = LINE_LEADING

    // Corpo sempre abaixo do título no modelo (título + texto em sequência na mesma “sentença”
    // visual: título bold, depois texto na mesma linha quando possível).
    // Medimos título+início do 1º parágrafo na mesma linha.
    let firstConsumed = false
    for (const linha of linhasCorpo) {
        const indent = linha.nested ? OBS_NESTED_INDENT : 0
        const avail = Math.max(40, larguraMax - indent)
        if (!firstConsumed && !linha.nested && item.titulo) {
            const restoLargura = Math.max(40, larguraMax - prefixoW - 4)
            const wrapped = quebrarSegmentosEmLinhas(
                linha.segmentos,
                fonts,
                FONT_SIZE_OBS,
                avail,
                restoLargura,
            )
            // primeira linha do wrap fica na linha do título; demais abaixo
            h += Math.max(0, wrapped.length - 1) * corpoLead
            if (wrapped.length === 0) h += 0
            firstConsumed = true
            continue
        }
        if (!firstConsumed && !linha.nested && !item.titulo) {
            const wrapped = quebrarSegmentosEmLinhas(linha.segmentos, fonts, FONT_SIZE_OBS, avail)
            h = Math.max(h, wrapped.length * corpoLead)
            firstConsumed = true
            continue
        }
        firstConsumed = true
        if (!linha.segmentos.length) {
            h += corpoLead
            continue
        }
        const wrapped = quebrarSegmentosEmLinhas(linha.segmentos, fonts, FONT_SIZE_OBS, avail)
        h += Math.max(1, wrapped.length) * corpoLead
    }
    return h + OBS_ITEM_GAP
}

function desenharItemObservacaoModelo(page, fonts, x, yTop, item, larguraMax) {
    const tituloFont = fonts.bold
    const prefixo = `${item.numero}) `
    const tituloTxt = item.titulo ? `${sanitizarTextoPdf(item.titulo)}:` : ''
    const corTitulo = COR_TEXTO
    const corCorpo = COR_TEXTO_OBS

    page.drawText(prefixo, {
        x,
        y: yTop - FONT_SIZE_OBS_TITLE,
        size: FONT_SIZE_OBS_TITLE,
        font: tituloFont,
        color: corTitulo,
    })
    const prefixoW = tituloFont.widthOfTextAtSize(prefixo, FONT_SIZE_OBS_TITLE)
    if (tituloTxt) {
        page.drawText(tituloTxt, {
            x: x + prefixoW,
            y: yTop - FONT_SIZE_OBS_TITLE,
            size: FONT_SIZE_OBS_TITLE,
            font: tituloFont,
            color: corTitulo,
        })
    }
    const tituloW = tituloFont.widthOfTextAtSize(prefixo + tituloTxt, FONT_SIZE_OBS_TITLE)

    let y = yTop - FONT_SIZE_OBS_TITLE
    const linhasCorpo = parseLinhasCorpoObservacao(item.mensagem)
    let firstConsumed = false

    for (const linha of linhasCorpo) {
        const indent = linha.nested ? OBS_NESTED_INDENT : 0
        if (!firstConsumed && !linha.nested) {
            const gap = tituloTxt ? 4 : 0
            const startX = x + tituloW + gap
            const availFull = Math.max(40, larguraMax - indent)
            const availPrimeira = tituloTxt
                ? Math.max(40, larguraMax - (tituloW + gap))
                : availFull
            const wrapped = quebrarSegmentosEmLinhas(
                linha.segmentos,
                fonts,
                FONT_SIZE_OBS,
                availFull,
                availPrimeira,
            )
            if (wrapped.length) {
                desenharSegmentos(page, fonts, startX, y, wrapped[0], FONT_SIZE_OBS, corCorpo)
                for (let i = 1; i < wrapped.length; i += 1) {
                    y -= LINE_LEADING
                    desenharSegmentos(page, fonts, x + indent, y, wrapped[i], FONT_SIZE_OBS, corCorpo)
                }
            }
            firstConsumed = true
            continue
        }
        firstConsumed = true
        y -= LINE_LEADING
        if (!linha.segmentos.length) continue
        if (linha.nested) {
            page.drawText('•', {
                x: x + 4,
                y,
                size: FONT_SIZE_OBS,
                font: fontCorpo(fonts),
                color: corCorpo,
            })
        }
        const avail = Math.max(40, larguraMax - indent)
        const wrapped = quebrarSegmentosEmLinhas(linha.segmentos, fonts, FONT_SIZE_OBS, avail)
        wrapped.forEach((segs, i) => {
            if (i > 0) y -= LINE_LEADING
            desenharSegmentos(page, fonts, x + indent, y, segs, FONT_SIZE_OBS, corCorpo)
        })
    }

    return yTop - (medirItemObservacaoModelo(item, fonts, larguraMax))
}

function textoCentralizado(xCol, colW, texto, font, size) {
    const t = sanitizarTextoPdf(texto) || '—'
    const w = font.widthOfTextAtSize(t, size)
    return xCol + Math.max(2, (colW - w) / 2)
}

function colunasLayout(width) {
    const innerW = width - MARGIN_X * 2
    const widths = COL_FRAC.map((f) => innerW * f)
    const xs = [MARGIN_X]
    for (let i = 0; i < widths.length - 1; i += 1) {
        xs.push(xs[i] + widths[i])
    }
    return { innerW, widths, xs }
}

function medirAlturaLinha(linha, fonts, colNomeW) {
    const corpo = fontCorpo(fonts)
    const linhasNome = quebrarTexto(linha.nome, corpo, FONT_SIZE_BODY, colNomeW - 12)
    let h = ROW_BASE_HEIGHT
    if (linhasNome.length > 1) h += (linhasNome.length - 1) * LINE_LEADING
    return Math.max(ROW_BASE_HEIGHT, h)
}

/**
 * @param {Array<{ categoriaNome?: string, nome?: string, linhas: object[] }>} secoes
 */
export function montarSecoesImpressao(secoes) {
    const saida = []
    for (const secao of secoes || []) {
        const linhas = (secao.linhas || [])
            .filter((l) => l.checked !== false)
            .map((l) => ({
                codigo: sanitizarTextoPdf(l.codigo) || '',
                nome: sanitizarTextoPdf(l.procedimento ?? l.nome) || '—',
                P: formatarValorPorte(l.porteP ?? l.P),
                M: formatarValorPorte(l.porteM ?? l.M),
                G: formatarValorPorte(l.porteG ?? l.G),
            }))
            .filter((l) => l.nome && l.nome !== '—')
        if (!linhas.length) continue
        saida.push({
            nome: String(secao.categoriaNome || secao.nome || 'Categoria'),
            linhas,
        })
    }
    return saida
}

async function carregarSvgComoPngBytes(urlSvg, sizePx = ICON_RASTER_PX) {
    const resposta = await fetch(urlSvg)
    if (!resposta.ok) throw new Error('Não foi possível carregar o ícone estetoscópio.')
    const svgText = await resposta.text()
    const blob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' })
    const objectUrl = URL.createObjectURL(blob)
    try {
        const img = await new Promise((resolve, reject) => {
            const el = new Image()
            el.onload = () => resolve(el)
            el.onerror = () => reject(new Error('Falha ao decodificar estetoscopio.svg'))
            el.src = objectUrl
        })
        const canvas = document.createElement('canvas')
        canvas.width = sizePx
        canvas.height = sizePx
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('Canvas indisponível para rasterizar o ícone.')
        ctx.clearRect(0, 0, sizePx, sizePx)
        ctx.drawImage(img, 0, 0, sizePx, sizePx)
        const dataUrl = canvas.toDataURL('image/png')
        const base64 = dataUrl.split(',')[1] || ''
        const bin = atob(base64)
        const bytes = new Uint8Array(bin.length)
        for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i)
        return bytes
    } finally {
        URL.revokeObjectURL(objectUrl)
    }
}

function desenharIconeEstetoscopio(page, iconePng, x, textY) {
    if (!iconePng) return
    const size = ICON_CAB_SIZE_PT
    // Centro do ícone = centro das maiúsculas do texto do cabeçalho (≈ 0,36 do corpo da fonte).
    page.drawImage(iconePng, {
        x,
        y: textY + FONT_SIZE_HEADER * 0.36 - size / 2,
        width: size,
        height: size,
    })
}

function desenharCabecalhoTabela(page, fonts, layout, yTop, iconeEstetoscopio) {
    const { xs, widths, innerW } = layout
    const y = yTop - TABLE_HEADER_HEIGHT

    page.drawRectangle({
        x: MARGIN_X,
        y,
        width: innerW,
        height: TABLE_HEADER_HEIGHT,
        color: COR_BRANCO,
    })

    // Meio das maiúsculas (≈ 0,36 do corpo) no meio da faixa: baseline = meio − 0,36·corpo.
    const textY = yBaselineCentro(y + TABLE_HEADER_HEIGHT / 2, FONT_SIZE_HEADER)
    const labels = ['Nome', 'Porte P', 'Porte M', 'Porte G']
    labels.forEach((label, idx) => {
        const colX = xs[idx]
        const colW = widths[idx]
        if (idx === 0) {
            // Ícone + rótulo centralizados sobre a coluna.
            const grupoW =
                ICON_CAB_SIZE_PT +
                ICON_CAB_GAP_PT +
                fonts.bold.widthOfTextAtSize(label, FONT_SIZE_HEADER)
            const iconX = colX + Math.max(2, (colW - grupoW) / 2)
            desenharIconeEstetoscopio(page, iconeEstetoscopio, iconX, textY)
            page.drawText(label, {
                x: iconX + ICON_CAB_SIZE_PT + ICON_CAB_GAP_PT,
                y: textY,
                size: FONT_SIZE_HEADER,
                font: fonts.bold,
                color: COR_NAVY,
            })
        } else {
            page.drawText(label, {
                x: textoCentralizado(colX, colW, label, fonts.bold, FONT_SIZE_HEADER),
                y: textY,
                size: FONT_SIZE_HEADER,
                font: fonts.bold,
                color: COR_NAVY,
            })
        }
    })

    // Sem linha entre o cabeçalho e a primeira linha do grupo.
    return y
}

function yPrimeiraLinhaBloco(yTop, yBottom, numLinhas, fontSize) {
    return yPrimeiraLinhaBlocoBase(yTop, yBottom, numLinhas, fontSize, LINE_LEADING)
}

function desenharLinhaDados(page, fonts, layout, yTop, linha, indiceZebra, opcoes) {
    const { xs, widths } = layout
    const corpo = fontCorpo(fonts)
    const h = medirAlturaLinha(linha, fonts, widths[0])
    const yBottom = yTop - h
    const fundo = indiceZebra % 2 === 1 ? COR_ZEBRA : COR_BRANCO

    page.drawRectangle({
        x: MARGIN_X,
        y: yBottom,
        width: layout.innerW,
        height: h,
        color: fundo,
    })

    // Divisória no TOPO da linha (depois do fundo, para a zebra não cobri-la); a 1ª do bloco não tem.
    if (!opcoes?.semLinhaSuperior) {
        desenharDivisoria(page, { x: MARGIN_X, innerW: layout.innerW, y: yTop })
    }

    const linhasNome = quebrarTexto(linha.nome, corpo, FONT_SIZE_BODY, widths[0] - 12)
    const yNome = yPrimeiraLinhaBloco(yTop, yBottom, linhasNome.length, FONT_SIZE_BODY)
    linhasNome.forEach((ln, i) => {
        page.drawText(ln, {
            x: xs[0] + 14,
            y: yNome - i * LINE_LEADING,
            size: FONT_SIZE_BODY,
            font: corpo,
            color: COR_TEXTO,
        })
    })

    const yCelulaSimples = yPrimeiraLinhaBloco(yTop, yBottom, 1, FONT_SIZE_BODY)
    ;[linha.P, linha.M, linha.G].forEach((val, i) => {
        const idx = i + 1
        const texto = sanitizarTextoPdf(val) || '—'
        page.drawText(texto, {
            x: textoCentralizado(xs[idx], widths[idx], texto, corpo, FONT_SIZE_BODY),
            y: yCelulaSimples,
            size: FONT_SIZE_BODY,
            font: corpo,
            color: COR_TEXTO,
        })
    })

    return { yBottom, h }
}

function encaixarTextoLargura(texto, font, size, larguraMax) {
    const bruto = String(texto || '').trim()
    if (!bruto || larguraMax <= 0) return ''
    if (font.widthOfTextAtSize(bruto, size) <= larguraMax) return bruto
    const sufixo = '…'
    let cortado = bruto
    while (cortado.length > 1 && font.widthOfTextAtSize(cortado + sufixo, size) > larguraMax) {
        cortado = cortado.slice(0, -1)
    }
    return cortado.length < bruto.length ? `${cortado}${sufixo}` : cortado
}

function montarTextoCarimboEsquerda({ nome, cidadeNome } = {}) {
    const partes = []
    const n = sanitizarTextoPdf(nome)
    const c = sanitizarTextoPdf(cidadeNome)
    if (n) partes.push(n)
    if (c) partes.push(c)
    return partes.join(' · ')
}

function desenharCarimboPagina(page, fonts, width, carimboEsquerda) {
    const stamp = formatarCarimboDataHora()
    const font = fonts.regular
    const stampW = font.widthOfTextAtSize(stamp, FONT_SIZE_STAMP)
    const stampX = width - MARGIN_X - stampW
    const y = 24

    page.drawText(stamp, {
        x: stampX,
        y,
        size: FONT_SIZE_STAMP,
        font,
        color: COR_STAMP,
    })

    const textoEsq = sanitizarTextoPdf(carimboEsquerda)
    if (!textoEsq) return

    const larguraDisponivel = Math.max(0, stampX - MARGIN_X - GAP_CARIMBO)
    const exibir = encaixarTextoLargura(textoEsq, font, FONT_SIZE_STAMP, larguraDisponivel)
    if (!exibir) return

    page.drawText(exibir, {
        x: MARGIN_X,
        y,
        size: FONT_SIZE_STAMP,
        font,
        color: COR_STAMP,
    })
}

function adicionarLinkUri(page, uri, rect) {
    const annot = page.doc.context.register(
        page.doc.context.obj({
            Type: 'Annot',
            Subtype: 'Link',
            Rect: [rect.x, rect.y, rect.x + rect.width, rect.y + rect.height],
            Border: [0, 0, 0],
            A: {
                Type: 'Action',
                S: 'URI',
                URI: PDFString.of(uri),
            },
        }),
    )
    page.node.addAnnot(annot)
}

function medirBlocoDuvidas(fonts, larguraMax) {
    const corpo = fontCorpo(fonts)
    const aviso =
        'Esta tabela pode ter sofrido alguma alteração, consulte com nossa equipe para ver em sua região.'
    const linhasAviso = quebrarTexto(aviso, fonts.bold, FONT_SIZE_DUVIDAS, larguraMax - 36)
    let h = Math.max(22, linhasAviso.length * LINE_LEADING + 6) // aviso + ícone
    h += 14 // gap
    h += FONT_SIZE_DUVIDAS + 4 // empresa
    h += FONT_SIZE_DUVIDAS + 4 // crmv
    const resp =
        'Documento confeccionado e direcionado sob Responsabilidade Técnica homologada junto ao Conselho Regional de Medicina Veterinária.'
    const linhasResp = quebrarTexto(resp, corpo, FONT_SIZE_DUVIDAS - 0.5, larguraMax)
    h += linhasResp.length * (LINE_LEADING - 1) + 10
    h += FONT_SIZE_DUVIDAS + 6 // dúvidas título
    h += (LINE_LEADING + 2) * 4 // 4 canais
    return h
}

/**
 * @returns {number} yBottom do bloco
 */
function desenharBlocoDuvidas(page, fonts, x, yTop, larguraMax) {
    const corpo = fontCorpo(fonts)
    let y = yTop

    const aviso =
        'Esta tabela pode ter sofrido alguma alteração, consulte com nossa equipe para ver em sua região.'
    const linhasAviso = quebrarTexto(aviso, fonts.bold, FONT_SIZE_DUVIDAS, larguraMax - 36)
    const bannerH = Math.max(22, linhasAviso.length * LINE_LEADING + 6)
    const bannerY = y - bannerH
    const iconR = 7
    const iconCx = x + 10
    const iconCy = bannerY + bannerH / 2
    page.drawCircle({
        x: iconCx,
        y: iconCy,
        size: iconR,
        color: COR_INFO_ICON,
    })
    const iW = fonts.bold.widthOfTextAtSize('i', 9)
    page.drawText('i', {
        x: iconCx - iW / 2,
        y: iconCy - 3,
        size: 9,
        font: fonts.bold,
        color: COR_BRANCO,
    })
    let yAviso = bannerY + bannerH - 4 - FONT_SIZE_DUVIDAS
    linhasAviso.forEach((ln, i) => {
        page.drawText(ln, {
            x: x + 24,
            y: yAviso - i * LINE_LEADING,
            size: FONT_SIZE_DUVIDAS,
            font: fonts.bold,
            color: COR_INFO_TEXTO,
        })
    })
    y = bannerY - 14

    page.drawText('EMERDOG PLANO DE SAÚDE ANIMAL LTDA', {
        x,
        y: y - FONT_SIZE_DUVIDAS,
        size: FONT_SIZE_DUVIDAS,
        font: fonts.bold,
        color: COR_TEXTO,
    })
    y -= FONT_SIZE_DUVIDAS + 4
    page.drawText('CRMV RS-25732-PJ', {
        x,
        y: y - FONT_SIZE_DUVIDAS,
        size: FONT_SIZE_DUVIDAS,
        font: corpo,
        color: COR_TEXTO_OBS,
    })
    y -= FONT_SIZE_DUVIDAS + 6

    const resp =
        'Documento confeccionado e direcionado sob Responsabilidade Técnica homologada junto ao Conselho Regional de Medicina Veterinária.'
    const linhasResp = quebrarTexto(resp, corpo, FONT_SIZE_DUVIDAS - 0.5, larguraMax)
    linhasResp.forEach((ln, i) => {
        page.drawText(ln, {
            x,
            y: y - (FONT_SIZE_DUVIDAS - 0.5) - i * (LINE_LEADING - 1),
            size: FONT_SIZE_DUVIDAS - 0.5,
            font: corpo,
            color: COR_TEXTO_OBS,
        })
    })
    y -= linhasResp.length * (LINE_LEADING - 1) + 12

    page.drawText('Em caso de dúvidas, disponibilizamos os canais:', {
        x,
        y: y - FONT_SIZE_DUVIDAS,
        size: FONT_SIZE_DUVIDAS,
        font: fonts.bold,
        color: COR_NAVY,
    })
    y -= FONT_SIZE_DUVIDAS + 8

    const canais = [
        { texto: 'Canal de Atendimento pelo WhatsApp', url: LINK_WHATSAPP },
        { texto: 'Telefone: 54 3039-5909', url: null },
        { texto: 'E-mail: contato@emerdog.com.br', url: null },
        { texto: 'Acessar vídeo explicativo', url: LINK_VIDEO },
    ]
    for (const canal of canais) {
        const font = canal.url ? fonts.bold : corpo
        const color = canal.url ? COR_LINK : COR_TEXTO
        const ty = y - FONT_SIZE_DUVIDAS
        page.drawText(canal.texto, {
            x,
            y: ty,
            size: FONT_SIZE_DUVIDAS,
            font,
            color,
        })
        if (canal.url) {
            const tw = font.widthOfTextAtSize(canal.texto, FONT_SIZE_DUVIDAS)
            page.drawLine({
                start: { x, y: ty - 1 },
                end: { x: x + tw, y: ty - 1 },
                thickness: 0.6,
                color: COR_LINK,
            })
            adicionarLinkUri(page, canal.url, {
                x,
                y: ty - 2,
                width: tw,
                height: FONT_SIZE_DUVIDAS + 4,
            })
        }
        y -= LINE_LEADING + 2
    }

    return y
}

/**
 * Observações em folhas em branco (mesmo template da listagem de procedimentos).
 * Ao final de todas as OBS, desenha o bloco de dúvidas com links.
 * @returns {Promise<number>} páginas adicionadas
 */
async function adicionarPaginasObservacoesDinamicas(
    finalDoc,
    templateDoc,
    fonts,
    observacoes,
    carimboEsq,
) {
    const itens = normalizarListaObservacoes(observacoes)
    if (!itens.length) return 0

    const refPage = templateDoc.getPage(TEMPLATE_PAGE_INDEX)
    const { width, height } = refPage.getSize()
    const layout = colunasLayout(width)
    const x = MARGIN_X
    const larguraMax = layout.innerW
    const yTopLimit = height - MARGIN_TOP
    const yBottomLimit = MARGIN_BOTTOM
    const hDuvidas = medirBlocoDuvidas(fonts, larguraMax)

    const medidos = itens.map((item) => ({
        item,
        h: medirItemObservacaoModelo(item, fonts, larguraMax),
    }))

    let idx = 0
    let paginas = 0
    let guard = 0
    const maxPaginas = Math.max(10, medidos.length + 3)
    let precisaDuvidas = true

    while ((idx < medidos.length || precisaDuvidas) && guard < maxPaginas) {
        guard += 1
        paginas += 1
        const [tpl] = await finalDoc.copyPages(templateDoc, [TEMPLATE_PAGE_INDEX])
        const page = finalDoc.addPage(tpl)

        let y = yTopLimit
        const ehPrimeira = paginas === 1

        if (ehPrimeira) {
            const titulo = 'Observações'
            const titW = fonts.bold.widthOfTextAtSize(titulo, FONT_SIZE_OBS_H1)
            page.drawText(titulo, {
                x: x + (larguraMax - titW) / 2,
                y: y - FONT_SIZE_OBS_H1,
                size: FONT_SIZE_OBS_H1,
                font: fonts.bold,
                color: COR_NAVY,
            })
            y -= FONT_SIZE_OBS_H1 + OBS_H1_GAP
        } else if (idx < medidos.length) {
            const cont = 'Observações (cont.)'
            const titW = fonts.bold.widthOfTextAtSize(cont, FONT_SIZE_TITLE_CAT)
            page.drawText(cont, {
                x: x + (larguraMax - titW) / 2,
                y: y - FONT_SIZE_TITLE_CAT,
                size: FONT_SIZE_TITLE_CAT,
                font: fonts.bold,
                color: COR_NAVY,
            })
            y -= FONT_SIZE_TITLE_CAT + SECTION_GAP
        }

        const inicioIdx = idx
        while (idx < medidos.length) {
            const { item, h } = medidos[idx]
            const reservarDuvidas =
                idx === medidos.length - 1 ? hDuvidas + DUVIDAS_GAP : 0
            if (y - h - reservarDuvidas < yBottomLimit) break
            desenharItemObservacaoModelo(page, fonts, x, y, item, larguraMax)
            y -= h
            idx += 1
        }

        if (idx === inicioIdx && idx < medidos.length) {
            desenharItemObservacaoModelo(page, fonts, x, y, medidos[idx].item, larguraMax)
            y -= medidos[idx].h
            idx += 1
        }

        if (idx >= medidos.length && precisaDuvidas) {
            const cabeAqui = y - hDuvidas - DUVIDAS_GAP >= yBottomLimit
            if (cabeAqui) {
                y -= DUVIDAS_GAP
                desenharBlocoDuvidas(page, fonts, x, y, larguraMax)
                precisaDuvidas = false
            } else if (inicioIdx === idx) {
                // Página reservada só para o bloco de dúvidas.
                desenharBlocoDuvidas(page, fonts, x, yTopLimit, larguraMax)
                precisaDuvidas = false
            }
        }

        desenharCarimboPagina(page, fonts, width, carimboEsq)
    }

    return paginas
}

function renderizarUmaPagina(page, fonts, width, height, secoes, cursor, iconeEstetoscopio) {
    const layout = colunasLayout(width)
    let y = height - MARGIN_TOP
    let { secaoIdx, linhaIdx, zebra } = cursor
    const secaoIdxInicial = secaoIdx
    const linhaIdxInicial = linhaIdx
    let desenhouAlgoNestaPagina = false

    while (secaoIdx < secoes.length) {
        const secao = secoes[secaoIdx]
        const linhas = secao.linhas
        if (linhaIdx >= linhas.length) {
            secaoIdx += 1
            linhaIdx = 0
            continue
        }

        const ehContinuacaoNaPrimeiraSecaoDaPagina =
            secaoIdx === secaoIdxInicial && linhaIdxInicial > 0 && !desenhouAlgoNestaPagina
        const desenharTituloCategoria = linhaIdx === 0 || ehContinuacaoNaPrimeiraSecaoDaPagina

        const overhead =
            (desenharTituloCategoria ? SECTION_GAP + TITLE_BAR_HEIGHT : 0) + TABLE_HEADER_HEIGHT
        const alturaPrimeiraLinha = medirAlturaLinha(linhas[linhaIdx], fonts, layout.widths[0])

        if (y - overhead < LIMITE_LINHAS + alturaPrimeiraLinha) {
            return { secaoIdx, linhaIdx, zebra, done: false }
        }

        const cardTop = y - (desenharTituloCategoria ? SECTION_GAP : 0)
        const corpoTop = desenharTituloCategoria ? cardTop - TITLE_BAR_HEIGHT : cardTop

        let yCardBottom = corpoTop - TABLE_HEADER_HEIGHT
        {
            let yProbe = yCardBottom
            let iProbe = linhaIdx
            while (iProbe < linhas.length) {
                const hProbe = medirAlturaLinha(linhas[iProbe], fonts, layout.widths[0])
                if (yProbe - hProbe < LIMITE_LINHAS) break
                yProbe -= hProbe
                iProbe += 1
            }
            yCardBottom = yProbe - CARD_PADDING_BOTTOM
        }

        const topFundo = desenharTituloCategoria ? cardTop : corpoTop
        {
            const cardH = topFundo - yCardBottom
            if (cardH > 0) {
                desenharRetanguloArredondado(page, {
                    x: MARGIN_X,
                    yTop: topFundo,
                    width: layout.innerW,
                    height: cardH,
                    raio: CARD_RADIUS,
                    color: COR_BRANCO,
                })
            }
        }
        if (desenharTituloCategoria) {
            desenharBarraTitulo(page, fonts, {
                x: MARGIN_X,
                yTop: cardTop,
                innerW: layout.innerW,
                prefixo: 'Grupo de ',
                destaque: sanitizarTextoPdf(secao.nome) || 'Categoria',
            })
        }

        let yCursor = desenharCabecalhoTabela(page, fonts, layout, corpoTop, iconeEstetoscopio)
        const yTopoLinhas = yCursor
        desenhouAlgoNestaPagina = true

        while (linhaIdx < linhas.length) {
            const linha = linhas[linhaIdx]
            const h = medirAlturaLinha(linha, fonts, layout.widths[0])
            if (yCursor - h < LIMITE_LINHAS) {
                return { secaoIdx, linhaIdx, zebra, done: false }
            }
            const { yBottom } = desenharLinhaDados(page, fonts, layout, yCursor, linha, zebra, {
                semLinhaSuperior: yCursor === yTopoLinhas,
            })
            yCursor = yBottom
            zebra += 1
            linhaIdx += 1
        }

        secaoIdx += 1
        linhaIdx = 0
        y = yCursor - CARD_PADDING_BOTTOM - SECTION_GAP
    }

    return { secaoIdx, linhaIdx: 0, zebra, done: true }
}

/**
 * Pagina as seções: pede uma página a novaPagina() enquanto houver conteúdo,
 * renderiza e chama aposPagina(page). Exportada para testes com página que grava chamadas.
 */
export async function paginarSecoesHonorarios({
    secoes,
    fonts,
    width,
    height,
    iconeEstetoscopio,
    novaPagina,
    aposPagina = () => {},
}) {
    let cursor = { secaoIdx: 0, linhaIdx: 0, zebra: 0, done: false }
    let guard = 0
    const maxPaginas = Math.max(30, secoes.reduce((n, s) => n + s.linhas.length, 0) + 4)

    while (!cursor.done && guard < maxPaginas) {
        guard += 1
        const antes = `${cursor.secaoIdx}-${cursor.linhaIdx}`
        const page = await novaPagina()
        cursor = renderizarUmaPagina(page, fonts, width, height, secoes, cursor, iconeEstetoscopio)
        aposPagina(page)
        const depois = `${cursor.secaoIdx}-${cursor.linhaIdx}`
        if (!cursor.done && depois === antes) {
            cursor.linhaIdx += 1
        }
    }
}

/**
 * @param {{
 *   secoes: object[],
 *   cidadeNome?: string,
 *   prestadorNome?: string,
 *   carimboEsquerda?: string,
 *   pdfUrl?: string,
 *   observacoes?: Array<{ titulo?: string, mensagem: string }> | string | string[],
 * }} opts
 */
export async function gerarImpressaoHonorariosPdf(opts) {
    const pdfUrl = opts.pdfUrl || urlHonorariosPdf
    const resposta = await fetch(pdfUrl)
    if (!resposta.ok) throw new Error('Não foi possível carregar o PDF base de honorários.')
    const templateBytes = await resposta.arrayBuffer()
    const templateDoc = await PDFDocument.load(templateBytes)
    if (templateDoc.getPageCount() < 3) {
        throw new Error('O PDF base de honorários deve conter 3 páginas (capa, listagem, observações).')
    }

    const secoes = montarSecoesImpressao(opts.secoes)
    if (!secoes.length) {
        throw new Error('Selecione ao menos um procedimento para imprimir.')
    }

    const refPage = templateDoc.getPage(TEMPLATE_PAGE_INDEX)
    const { width, height } = refPage.getSize()
    const carimboEsq =
        String(opts.carimboEsquerda || '').trim() ||
        montarTextoCarimboEsquerda({
            nome: opts.prestadorNome,
            cidadeNome: opts.cidadeNome,
        })
    const observacoesDinamicas = normalizarListaObservacoes(opts.observacoes)

    const finalDoc = await PDFDocument.create()
    const fonts = await embedMontserratNoPdf(finalDoc)
    const iconPngBytes = await carregarSvgComoPngBytes(urlEstetoscopioSvg)
    const iconeEstetoscopio = await finalDoc.embedPng(iconPngBytes)

    const [capa] = await finalDoc.copyPages(templateDoc, [COVER_INDEX])
    finalDoc.addPage(capa)

    await paginarSecoesHonorarios({
        secoes,
        fonts,
        width,
        height,
        iconeEstetoscopio,
        novaPagina: async () => {
            const [tpl] = await finalDoc.copyPages(templateDoc, [TEMPLATE_PAGE_INDEX])
            return finalDoc.addPage(tpl)
        },
        aposPagina: (page) => desenharCarimboPagina(page, fonts, width, carimboEsq),
    })

    if (observacoesDinamicas.length) {
        // Folha em branco (mesmo template da listagem) + bloco de dúvidas ao final.
        await adicionarPaginasObservacoesDinamicas(
            finalDoc,
            templateDoc,
            fonts,
            observacoesDinamicas,
            carimboEsq,
        )
    } else {
        // Sem gatilhos: mantém a página estática do PDF base.
        const [obs] = await finalDoc.copyPages(templateDoc, [OBS_INDEX])
        finalDoc.addPage(obs)
    }

    return blobDePdfLib(finalDoc)
}

export function downloadImpressaoHonorariosPdf(blob, nomeArquivoBase) {
    const limpar = (s) =>
        String(s || '')
            .replace(/[\\/:*?"<>|]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
    const base = limpar(nomeArquivoBase)
    const nome = base
        ? base.toLowerCase().endsWith('.pdf')
            ? base
            : `Honorários - ${base}.pdf`
        : 'Honorários.pdf'
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = nome
    a.click()
    URL.revokeObjectURL(url)
}
