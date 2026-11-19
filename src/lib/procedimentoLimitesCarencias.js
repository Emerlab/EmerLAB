/**
 * Pendências de limite/carência por procedimento: um procedimento deve ter linha em planos_config,
 * com carência (e limite, salvo limite de grupo ativo) preenchidos, em cada plano do plano base até o Ultra.
 */
import { gravarPlanoConfig } from './planosConfigCompat.js'
import { categoriaUsaLimiteGrupo, procedimentoIsentoLimiteGrupo } from './categoriaLimitesGrupo.js'
import {
    obterPlanoIdsPermitidosDesdeBase,
    obterChavePlanoPorId,
    CHAVE_PLANO_APENAS_LOJA,
    ORDEM_PLANOS,
} from './planosHierarquia.js'

const emBranco = (valor) => !String(valor ?? '').trim()

const idsDaHierarquia = (chaves, mapaPlanos) =>
    chaves.map((chave) => mapaPlanos[chave]?.id).filter(Boolean).map((id) => Number(id))

/** Do plano base ao Ultra; «Apenas loja» tem as 4 colunas da hierarquia. */
export const planoIdsAplicaveis = (planoBaseId, mapaPlanos) => {
    if (obterChavePlanoPorId(planoBaseId, mapaPlanos) === CHAVE_PLANO_APENAS_LOJA) {
        return idsDaHierarquia(ORDEM_PLANOS, mapaPlanos)
    }
    return obterPlanoIdsPermitidosDesdeBase(planoBaseId, mapaPlanos)
}

/** Planos da hierarquia antes do plano base (onde vale «<base> Acima»). */
export const planoIdsAbaixoDaBase = (planoBaseId, mapaPlanos) => {
    const chaveBase = obterChavePlanoPorId(planoBaseId, mapaPlanos)
    if (chaveBase === CHAVE_PLANO_APENAS_LOJA) return []
    const indice = ORDEM_PLANOS.indexOf(chaveBase || 'basico')
    return idsDaHierarquia(ORDEM_PLANOS.slice(0, Math.max(indice, 0)), mapaPlanos)
}

export const textoAcima = (nomePlanoBase) => `${String(nomePlanoBase ?? '').trim()} Acima`

const terminaEmAcima = (valor) => /\sacima$/i.test(String(valor ?? '').trim())

/** Os dois campos terminam em «Acima» (só o par é considerado valor automático). */
export const ehParAcima = (limite, carencia) => terminaEmAcima(limite) && terminaEmAcima(carencia)

const nomeDoPlanoBase = (planoBaseId, planos, mapaPlanos) => {
    const direto = (planos || []).find((plano) => Number(plano.id) === Number(planoBaseId))?.nome
    if (direto) return direto
    const chave = obterChavePlanoPorId(planoBaseId, mapaPlanos)
    return chave ? mapaPlanos[chave]?.nome || '' : ''
}

/**
 * Compara as linhas de planos_config do procedimento com a regra «Acima»:
 * abaixo do plano base = «<base> Acima» nos dois campos; do base para cima não pode sobrar par «Acima» velho.
 */
export const diagnosticarAcima = (proc, { mapaPlanos, planos, indiceConfigs }) => {
    const porPlano = indiceConfigs.get(String(proc.codigo ?? '').trim().toUpperCase())
    const resultado = []

    const abaixo = planoIdsAbaixoDaBase(proc.planoBaseId, mapaPlanos)
    const nomeBase = nomeDoPlanoBase(proc.planoBaseId, planos, mapaPlanos)
    if (abaixo.length > 0 && nomeBase) {
        const texto = textoAcima(nomeBase)
        abaixo.forEach((planoId) => {
            const config = porPlano?.get(planoId)
            if (!config) {
                resultado.push({ planoId, tipo: 'faltando', limite: texto, carencia: texto })
            } else if (config.limite.trim() !== texto || config.carencia.trim() !== texto) {
                resultado.push({ planoId, tipo: 'divergente', limite: texto, carencia: texto })
            }
        })
    }

    planoIdsAplicaveis(proc.planoBaseId, mapaPlanos).forEach((planoId) => {
        const config = porPlano?.get(planoId)
        if (config && ehParAcima(config.limite, config.carencia)) {
            resultado.push({ planoId, tipo: 'acima-velho', limite: '', carencia: '' })
        }
    })

    return resultado
}

/** Grava o «Acima» abaixo do plano base e zera «Acima» velho do base para cima; erros por plano. */
export const sincronizarAcimaProcedimento = async (supabase, { codigo, planoBaseId, mapaPlanos, planos }) => {
    const limpo = String(codigo ?? '').trim()
    const variantes = [...new Set([limpo, limpo.toUpperCase(), limpo.toLowerCase()])].filter(Boolean)
    if (variantes.length === 0) return { erros: [] }

    const { data, error } = await supabase
        .from('planos_config')
        .select('id, plano_id, procedimento, limite, carencia')
        .in('procedimento', variantes)
    if (error) return { erros: [{ planoId: 0, mensagem: error.message }] }

    const pendencias = diagnosticarAcima(
        { codigo: limpo, planoBaseId },
        { mapaPlanos, planos, indiceConfigs: indexarPlanosConfig(data || []) }
    )

    const erros = []
    for (const item of pendencias) {
        const resultado = await gravarPlanoConfig(supabase, {
            planoId: item.planoId,
            procedimento: limpo,
            limite: item.limite,
            carencia: item.carencia,
        })
        if (resultado.status === 'erro') {
            erros.push({ planoId: item.planoId, mensagem: resultado.error?.message || 'Erro ao gravar.' })
        }
    }
    return { erros }
}


export const indexarPlanosConfig = (rows) => {
    const indice = new Map()
    ;(rows || []).forEach((row) => {
        const codigo = String(row.procedimento ?? '').trim().toUpperCase()
        if (!codigo) return
        if (!indice.has(codigo)) indice.set(codigo, new Map())
        indice.get(codigo).set(Number(row.plano_id), {
            id: row.id,
            limite: row.limite != null ? String(row.limite) : '',
            carencia: row.carencia != null ? String(row.carencia) : '',
        })
    })
    return indice
}

export const limiteGrupoAtivoNoPlano = (categorias, limitesGrupoRows, categoriaId, planoId) => {
    if (!categoriaUsaLimiteGrupo(categorias, categoriaId)) return ''
    const linha = (limitesGrupoRows || []).find(
        (row) => Number(row.categoria_id) === Number(categoriaId) && Number(row.plano_id) === Number(planoId)
    )
    return String(linha?.limite ?? '').trim()
}

export const calcularPendencias = (proc, contexto) => {
    const { mapaPlanos, indiceConfigs, categorias, limitesGrupoRows } = contexto
    const porPlano = indiceConfigs.get(String(proc.codigo ?? '').trim().toUpperCase())
    const isento = procedimentoIsentoLimiteGrupo({ procedimentoId: proc.procedimentoId })

    const pendencias = []
    planoIdsAplicaveis(proc.planoBaseId, mapaPlanos).forEach((planoId) => {
        const config = porPlano?.get(planoId)
        if (!config) {
            pendencias.push({ planoId, faltaLinha: true, faltaLimite: true, faltaCarencia: true })
            return
        }
        const grupoAtivo =
            !isento && Boolean(limiteGrupoAtivoNoPlano(categorias, limitesGrupoRows, proc.categoriaId, planoId))
        const faltaLimite = emBranco(config.limite) && !grupoAtivo
        const faltaCarencia = emBranco(config.carencia)
        if (faltaLimite || faltaCarencia) {
            pendencias.push({ planoId, faltaLinha: false, faltaLimite, faltaCarencia })
        }
    })
    return pendencias
}

/** Pendências por código só das linhas cuja categoria é exibida na página (as outras nunca aparecem). */
export const calcularPendenciasDasLinhas = (linhas, contexto) => {
    const categoriaIdsVisiveis = new Set((contexto.categorias || []).map((categoria) => Number(categoria.id)))
    const mapa = new Map()
    ;(linhas || []).forEach((linha) => {
        if (!categoriaIdsVisiveis.has(Number(linha.categoriaId))) return
        const pendencias = calcularPendencias(
            {
                codigo: linha.codigo,
                categoriaId: linha.categoriaId,
                planoBaseId: contexto.mapaPlanos[linha.planoBaseChave]?.id ?? null,
                procedimentoId: linha.procedimentoId,
            },
            contexto
        )
        if (pendencias.length > 0) mapa.set(linha.codigo, pendencias)
    })
    return mapa
}

/** Grava os planos informados um a um; a falha de um plano não impede os demais. */
export const salvarLimitesCarenciasProcedimento = async (supabase, { codigo, itens }) => {
    const erros = []
    for (const item of itens || []) {
        const resultado = await gravarPlanoConfig(supabase, {
            planoId: item.planoId,
            procedimento: codigo,
            limite: item.limite,
            carencia: item.carencia,
        })
        if (resultado.status === 'erro') {
            erros.push({ planoId: Number(item.planoId), mensagem: resultado.error?.message || 'Erro ao gravar.' })
        }
    }
    return { erros }
}
