/**
 * Decide em qual grupo do PDF cada observação sai.
 * - geral ativa -> só em `gerais` (páginas do fim);
 * - não geral -> só no primeiro grupo (ordem do PDF) com algum código marcado ligado a ela.
 */

function normalizarCodigo(codigo) {
    return String(codigo || '')
        .trim()
        .toUpperCase()
}

function comparar(a, b) {
    const oa = Number(a.ordem) || 0
    const ob = Number(b.ordem) || 0
    if (oa !== ob) return oa - ob
    return (Number(a.id) || 0) - (Number(b.id) || 0)
}

export function distribuirObservacoes({ grupos = [], observacoes = [] } = {}) {
    const gruposNorm = grupos.map((g) => ({
        chave: g.chave,
        codigos: new Set((g.codigos || []).map(normalizarCodigo).filter(Boolean)),
    }))

    const porGrupo = {}
    const gerais = []

    const ordenadas = [...observacoes].sort(comparar)
    for (const o of ordenadas) {
        if (!o?.ativa) continue
        if (!String(o.mensagem || '').trim()) continue
        const item = { titulo: o.titulo, mensagem: o.mensagem }

        if (o.geral) {
            gerais.push(item)
            continue
        }

        const codigos = (o.codigosProcedimentos || []).map(normalizarCodigo).filter(Boolean)
        const grupo = gruposNorm.find((g) => codigos.some((c) => g.codigos.has(c)))
        if (!grupo) continue
        if (!porGrupo[grupo.chave]) porGrupo[grupo.chave] = []
        porGrupo[grupo.chave].push(item)
    }

    return { porGrupo, gerais }
}
