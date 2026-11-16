import { normalizarTextoBusca } from '../../prestadorCadastroHelpers.js'

/** Remove iniciais de uma letra (ex.: «F.») após normalizar. */
export function normalizeName(texto) {
    const base = normalizarTextoBusca(texto)
    if (!base) return ''
    return base
        .split(' ')
        .filter((tok) => tok.length > 1)
        .join(' ')
        .trim()
}

export function normalizePet(texto) {
    return normalizeName(texto)
}

export function tokensNome(texto) {
    return normalizeName(texto).split(' ').filter(Boolean)
}

/**
 * Tutores equivalentes: iguais após normalizar, ou o menor (2+ tokens)
 * está contido no maior (abreviações / nome do meio).
 */
export function tokensEquivalentes(ta, tb) {
    if (!ta.length || !tb.length) return false
    if (ta.join(' ') === tb.join(' ')) return true
    if (ta.length < 2 || tb.length < 2) return false
    const [menor, maior] = ta.length <= tb.length ? [ta, tb] : [tb, ta]
    return menor.every((t) => maior.includes(t))
}

export function nomesPessoaEquivalentes(a, b) {
    return tokensEquivalentes(tokensNome(a), tokensNome(b))
}

export function petsEquivalentes(a, b) {
    const na = normalizePet(a)
    const nb = normalizePet(b)
    return Boolean(na && nb && na === nb)
}
