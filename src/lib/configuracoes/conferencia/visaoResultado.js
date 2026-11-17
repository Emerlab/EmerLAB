import { statusEhOk } from './classify.js'

/** Abas do resultado, na ordem em que aparecem (cada uma mapeia para um filtro da página). */
export const ABAS_RESULTADO = [
    { id: 'precisam', rotulo: 'Precisam de você' },
    { id: 'data', rotulo: 'Data divergente' },
    { id: 'revisao', rotulo: 'Revisão manual' },
    { id: 'orf_lab', rotulo: 'Só no laboratório' },
    { id: 'orf_plano', rotulo: 'Só no plano' },
    { id: 'valores', rotulo: 'Valor divergente' },
    { id: 'memoria', rotulo: 'Resolvidas pela memória' },
    { id: 'ok', rotulo: 'OK' },
    { id: 'todos', rotulo: 'Todas' },
]

const ativa = (r) => !r.revisao?.ignorar

/** Predicado de cada aba. */
export function linhaPertenceAba(r, aba) {
    switch (aba) {
        case 'precisam':
            return !statusEhOk(r.status) && ativa(r)
        case 'data':
            return r.status === 'DATA_DIVERGENTE'
        case 'revisao':
            return r.status === 'REVISAO_MANUAL'
        case 'orf_lab':
            return r.status === 'ORFAO_MELLISLAB' && ativa(r)
        case 'orf_plano':
            return r.status === 'ORFAO_HONORARIOS' && ativa(r)
        case 'valores':
            return r.status === 'VALOR_DIVERGENTE'
        case 'memoria':
            return Boolean(r.aprendido)
        case 'ok':
            return statusEhOk(r.status)
        default:
            return true
    }
}

export function contarAbas(resultados) {
    const lista = Array.isArray(resultados) ? resultados : []
    const out = {}
    for (const a of ABAS_RESULTADO) out[a.id] = lista.filter((r) => linhaPertenceAba(r, a.id)).length
    return out
}

function isoDe(valor) {
    const m = String(valor || '').match(/^(\d{4})-(\d{2})-(\d{2})/)
    return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}

function faixaDatas(valores) {
    const isos = valores.map(isoDe).filter(Boolean).sort()
    return isos.length ? { de: isos[0], ate: isos[isos.length - 1] } : null
}

/**
 * Avisa quando os arquivos parecem ser de períodos diferentes (a causa mais comum de "tudo virou órfão").
 * Devolve null quando está tudo coerente.
 */
export function avisoDePeriodo(resultados) {
    const lista = Array.isArray(resultados) ? resultados : []
    const plano = lista.filter((r) => r.honorarios)
    const lab = lista.filter((r) => r.mellis)
    if (plano.length < 10 || lab.length < 10) return null
    const pares = lista.filter((r) => r.honorarios && r.mellis).length
    const menor = Math.min(plano.length, lab.length)
    const faixaPlano = faixaDatas(plano.map((r) => r.data_honorarios))
    const faixaLab = faixaDatas(lab.map((r) => r.data_mellislab))
    const semSobreposicao = Boolean(faixaPlano && faixaLab && (faixaPlano.ate < faixaLab.de || faixaLab.ate < faixaPlano.de))
    const poucosPares = pares / menor < 0.25
    if (!semSobreposicao && !poucosPares) return null
    return {
        pares,
        totalLinhas: lista.length,
        semSobreposicao,
        faixaPlano,
        faixaLab,
    }
}

/** Métricas por pares: os órfãos não entram na conta de "conferidas sozinhas". */
export function resumoDePares(resultados) {
    const lista = Array.isArray(resultados) ? resultados : []
    const pares = lista.filter((r) => r.honorarios && r.mellis)
    const paresOk = pares.filter((r) => statusEhOk(r.status)).length
    return {
        pares: pares.length,
        paresOk,
        paresComDiferenca: pares.length - paresOk,
        orfaosLab: lista.filter((r) => r.status === 'ORFAO_MELLISLAB' && ativa(r)).length,
        orfaosPlano: lista.filter((r) => r.status === 'ORFAO_HONORARIOS' && ativa(r)).length,
    }
}

export function normalizarTexto(v) {
    return String(v || '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim()
}

/** Para destacar só o que difere entre Plano e Laboratório. */
export const camposIguais = {
    texto: (a, b) => normalizarTexto(a) === normalizarTexto(b),
    data: (a, b) => (isoDe(a) || String(a || '')) === (isoDe(b) || String(b || '')),
    valor: (a, b) => {
        const x = Number(a)
        const y = Number(b)
        return Number.isFinite(x) && Number.isFinite(y) && Math.abs(x - y) < 0.005
    },
}

export function chaveTutor(r) {
    return `${normalizarTexto(r.tutor_honorarios)}|${normalizarTexto(r.tutor_mellislab)}`
}

/**
 * Agrupa por tutor: quem tem 2+ linhas vira um grupo (na posição da primeira linha dele), as demais ficam soltas.
 * Mantém a ordem recebida.
 */
export function agruparPorTutor(linhas) {
    const lista = Array.isArray(linhas) ? linhas : []
    const porChave = new Map()
    for (const r of lista) {
        const k = chaveTutor(r)
        if (!porChave.has(k)) porChave.set(k, [])
        porChave.get(k).push(r)
    }
    const itens = []
    const usados = new Set()
    for (const r of lista) {
        const k = chaveTutor(r)
        const rows = porChave.get(k)
        if (rows.length < 2) {
            itens.push({ tipo: 'linha', r })
        } else if (!usados.has(k)) {
            usados.add(k)
            itens.push({ tipo: 'grupo', chave: k, rows })
        }
    }
    return itens
}
