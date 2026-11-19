/**
 * Pendências de limite/carência por procedimento: um procedimento deve ter linha em planos_config,
 * com carência (e limite, salvo limite de grupo ativo) preenchidos, em cada plano do plano base até o Ultra.
 */
import { gravarPlanoConfig } from './planosConfigCompat.js'
import { categoriaUsaLimiteGrupo } from './categoriaLimitesGrupo.js'
import {
    obterPlanoIdsPermitidosDesdeBase,
    obterChavePlanoPorId,
    CHAVE_PLANO_APENAS_LOJA,
    ORDEM_PLANOS,
} from './planosHierarquia.js'

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

const temValorReal = (valor) => {
    const texto = String(valor ?? '').trim()
    return texto !== '' && !terminaEmAcima(texto)
}

/**
 * Compara as linhas de planos_config do procedimento com a regra «Acima»:
 * abaixo do plano base = «<base> Acima» nos dois campos; do base para cima não pode sobrar par «Acima» velho.
 * Linha abaixo do base com valor real (não vazio e não «Acima») é CONFLITO: por padrão nada é proposto
 * para gravar abaixo do base nesse procedimento (a migração de dados segue a mesma regra);
 * `sobrescreverValoresReais` trata o conflito como divergência (troca explícita de plano base).
 */
export const diagnosticarAcima = (proc, { mapaPlanos, planos, indiceConfigs }, opcoes = {}) => {
    const porPlano = indiceConfigs.get(String(proc.codigo ?? '').trim().toUpperCase())
    const resultado = []

    const abaixo = planoIdsAbaixoDaBase(proc.planoBaseId, mapaPlanos)
    const nomeBase = nomeDoPlanoBase(proc.planoBaseId, planos, mapaPlanos)
    if (abaixo.length > 0 && nomeBase) {
        const texto = textoAcima(nomeBase)
        const conflitos = opcoes.sobrescreverValoresReais
            ? []
            : abaixo.filter((planoId) => {
                  const config = porPlano?.get(planoId)
                  return Boolean(config) && (temValorReal(config.limite) || temValorReal(config.carencia))
              })

        if (conflitos.length > 0) {
            conflitos.forEach((planoId) => {
                const config = porPlano.get(planoId)
                resultado.push({ planoId, tipo: 'conflito', limite: config.limite, carencia: config.carencia })
            })
        } else {
            abaixo.forEach((planoId) => {
                const config = porPlano?.get(planoId)
                if (!config) {
                    resultado.push({ planoId, tipo: 'faltando', limite: texto, carencia: texto })
                } else if (config.limite.trim() !== texto || config.carencia.trim() !== texto) {
                    resultado.push({ planoId, tipo: 'divergente', limite: texto, carencia: texto })
                }
            })
        }
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
export const sincronizarAcimaProcedimento = async (
    supabase,
    { codigo, planoBaseId, mapaPlanos, planos, sobrescreverValoresReais = false }
) => {
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
        { mapaPlanos, planos, indiceConfigs: indexarPlanosConfig(data || []) },
        { sobrescreverValoresReais }
    ).filter((item) => item.tipo !== 'conflito')

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

