// Funções puras (sem banco/DOM) do download rápido de planos em zip.

const limpar = (s) =>
    String(s || '')
        .replace(/[/\\:*?"<>|]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()

export function nomeArquivoImpressaoPlanosPdf(planoNome, cidadeNome) {
    return `${limpar(planoNome)} ${limpar(cidadeNome)}.pdf`.trim() || 'Plano Cidade.pdf'
}

export function nomeArquivoZipPlanos(cidadeNome) {
    return `Planos ${limpar(cidadeNome)}.zip`.trim() || 'Planos Cidade.zip'
}

function ms(v) {
    const t = v ? new Date(v).getTime() : NaN
    return Number.isNaN(t) ? null : t
}

export function calcularStatusZipPlanos({ planosDisponiveis, modos, ultimaGeracao } = {}) {
    const planos = Array.isArray(planosDisponiveis) ? planosDisponiveis : []
    const lista = Array.isArray(modos) ? modos : []
    const geradoMs = ms(ultimaGeracao?.geradoEm)

    const linhas = planos.map((plano) => {
        const modo = lista.find((m) => Number(m.planoId) === Number(plano.id)) || null
        const atualizadoMs = ms(modo?.atualizadoEm)
        return {
            planoId: plano.id,
            planoNome: plano.nome,
            modo,
            semPreset: !modo,
            maisNovoQueZip: geradoMs != null && atualizadoMs != null && atualizadoMs > geradoMs,
        }
    })

    if (linhas.length === 0) {
        return { linhas, podeGerar: false, motivoBloqueio: 'Nenhum plano disponível nesta cidade' }
    }
    const sem = linhas.filter((l) => l.semPreset)
    if (sem.length > 0) {
        return {
            linhas,
            podeGerar: false,
            motivoBloqueio: `Sem preset salvo: ${sem.map((l) => l.planoNome).join(', ')} — revise esses planos antes de gerar`,
        }
    }
    return { linhas, podeGerar: true, motivoBloqueio: null }
}
