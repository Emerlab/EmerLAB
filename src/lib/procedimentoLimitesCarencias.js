/**
 * Pendências de limite/carência por procedimento: um procedimento deve ter linha em planos_config,
 * com carência (e limite, salvo limite de grupo ativo) preenchidos, em cada plano do plano base até o Ultra.
 */
import { categoriaUsaLimiteGrupo, procedimentoIsentoLimiteGrupo } from './categoriaLimitesGrupo.js'
import { obterPlanoIdsPermitidosDesdeBase, obterChavePlanoPorId, CHAVE_PLANO_APENAS_LOJA } from './planosHierarquia.js'

const emBranco = (valor) => !String(valor ?? '').trim()

export const planoIdsAplicaveis = (planoBaseId, mapaPlanos) => {
    if (obterChavePlanoPorId(planoBaseId, mapaPlanos) === CHAVE_PLANO_APENAS_LOJA) return []
    return obterPlanoIdsPermitidosDesdeBase(planoBaseId, mapaPlanos)
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
