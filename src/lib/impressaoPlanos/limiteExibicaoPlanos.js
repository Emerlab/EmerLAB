// Módulo puro: usado pelo PDF de planos (navegador) e pela API pública (Node).
import {
    categoriaUsaLimiteGrupo,
    procedimentoIsentoLimiteGrupo,
    resolverLimiteGrupoExibicao,
    textoCelulaLimiteGrupo,
} from '../categoriaLimitesGrupo.js'
import { formatarTextoCampoPlano } from './formatarCamposPlano.js'

/**
 * Texto do limite de uma linha: limite de grupo da categoria quando houver
 * (exceto o procedimento isento), senão o limite individual.
 */
export function resolverLimiteExibicao(linha, categorias, limitesGrupoPorCategoriaId, contextoLimiteGrupoPlano) {
    const catId = Number(linha.categoriaId)
    if (procedimentoIsentoLimiteGrupo(linha)) {
        return formatarTextoCampoPlano(linha.limite)
    }
    if (!categoriaUsaLimiteGrupo(categorias, catId)) {
        return formatarTextoCampoPlano(linha.limite)
    }
    const grupo = resolverLimiteGrupoExibicao(categorias, limitesGrupoPorCategoriaId, catId, contextoLimiteGrupoPlano)
    if (grupo) {
        const catNome = categorias.find((c) => Number(c.id) === catId)?.nome || 'categoria'
        return textoCelulaLimiteGrupo(grupo, catNome)
    }
    return formatarTextoCampoPlano(linha.limite)
}
