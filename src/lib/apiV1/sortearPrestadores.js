/**
 * Sorteio de prestadores no navegador (a API devolve a lista ordenada por nome; quem sorteia é a página).
 * Fisher–Yates; `aleatorio` injetável para teste.
 */
function embaralhar(lista, aleatorio) {
    const a = [...lista]
    for (let i = a.length - 1; i > 0; i -= 1) {
        const j = Math.floor(aleatorio() * (i + 1))
        ;[a[i], a[j]] = [a[j], a[i]]
    }
    return a
}

/**
 * @param {Array<{id:number}>} lista prestadores elegíveis
 * @param {{ quantidade?: number, excluirIds?: number[], aleatorio?: () => number }} [opcoes]
 * @returns {{ sorteados: Array<{id:number}>, restantes: number }} `restantes` = elegíveis ainda não mostrados
 */
export function sortearPrestadores(lista, { quantidade = 5, excluirIds = [], aleatorio = Math.random } = {}) {
    const todos = Array.isArray(lista) ? lista : []
    const n = Math.max(1, Math.min(5, Math.floor(quantidade) || 5))
    const vistos = new Set(excluirIds.map(Number))
    const naoVistos = todos.filter((p) => !vistos.has(Number(p.id)))

    let sorteados = embaralhar(naoVistos, aleatorio).slice(0, n)
    if (sorteados.length < n && todos.length > sorteados.length) {
        // Os não vistos acabaram: completa com o conjunto já mostrado (sem repetir dentro do mesmo sorteio).
        const escolhidos = new Set(sorteados.map((p) => Number(p.id)))
        const reserva = embaralhar(
            todos.filter((p) => !escolhidos.has(Number(p.id))),
            aleatorio,
        )
        sorteados = [...sorteados, ...reserva.slice(0, n - sorteados.length)]
    }
    const mostrados = new Set([...vistos, ...sorteados.map((p) => Number(p.id))])
    return { sorteados, restantes: todos.filter((p) => !mostrados.has(Number(p.id))).length }
}
