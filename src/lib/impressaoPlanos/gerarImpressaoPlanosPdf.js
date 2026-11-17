import { PDFDocument, rgb } from 'pdf-lib'
import { blobDePdfLib } from '../pdf/serializarPdf.js'
import { procedimentoIsentoLimiteGrupo } from '../categoriaLimitesGrupo.js'
import { embedMontserratNoPdf } from './montserratPdfFonts.js'
import { formatarCarimboDataHora } from '../pdf/formatarCarimboEmissao.js'
import {
    adicionarPaginasObservacoesDinamicas,
    normalizarListaObservacoes,
} from '../pdf/observacoesModeloPdf.js'
import urlEstetoscopioSvg from '../../assets/planos/estetoscopio.svg?url'

const ICON_CAB_SIZE_PT = 14
const ICON_CAB_GAP_PT = 4
const ICON_RASTER_PX = 64

const TEMPLATE_PAGE_INDEX = 1
const COVER_INDEX = 0
const OBS_INDEX_A = 2
const OBS_INDEX_B = 3

const MARGIN_X = 42
const MARGIN_TOP = 86
const MARGIN_BOTTOM = 58
const SECTION_GAP = 16
const CARD_RADIUS = 14
const TITLE_BAR_HEIGHT = 44
const TABLE_HEADER_HEIGHT = 36
const ROW_BASE_HEIGHT = 34
const ROW_DIVIDER_INSET = 14
const CARD_PADDING_BOTTOM = 12
// Grupo com limite mesclado: só é partido entre páginas se couberem ao menos N linhas na atual
// e sobrarem ao menos M na seguinte (evita linhas órfãs).
const MIN_LINHAS_GRUPO_PARTIDO = 5
const MIN_LINHAS_GRUPO_PARTIDO_RESTO = 2
const LINE_LEADING = 12
const FONT_SIZE_BODY = 10
const FONT_SIZE_HEADER = 11
const FONT_SIZE_TITLE_PREFIX = 15
const FONT_SIZE_TITLE_CAT = 15
const FONT_SIZE_STAMP = 7

const COR_NAVY = rgb(0x1e / 255, 0x31 / 255, 0x48 / 255) // #1E3148
const COR_TEXTO = rgb(58 / 255, 63 / 255, 75 / 255)
const COR_BRANCO = rgb(1, 1, 1)
// Linhas alternam entre branco e um branco levemente acinzentado (#FCFCFC).
const COR_ZEBRA = rgb(252 / 255, 252 / 255, 252 / 255)
const COR_BORDA = rgb(218 / 255, 220 / 255, 225 / 255)
const COR_STAMP = rgb(0.72, 0.72, 0.72)

const COL_FRAC = [0.44, 0.18, 0.18, 0.2]

function fontCorpo(fonts) {
    return fonts.light || fonts.regular
}

function sanitizarTextoPdf(texto) {
    return String(texto ?? '')
        .replace(/https?:\/\/\S+/gi, '')
        .replace(/www\.\S+/gi, '')
        .trim()
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

function nomeProcedimentoPdf(linha) {
    return sanitizarTextoPdf(linha?.nome) || '—'
}

function limiteGrupoPreenchido(valor) {
    return Boolean(String(valor ?? '').trim())
}

function medirAlturaLinha(linha, fonts, colProcW) {
    const corpo = fontCorpo(fonts)
    const linhasNome = quebrarTexto(linha.nome, corpo, FONT_SIZE_BODY, colProcW - 12)
    let h = ROW_BASE_HEIGHT
    if (linhasNome.length > 1) h += (linhasNome.length - 1) * LINE_LEADING
    return Math.max(ROW_BASE_HEIGHT, h)
}

/**
 * @param {Array<{ id: number, nome: string, limiteGrupoValor?: string, textoLimiteGrupo?: string, linhas: object[] }>} categorias
 */
function montarSecoesImpressao(categorias) {
    const secoes = []
    for (const cat of categorias || []) {
        const linhasMarcadas = (cat.linhas || []).filter(
            (l) => l.checked !== false && !l.apenasLoja && l.selecionavel !== false,
        )
        if (!linhasMarcadas.length) continue

        // Só mescla se houver valor de limite de grupo preenchido; senão célula individual ("—").
        const limiteGrupoAtivo = limiteGrupoPreenchido(cat.limiteGrupoValor)

        secoes.push({
            nome: String(cat.nome || 'Categoria'),
            textoLimiteGrupo: limiteGrupoAtivo ? String(cat.textoLimiteGrupo || '').trim() : '',
            limiteGrupoAtivo,
            linhas: linhasMarcadas.map((l) => {
                const isento = procedimentoIsentoLimiteGrupo(l)
                const usaLimiteGrupoLinha = limiteGrupoAtivo && !isento
                return {
                    nome: nomeProcedimentoPdf(l),
                    diferenca: sanitizarTextoPdf(l.diferenca) || '—',
                    carencia: sanitizarTextoPdf(l.carenciaExibicao ?? l.carencia) || '—',
                    limiteIndividual:
                        sanitizarTextoPdf(l.limiteIndividualExibicao ?? l.limite) || '—',
                    isentoLimiteGrupo: isento,
                    usaLimiteGrupoLinha,
                }
            }),
        })
    }
    return secoes
}

function indicesGrupoLimite(linhas) {
    const idx = []
    linhas.forEach((l, i) => {
        if (l.usaLimiteGrupoLinha) idx.push(i)
    })
    return idx
}

/** Altura útil para linhas numa página (com ou sem barra de título de seção). */
function calcularAlturaUtilPagina(height, comecaSecao) {
    const reservaTitulo = comecaSecao ? TITLE_BAR_HEIGHT + SECTION_GAP : 0
    return height - MARGIN_TOP - MARGIN_BOTTOM - reservaTitulo - TABLE_HEADER_HEIGHT
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
    const y = textY + FONT_SIZE_HEADER * 0.36 - size / 2
    page.drawImage(iconePng, {
        x,
        y,
        width: size,
        height: size,
    })
}

/**
 * pdf-lib ignora borderRadius em drawRectangle; desenha o retângulo arredondado por caminho SVG
 * (y do caminho cresce para baixo, a partir de yTop). `soTopo` arredonda só os cantos superiores.
 */
function desenharRetanguloArredondado(page, { x, yTop, width, height, raio, color, soTopo = false }) {
    const r = Math.max(0, Math.min(raio, width / 2, height / 2))
    const w = width
    const h = height
    const d = soTopo
        ? `M 0 ${h} L 0 ${r} A ${r} ${r} 0 0 1 ${r} 0 L ${w - r} 0 A ${r} ${r} 0 0 1 ${w} ${r} L ${w} ${h} Z`
        : `M ${r} 0 L ${w - r} 0 A ${r} ${r} 0 0 1 ${w} ${r} L ${w} ${h - r} A ${r} ${r} 0 0 1 ${w - r} ${h} L ${r} ${h} A ${r} ${r} 0 0 1 0 ${h - r} L 0 ${r} A ${r} ${r} 0 0 1 ${r} 0 Z`
    page.drawSvgPath(d, { x, y: yTop, color, borderWidth: 0 })
}

function desenharBarraTituloSecao(page, fonts, x, yTop, innerW, nomeCategoria) {
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

    const baseY = y + (TITLE_BAR_HEIGHT - FONT_SIZE_TITLE_PREFIX) / 2 + 2
    const corPrefixo = fonts.light || fonts.regular
    // Barra vertical fina antes do título, como no layout do Canva.
    page.drawLine({
        start: { x: x + 16, y: y + 11 },
        end: { x: x + 16, y: y + TITLE_BAR_HEIGHT - 11 },
        thickness: 0.8,
        color: rgb(0.78, 0.82, 0.88),
    })
    const prefix = 'Grupo de '
    const textoX = x + 28
    page.drawText(prefix, {
        x: textoX,
        y: baseY,
        size: FONT_SIZE_TITLE_PREFIX,
        font: corPrefixo,
        color: COR_BRANCO,
    })
    const prefixW = corPrefixo.widthOfTextAtSize(prefix, FONT_SIZE_TITLE_PREFIX)
    const catNome = sanitizarTextoPdf(nomeCategoria) || 'Categoria'
    const linhasCat = quebrarTexto(
        catNome,
        fonts.bold,
        FONT_SIZE_TITLE_CAT,
        innerW - 28 - prefixW - 14,
    )
    page.drawText(linhasCat[0], {
        x: textoX + prefixW,
        y: baseY,
        size: FONT_SIZE_TITLE_CAT,
        font: fonts.bold,
        color: COR_BRANCO,
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
    const textY = y + TABLE_HEADER_HEIGHT / 2 - FONT_SIZE_HEADER * 0.36
    const labels = ['Procedimento', 'Diferença', 'Carências', 'Limites']
    labels.forEach((label, idx) => {
        const colX = xs[idx]
        const colW = widths[idx]
        if (idx === 0) {
            // Ícone + rótulo centralizados sobre a coluna, como no Canva.
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
    const h = yTop - yBottom
    const blockH = (Math.max(1, numLinhas) - 1) * LINE_LEADING + fontSize
    // Sobe 0,14·corpo: centraliza pelas maiúsculas, não pela linha de base.
    return yBottom + (h + blockH) / 2 - fontSize + fontSize * 0.14
}

function desenharLinhaDados(page, fonts, layout, yTop, linha, indiceZebra, opcoesLimite) {
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

    // Divisória no TOPO da linha (desenhada depois do fundo, para a zebra não cobri-la).
    // A primeira linha do bloco não tem borda superior; a última do grupo fica sem borda inferior.
    if (!opcoesLimite?.semLinhaSuperior) {
        page.drawLine({
            start: { x: MARGIN_X + ROW_DIVIDER_INSET, y: yTop },
            end: { x: MARGIN_X + layout.innerW - ROW_DIVIDER_INSET, y: yTop },
            thickness: 0.8,
            color: COR_BORDA,
        })
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
    ;[linha.diferenca, linha.carencia].forEach((val, i) => {
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

    if (opcoesLimite?.desenharCelulaIndividual) {
        const lim = sanitizarTextoPdf(opcoesLimite.texto) || '—'
        const linhasLim = quebrarTexto(lim, corpo, FONT_SIZE_BODY, widths[3] - 8)
        const yLim = yPrimeiraLinhaBloco(yTop, yBottom, linhasLim.length, FONT_SIZE_BODY)
        linhasLim.forEach((ln, i) => {
            page.drawText(ln, {
                x: textoCentralizado(xs[3], widths[3], ln, corpo, FONT_SIZE_BODY),
                y: yLim - i * LINE_LEADING,
                size: FONT_SIZE_BODY,
                font: corpo,
                color: COR_TEXTO,
            })
        })
    }

    return { yBottom, h }
}

function desenharCelulaLimiteGrupoMesclada(page, fonts, layout, yTop, yBottom, texto) {
    const { xs, widths } = layout
    const corpo = fontCorpo(fonts)
    const x = xs[3]
    const w = widths[3]
    const h = yTop - yBottom
    if (h <= 0) return

    page.drawRectangle({
        x,
        y: yBottom,
        width: w,
        height: h,
        color: COR_BRANCO,
    })
    const lim = sanitizarTextoPdf(texto) || '—'
    const linhasLim = quebrarTexto(lim, corpo, FONT_SIZE_BODY, w - 10)
    const yLim = yPrimeiraLinhaBloco(yTop, yBottom, linhasLim.length, FONT_SIZE_BODY)
    linhasLim.forEach((ln, i) => {
        page.drawText(ln, {
            x: textoCentralizado(x, w, ln, corpo, FONT_SIZE_BODY),
            y: yLim - i * LINE_LEADING,
            size: FONT_SIZE_BODY,
            font: corpo,
            color: COR_TEXTO,
        })
    })
}

function alturaGrupo(linhas, indices, fonts, colProcW) {
    return indices.reduce((acc, i) => acc + medirAlturaLinha(linhas[i], fonts, colProcW), 0)
}

function desenharCarimboPagina(page, fonts, width) {
    const stamp = formatarCarimboDataHora()
    const w = fonts.regular.widthOfTextAtSize(stamp, FONT_SIZE_STAMP)
    page.drawText(stamp, {
        x: width - MARGIN_X - w,
        y: 24,
        size: FONT_SIZE_STAMP,
        font: fonts.regular,
        color: COR_STAMP,
    })
}

/**
 * Renderiza uma página de conteúdo. Sempre inicia no topo útil da página.
 * @param {object} cursor — pode incluir grupoMergeAberto indicando continuidade de rowspan entre páginas
 */
function renderizarUmaPagina(page, fonts, width, height, secoes, cursor, iconeEstetoscopio) {
    const layout = colunasLayout(width)
    let y = height - MARGIN_TOP
    let { secaoIdx, linhaIdx, zebra } = cursor
    let grupoMergeAberto = Boolean(cursor.grupoMergeAberto)
    let mergeTopY = null
    const secaoIdxInicial = secaoIdx
    const linhaIdxInicial = linhaIdx
    let desenhouAlgoNestaPagina = false

    while (secaoIdx < secoes.length) {
        const secao = secoes[secaoIdx]
        const linhas = secao.linhas
        if (linhaIdx >= linhas.length) {
            secaoIdx += 1
            linhaIdx = 0
            grupoMergeAberto = false
            mergeTopY = null
            continue
        }

        // Título da categoria em toda página onde a seção aparece (início ou continuação).
        const ehContinuacaoNaPrimeiraSecaoDaPagina =
            secaoIdx === secaoIdxInicial && linhaIdxInicial > 0 && !desenhouAlgoNestaPagina
        const desenharTituloCategoria =
            (linhaIdx === 0 && !grupoMergeAberto) || ehContinuacaoNaPrimeiraSecaoDaPagina

        const overhead =
            (desenharTituloCategoria ? SECTION_GAP + TITLE_BAR_HEIGHT : 0) + TABLE_HEADER_HEIGHT
        const alturaPrimeiraLinha = medirAlturaLinha(linhas[linhaIdx], fonts, layout.widths[0])

        // Não desenhar título/cabeçalho se a primeira linha real não couber — evita página quase vazia.
        if (y - overhead < MARGIN_BOTTOM + alturaPrimeiraLinha) {
            return {
                secaoIdx,
                linhaIdx,
                zebra,
                grupoMergeAberto: desenhouAlgoNestaPagina
                    ? grupoMergeAberto
                    : Boolean(cursor.grupoMergeAberto),
                done: false,
            }
        }

        const idxGrupoPre = indicesGrupoLimite(linhas)
        const temGrupoPre = idxGrupoPre.length > 0 && secao.textoLimiteGrupo
        if (temGrupoPre && linhaIdx === idxGrupoPre[0] && !grupoMergeAberto) {
            const hGrupo = alturaGrupo(linhas, idxGrupoPre, fonts, layout.widths[0])
            const espacoAposChrome = y - overhead - MARGIN_BOTTOM
            const cabeAqui = hGrupo <= espacoAposChrome
            const cabeEmPaginaNova = hGrupo <= calcularAlturaUtilPagina(height, true)
            // Parte o grupo entre páginas só se sobrar espaço para linhas suficientes aqui
            // (e restarem linhas na próxima); senão empurra o grupo inteiro para a página nova.
            let linhasQueCabem = 0
            {
                let acc = 0
                for (const i of idxGrupoPre) {
                    acc += medirAlturaLinha(linhas[i], fonts, layout.widths[0])
                    if (acc > espacoAposChrome - CARD_PADDING_BOTTOM) break
                    linhasQueCabem += 1
                }
            }
            const restantes = idxGrupoPre.length - linhasQueCabem
            const podePartir =
                linhasQueCabem >= MIN_LINHAS_GRUPO_PARTIDO && restantes >= MIN_LINHAS_GRUPO_PARTIDO_RESTO
            if (!cabeAqui && cabeEmPaginaNova && !podePartir) {
                return {
                    secaoIdx,
                    linhaIdx,
                    zebra,
                    grupoMergeAberto: false,
                    done: false,
                }
            }
        }

        const cardTop = y - (desenharTituloCategoria ? SECTION_GAP : 0)
        const corpoTop = desenharTituloCategoria ? cardTop - TITLE_BAR_HEIGHT : cardTop

        // Mede até onde o card deve ir nesta página (só até a última linha que cabe).
        let yCardBottom = corpoTop - TABLE_HEADER_HEIGHT
        {
            let yProbe = yCardBottom
            let iProbe = linhaIdx
            while (iProbe < linhas.length) {
                const hProbe = medirAlturaLinha(linhas[iProbe], fonts, layout.widths[0])
                if (yProbe - hProbe < MARGIN_BOTTOM) break
                yProbe -= hProbe
                iProbe += 1
            }
            yCardBottom = yProbe - CARD_PADDING_BOTTOM
        }

        // Fundo branco só até o fim do conteúdo deste bloco (gap = cor da folha).
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
            desenharBarraTituloSecao(page, fonts, MARGIN_X, cardTop, layout.innerW, secao.nome)
        }

        let yCursor = desenharCabecalhoTabela(page, fonts, layout, corpoTop, iconeEstetoscopio)
        const yTopoLinhas = yCursor
        desenhouAlgoNestaPagina = true

        const idxGrupo = idxGrupoPre
        const temGrupo = temGrupoPre
        const ultimoIdxGrupo = idxGrupo.length ? idxGrupo[idxGrupo.length - 1] : -1

        if (grupoMergeAberto && temGrupo) {
            mergeTopY = yCursor
        }

        while (linhaIdx < linhas.length) {
            const linha = linhas[linhaIdx]
            const h = medirAlturaLinha(linha, fonts, layout.widths[0])
            const naGrupo = temGrupo && linha.usaLimiteGrupoLinha
            const ehPrimeiroGrupo = naGrupo && linhaIdx === idxGrupo[0]
            const ehUltimoGrupo = naGrupo && linhaIdx === ultimoIdxGrupo

            if (ehPrimeiroGrupo && !grupoMergeAberto) {
                mergeTopY = yCursor
                grupoMergeAberto = true
            }

            if (yCursor - h < MARGIN_BOTTOM) {
                if (grupoMergeAberto && mergeTopY != null && naGrupo) {
                    desenharCelulaLimiteGrupoMesclada(
                        page,
                        fonts,
                        layout,
                        mergeTopY,
                        yCursor,
                        secao.textoLimiteGrupo,
                    )
                }
                return {
                    secaoIdx,
                    linhaIdx,
                    zebra,
                    grupoMergeAberto: grupoMergeAberto && naGrupo,
                    done: false,
                }
            }

            const { yBottom } = desenharLinhaDados(page, fonts, layout, yCursor, linha, zebra, {
                desenharCelulaIndividual: !linha.usaLimiteGrupoLinha,
                texto: linha.limiteIndividual,
                semLinhaSuperior: yCursor === yTopoLinhas,
            })

            if (ehUltimoGrupo && mergeTopY != null) {
                desenharCelulaLimiteGrupoMesclada(
                    page,
                    fonts,
                    layout,
                    mergeTopY,
                    yBottom,
                    secao.textoLimiteGrupo,
                )
                mergeTopY = null
                grupoMergeAberto = false
            }

            yCursor = yBottom
            zebra += 1
            linhaIdx += 1
        }

        secaoIdx += 1
        linhaIdx = 0
        grupoMergeAberto = false
        mergeTopY = null
        y = yCursor - CARD_PADDING_BOTTOM - SECTION_GAP
    }

    return { secaoIdx, linhaIdx: 0, zebra, grupoMergeAberto: false, done: true }
}

/**
 * @param {{
 *   pdfUrl: string,
 *   categorias: object[],
 *   observacoes?: Array<{ titulo?: string, mensagem: string }> | string | string[],
 * }} opts
 */
export async function gerarImpressaoPlanosPdf(opts) {
    const resposta = await fetch(opts.pdfUrl)
    if (!resposta.ok) throw new Error('Não foi possível carregar o PDF base do plano.')
    const templateBytes = await resposta.arrayBuffer()
    const templateDoc = await PDFDocument.load(templateBytes)
    if (templateDoc.getPageCount() < 4) {
        throw new Error('O PDF base do plano deve conter 4 páginas (capa, listagem, observações).')
    }

    const secoes = montarSecoesImpressao(opts.categorias)
    if (!secoes.length) {
        throw new Error('Selecione ao menos um procedimento para imprimir.')
    }

    const observacoesDinamicas = normalizarListaObservacoes(opts.observacoes)
    const refPage = templateDoc.getPage(TEMPLATE_PAGE_INDEX)
    const { width, height } = refPage.getSize()

    const finalDoc = await PDFDocument.create()
    const fonts = await embedMontserratNoPdf(finalDoc)
    const iconPngBytes = await carregarSvgComoPngBytes(urlEstetoscopioSvg)
    const iconeEstetoscopio = await finalDoc.embedPng(iconPngBytes)

    const [capa] = await finalDoc.copyPages(templateDoc, [COVER_INDEX])
    desenharCarimboPagina(finalDoc.addPage(capa), fonts, width)

    let cursor = {
        secaoIdx: 0,
        linhaIdx: 0,
        zebra: 0,
        grupoMergeAberto: false,
        done: false,
    }
    let guard = 0
    const maxPaginas = Math.max(30, secoes.reduce((n, s) => n + s.linhas.length, 0) + 4)

    while (!cursor.done && guard < maxPaginas) {
        guard += 1
        const antes = `${cursor.secaoIdx}-${cursor.linhaIdx}-${cursor.grupoMergeAberto}`
        const [tpl] = await finalDoc.copyPages(templateDoc, [TEMPLATE_PAGE_INDEX])
        const page = finalDoc.addPage(tpl)
        cursor = renderizarUmaPagina(page, fonts, width, height, secoes, cursor, iconeEstetoscopio)
        desenharCarimboPagina(page, fonts, width)
        const depois = `${cursor.secaoIdx}-${cursor.linhaIdx}-${cursor.grupoMergeAberto}`
        if (!cursor.done && depois === antes) {
            cursor.linhaIdx += 1
            cursor.grupoMergeAberto = false
        }
    }

    if (observacoesDinamicas.length) {
        await adicionarPaginasObservacoesDinamicas({
            finalDoc,
            templateDoc,
            templatePageIndex: TEMPLATE_PAGE_INDEX,
            fonts,
            observacoes: observacoesDinamicas,
            onPagina: (page, pageWidth) => desenharCarimboPagina(page, fonts, pageWidth),
        })
    } else {
        // Sem gatilhos: páginas de OBS do PDF molde.
        for (const idx of [OBS_INDEX_A, OBS_INDEX_B]) {
            const [obs] = await finalDoc.copyPages(templateDoc, [idx])
            finalDoc.addPage(obs)
        }
    }

    return blobDePdfLib(finalDoc)
}

export function downloadImpressaoPlanosPdf(blob, planoNome, cidadeNome) {
    const limpar = (s) =>
        String(s || '')
            .replace(/[\\/:*?"<>|]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
    const nome = `${limpar(planoNome)} ${limpar(cidadeNome)}.pdf`.trim() || 'Plano Cidade.pdf'
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = nome
    a.click()
    URL.revokeObjectURL(url)
}
