import { avaliarPar } from './matching.js'
import { classifyComparison } from './classify.js'
import { compareValues } from './values.js'
import { normalizeExam } from './examSimilarity.js'
import { normalizeName } from './normalize.js'
import { contextoMatching, montarOrfao, montarParManual } from './index.js'

/**
 * Ações de revisão manual sobre os resultados da conferência (funções puras).
 *
 * Princípio: nenhuma ação humana "esconde" divergência de valor. Confirmar o
 * pareamento, aceitar tutor alternativo ou exame equivalente resolvem a
 * identificação do registro; o valor continua sendo conferido. Para aceitar um
 * valor divergente existe a ação própria `aceitar_valor`, com justificativa.
 */

export const JUSTIFICATIVA_MIN = 3

export const ACOES_MASSA_PERMITIDAS = [
    'confirmar',
    'nao_corresponde',
    'tutor_alternativo',
    'exame_equivalente',
    'perfil_equivalente',
    'ignorar',
]

export function ehOrfaoStatus(status) {
    return status === 'ORFAO_MELLISLAB' || status === 'ORFAO_HONORARIOS'
}

function temPar(r) {
    return Boolean(r?.honorarios && r?.mellis)
}

export function itemAceitaAcao(r, acao) {
    if (!r) return false
    if (acao === 'ignorar') return true
    if (acao === 'nao_corresponde') return temPar(r) || Boolean(r.mellis && r.candidatos?.length)
    if (['confirmar', 'tutor_alternativo', 'exame_equivalente', 'perfil_equivalente'].includes(acao)) {
        return temPar(r) && !ehOrfaoStatus(r.status)
    }
    if (acao === 'aceitar_valor') {
        if (!temPar(r) || ehOrfaoStatus(r.status)) return false
        return !compareValues(r.valor_honorarios, r.valor_mellislab).ok
    }
    return false
}

function textoDif(d) {
    if (d == null) return '—'
    return `${d > 0 ? '+' : ''}${d}`
}

function substituir(lista, id, novos, removerIds = []) {
    const remover = new Set([id, ...removerIds])
    const existentes = new Set(lista.filter((x) => !remover.has(x.id)).map((x) => x.id))
    const out = []
    for (const x of lista) {
        if (x.id === id) {
            for (const n of novos) {
                if (!existentes.has(n.id)) {
                    out.push(n)
                    existentes.add(n.id)
                }
            }
            continue
        }
        if (remover.has(x.id)) continue
        out.push(x)
    }
    return out
}

function confirmarPar(par, revisao) {
    const valor = compareValues(par.valor_honorarios, par.valor_mellislab)
    return {
        ...par,
        status: valor.ok ? 'OK' : 'VALOR_DIVERGENTE',
        motivo: valor.ok
            ? 'Correspondência confirmada manualmente.'
            : `Pareamento confirmado, mas o valor continua divergente (${textoDif(valor.diferenca_valor)}).`,
        acao: 'Confirmado',
        revisao,
    }
}

function chaveNome(t) {
    return normalizeName(t)
}

export function adicionarAliasUnico(lista, alias) {
    const nl = chaveNome(alias.nomeLab)
    const np = chaveNome(alias.nomePlano)
    if (!nl || !np) return lista
    const existe = (lista || []).some(
        (a) =>
            chaveNome(a.nomeLab || a.nome_lab) === nl && chaveNome(a.nomePlano || a.nome_plano) === np,
    )
    return existe ? lista : [...(lista || []), alias]
}

export function adicionarEquivalenciaUnica(lista, eq) {
    const a = normalizeExam(eq.a)
    const b = normalizeExam(eq.b)
    if (!a || !b || a === b) return lista
    const existe = (lista || []).some((p) => {
        const pa = normalizeExam(p.a)
        const pb = normalizeExam(p.b)
        return (pa === a && pb === b) || (pa === b && pb === a)
    })
    return existe ? lista : [...(lista || []), eq]
}

/**
 * @returns {{ resultados: object[], erro?: string, aprendizado?: { alias?: object, equivalencia?: object } }}
 */
export function aplicarAcao(resultados, id, acao, extra = {}, revisao = null, ctx = {}) {
    const r = (resultados || []).find((x) => x.id === id)
    if (!r) return { resultados, erro: 'Item não encontrado.' }
    const rev = revisao || null
    const matchCtx = contextoMatching(ctx)

    if (acao === 'ignorar') {
        return {
            resultados: substituir(resultados, id, [{ ...r, acao: 'Ignorado', revisao: rev }]),
        }
    }

    if (acao === 'nao_corresponde') {
        const novos = []
        if (r.mellis) novos.push({ ...montarOrfao(r.mellis, 'mellislab'), acao: 'Não corresponde', revisao: rev })
        if (r.honorarios) {
            novos.push({ ...montarOrfao(r.honorarios, 'honorarios'), acao: 'Não corresponde', revisao: rev })
        }
        if (!novos.length) return { resultados, erro: 'Esta linha não tem par para desfazer.' }
        return { resultados: substituir(resultados, id, novos) }
    }

    // Ambíguo: precisa escolher um candidato do plano que ainda esteja livre.
    if (acao === 'confirmar' && !r.honorarios && r.candidatos?.length) {
        const cand = r.candidatos.find((c) => String(c.id) === String(extra.honorariosId))
        if (!cand) return { resultados, erro: 'Escolha um dos candidatos do plano.' }
        const orfaoId = `orfao:honorarios:${cand.id}`
        if (!resultados.some((x) => x.id === orfaoId)) {
            return { resultados, erro: 'Esse item do plano já foi usado em outro par.' }
        }
        const par = confirmarPar({ ...montarParManual(cand, r.mellis, matchCtx) }, rev)
        return { resultados: substituir(resultados, id, [par], [orfaoId]) }
    }

    if (!temPar(r) || ehOrfaoStatus(r.status)) {
        return { resultados, erro: 'Esta ação precisa de um par Plano × Laboratório.' }
    }

    if (acao === 'confirmar') {
        return { resultados: substituir(resultados, id, [confirmarPar(r, rev)]) }
    }

    if (acao === 'aceitar_valor') {
        const valor = compareValues(r.valor_honorarios, r.valor_mellislab)
        if (valor.ok) return { resultados, erro: 'O valor já confere; não há o que aceitar.' }
        const just = String(extra.justificativa || '').trim()
        if (just.length < JUSTIFICATIVA_MIN) {
            return { resultados, erro: 'Informe a justificativa para aceitar o valor divergente.' }
        }
        return {
            resultados: substituir(resultados, id, [
                {
                    ...r,
                    status: 'VALOR_ACEITO',
                    motivo: `Valor divergente (${textoDif(valor.diferenca_valor)}) aceito: ${just}`,
                    acao: 'Valor aceito',
                    revisao: rev,
                },
            ]),
        }
    }

    const av = avaliarPar(r.honorarios, r.mellis, matchCtx)
    const base = { exameHonorarios: r.honorarios.exame, exameMellis: r.mellis.exame }
    const exameOk = av.exame.exact || av.exame.equivalent

    if (acao === 'tutor_alternativo') {
        if (!av.petOk) {
            return { resultados, erro: 'O pet é diferente: tutor alternativo não se aplica. Use "Confirmar".' }
        }
        const cls = classifyComparison({ ...av, ...base, tutorAlias: true })
        const aprendizado =
            exameOk && !av.tutorOk
                ? { alias: { tipo: 'tutor', nomeLab: r.mellis.tutor, nomePlano: r.honorarios.tutor } }
                : undefined
        return {
            resultados: substituir(resultados, id, [
                {
                    ...r,
                    status: cls.status,
                    motivo:
                        cls.status === 'OK_COM_TUTOR_ALTERNATIVO' ? 'Tutor alternativo autorizado.' : cls.motivo,
                    acao: 'Tutor alternativo',
                    revisao: rev,
                },
            ]),
            aprendizado,
        }
    }

    if (acao === 'exame_equivalente') {
        if (!av.petOk) {
            return { resultados, erro: 'O pet é diferente: exame equivalente não se aplica. Use "Confirmar".' }
        }
        const cls = classifyComparison({
            ...av,
            ...base,
            exame: { exact: false, equivalent: true, score: 900 },
        })
        const aprendizado =
            !av.exame.exact && (av.tutorOk || av.tutorAlias)
                ? { equivalencia: { a: r.honorarios.exame, b: r.mellis.exame } }
                : undefined
        return {
            resultados: substituir(resultados, id, [
                {
                    ...r,
                    status: cls.status,
                    motivo:
                        cls.status === 'OK_COM_EXAME_EQUIVALENTE' ? 'Exame equivalente confirmado.' : cls.motivo,
                    acao: 'Exame equivalente',
                    revisao: rev,
                },
            ]),
            aprendizado,
        }
    }

    if (acao === 'perfil_equivalente') {
        return {
            resultados: substituir(resultados, id, [
                {
                    ...r,
                    status: 'PERFIL_EQUIVALENTE',
                    motivo: 'Perfil equivalente confirmado.',
                    acao: 'Perfil equivalente',
                    revisao: rev,
                },
            ]),
        }
    }

    return { resultados, erro: 'Ação desconhecida.' }
}

/** Encaixa manualmente um órfão com uma linha órfã do lado oposto. */
export function parearOrfaos(resultados, item, oposto, ctx = {}, revisao = null) {
    if (!item || !oposto) return { resultados, erro: 'Escolha uma entrada do relatório oposto para encaixar.' }
    const hon = item.status === 'ORFAO_HONORARIOS' ? item.honorarios : oposto.honorarios
    const mel = item.status === 'ORFAO_MELLISLAB' ? item.mellis : oposto.mellis
    if (!hon || !mel) return { resultados, erro: 'Não foi possível montar o par: falta um dos lados.' }
    const par = { ...montarParManual(hon, mel, ctx), revisao }
    const next = resultados.filter((r) => r.id !== item.id && r.id !== oposto.id)
    next.push(par)
    return { resultados: next, par }
}
