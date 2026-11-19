/**
 * Regras puras da página /tabela-planos (busca, destaque, formatação, WhatsApp). Sem React nem rede.
 */
import { normalizarBusca } from '../../../lib/apiV1/planosSinonimos.js'
import { linkWhatsapp } from '../../../lib/repasse/repasseCore.js'
import { mensagemWhatsappPlano, WHATSAPP_NUMERO } from './mockTabelaPlanos.js'

const MARCAS = /[̀-ͯ]/g

/** Um procedimento casa com a consulta se o nome, o código ou algum termo (sinônimo/nome alternativo) a contém. */
export function procedimentoBateConsulta(proc, consultaNorm) {
    if (!consultaNorm) return true
    if (normalizarBusca(`${proc.nome} ${proc.codigo}`).includes(consultaNorm)) return true
    return (proc.termos || []).some((t) => normalizarBusca(t).includes(consultaNorm))
}

/** Grupos só com os procedimentos que casam; grupos sem resultado somem. Sem consulta, devolve tudo. */
export function filtrarGrupos(grupos, consulta) {
    const norm = normalizarBusca(consulta)
    if (!norm) return grupos || []
    return (grupos || [])
        .map((g) => ({ ...g, procedimentos: g.procedimentos.filter((p) => procedimentoBateConsulta(p, norm)) }))
        .filter((g) => g.procedimentos.length > 0)
}

/**
 * Divide `texto` em trechos, marcando os que casam com a consulta (ignora acento e caixa).
 * Só destaca o que aparece no próprio texto: quando o acerto veio de um sinônimo, devolve o texto inteiro sem destaque.
 */
export function trechosComDestaque(texto, consulta) {
    const original = String(texto ?? '')
    const alvo = normalizarBusca(consulta)
    if (!alvo) return [{ texto: original, destaque: false }]
    // Normaliza caractere a caractere para manter o mapeamento de posições com o texto original.
    let norm = ''
    const posicoes = []
    for (let i = 0; i < original.length; i += 1) {
        const n = original[i].normalize('NFD').replace(MARCAS, '').toLowerCase()
        for (const c of n) {
            norm += c
            posicoes.push(i)
        }
    }
    const inicio = norm.indexOf(alvo)
    if (inicio < 0) return [{ texto: original, destaque: false }]
    const de = posicoes[inicio]
    const ate = posicoes[inicio + alvo.length - 1] + 1
    return [
        { texto: original.slice(0, de), destaque: false },
        { texto: original.slice(de, ate), destaque: true },
        { texto: original.slice(ate), destaque: false },
    ].filter((t) => t.texto)
}

export function formatarReais(valor) {
    const n = Number(valor)
    if (!Number.isFinite(n)) return '—'
    return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function totalProcedimentos(grupos) {
    return (grupos || []).reduce((s, g) => s + g.procedimentos.length, 0)
}

/** Link do WhatsApp flutuante; `null` enquanto não houver cidade e plano. Com procedimento aberto, cita o procedimento. */
export function hrefWhatsappTabela({ cidade, plano, procedimento } = {}) {
    if (!cidade || !plano) return null
    return linkWhatsapp(WHATSAPP_NUMERO, mensagemWhatsappPlano(plano.nome, cidade.nome, cidade.uf, procedimento?.nome))
}

/** Link do WhatsApp quando a busca não acha nada ou o procedimento não tem prestadores. */
export function hrefWhatsappSemResultado({ cidade, plano, assunto } = {}) {
    const onde = cidade ? ` em ${cidade.nome}-${cidade.uf}` : ''
    const qual = plano ? ` (plano ${plano.nome})` : ''
    return linkWhatsapp(WHATSAPP_NUMERO, `Olá! Vim pelo site e procurei por "${assunto || 'um procedimento'}"${onde}${qual}. Podem me ajudar?`)
}

const NEGRITO_OBSERVACAO = /\*\*([^*]+)\*\*/g
const URL_OBSERVACAO = /https?:\/\/[^\s*]+/g

/** Quebra um trecho em `texto` e `link`; a pontuação no fim da URL fica fora do link. */
function partesComLinks(trecho, negrito) {
    const partes = []
    let fim = 0
    const texto = (t) => {
        if (t) partes.push({ tipo: 'texto', texto: t, negrito })
    }
    for (const m of trecho.matchAll(URL_OBSERVACAO)) {
        texto(trecho.slice(fim, m.index))
        const url = m[0].replace(/[.,;:!?)]+$/, '')
        partes.push({ tipo: 'link', texto: url, href: url, negrito })
        texto(m[0].slice(url.length))
        fim = m.index + m[0].length
    }
    texto(trecho.slice(fim))
    return partes
}

/**
 * Quebra o texto de uma observação em partes (`texto` ou `link`), cada uma com `negrito: boolean`, no mesmo
 * formato do PDF: `**negrito**` e URLs (um link pode estar dentro do negrito). Sem HTML: quem desenha usa só as partes.
 * @returns {Array<{ tipo: 'texto'|'link', texto: string, href?: string, negrito: boolean }>}
 */
export function partesTextoObservacao(texto) {
    const s = String(texto ?? '')
    const partes = []
    let fim = 0
    for (const m of s.matchAll(NEGRITO_OBSERVACAO)) {
        partes.push(...partesComLinks(s.slice(fim, m.index), false))
        partes.push(...partesComLinks(m[1], true))
        fim = m.index + m[0].length
    }
    partes.push(...partesComLinks(s.slice(fim), false))
    return partes
}

/** Telefone e celular sem repetir o mesmo número (comparação só pelos dígitos); vazios saem. */
export function contatosDistintos(contatos) {
    const vistos = new Set()
    const saida = []
    for (const valor of [contatos?.telefone, contatos?.celular]) {
        const texto = String(valor ?? '').trim()
        const digitos = texto.replace(/\D/g, '')
        if (!digitos || vistos.has(digitos)) continue
        vistos.add(digitos)
        saida.push(texto)
    }
    return saida
}
