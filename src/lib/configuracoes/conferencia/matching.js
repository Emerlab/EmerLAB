import { compareDates } from './dates.js'
import { compareValues } from './values.js'
import { applyExamEquivalence, normalizeExam } from './examSimilarity.js'
import { normalizeName, tokensNome, tokensEquivalentes } from './normalize.js'

/**
 * Normalização por linha, calculada uma única vez (WeakMap pela referência da linha).
 * Evita renormalizar nomes a cada par avaliado (era o gargalo do motor).
 */
const PREP = new WeakMap()

export function prepararLinha(linha) {
    let p = PREP.get(linha)
    if (!p) {
        const tutorTok = tokensNome(linha.tutor)
        const petN = normalizeName(linha.pet)
        p = {
            tutorN: tutorTok.join(' '),
            tutorTok,
            petN,
            exameN: normalizeExam(linha.exame),
        }
        PREP.set(linha, p)
    }
    return p
}

function chaveAlias(a, b) {
    return `${a}\u0001${b}`
}

function indiceAliases(ctx) {
    const lista = ctx.aliasesTutor || []
    if (ctx._aliasLista === lista && ctx._aliasSet) return ctx._aliasSet
    const set = new Set()
    for (const a of lista) {
        const plano = normalizeName(a.nomePlano || a.nome_plano || a.honorarios)
        const lab = normalizeName(a.nomeLab || a.nome_lab || a.mellislab)
        if (!plano || !lab) continue
        set.add(chaveAlias(plano, lab))
        set.add(chaveAlias(lab, plano))
    }
    ctx._aliasLista = lista
    ctx._aliasSet = set
    return set
}

function exameEquivalente(h, m, pH, pM, ctx) {
    if (!ctx._exameCache) ctx._exameCache = new Map()
    const k = chaveAlias(pH.exameN, pM.exameN)
    let r = ctx._exameCache.get(k)
    if (!r) {
        r = applyExamEquivalence(h.exame, m.exame, ctx.equivalencias || [])
        ctx._exameCache.set(k, r)
    }
    return r
}

export function avaliarPar(honorarios, mellis, ctx = {}) {
    const pH = prepararLinha(honorarios)
    const pM = prepararLinha(mellis)
    const tutorOk = tokensEquivalentes(pH.tutorTok, pM.tutorTok)
    const tutorAlias =
        !tutorOk &&
        Boolean(pH.tutorN && pM.tutorN) &&
        indiceAliases(ctx).has(chaveAlias(pH.tutorN, pM.tutorN))
    const petOk = Boolean(pH.petN && pM.petN && pH.petN === pM.petN)
    const data = compareDates(honorarios.data, mellis.data)
    const valor = compareValues(honorarios.valor, mellis.valor)
    const exame = exameEquivalente(honorarios, mellis, pH, pM, ctx)
    return { tutorOk, tutorAlias, petOk, data, valor, exame }
}

export function passaPrioridade(av, prioridade) {
    const { tutorOk, tutorAlias, petOk, data, valor, exame } = av
    const examOk = exame.exact || exame.equivalent
    switch (prioridade) {
        case 1:
            return tutorOk && petOk && exame.exact && valor.ok && data.exata
        case 2:
            return tutorOk && petOk && exame.equivalent && valor.ok && data.exata
        case 3:
            return tutorOk && petOk && examOk && valor.ok && data.compativel
        case 4:
            return tutorAlias && petOk && examOk && valor.ok && data.compativel
        case 6:
            return tutorOk && petOk && examOk && data.exata
        case 7:
            return tutorOk && petOk && examOk && data.compativel
        case 8:
            return tutorAlias && petOk && examOk && data.compativel
        case 9:
            return tutorOk && petOk && examOk
        case 10:
            return petOk && examOk && valor.ok && data.compativel && !tutorOk && !tutorAlias
        default:
            return false
    }
}

export const PRIORIDADES = [1, 2, 3, 4, 6, 7, 8, 9, 10]

/**
 * Conservador: na maior prioridade com candidato(s), 1 → match; 2+ → revisão.
 * Avalia um único lado do laboratório contra uma lista de candidatos.
 * (O motor usa `parearEmPassadas`, que decide de forma global.)
 */
export function findBestMatch(linhaMellis, honorariosLivres, ctx = {}) {
    if (!linhaMellis || !honorariosLivres?.length) {
        return { tipo: 'nenhum', candidatos: [], prioridade: null, avaliacoes: [] }
    }

    const avaliacoes = honorariosLivres.map((h) => ({
        honorarios: h,
        av: avaliarPar(h, linhaMellis, ctx),
    }))

    for (const prioridade of PRIORIDADES) {
        const candidatos = avaliacoes.filter((x) => passaPrioridade(x.av, prioridade))
        if (candidatos.length === 1) {
            return { tipo: 'unico', prioridade, candidatos, match: candidatos[0] }
        }
        if (candidatos.length > 1) {
            return { tipo: 'ambiguo', prioridade, candidatos, match: null }
        }
    }

    return { tipo: 'nenhum', candidatos: [], prioridade: null, avaliacoes }
}

/** Assinatura que torna duas linhas intercambiáveis (mesmo registro duplicado). */
function assinatura(linha) {
    const p = prepararLinha(linha)
    return [
        p.tutorN,
        p.petN,
        linha.data || '',
        p.exameN,
        linha.valor ?? '',
        linha.prontuario || '',
    ].join('|')
}

/**
 * Pareamento global por passadas de prioridade.
 *
 * Em cada prioridade, um par (lab, plano) só é aceito se for "mutuamente único":
 * o lab tem um único candidato possível E esse plano só é candidato desse lab
 * (linhas idênticas/intercambiáveis contam como uma só). Assim a ordem das linhas
 * não decide quem leva o item — um match fraco nunca rouba o de um match forte.
 *
 * Pet é obrigatório em todas as prioridades, então as linhas do plano são
 * indexadas por pet normalizado (blocking sem perda).
 *
 * Linhas sem par único e com candidatos viram `ambiguos` (sem consumir ninguém).
 */
export function parearEmPassadas(mel, hon, ctx = {}) {
    const blocos = new Map()
    for (const h of hon) {
        const pet = prepararLinha(h).petN
        if (!pet) continue
        if (!blocos.has(pet)) blocos.set(pet, [])
        blocos.get(pet).push(h)
    }

    const usadosH = new Set()
    const usadosM = new Set()
    const pares = []
    const sigCache = new Map()
    const sig = (l) => {
        let s = sigCache.get(l)
        if (s == null) {
            s = assinatura(l)
            sigCache.set(l, s)
        }
        return s
    }

    const avaliacoesDe = (m) => {
        const bloco = blocos.get(prepararLinha(m).petN) || []
        const livres = []
        for (const h of bloco) if (!usadosH.has(h.id)) livres.push(h)
        return livres.map((h) => ({ honorarios: h, av: avaliarPar(h, m, ctx) }))
    }

    const passada = (prioridade) => {
        const propostas = new Map() // h.id -> [{ m, h, av }]
        for (const m of mel) {
            if (usadosM.has(m.id)) continue
            const cands = avaliacoesDe(m).filter((x) => passaPrioridade(x.av, prioridade))
            if (!cands.length) continue
            const distintos = new Set(cands.map((c) => sig(c.honorarios)))
            if (distintos.size !== 1) continue
            const alvo = cands[0]
            if (!propostas.has(alvo.honorarios.id)) propostas.set(alvo.honorarios.id, [])
            propostas.get(alvo.honorarios.id).push({ m, h: alvo.honorarios, av: alvo.av })
        }
        let casou = 0
        for (const lista of propostas.values()) {
            const distintos = new Set(lista.map((p) => sig(p.m)))
            if (distintos.size !== 1) continue
            const escolhido = lista[0]
            if (usadosH.has(escolhido.h.id) || usadosM.has(escolhido.m.id)) continue
            usadosH.add(escolhido.h.id)
            usadosM.add(escolhido.m.id)
            pares.push({ ...escolhido, prioridade })
            casou += 1
        }
        return casou
    }

    let continuar = true
    while (continuar) {
        continuar = false
        for (const prioridade of PRIORIDADES) {
            if (passada(prioridade) > 0) {
                continuar = true
                break
            }
        }
    }

    const ambiguos = []
    for (const m of mel) {
        if (usadosM.has(m.id)) continue
        const avs = avaliacoesDe(m)
        for (const prioridade of PRIORIDADES) {
            const candidatos = avs.filter((x) => passaPrioridade(x.av, prioridade))
            if (candidatos.length) {
                ambiguos.push({ m, prioridade, candidatos })
                break
            }
        }
    }

    return { pares, ambiguos, usadosH, usadosM }
}
