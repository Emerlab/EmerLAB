// Disponibilidade de planos por cidade (lógica pura/injetável, sem DOM).

/**
 * Para cada plano, verifica se a cidade está entre as que o atendem.
 * Falha na verificação de um plano vai para `comFalha` (nunca para `disponiveis`).
 */
export async function carregarDisponibilidadePlanos({ planos, cidadeTabelaId, buscarCidadeIds }) {
    if (!cidadeTabelaId) return { disponiveis: [], comFalha: [] }
    const resultados = await Promise.all(
        (planos || []).map(async (plano) => {
            try {
                const ids = await buscarCidadeIds(plano.id)
                return { plano, ok: true, tem: Boolean(ids?.has(cidadeTabelaId)) }
            } catch {
                return { plano, ok: false, tem: false }
            }
        }),
    )
    return {
        disponiveis: resultados.filter((r) => r.ok && r.tem).map((r) => r.plano),
        comFalha: resultados.filter((r) => !r.ok).map((r) => r.plano),
    }
}

/** Decide se o botão do zip fica bloqueado e qual mensagem explica. */
export function decidirBloqueioZip({
    status,
    carregando = false,
    erroCarga = '',
    disponibilidadeCarregando = false,
    planosComFalha = [],
}) {
    if (disponibilidadeCarregando) {
        return { bloqueado: true, mensagem: 'Verificando planos da cidade…' }
    }
    if ((planosComFalha || []).length > 0) {
        const nomes = planosComFalha.map((p) => p.nome).join(', ')
        return {
            bloqueado: true,
            mensagem: `Não deu para verificar a disponibilidade de ${nomes}; recarregue a página ou tente de novo`,
        }
    }
    if (carregando) return { bloqueado: true, mensagem: null }
    if (erroCarga) return { bloqueado: true, mensagem: null }
    if (!status?.podeGerar) return { bloqueado: true, mensagem: status?.motivoBloqueio || null }
    return { bloqueado: false, mensagem: null }
}
