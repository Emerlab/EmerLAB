import { avaliarPar, prepararLinha } from './matching.js'
import { calculateExamSimilarity } from './examSimilarity.js'
import { contextoMatching } from './index.js'

function sobreposicao(tokensA, tokensB) {
    if (!tokensA.length || !tokensB.length) return 0
    const b = new Set(tokensB)
    const comum = tokensA.filter((t) => b.has(t)).length
    return comum / Math.max(tokensA.length, tokensB.length)
}

/**
 * Pontua um par (plano, laboratório) para ajudar a encaixar órfãos.
 * Não decide nada: só ordena as opções que o usuário vai escolher.
 */
export function pontuarEncaixe(honorarios, mellis, ctx) {
    const av = avaliarPar(honorarios, mellis, ctx)
    const pH = prepararLinha(honorarios)
    const pM = prepararLinha(mellis)
    const motivos = []
    let pontos = 0

    if (av.tutorOk) {
        pontos += 300
        motivos.push('tutor')
    } else if (av.tutorAlias) {
        pontos += 250
        motivos.push('tutor (alias)')
    } else {
        const o = sobreposicao(pH.tutorTok, pM.tutorTok)
        if (o > 0) {
            pontos += Math.round(o * 150)
            motivos.push('tutor parecido')
        }
    }

    if (av.petOk) {
        pontos += 300
        motivos.push('pet')
    } else if (pH.petN && pM.petN) {
        const sim = calculateExamSimilarity(pH.petN, pM.petN)
        if (sim >= 650) {
            pontos += 150
            motivos.push('pet parecido')
        }
    }

    pontos += Math.round((av.exame.score / 1000) * 250)
    if (av.exame.exact) motivos.push('exame')
    else if (av.exame.equivalent) motivos.push('exame equivalente')
    else if (av.exame.score >= 650) motivos.push('exame parecido')

    if (av.data.exata) {
        pontos += 150
        motivos.push('mesma data')
    } else if (av.data.compativel) {
        pontos += 100
        motivos.push(`data ±${av.data.diferenca_dias}d`)
    }

    if (av.valor.ok) {
        pontos += 100
        motivos.push('valor')
    }

    return { pontos, motivos, av }
}

/**
 * @param item   linha órfã (ORFAO_HONORARIOS ou ORFAO_MELLISLAB)
 * @param opostos linhas órfãs do lado oposto
 * @returns sugestões ordenadas: [{ id, pontos, motivos }]
 */
export function sugerirEncaixes(item, opostos, matchCtx = {}, limite = 5, minimo = 350) {
    if (!item) return []
    const ctx = matchCtx.aliasesTutor ? matchCtx : contextoMatching(matchCtx)
    const ladoLab = item.status === 'ORFAO_MELLISLAB'
    const base = ladoLab ? item.mellis : item.honorarios
    if (!base) return []
    const out = []
    for (const o of opostos || []) {
        const outra = ladoLab ? o.honorarios : o.mellis
        if (!outra || o.id === item.id) continue
        const { pontos, motivos } = ladoLab
            ? pontuarEncaixe(outra, base, ctx)
            : pontuarEncaixe(base, outra, ctx)
        if (pontos >= minimo) out.push({ id: o.id, pontos, motivos })
    }
    return out.sort((a, b) => b.pontos - a.pontos).slice(0, limite)
}
