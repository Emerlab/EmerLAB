// Detecta, entre duas leituras da lista de conversas, o que é "para mim":
// menção nas notas, conversa transferida/atribuída a mim e resposta numa conversa minha.
import { normalizarWaId, mesmoEmail } from './util.js'

const temEmail = (lista, email) => (lista || []).some((e) => mesmoEmail(e, email))

/** @returns {{tipo: 'mencao'|'transferida'|'resposta', conversa: object}[]} no máximo um evento por conversa */
export function eventosParaMim(antes, depois, email) {
    if (!email || !Array.isArray(antes) || !Array.isArray(depois)) return []
    const prev = new Map(antes.map((c) => [normalizarWaId(c.waId), c]))
    const eventos = []
    for (const c of depois) {
        const p = prev.get(normalizarWaId(c.waId)) || {}
        const minha = mesmoEmail(c.atendenteEmail, email)
        let tipo = null
        if (temEmail(c.mencionados, email) && !temEmail(p.mencionados, email)) tipo = 'mencao'
        else if (minha && !mesmoEmail(p.atendenteEmail, email)) tipo = 'transferida'
        else if (minha && (c.naoLidas || 0) > (p.naoLidas || 0) && !c.ultimaMinha) tipo = 'resposta'
        if (tipo) eventos.push({ tipo, conversa: c })
    }
    return eventos
}

export function textoEvento({ tipo }, nome) {
    if (tipo === 'mencao') return `${nome} mencionou você`
    if (tipo === 'transferida') return `Conversa atribuída a você · ${nome}`
    return `${nome} respondeu`
}
