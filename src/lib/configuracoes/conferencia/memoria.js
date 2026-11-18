import { normalizeExam } from './examSimilarity.js'
import { compareValues } from './values.js'
import { statusEhOk } from './classify.js'

/**
 * Memória da Conferência por laboratório (funções puras).
 *
 * «Valor aceito» lembrado: uma diferença de valor que o usuário já aceitou (exame + valor do plano + valor do
 * laboratório, os três iguais) deixa de voltar para revisão nos meses seguintes. Qualquer valor diferente do que foi
 * aceito continua divergente: a memória nunca esconde uma diferença nova.
 */

const centavos = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Math.round(Number(v) * 100))

/** Chave única da regra: exame normalizado + valor do plano + valor do laboratório (em centavos). */
export function chaveValorAceito(exame, valorPlano, valorLab) {
    const a = centavos(valorPlano)
    const b = centavos(valorLab)
    const e = normalizeExam(exame)
    if (!e || a == null || b == null) return ''
    return `${e}|${a}|${b}`
}

/** Regra de valor aceito a partir de uma linha do resultado (null se a linha não tem os dados). */
export function regraValorAceitoDe(resultado) {
    const exame = resultado?.exame_honorarios || resultado?.honorarios?.exame || resultado?.exame_mellislab || ''
    const valorPlano = resultado?.valor_honorarios
    const valorLab = resultado?.valor_mellislab
    const chave = chaveValorAceito(exame, valorPlano, valorLab)
    if (!chave) return null
    return { chave, exame, valorPlano: Number(valorPlano), valorLab: Number(valorLab) }
}

/**
 * Marca como «Valor aceito» as linhas com divergência de valor que casam com uma regra já guardada.
 * Devolve os resultados e quantas linhas foram resolvidas pela memória (marcadas com `aprendido: 'valor_aceito'`).
 */
export function aplicarValoresAceitos(resultados, valoresAceitos) {
    const lista = Array.isArray(valoresAceitos) ? valoresAceitos : []
    if (!lista.length) return { resultados, aplicadas: 0 }
    const porChave = new Map(lista.map((v) => [chaveValorAceito(v.exame, v.valorPlano, v.valorLab), v]))
    let aplicadas = 0
    const out = resultados.map((r) => {
        if (r.status !== 'VALOR_DIVERGENTE' || !r.honorarios || !r.mellis) return r
        if (compareValues(r.valor_honorarios, r.valor_mellislab).ok) return r
        const regra = porChave.get(chaveValorAceito(r.exame_honorarios || r.honorarios.exame, r.valor_honorarios, r.valor_mellislab))
        if (!regra) return r
        aplicadas += 1
        return {
            ...r,
            status: 'VALOR_ACEITO',
            motivo: `Diferença de valor já aceita antes${regra.justificativa ? `: ${regra.justificativa}` : '.'}`,
            acao: 'Valor aceito',
            aprendido: 'valor_aceito',
        }
    })
    return { resultados: out, aplicadas }
}

/** Quantas linhas foram resolvidas sem decisão do usuário (memória) e quantas ainda precisam dele. */
export function resumoDeAprendizado(resultados) {
    const lista = Array.isArray(resultados) ? resultados : []
    const resolvidasPelaMemoria = lista.filter((r) => r.aprendido || r.matchPorMemoria).length
    const precisamDeVoce = lista.filter((r) => !statusEhOk(r.status) && !r.revisao?.ignorar).length
    const total = lista.length
    const sozinhas = lista.filter((r) => statusEhOk(r.status)).length
    return {
        total,
        sozinhas,
        percentualSozinhas: total ? Math.round((sozinhas / total) * 100) : 0,
        precisamDeVoce,
        resolvidasPelaMemoria,
    }
}

/** Mapa de colunas (campo → índice) para nomes de cabeçalho, que é o que dá para reaproveitar em outro arquivo. */
export function mapaColunasParaNomes(mapCols, headers) {
    const out = {}
    for (const [campo, idx] of Object.entries(mapCols || {})) {
        const h = Number.isInteger(idx) && idx >= 0 ? headers?.[idx] : null
        if (h != null && String(h).trim()) out[campo] = String(h)
    }
    return out
}

/**
 * Colunas lembradas: converte o mapa salvo (campo → nome do cabeçalho) em campo → índice do arquivo novo, só se
 * TODAS as colunas citadas existirem nos cabeçalhos (sem caixa/acento). Caso contrário devolve null e o usuário
 * mapeia de novo.
 */
export function mapaColunasCompativel(mapaSalvo, headers) {
    if (!mapaSalvo || typeof mapaSalvo !== 'object') return null
    const posicoes = new Map()
    ;(headers || []).forEach((h, i) => {
        const k = normalizeExam(h)
        if (k && !posicoes.has(k)) posicoes.set(k, i)
    })
    const novo = {}
    for (const [campo, nome] of Object.entries(mapaSalvo)) {
        if (nome == null || nome === '') continue
        const idx = posicoes.get(normalizeExam(nome))
        if (idx === undefined) return null
        novo[campo] = idx
    }
    return Object.keys(novo).length ? novo : null
}
