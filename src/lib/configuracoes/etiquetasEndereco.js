import ExcelJS from 'exceljs'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { blobDePdfLib } from '../pdf/serializarPdf.js'

/**
 * Colacril CA4263 (conforme embalagem):
 * - Folha A4
 * - Etiqueta 99,1 × 38,1 mm
 * - 14 etiquetas/folha (2×7)
 * Margens/gap padrão deste formato A4 no Brasil (4,7 / 15,1 / 2,5 mm).
 * Texto alinhado à esquerda.
 */
export const ETIQUETAS_POR_PAGINA = 14
export const MODELO_ETIQUETA = 'Colacril CA4263'

const MM = 72 / 25.4
const PAGE_W = 210 * MM
const PAGE_H = 297 * MM
const LABEL_W = 99.1 * MM
const LABEL_H = 38.1 * MM
const MARGIN_TOP = 15.1 * MM
const MARGIN_LEFT = 4.7 * MM
const GAP_H = 2.5 * MM
/** Recuo interno do texto (esquerda) */
const PAD_X = 2.5 * MM
/** Distância do topo da etiqueta até a 1ª linha de texto */
const PAD_Y = 4.5 * MM

const COL_X = [MARGIN_LEFT + PAD_X, MARGIN_LEFT + LABEL_W + GAP_H + PAD_X]
const ROW_Y = Array.from({ length: 7 }, (_, i) => MARGIN_TOP + PAD_Y + i * LABEL_H)
const LABEL_MAX_W = LABEL_W - 2 * PAD_X

const FONT_SIZE = 10
/** Tamanho mínimo ao encolher texto longo (pt) */
const FONT_SIZE_MIN = 6
/** Endereço pode ocupar até 3 linhas (fonte intermediária encolhe se precisar) */
const ENDERECO_MAX_LINHAS = 3
const PAD_BOTTOM = 2.5 * MM
const COR_TEXTO = rgb(0.05, 0.05, 0.05)

/**
 * Rótulo «Endereço:» das linhas importadas. Aceita grafias que aparecem nos PDFs do outro sistema,
 * como «Enderço:» (sem o 2º «e») e «Endereco:» (sem cedilha).
 */
const ROTULO_ENDERECO = /^ender[a-zç]{0,4}o\s*:/i
const ROTULO_ENDERECO_PREFIXO = /^ender[a-zç]{0,4}o\s*:\s*/i

export function normalizarCabecalhoEtiqueta(texto) {
    return String(texto || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
}

function detectarCampoCabecalho(h) {
    if (!h) return null
    if (h === 'nome' || h.startsWith('nome ') || h.includes('destinat') || h === 'cliente' || h === 'tutor') {
        return 'nome'
    }
    if (
        h.includes('logradouro') ||
        h === 'rua' ||
        h.startsWith('rua ') ||
        h === 'endereco' ||
        h.startsWith('endereco ') ||
        h.includes('endereco rua')
    ) {
        return 'endereco'
    }
    if (h === 'bairro' || h.startsWith('bairro ')) return 'bairro'
    if (h === 'cidade' || h.startsWith('cidade ') || h === 'municipio') return 'cidade'
    if (h === 'uf' || h === 'estado' || h === 'sg' || h === 'sigla') return 'uf'
    if (h === 'cep' || h.includes('codigo postal') || h.includes('postal')) return 'cep'
    if (h.includes('complemento') || h === 'numero' || h === 'n') return 'complemento'
    return null
}

function celulaTexto(cell) {
    if (cell == null) return ''
    if (typeof cell === 'object' && cell.text != null) return String(cell.text).trim()
    if (typeof cell === 'object' && cell.result != null) return String(cell.result).trim()
    return String(cell).trim()
}

function formatarCep(raw) {
    const d = String(raw || '').replace(/\D+/g, '')
    if (d.length === 8) return `${d.slice(0, 5)}-${d.slice(5)}`
    return String(raw || '').trim()
}

function montarLinhaLocalidade({ bairro, cidade, uf }) {
    const parts = [bairro, cidade, uf].map((p) => String(p || '').trim()).filter(Boolean)
    if (!parts.length) return ''
    if (parts.length === 1) return parts[0].toUpperCase()
    if (parts.length === 2) return `${parts[0].toUpperCase()} - ${parts[1].toUpperCase()}`
    const [b, c, u] = parts
    return `${b.toUpperCase()} - ${c.toUpperCase()} - ${u.toUpperCase()}`
}

function montarEnderecoLinha({ endereco, complemento }) {
    const base = String(endereco || '').trim()
    const comp = String(complemento || '').trim()
    if (!base && !comp) return ''
    if (!comp) return base
    if (!base) return comp
    if (/,?\s*\d/.test(base) || base.includes(comp)) return base
    return `${base}, ${comp}`
}

/**
 * @returns {{ nome: string, endereco: string, localidade: string, cep: string }}
 */
export function normalizarEtiquetaRegistro(raw = {}) {
    const nome = String(raw.nome || '').trim()
    const enderecoBruto = montarEnderecoLinha(raw)
    const endereco = enderecoBruto
        ? enderecoBruto.replace(ROTULO_ENDERECO_PREFIXO, '').trim()
        : ''
    const localidade = String(raw.localidade || '').trim() || montarLinhaLocalidade(raw)
    const cep = formatarCep(raw.cep)
    return { nome, endereco, localidade, cep }
}

export function etiquetaTemConteudo(et) {
    const e = normalizarEtiquetaRegistro(et)
    return Boolean(e.nome || e.endereco || e.localidade || e.cep)
}

/**
 * Avisos de uma etiqueta que parece mal lida ou incompleta (lista vazia = nada suspeito).
 * Serve para a pessoa conferir a prévia antes de imprimir: um destinatário trocado vira correspondência perdida.
 * Linha totalmente vazia não gera aviso.
 * @returns {string[]}
 */
export function avisosEtiqueta(raw) {
    if (!etiquetaTemConteudo(raw)) return []
    const e = normalizarEtiquetaRegistro(raw)
    const avisos = []
    if (!e.nome) avisos.push('Sem nome do destinatário.')
    else if (ROTULO_ENDERECO.test(e.nome) || pareceCep(e.nome) || pareceLocalidade(e.nome)) {
        avisos.push('O nome parece ser um endereço ou CEP: confira se não trocou com outra etiqueta.')
    }
    if (!e.endereco) avisos.push('Sem endereço (rua e número).')
    else if (ROTULO_ENDERECO.test(e.endereco)) avisos.push('O endereço começa com «Endereço:».')
    if (!e.localidade) avisos.push('Sem bairro, cidade e UF.')
    else if (!pareceLocalidade(e.localidade)) avisos.push('Bairro - Cidade - UF fora do formato esperado.')
    if (!e.cep) avisos.push('Sem CEP.')
    else if (e.cep.replace(/\D/g, '').length !== 8) avisos.push('CEP incompleto.')
    return avisos
}

function pareceCep(texto) {
    const t = String(texto || '').trim()
    if (/^cep\s*/i.test(t)) return true
    const d = t.replace(/\D+/g, '')
    return d.length === 8 && /^\d{5}-?\d{3}$/.test(t.replace(/\s/g, ''))
}

/** Ex.: CENTRO - CAXIAS DO SUL - RS (bairro - cidade - UF) */
function pareceLocalidade(texto) {
    const t = String(texto || '').trim()
    if (!t || ROTULO_ENDERECO.test(t) || pareceCep(t)) return false
    return /\s-\s.+\s-\s*[A-Za-z]{2}\s*$/.test(t)
}

function juntarTextoCampo(a, b) {
    const sa = String(a || '').trim()
    const sb = String(b || '').trim()
    if (!sa) return sb
    if (!sb) return sa
    if (sa.includes(sb)) return sa
    if (sb.includes(sa)) return sb
    return `${sa} ${sb}`.trim()
}

/**
 * Etiqueta tipicamente completa no layout do outro sistema (sempre tem CEP).
 */
export function etiquetaPareceCompleta(et) {
    const e = normalizarEtiquetaRegistro(et)
    if (!e.nome) return false
    if (pareceCep(e.nome) || ROTULO_ENDERECO.test(e.nome) || pareceLocalidade(e.nome)) {
        return false
    }
    // Sem CEP = incompleta (fonte costuma cortar o CEP para a folha seguinte)
    return Boolean(e.cep && (e.endereco || e.localidade))
}

/**
 * Fragmento típico quando a fonte corta a etiqueta no fim/início da folha.
 */
export function etiquetaPareceFragmento(et) {
    const e = normalizarEtiquetaRegistro(et)
    if (!etiquetaTemConteudo(e)) return false
    if (etiquetaPareceCompleta(e)) return false
    if (!e.nome && (e.endereco || e.localidade || e.cep)) return true
    if (pareceCep(e.nome) || ROTULO_ENDERECO.test(e.nome) || pareceLocalidade(e.nome)) {
        return true
    }
    if (e.nome && e.endereco && !e.cep) return true
    if (e.nome && !e.endereco && !e.localidade && !e.cep) return true
    if (e.nome && e.localidade && !e.cep) return true
    return !e.cep
}

/** Só sobra CEP/localidade/endereço — remanescente do card cortado na folha anterior. */
export function ehRemanescenteDeCorte(et) {
    const e = reclassificarCamposSoltos(et)
    if (e.nome && !pareceCep(e.nome) && !pareceLocalidade(e.nome) && !ROTULO_ENDERECO.test(e.nome)) {
        return false
    }
    return Boolean(e.cep || e.localidade || e.endereco)
}

function precisaRemanescente(prev, rem) {
    if (etiquetaPareceCompleta(prev)) return false
    if (!prev.nome) return false
    if (rem.cep && !prev.cep) return true
    if (rem.localidade && !prev.localidade) return true
    if (rem.endereco && !prev.endereco) return true
    return false
}

function reclassificarCamposSoltos(e) {
    let { nome, endereco, localidade, cep } = normalizarEtiquetaRegistro(e)
    if (nome && !cep && pareceCep(nome)) {
        cep = nome
        nome = ''
    }
    // "95096-175 LUIZA…" — CEP órfão grudado no nome do card seguinte
    if (nome) {
        const m = nome.match(/^(\d{5}-?\d{3})\s+(.+)$/)
        if (m) {
            if (!cep) cep = m[1]
            nome = m[2].trim()
        }
    }
    if (nome && !endereco && ROTULO_ENDERECO.test(nome)) {
        endereco = nome.replace(ROTULO_ENDERECO_PREFIXO, '').trim()
        nome = ''
    }
    if (nome && !localidade && pareceLocalidade(nome)) {
        localidade = nome
        nome = ''
    }
    if (endereco && !localidade && pareceLocalidade(endereco) && !/^ender[a-zç]{0,4}o\b/i.test(String(e.endereco || ''))) {
        if (!nome) {
            localidade = endereco
            endereco = ''
        }
    }
    return normalizarEtiquetaRegistro({ nome, endereco, localidade, cep })
}

export function fundirEtiquetaParcial(a, b) {
    const A = reclassificarCamposSoltos(a)
    const B = reclassificarCamposSoltos(b)
    return normalizarEtiquetaRegistro({
        nome: A.nome || B.nome,
        endereco: juntarTextoCampo(A.endereco, B.endereco),
        localidade: A.localidade || B.localidade,
        cep: A.cep || B.cep,
    })
}

/**
 * Recompõe etiquetas partidas entre folhas.
 * Remanescentes (CEP órfão no topo da folha seguinte) voltam ao card incompleto
 * mais antigo que ainda precisa deles — nunca para o card seguinte.
 */
export function recomporEtiquetasCortadas(lista) {
    const bruto = (Array.isArray(lista) ? lista : [])
        .map(reclassificarCamposSoltos)
        .filter(etiquetaTemConteudo)
    if (bruto.length < 2) return bruto

    const out = []
    for (const et of bruto) {
        if (ehRemanescenteDeCorte(et)) {
            const idx = out.findIndex((p) => precisaRemanescente(p, et))
            if (idx >= 0) {
                out[idx] = fundirEtiquetaParcial(out[idx], et)
                continue
            }
            // Sem dono: não vira card fantasma (evita cascata)
            if (!et.nome && !et.endereco) continue
            out.push(et)
            continue
        }

        if (!out.length) {
            out.push(et)
            continue
        }

        const prev = out[out.length - 1]
        // Continuação do mesmo card (endereço partido), sem nome novo
        if (
            !etiquetaPareceCompleta(prev) &&
            etiquetaPareceFragmento(et) &&
            !et.nome &&
            (et.endereco || et.localidade)
        ) {
            out[out.length - 1] = fundirEtiquetaParcial(prev, et)
            continue
        }

        out.push(et)
    }
    return out
}

/**
 * Se a célula misturou CEP órfão (topo da folha) com o card seguinte, separa o CEP.
 */
function separarCepsOrfaosDoInicio(texts) {
    const linhas = [...(texts || [])]
    const orfaos = []
    while (linhas.length >= 2 && pareceCep(linhas[0])) {
        const restoTemNome =
            linhas.slice(1).some((t) => ROTULO_ENDERECO.test(t)) ||
            linhas.slice(1).some(
                (t) => !pareceCep(t) && !pareceLocalidade(t) && !ROTULO_ENDERECO.test(t),
            )
        if (!restoTemNome) break
        orfaos.push(linhas.shift())
    }
    return { orfaos, texts: linhas }
}

/**
 * "SAO JOSE - CAXIAS DO SUL - RS ALEXANDRE…"
 * "CENTRO - CAXIAS DO SUL - RS 95020-260 TATIANA…"
 * ou "… RS MARIA… Endereço: DA"
 */
function separarVazamentoNaLocalidade(texto) {
    const t = String(texto || '').trim()
    if (!t) return { localidade: '', resto: [] }

    const m = t.match(/^(.+\s-\s.+\s-\s*[A-Za-z]{2})(?:\s+(.*))?$/s)
    if (!m || !pareceLocalidade(m[1])) {
        return { localidade: t, resto: [] }
    }
    const localidade = m[1].trim()
    let restoStr = String(m[2] || '').trim()
    if (!restoStr) return { localidade, resto: [] }

    const endMatch = restoStr.match(/^(.*?)(\s*)(Endere[cç]o:\s*.+)$/i)
    if (endMatch) {
        const antesEnd = endMatch[1].trim()
        const endExtra = endMatch[3].trim()
        const partes = []
        const cepNome = antesEnd.match(/^(\d{5}-?\d{3})\s*(.*)$/)
        if (cepNome) {
            partes.push(cepNome[1])
            if (cepNome[2].trim()) partes.push(cepNome[2].trim())
        } else if (antesEnd) {
            partes.push(antesEnd)
        }
        partes.push(endExtra)
        return { localidade, resto: partes.filter(Boolean) }
    }

    // Localidade + CEP + Nome (remanescente da folha anterior colado no card seguinte)
    const cepNome = restoStr.match(/^(\d{5}-?\d{3})\s+(.+)$/)
    if (cepNome) {
        return { localidade, resto: [cepNome[1], cepNome[2].trim()].filter(Boolean) }
    }
    if (pareceCep(restoStr)) {
        return { localidade, resto: [restoStr] }
    }

    return { localidade, resto: [restoStr] }
}

/**
 * Tira localidade/CEP órfãos grudados na frente do nome.
 * Ex.: "CENTRO - CAXIAS DO SUL - RS 95020-260 TATIANA…"
 */
function extrairRemanescentesAntesDoNome(textoNome) {
    let s = String(textoNome || '').trim()
    /** @type {{ localidade?: string, cep?: string }[]} */
    const remanescentes = []
    if (!s) return { remanescentes, nome: '' }

    const mLoc = s.match(/^(.+\s-\s.+\s-\s*[A-Za-z]{2})\s+(.*)$/s)
    if (mLoc && pareceLocalidade(mLoc[1])) {
        remanescentes.push({ localidade: mLoc[1].trim() })
        s = mLoc[2].trim()
    }

    const mCep = s.match(/^(\d{5}-?\d{3})\s+(.*)$/)
    if (mCep) {
        remanescentes.push({ cep: mCep[1] })
        s = mCep[2].trim()
    } else if (pareceCep(s)) {
        remanescentes.push({ cep: s.replace(/^cep\s*/i, '').trim() })
        s = ''
    }

    return { remanescentes, nome: s }
}

/** Quebra linhas em que a fonte colou o próximo card no fim da localidade. */
function expandirLinhasColadas(texts) {
    const out = []
    for (const raw of texts || []) {
        const t = String(raw || '').trim()
        if (!t) continue
        const sep = separarVazamentoNaLocalidade(t)
        if (sep.resto.length && pareceLocalidade(sep.localidade)) {
            out.push(sep.localidade, ...sep.resto)
            continue
        }
        out.push(t)
    }
    return out
}

/**
 * Converte linhas de texto (já ordenadas) em 1+ registros.
 * Para no fim de cada etiqueta — não engole o nome/endereço do card seguinte.
 */
export function parseLinhasEmEtiquetas(textsIn) {
    let texts = expandirLinhasColadas(
        [...(textsIn || [])].map((t) => String(t || '').trim()).filter(Boolean),
    )
    const out = []
    let guard = 0

    while (texts.length && guard < 500) {
        guard += 1
        const tamanhoAntes = texts.length
        texts = expandirLinhasColadas(texts)

        const { orfaos, texts: rest } = separarCepsOrfaosDoInicio(texts)
        for (const c of orfaos) {
            out.push(normalizarEtiquetaRegistro({ cep: c.replace(/^cep\s*/i, '').trim() }))
        }
        texts = rest
        if (!texts.length) break

        if (texts.length === 1 && pareceCep(texts[0])) {
            out.push(normalizarEtiquetaRegistro({ cep: texts[0].replace(/^cep\s*/i, '').trim() }))
            break
        }

        if (texts.length === 1 && pareceLocalidade(texts[0])) {
            out.push(normalizarEtiquetaRegistro({ localidade: texts[0] }))
            texts = []
            continue
        }

        const idxEnd = texts.findIndex((t) => ROTULO_ENDERECO.test(t))
        let nome = ''
        let endereco = ''
        let localidade = ''
        let cep = ''
        /** @type {string[]} */
        let sobra = []

        if (idxEnd >= 0) {
            const brutoAntes = texts.slice(0, idxEnd)
            // Localidade/CEP órfãos como linhas próprias antes do nome
            const nomeParts = []
            for (const t of brutoAntes) {
                if (pareceCep(t)) {
                    out.push(normalizarEtiquetaRegistro({ cep: t.replace(/^cep\s*/i, '').trim() }))
                    continue
                }
                if (pareceLocalidade(t)) {
                    out.push(normalizarEtiquetaRegistro({ localidade: t }))
                    continue
                }
                nomeParts.push(t)
            }
            const brutoNome = nomeParts.join(' ').trim()
            const { remanescentes, nome: nomeLimpo } = extrairRemanescentesAntesDoNome(brutoNome)
            for (const r of remanescentes) {
                out.push(normalizarEtiquetaRegistro(r))
            }
            nome = nomeLimpo

            const endParts = [texts[idxEnd].replace(ROTULO_ENDERECO_PREFIXO, '').trim()]
            let viuLocalidade = false
            let i = idxEnd + 1

            for (; i < texts.length; i += 1) {
                const t = texts[i]

                if (pareceCep(t)) {
                    cep = t.replace(/^cep\s*/i, '').trim()
                    i += 1
                    break
                }

                if (pareceLocalidade(t)) {
                    if (viuLocalidade) break
                    localidade = t
                    viuLocalidade = true
                    continue
                }

                if (viuLocalidade) break

                endParts.push(t)
            }

            sobra = texts.slice(i)
            endereco = endParts.filter(Boolean).join(' ').trim()
        } else if (pareceLocalidade(texts[0])) {
            localidade = texts[0]
            sobra = texts.slice(1)
        } else {
            nome = texts[0] || ''
            let i = 1
            if (texts[i] && ROTULO_ENDERECO.test(texts[i])) {
                endereco = texts[i].replace(ROTULO_ENDERECO_PREFIXO, '').trim()
                i += 1
            }
            if (texts[i] && pareceLocalidade(texts[i])) {
                localidade = texts[i]
                i += 1
            }
            if (texts[i] && pareceCep(texts[i])) {
                cep = texts[i].replace(/^cep\s*/i, '').trim()
                i += 1
            }
            sobra = texts.slice(i)
        }

        if (/^emerdog\b/i.test(nome) && /telefone/i.test(texts.join(' '))) {
            texts = sobra.length ? sobra : texts.slice(1)
            continue
        }

        const reg = reclassificarCamposSoltos({ nome, endereco, localidade, cep })
        if (etiquetaTemConteudo(reg)) out.push(reg)

        texts = sobra
        if (texts.length >= tamanhoAntes) texts = texts.slice(1)
    }

    return out
}

/** Diferença de y (pt) abaixo da qual duas etiquetas de colunas diferentes estão na mesma fileira. */
const TOLERANCIA_FILEIRA = 10

/** Junta itens de texto na mesma linha visual (|dy| < 4) e devolve as linhas de cima para baixo. */
function linhasDaColuna(itens) {
    const linhas = []
    for (const it of [...itens].sort((a, b) => a.y - b.y || a.x - b.x)) {
        const ultima = linhas[linhas.length - 1]
        if (ultima && Math.abs(it.y - ultima.y) < 4) ultima.text = `${ultima.text} ${it.str}`.trim()
        else linhas.push({ y: it.y, text: it.str })
    }
    return linhas.filter((l) => l.text)
}

/**
 * Onde termina o resto da etiqueta anterior dentro do trecho entre dois «Endereço:».
 * O que vem depois é o nome da próxima. Ordem: depois do CEP, depois da localidade, senão no maior vão vertical.
 * Devolve o índice da primeira linha do nome (0 = o trecho todo é nome).
 */
function inicioDoNome(trecho) {
    const idxCep = trecho.findIndex((l) => pareceCep(l.text))
    if (idxCep >= 0) return idxCep + 1
    const idxLoc = trecho.findIndex((l) => pareceLocalidade(l.text))
    if (idxLoc >= 0) return idxLoc + 1
    let melhor = 0
    let maiorVao = 0
    for (let i = 1; i < trecho.length; i += 1) {
        const vao = trecho[i].y - trecho[i - 1].y
        if (vao > maiorVao) {
            maiorVao = vao
            melhor = i
        }
    }
    return melhor
}

/**
 * Divide as linhas de UMA coluna em etiquetas, ancorando em cada «Endereço:». Não depende da grade da folha:
 * PDFs com a posição deslocada continuam certos, porque nome, endereço, localidade e CEP são ligados pela ordem.
 * @returns {{ y: number, texts: string[] }[]}
 */
function etiquetasDaColuna(linhas) {
    const ancoras = linhas.map((l, i) => (ROTULO_ENDERECO.test(l.text) ? i : -1)).filter((i) => i >= 0)
    if (!ancoras.length) return linhas.length ? [{ y: linhas[0].y, texts: linhas.map((l) => l.text) }] : []

    // Sobra do topo (cauda de uma etiqueta cortada na folha anterior) + nome da 1ª etiqueta
    const topo = linhas.slice(0, ancoras[0])
    const corteTopo = inicioDoNome(topo)
    const grupos = []
    if (corteTopo > 0) grupos.push({ y: topo[0].y, texts: topo.slice(0, corteTopo).map((l) => l.text) })
    let nomeAtual = topo.slice(corteTopo)

    ancoras.forEach((a, k) => {
        const proxima = ancoras[k + 1] ?? linhas.length
        const trecho = linhas.slice(a + 1, proxima)
        // Último trecho: não há próximo nome, tudo é corpo da etiqueta.
        const corte = k === ancoras.length - 1 ? trecho.length : inicioDoNome(trecho)
        const corpo = [linhas[a], ...trecho.slice(0, corte)]
        const inicio = nomeAtual.length ? nomeAtual[0].y : linhas[a].y
        grupos.push({ y: inicio, texts: [...nomeAtual, ...corpo].map((l) => l.text) })
        nomeAtual = trecho.slice(corte)
    })
    return grupos
}

/**
 * Agrupa itens de texto de um PDF de etiquetas (2 colunas) em registros.
 * Aceita o layout exportado pelo outro sistema (nome / Endereço / bairro-cidade-UF / CEP).
 * Cada coluna é lida de cima para baixo ancorando em «Endereço:»; a ordem final é fileira a fileira (esquerda, direita).
 * @param {{ str: string, x: number, y: number }[]} items y=0 no topo da página
 */
export function agruparItensTextoEmEtiquetas(items, pageWidth = PAGE_W) {
    const lista = (items || [])
        .map((it) => ({
            str: String(it.str || '').trim(),
            x: Number(it.x) || 0,
            y: Number(it.y) || 0,
        }))
        .filter((it) => it.str)
    if (!lista.length) return []

    const mid = pageWidth / 2
    const colunas = [lista.filter((it) => it.x < mid), lista.filter((it) => it.x >= mid)]
    const blocos = []
    colunas.forEach((itens, col) => {
        for (const g of etiquetasDaColuna(linhasDaColuna(itens))) blocos.push({ ...g, col })
    })

    // Fileiras: blocos com y de início parecido (colunas lado a lado) ficam juntos.
    blocos.sort((a, b) => a.y - b.y || a.col - b.col)
    let fileira = -1
    let yFileira = -Infinity
    for (const b of blocos) {
        if (b.y - yFileira > TOLERANCIA_FILEIRA) {
            fileira += 1
            yFileira = b.y
        }
        b.fileira = fileira
    }
    blocos.sort((a, b) => a.fileira - b.fileira || a.col - b.col)

    const out = []
    for (const b of blocos) out.push(...parseLinhasEmEtiquetas(b.texts))
    return out
}

async function carregarPdfJs() {
    const pdfjs = await import('pdfjs-dist')
    try {
        const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
        if (pdfjs.GlobalWorkerOptions && worker?.default) {
            pdfjs.GlobalWorkerOptions.workerSrc = worker.default
        }
    } catch {
        // Fallback: CDN da mesma versão (evita travar se o worker local falhar)
        const v = pdfjs.version || '4.10.38'
        if (pdfjs.GlobalWorkerOptions) {
            pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${v}/build/pdf.worker.min.mjs`
        }
    }
    return pdfjs
}

/**
 * Extrai etiquetas de um PDF (texto posicionado).
 * @param {ArrayBuffer} data
 * @param {{ limite?: number }} [opts]
 */
export async function parsePdfEtiquetas(data, opts = {}) {
    const limite = Math.min(Math.max(Number(opts.limite) || 500, 1), 2000)
    try {
        const pdfjs = await carregarPdfJs()
        // Copiar bytes: getDocument pode desanexar o ArrayBuffer
        const bytes =
            data instanceof ArrayBuffer
                ? new Uint8Array(data.slice(0))
                : new Uint8Array(data)
        const loadingTask = pdfjs.getDocument({ data: bytes })
        const doc = await loadingTask.promise
        const itens = []
        for (let p = 1; p <= doc.numPages; p += 1) {
            const page = await doc.getPage(p)
            const viewport = page.getViewport({ scale: 1 })
            const content = await page.getTextContent()
            const pageItems = []
            for (const it of content.items || []) {
                const str = String(it.str || '').trim()
                if (!str) continue
                const tx = it.transform?.[4] ?? 0
                const ty = it.transform?.[5] ?? 0
                const yFromTop = viewport.height - ty
                pageItems.push({ str, x: tx, y: yFromTop })
            }
            itens.push(...agruparItensTextoEmEtiquetas(pageItems, viewport.width))
            if (itens.length >= limite * 2) break
        }
        try {
            await doc.destroy?.()
        } catch {
            /* ignore */
        }
        // Fonte costuma partir etiqueta no fim da folha — recompõe antes do limite
        const recompostos = recomporEtiquetasCortadas(itens)
        const cortados = recompostos.slice(0, limite)
        if (!cortados.length) {
            return {
                ok: false,
                erro: 'Não encontrei texto de etiquetas no PDF. Exporte com texto selecionável (não só imagem).',
                itens: [],
            }
        }
        return { ok: true, itens: cortados, total: cortados.length }
    } catch (e) {
        return { ok: false, erro: e?.message || String(e), itens: [] }
    }
}

/**
 * Lê Excel (.xlsx), CSV ou PDF e devolve etiquetas.
 * @param {ArrayBuffer|string} data
 * @param {{ nomeArquivo?: string, limite?: number }} [opts]
 */
export async function parseArquivoEtiquetas(data, opts = {}) {
    const limite = Math.min(Math.max(Number(opts.limite) || 500, 1), 2000)
    const nomeArquivo = String(opts.nomeArquivo || '').toLowerCase()
    const isCsv = nomeArquivo.endsWith('.csv') || typeof data === 'string'
    const isPdf = nomeArquivo.endsWith('.pdf')

    if (isPdf) {
        if (typeof data === 'string') {
            return { ok: false, erro: 'PDF inválido.', itens: [] }
        }
        return parsePdfEtiquetas(data, { limite })
    }

    if (isCsv) {
        const texto =
            typeof data === 'string'
                ? data
                : new TextDecoder('utf-8').decode(data instanceof ArrayBuffer ? data : new Uint8Array(data))
        return parseCsvEtiquetas(texto, limite)
    }

    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(data)
    const sheet = wb.worksheets[0]
    if (!sheet) return { ok: false, erro: 'Planilha vazia.', itens: [] }

    const headerRow = sheet.getRow(1)
    const mapa = {}
    headerRow.eachCell({ includeEmpty: false }, (cell, col) => {
        const campo = detectarCampoCabecalho(normalizarCabecalhoEtiqueta(celulaTexto(cell.value)))
        if (campo && mapa[campo] == null) mapa[campo] = col
    })

    if (!mapa.nome && !mapa.endereco && !mapa.cep) {
        return {
            ok: false,
            erro: 'Não encontrei colunas de Nome / Endereço / CEP. Use o modelo baixado nesta tela.',
            itens: [],
        }
    }

    const itens = []
    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        if (rowNumber === 1) return
        if (itens.length >= limite) return
        const get = (campo) => (mapa[campo] != null ? celulaTexto(row.getCell(mapa[campo]).value) : '')
        const reg = normalizarEtiquetaRegistro({
            nome: get('nome'),
            endereco: get('endereco'),
            complemento: get('complemento'),
            bairro: get('bairro'),
            cidade: get('cidade'),
            uf: get('uf'),
            cep: get('cep'),
        })
        if (etiquetaTemConteudo(reg)) itens.push(reg)
    })

    return { ok: true, itens, total: itens.length }
}

function parseCsvEtiquetas(texto, limite) {
    const linhas = String(texto || '')
        .replace(/^\uFEFF/, '')
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean)
    if (linhas.length < 2) return { ok: false, erro: 'CSV sem dados.', itens: [] }

    const sep = linhas[0].includes(';') ? ';' : ','
    const headers = splitCsvLine(linhas[0], sep).map(normalizarCabecalhoEtiqueta)
    const mapa = {}
    headers.forEach((h, i) => {
        const campo = detectarCampoCabecalho(h)
        if (campo && mapa[campo] == null) mapa[campo] = i
    })
    if (!mapa.nome && !mapa.endereco && !mapa.cep) {
        return {
            ok: false,
            erro: 'CSV sem colunas reconhecidas (Nome, Endereço, CEP…).',
            itens: [],
        }
    }

    const itens = []
    for (let r = 1; r < linhas.length && itens.length < limite; r += 1) {
        const cols = splitCsvLine(linhas[r], sep)
        const get = (campo) => (mapa[campo] != null ? String(cols[mapa[campo]] || '').trim() : '')
        const reg = normalizarEtiquetaRegistro({
            nome: get('nome'),
            endereco: get('endereco'),
            complemento: get('complemento'),
            bairro: get('bairro'),
            cidade: get('cidade'),
            uf: get('uf'),
            cep: get('cep'),
        })
        if (etiquetaTemConteudo(reg)) itens.push(reg)
    }
    return { ok: true, itens, total: itens.length }
}

function splitCsvLine(line, sep) {
    const out = []
    let cur = ''
    let inQ = false
    for (let i = 0; i < line.length; i += 1) {
        const ch = line[i]
        if (ch === '"') {
            if (inQ && line[i + 1] === '"') {
                cur += '"'
                i += 1
            } else inQ = !inQ
            continue
        }
        if (ch === sep && !inQ) {
            out.push(cur)
            cur = ''
            continue
        }
        cur += ch
    }
    out.push(cur)
    return out
}

/** Gera Excel modelo com cabeçalhos. */
export async function baixarModeloEtiquetasExcel() {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Etiquetas')
    ws.columns = [
        { header: 'Nome', key: 'nome', width: 32 },
        { header: 'Endereço', key: 'endereco', width: 40 },
        { header: 'Complemento', key: 'complemento', width: 18 },
        { header: 'Bairro', key: 'bairro', width: 22 },
        { header: 'Cidade', key: 'cidade', width: 22 },
        { header: 'UF', key: 'uf', width: 6 },
        { header: 'CEP', key: 'cep', width: 12 },
    ]
    ws.addRow({
        nome: 'NOME COMPLETO',
        endereco: 'RUA EXEMPLO, 100',
        complemento: 'AP 101',
        bairro: 'CENTRO',
        cidade: 'CAXIAS DO SUL',
        uf: 'RS',
        cep: '95000-000',
    })
    const buf = await wb.xlsx.writeBuffer()
    const blob = new Blob([buf], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'modelo-etiquetas-ca4263.xlsx'
    a.click()
    URL.revokeObjectURL(url)
}

function truncarLinha(texto, font, size, maxW) {
    const t = String(texto || '').trim()
    if (!t) return ''
    if (font.widthOfTextAtSize(t, size) <= maxW) return t
    let lo = 0
    let hi = t.length
    while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2)
        const cand = `${t.slice(0, mid)}…`
        if (font.widthOfTextAtSize(cand, size) <= maxW) lo = mid
        else hi = mid - 1
    }
    return lo > 0 ? `${t.slice(0, lo)}…` : '…'
}

/**
 * Encolhe a fonte até caber na largura; só corta com … no tamanho mínimo.
 * @returns {{ text: string, size: number }}
 */
function caberLinha(texto, font, maxW, sizeMax = FONT_SIZE, sizeMin = FONT_SIZE_MIN) {
    const t = String(texto || '').trim()
    if (!t) return { text: '', size: sizeMax }
    if (font.widthOfTextAtSize(t, sizeMax) <= maxW) {
        return { text: t, size: sizeMax }
    }
    if (font.widthOfTextAtSize(t, sizeMin) > maxW) {
        return { text: truncarLinha(t, font, sizeMin, maxW), size: sizeMin }
    }
    let lo = sizeMin
    let hi = sizeMax
    let best = sizeMin
    while (hi - lo > 0.05) {
        const mid = (lo + hi) / 2
        if (font.widthOfTextAtSize(t, mid) <= maxW) {
            best = mid
            lo = mid
        } else {
            hi = mid
        }
    }
    return { text: t, size: Math.round(best * 100) / 100 }
}

/**
 * Quebra por palavras em até `maxLinhas`.
 * @returns {{ linhas: string[], completo: boolean }}
 */
function quebrarEmLinhas(texto, font, size, maxW, maxLinhas) {
    const t = String(texto || '').trim()
    if (!t) return { linhas: [], completo: true }

    const palavras = t.split(/\s+/).filter(Boolean)
    const linhas = []
    let atual = ''
    let idx = 0

    const larguraOk = (s) => font.widthOfTextAtSize(s, size) <= maxW

    while (idx < palavras.length) {
        const palavra = palavras[idx]
        const cand = atual ? `${atual} ${palavra}` : palavra

        if (larguraOk(cand)) {
            atual = cand
            idx += 1
            continue
        }

        if (atual) {
            linhas.push(atual)
            atual = ''
            if (linhas.length >= maxLinhas) break
            continue
        }

        // Palavra maior que a largura: não cabe sem truncar
        return { linhas: [...linhas, truncarLinha(palavra, font, size, maxW)], completo: false }
    }

    if (atual) {
        if (linhas.length < maxLinhas) {
            linhas.push(atual)
            atual = ''
        }
    }

    const completo = idx >= palavras.length && !atual
    return { linhas, completo }
}

/**
 * Endereço: prefere quebrar em até 2 linhas a encolher a fonte.
 * @returns {{ linhas: string[], size: number }}
 */
function caberEndereco(texto, font, maxW, sizeMax = FONT_SIZE, sizeMin = FONT_SIZE_MIN) {
    const t = String(texto || '').trim()
    if (!t) return { linhas: [], size: sizeMax }

    if (font.widthOfTextAtSize(t, sizeMax) <= maxW) {
        return { linhas: [t], size: sizeMax }
    }

    let lo = sizeMin
    let hi = sizeMax
    let best = null
    while (hi - lo > 0.05) {
        const mid = (lo + hi) / 2
        const { linhas, completo } = quebrarEmLinhas(t, font, mid, maxW, ENDERECO_MAX_LINHAS)
        if (completo && linhas.length) {
            best = { linhas, size: mid }
            lo = mid
        } else {
            hi = mid
        }
    }
    if (best) {
        return { linhas: best.linhas, size: Math.round(best.size * 100) / 100 }
    }

    // Último recurso: tamanho mínimo + truncar o que não couber nas 2 linhas
    const palavras = t.split(/\s+/).filter(Boolean)
    const linhas = []
    let atual = ''
    for (let i = 0; i < palavras.length; i += 1) {
        const palavra = palavras[i]
        const naUltima = linhas.length >= ENDERECO_MAX_LINHAS - 1
        const cand = atual ? `${atual} ${palavra}` : palavra

        if (!naUltima) {
            if (font.widthOfTextAtSize(cand, sizeMin) <= maxW) {
                atual = cand
                continue
            }
            if (atual) {
                linhas.push(atual)
                atual = palavra
                if (font.widthOfTextAtSize(atual, sizeMin) > maxW) {
                    linhas.push(truncarLinha(atual, font, sizeMin, maxW))
                    const resto = palavras.slice(i + 1).join(' ')
                    if (resto) linhas[linhas.length - 1] = truncarLinha(`${atual} ${resto}`, font, sizeMin, maxW)
                    return { linhas: linhas.slice(0, ENDERECO_MAX_LINHAS), size: sizeMin }
                }
                continue
            }
            linhas.push(truncarLinha(palavra, font, sizeMin, maxW))
            atual = ''
            continue
        }

        const resto = [atual, ...palavras.slice(i)].filter(Boolean).join(' ')
        linhas.push(truncarLinha(resto, font, sizeMin, maxW))
        return { linhas, size: sizeMin }
    }
    if (atual) linhas.push(atual)
    return { linhas: linhas.slice(0, ENDERECO_MAX_LINHAS), size: sizeMin }
}

function passoLinha(size) {
    return Math.max(size + 3.5, 11)
}

/**
 * @param {Array<{ nome?: string, endereco?: string, localidade?: string, cep?: string }>} etiquetas
 * @param {{ nomeArquivo?: string }} [opts]
 */
export async function gerarPdfEtiquetasEndereco(etiquetas, opts = {}) {
    const lista = (Array.isArray(etiquetas) ? etiquetas : [])
        .map(normalizarEtiquetaRegistro)
        .filter(etiquetaTemConteudo)

    if (!lista.length) {
        return { ok: false, erro: 'Nenhuma etiqueta para imprimir.' }
    }

    const pdf = await PDFDocument.create()
    const fontReg = await pdf.embedFont(StandardFonts.Helvetica)
    const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold)
    const alturaUtil = LABEL_H - PAD_Y - PAD_BOTTOM

    const paginas = Math.ceil(lista.length / ETIQUETAS_POR_PAGINA)
    for (let p = 0; p < paginas; p += 1) {
        const page = pdf.addPage([PAGE_W, PAGE_H])
        const slice = lista.slice(p * ETIQUETAS_POR_PAGINA, (p + 1) * ETIQUETAS_POR_PAGINA)
        slice.forEach((et, i) => {
            const row = Math.floor(i / 2)
            const col = i % 2
            const x = COL_X[col]
            const yTop = ROW_Y[row]

            const nome = caberLinha(et.nome.toUpperCase(), fontBold, LABEL_MAX_W)
            const end = et.endereco
                ? caberEndereco(`Endereço: ${et.endereco}`, fontReg, LABEL_MAX_W)
                : { linhas: [], size: FONT_SIZE }
            const loc = caberLinha(et.localidade, fontReg, LABEL_MAX_W)
            const cep = caberLinha(et.cep, fontReg, LABEL_MAX_W)

            /** @type {{ text: string, size: number, font: typeof fontReg }[]} */
            const linhas = []
            if (nome.text) linhas.push({ text: nome.text, size: nome.size, font: fontBold })
            for (const tl of end.linhas) {
                if (tl) linhas.push({ text: tl, size: end.size, font: fontReg })
            }
            if (loc.text) linhas.push({ text: loc.text, size: loc.size, font: fontReg })
            if (cep.text) linhas.push({ text: cep.text, size: cep.size, font: fontReg })

            let passos = linhas.map((ln) => passoLinha(ln.size))
            let altura = linhas[0] ? linhas[0].size : 0
            for (let k = 1; k < linhas.length; k += 1) altura += passos[k]
            if (altura > alturaUtil && linhas.length > 1) {
                const escala = alturaUtil / altura
                passos = passos.map((v) => v * escala)
            }

            let dy = 0
            linhas.forEach((ln, idx) => {
                page.drawText(ln.text, {
                    x,
                    y: PAGE_H - (yTop + dy) - ln.size,
                    size: ln.size,
                    font: ln.font,
                    color: COR_TEXTO,
                })
                if (idx < linhas.length - 1) dy += passos[idx + 1]
            })
        })
    }

    const blob = await blobDePdfLib(pdf)
    const stamp = new Date().toISOString().slice(0, 10)
    const nomeArquivo = opts.nomeArquivo || `etiquetas-ca4263-${stamp}.pdf`
    return { ok: true, blob, nomeArquivo, total: lista.length, paginas }
}

export function baixarBlob(blob, nomeArquivo) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = nomeArquivo
    a.click()
    URL.revokeObjectURL(url)
}
