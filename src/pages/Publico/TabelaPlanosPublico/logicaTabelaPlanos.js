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
