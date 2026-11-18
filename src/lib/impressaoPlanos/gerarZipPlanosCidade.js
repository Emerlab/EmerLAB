import JSZip from 'jszip'
import { aplicarSelecaoModo } from './modoImpressaoPlanos.js'
import { nomeArquivoImpressaoPlanosPdf, nomeArquivoZipPlanos } from './statusZipPlanos.js'

async function depsPadrao() {
    const [{ carregarLinhasImpressaoPlanos }, { resolverObservacoesPlanosPorGrupo }, { gerarImpressaoPlanosPdf }] =
        await Promise.all([
            import('./carregarLinhasImpressaoPlanos.js'),
            import('./planosObservacoes.js'),
            import('./gerarImpressaoPlanosPdf.js'),
        ])
    return {
        carregarLinhas: carregarLinhasImpressaoPlanos,
        resolverObservacoes: resolverObservacoesPlanosPorGrupo,
        gerarPdf: gerarImpressaoPlanosPdf,
        criarZip: () => new JSZip(),
    }
}

/**
 * Gera, um plano por vez, o PDF de cada plano disponível usando o preset salvo
 * e empacota tudo em um zip. Falha em qualquer plano aborta (sem zip parcial).
 */
export async function gerarZipPlanosCidade(params, deps) {
    const {
        cidadeTabelaId,
        municipioNome,
        incluirCidadesParalelas,
        planosLista,
        planosDisponiveis = [],
        modos = [],
        onProgresso,
    } = params
    const d = { ...(deps?.carregarLinhas && deps?.resolverObservacoes && deps?.gerarPdf && deps?.criarZip ? {} : await depsPadrao()), ...(deps || {}) }

    const presets = planosDisponiveis.map((plano) => {
        const modo = (modos || []).find((m) => Number(m.planoId) === Number(plano.id))
        if (!modo) throw new Error(`Plano ${plano.nome} sem preset salvo`)
        return { plano, modo }
    })

    const zip = d.criarZip()
    const planoIds = []
    let cidadeNomeZip = municipioNome

    for (let i = 0; i < presets.length; i += 1) {
        const { plano, modo } = presets[i]
        try {
            const res = await d.carregarLinhas({
                cidadeId: cidadeTabelaId,
                municipioNome,
                planoId: plano.id,
                incluirCidadesParalelas,
                planosLista,
            })
            const categorias = aplicarSelecaoModo(res.categorias, modo.selecao)
            const { porGrupo, gerais } = await d.resolverObservacoes(categorias)
            const blob = await d.gerarPdf({
                pdfUrl: res.pdfUrl,
                categorias,
                observacoes: gerais,
                observacoesPorGrupo: porGrupo,
            })
            zip.file(nomeArquivoImpressaoPlanosPdf(res.planoNome, res.cidadeNome), blob)
            if (res.cidadeNome) cidadeNomeZip = res.cidadeNome
        } catch (e) {
            throw new Error(`Falha ao gerar ${plano.nome}: ${e?.message || e}`)
        }
        planoIds.push(Number(plano.id))
        onProgresso?.(i + 1, presets.length, plano.nome)
    }

    const blob = await zip.generateAsync({ type: 'blob' })
    return { blob, nomeZip: nomeArquivoZipPlanos(cidadeNomeZip), planoIds }
}
