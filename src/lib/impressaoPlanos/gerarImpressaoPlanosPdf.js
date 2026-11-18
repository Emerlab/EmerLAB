import { PDFDocument, rgb } from 'pdf-lib'
import { blobDePdfLib } from '../pdf/serializarPdf.js'
import { procedimentoIsentoLimiteGrupo } from '../categoriaLimitesGrupo.js'
import { embedMontserratNoPdf } from './montserratPdfFonts.js'
import { nomeArquivoImpressaoPlanosPdf } from './statusZipPlanos.js'
import { formatarCarimboDataHora } from '../pdf/formatarCarimboEmissao.js'
import {
    adicionarPaginasObservacoesDinamicas,
    desenharItemObservacaoModelo,
    medirItemObservacaoModelo,
    normalizarListaObservacoes,
} from '../pdf/observacoesModeloPdf.js'
import {
    LINHAS_QUE_ACOMPANHAM_BLOCO,
    alturasItensBloco,
    blocoCabeComLinhasLevadas,
    desenharBlocoInformacoes,
    linhasALevarComBloco,
    planejarFatiaBlocoInformacoes,
} from '../pdf/blocoInformacoesPdf.js'

// Reexportadas: a regra "manter junto" é compartilhada com o gerador do Honorários.
export { LINHAS_QUE_ACOMPANHAM_BLOCO, blocoCabeComLinhasLevadas, linhasALevarComBloco }
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
    contarLinhasQueCabem,
    decidirPartirGrupo,
    limiteInferiorLinhas,
    yBaselineCentro,
    yPrimeiraLinhaBloco as yPrimeiraLinhaBlocoBase,
} from '../pdf/estiloTabelaPdf.js'
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
// Limite das linhas: margem + respiro do card (o padding fica dentro da margem).
const LIMITE_LINHAS = limiteInferiorLinhas(MARGIN_BOTTOM)
const SECTION_GAP = 16
// Grupo com limite mesclado: só é partido entre páginas se couberem ao menos N linhas na atual
// e sobrarem ao menos M na seguinte (evita linhas órfãs).
const MIN_LINHAS_GRUPO_PARTIDO = 5
const MIN_LINHAS_GRUPO_PARTIDO_RESTO = 2
// Quando nenhum item do bloco Informações cabe após as linhas, as últimas N linhas da seção
// vão para a página seguinte junto com o bloco (o bloco não fica separado da tabela).
const LINE_LEADING = 12
const FONT_SIZE_STAMP = 7

const COR_TEXTO = rgb(58 / 255, 63 / 255, 75 / 255)
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

/** Observações do grupo (Informações no fim do cartão), sem a numeração (o bloco numera). */
function itensInformacoesDoGrupo(observacoesPorGrupo, cat) {
    const brutos = observacoesPorGrupo?.[String(cat?.id)]
    return normalizarListaObservacoes(brutos || []).map(({ titulo, mensagem }) => ({
        titulo,
        mensagem,
    }))
}

/**
 * @param {Array<{ id: number, nome: string, limiteGrupoValor?: string, textoLimiteGrupo?: string, linhas: object[] }>} categorias
 * @param {Record<string, Array<{ titulo?: string, mensagem: string }>>} [observacoesPorGrupo]
 */
export function montarSecoesImpressao(categorias, observacoesPorGrupo = {}) {
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
            infoItens: itensInformacoesDoGrupo(observacoesPorGrupo, cat),
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

/** Espaço para linhas + bloco numa página de continuação da seção, até MARGIN_BOTTOM. */
export function alturaUtilBlocoContinuacao(height) {
    // calcularAlturaUtilPagina desconta LIMITE_LINHAS; o bloco vai até a margem.
    return calcularAlturaUtilPagina(height, true) + (LIMITE_LINHAS - MARGIN_BOTTOM)
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
    return height - MARGIN_TOP - LIMITE_LINHAS - reservaTitulo - TABLE_HEADER_HEIGHT
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
    return yPrimeiraLinhaBlocoBase(yTop, yBottom, numLinhas, fontSize, LINE_LEADING)
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

function medirItemInformacoes(fonts) {
    return (item, larguraMax) => medirItemObservacaoModelo(item, fonts, larguraMax)
}

/** Altura (por item, já numerado) do bloco Informações de cada seção; [] sem observações. */
function calcularAlturasInformacoes(secoes, fonts, innerW) {
    return secoes.map((secao) =>
        alturasItensBloco({
            itens: secao.infoItens || [],
            innerW,
            medirItem: medirItemInformacoes(fonts),
        }),
    )
}

/** Desenha os itens [fatia.inicio, fatia.fim) do bloco, numerados a partir de inicio + 1. */
function desenharFatiaInformacoes(page, fonts, layout, yTop, secao, fatia) {
    return desenharBlocoInformacoes(page, fonts, {
        x: MARGIN_X,
        yTop,
        innerW: layout.innerW,
        itens: (secao.infoItens || []).slice(fatia.inicio, fatia.fim),
        numeroInicial: fatia.inicio + 1,
        medirItem: medirItemInformacoes(fonts),
        desenharItem: desenharItemObservacaoModelo,
    })
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
function renderizarUmaPagina(
    page,
    fonts,
    width,
    height,
    secoes,
    cursor,
    iconeEstetoscopio,
    alturasInformacoes = [],
) {
    const layout = colunasLayout(width)
    let y = height - MARGIN_TOP
    let { secaoIdx, linhaIdx, zebra } = cursor
    let grupoMergeAberto = Boolean(cursor.grupoMergeAberto)
    let mergeTopY = null
    const secaoIdxInicial = secaoIdx
    const linhaIdxInicial = linhaIdx
    let desenhouAlgoNestaPagina = false

    // Continuação do bloco Informações de uma seção: cartão novo com o título do grupo
    // repetido e o restante dos itens (sem cabeçalho de tabela). O cursor já aponta
    // para a seção seguinte (secaoIdx = pendente.secaoIdx + 1, linhaIdx = 0).
    const pendente = cursor.blocoPendente
    if (pendente && secoes[pendente.secaoIdx]) {
        const secaoInfo = secoes[pendente.secaoIdx]
        const cardTop = y - SECTION_GAP
        const corpoTop = cardTop - TITLE_BAR_HEIGHT
        // Página nova: ao menos um item entra (item maior que a página não trava a paginação).
        // O padding final do bloco substitui o do cartão: o limite do bloco é a margem.
        const fatia = planejarFatiaBlocoInformacoes({
            alturasItens: alturasInformacoes[pendente.secaoIdx] || [],
            inicio: pendente.proximoItem,
            alturaDisponivel: corpoTop - MARGIN_BOTTOM,
            forcarAoMenosUm: true,
        })
        const yCardBottom = corpoTop - fatia.altura
        desenharRetanguloArredondado(page, {
            x: MARGIN_X,
            yTop: cardTop,
            width: layout.innerW,
            height: cardTop - yCardBottom,
            raio: CARD_RADIUS,
            color: COR_BRANCO,
        })
        desenharBarraTitulo(page, fonts, {
            x: MARGIN_X,
            yTop: cardTop,
            innerW: layout.innerW,
            prefixo: 'Grupo de ',
            destaque: sanitizarTextoPdf(secaoInfo.nome) || 'Categoria',
        })
        desenharFatiaInformacoes(page, fonts, layout, corpoTop, secaoInfo, fatia)
        desenhouAlgoNestaPagina = true
        if (!fatia.completo) {
            return {
                secaoIdx,
                linhaIdx,
                zebra,
                grupoMergeAberto: false,
                blocoPendente: { secaoIdx: pendente.secaoIdx, proximoItem: fatia.fim },
                done: false,
            }
        }
        y = yCardBottom - SECTION_GAP
    }

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
        if (y - overhead < LIMITE_LINHAS + alturaPrimeiraLinha) {
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
            const espacoAposChrome = y - overhead - LIMITE_LINHAS
            const cabeAqui = hGrupo <= espacoAposChrome
            const cabeEmPaginaNova = hGrupo <= calcularAlturaUtilPagina(height, true)
            // Parte o grupo entre páginas só se sobrar espaço para linhas suficientes aqui
            // (e restarem linhas na próxima); senão empurra o grupo inteiro para a página nova.
            const linhasQueCabem = contarLinhasQueCabem(
                idxGrupoPre.map((i) => medirAlturaLinha(linhas[i], fonts, layout.widths[0])),
                espacoAposChrome,
            )
            const restantes = idxGrupoPre.length - linhasQueCabem
            const podePartir = decidirPartirGrupo({
                linhasQueCabem,
                restantes,
                minAqui: MIN_LINHAS_GRUPO_PARTIDO,
                minResto: MIN_LINHAS_GRUPO_PARTIDO_RESTO,
            })
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
        // Bloco Informações desta seção nesta página (só quando a seção termina aqui).
        let fatiaInformacoes = null
        // Linhas [linhaIdx, fimLinhasPagina) saem nesta página; menor que linhas.length só
        // quando as últimas linhas vão para a seguinte junto com o bloco Informações.
        let fimLinhasPagina = linhas.length
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
            const alturasInfo = alturasInformacoes[secaoIdx] || []
            if (iProbe >= linhas.length && alturasInfo.length) {
                // O padding final do bloco substitui o CARD_PADDING_BOTTOM: limite = margem.
                fatiaInformacoes = planejarFatiaBlocoInformacoes({
                    alturasItens: alturasInfo,
                    inicio: 0,
                    alturaDisponivel: yProbe - MARGIN_BOTTOM,
                })
                const fatiaVazia = fatiaInformacoes.fim === fatiaInformacoes.inicio
                let levar = linhasALevarComBloco({
                    linhasNestaPagina: iProbe - linhaIdx,
                    fatiaVazia,
                })
                if (levar > 0) {
                    let alturaLinhasLevadas = 0
                    for (let k = iProbe - levar; k < iProbe; k += 1) {
                        alturaLinhasLevadas += medirAlturaLinha(linhas[k], fonts, layout.widths[0])
                    }
                    // Item que não cabe nem com as linhas levadas numa página nova: não leva
                    // (o bloco vai sozinho, como antes). Isso também impede levar de novo na
                    // página de continuação, que tem exatamente esta geometria.
                    if (
                        !blocoCabeComLinhasLevadas({
                            alturaPrimeiroItem: alturasInfo[0],
                            alturaLinhasLevadas,
                            alturaUtilBloco: alturaUtilBlocoContinuacao(height),
                        })
                    ) {
                        levar = 0
                    }
                }
                if (levar > 0) {
                    // Recua a sonda: o cartão termina após as linhas que ficam, sem bloco; a
                    // seção continua na página seguinte (linhas levadas + bloco).
                    for (let k = 0; k < levar; k += 1) {
                        iProbe -= 1
                        yProbe += medirAlturaLinha(linhas[iProbe], fonts, layout.widths[0])
                    }
                    fimLinhasPagina = iProbe
                    fatiaInformacoes = null
                    yCardBottom = yProbe - CARD_PADDING_BOTTOM
                } else if (!fatiaVazia) {
                    yCardBottom = yProbe - fatiaInformacoes.altura
                }
            }
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

        const idxGrupo = idxGrupoPre
        const temGrupo = temGrupoPre
        const ultimoIdxGrupo = idxGrupo.length ? idxGrupo[idxGrupo.length - 1] : -1

        if (grupoMergeAberto && temGrupo) {
            mergeTopY = yCursor
        }

        while (linhaIdx < linhas.length) {
            if (linhaIdx >= fimLinhasPagina) {
                // Linhas levadas com o bloco: fecha aqui a célula mesclada aberta e a reabre na
                // página seguinte (o restante do grupo ainda não foi desenhado).
                if (grupoMergeAberto && mergeTopY != null) {
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
                    grupoMergeAberto: grupoMergeAberto && mergeTopY != null,
                    done: false,
                }
            }
            const linha = linhas[linhaIdx]
            const h = medirAlturaLinha(linha, fonts, layout.widths[0])
            const naGrupo = temGrupo && linha.usaLimiteGrupoLinha
            const ehPrimeiroGrupo = naGrupo && linhaIdx === idxGrupo[0]
            const ehUltimoGrupo = naGrupo && linhaIdx === ultimoIdxGrupo

            if (ehPrimeiroGrupo && !grupoMergeAberto) {
                mergeTopY = yCursor
                grupoMergeAberto = true
            }

            if (yCursor - h < LIMITE_LINHAS) {
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

        if (fatiaInformacoes) {
            // Todas as linhas da seção já foram desenhadas (e a célula mesclada, fechada).
            const temItensAqui = fatiaInformacoes.fim > fatiaInformacoes.inicio
            const yFimCard = temItensAqui
                ? desenharFatiaInformacoes(page, fonts, layout, yCursor, secao, fatiaInformacoes)
                : yCursor - CARD_PADDING_BOTTOM
            if (!fatiaInformacoes.completo) {
                return {
                    secaoIdx: secaoIdx + 1,
                    linhaIdx: 0,
                    zebra,
                    grupoMergeAberto: false,
                    blocoPendente: { secaoIdx, proximoItem: fatiaInformacoes.fim },
                    done: false,
                }
            }
            secaoIdx += 1
            linhaIdx = 0
            grupoMergeAberto = false
            mergeTopY = null
            y = yFimCard - SECTION_GAP
            continue
        }

        secaoIdx += 1
        linhaIdx = 0
        grupoMergeAberto = false
        mergeTopY = null
        y = yCursor - CARD_PADDING_BOTTOM - SECTION_GAP
    }

    return { secaoIdx, linhaIdx: 0, zebra, grupoMergeAberto: false, blocoPendente: null, done: true }
}

/** Assinatura de progresso do cursor (guarda anti-laço). */
function assinaturaCursor(cursor) {
    const p = cursor.blocoPendente
    const bloco = p ? `${p.secaoIdx}:${p.proximoItem}` : '-'
    return `${cursor.secaoIdx}-${cursor.linhaIdx}-${cursor.grupoMergeAberto}-${bloco}`
}

/**
 * Pagina as seções: pede uma página a novaPagina() enquanto houver conteúdo,
 * renderiza e chama aposPagina(page). Exportada para testes com página que grava chamadas.
 */
export async function paginarSecoesPlanos({
    secoes,
    fonts,
    width,
    height,
    iconeEstetoscopio,
    novaPagina,
    aposPagina = () => {},
}) {
    const alturasInformacoes = calcularAlturasInformacoes(
        secoes,
        fonts,
        colunasLayout(width).innerW,
    )
    let cursor = {
        secaoIdx: 0,
        linhaIdx: 0,
        zebra: 0,
        grupoMergeAberto: false,
        blocoPendente: null,
        done: false,
    }
    let guard = 0
    const totalLinhas = secoes.reduce((n, s) => n + s.linhas.length, 0)
    // Cada item de Informações ocupa no máximo uma página de continuação.
    const totalItensInfo = alturasInformacoes.reduce((n, a) => n + a.length, 0)
    const maxPaginas = Math.max(30, totalLinhas + 4) + totalItensInfo

    while (!cursor.done && guard < maxPaginas) {
        guard += 1
        const antes = assinaturaCursor(cursor)
        const page = await novaPagina()
        cursor = renderizarUmaPagina(
            page,
            fonts,
            width,
            height,
            secoes,
            cursor,
            iconeEstetoscopio,
            alturasInformacoes,
        )
        aposPagina(page)
        const depois = assinaturaCursor(cursor)
        if (!cursor.done && depois === antes) {
            if (cursor.blocoPendente) {
                const total = alturasInformacoes[cursor.blocoPendente.secaoIdx]?.length || 0
                console.warn(
                    'Paginação sem progresso: item do bloco Informações ignorado para evitar laço infinito.',
                )
                const proximo = cursor.blocoPendente.proximoItem + 1
                cursor.blocoPendente =
                    proximo < total ? { ...cursor.blocoPendente, proximoItem: proximo } : null
            } else {
                cursor.linhaIdx += 1
                cursor.grupoMergeAberto = false
            }
        }
    }
}

/**
 * @param {{
 *   pdfUrl: string,
 *   categorias: object[],
 *   observacoes?: Array<{ titulo?: string, mensagem: string }> | string | string[],
 *   observacoesPorGrupo?: Record<string, Array<{ titulo?: string, mensagem: string }>>,
 * }} opts — observacoes = só as gerais (páginas do fim; sem gerais → páginas fixas do modelo);
 *   observacoesPorGrupo = bloco Informações no fim do cartão de cada categoria
 *   (chave String(categoria.id)).
 */
export async function gerarImpressaoPlanosPdf(opts) {
    const resposta = await fetch(opts.pdfUrl)
    if (!resposta.ok) throw new Error('Não foi possível carregar o PDF base do plano.')
    const templateBytes = await resposta.arrayBuffer()
    const templateDoc = await PDFDocument.load(templateBytes)
    if (templateDoc.getPageCount() < 4) {
        throw new Error('O PDF base do plano deve conter 4 páginas (capa, listagem, observações).')
    }

    const secoes = montarSecoesImpressao(opts.categorias, opts.observacoesPorGrupo || {})
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

    await paginarSecoesPlanos({
        secoes,
        fonts,
        width,
        height,
        iconeEstetoscopio,
        novaPagina: async () => {
            const [tpl] = await finalDoc.copyPages(templateDoc, [TEMPLATE_PAGE_INDEX])
            return finalDoc.addPage(tpl)
        },
        aposPagina: (page) => desenharCarimboPagina(page, fonts, width),
    })

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
    const nome = nomeArquivoImpressaoPlanosPdf(planoNome, cidadeNome)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = nome
    a.click()
    URL.revokeObjectURL(url)
}
