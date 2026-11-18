import { supabase } from '../supabase.js'
import { distribuirObservacoes } from '../pdf/distribuirObservacoes.js'
import {
    listarProcedimentosParaObservacoes,
    normalizarCodigoProcedimento,
} from '../impressaoHonorarios/honorariosObservacoes.js'

export { listarProcedimentosParaObservacoes, normalizarCodigoProcedimento }

function isMissingTableError(error) {
    const msg = String(error?.message || error?.details || '').toLowerCase()
    const code = String(error?.code || '')
    return (
        code === '42P01' ||
        code === 'PGRST205' ||
        (msg.includes('planos_observacoes') &&
            (msg.includes('does not exist') ||
                msg.includes('schema cache') ||
                msg.includes('could not find')))
    )
}

function isMissingTituloColumnError(error) {
    const msg = String(error?.message || error?.details || '').toLowerCase()
    return msg.includes('titulo') && (msg.includes('column') || msg.includes('schema cache'))
}

function isMissingGeralColumnError(error) {
    const msg = String(error?.message || error?.details || '').toLowerCase()
    const code = String(error?.code || '')
    if (msg.includes('geral')) return true
    return code === '42703' && !msg.includes('titulo')
}

const ERRO_MIGRACAO_GERAL =
    'Coluna geral ausente no banco. Aplique a migração de observações gerais.'

function isMissingRpcSalvarObservacaoError(error) {
    const msg = String(error?.message || error?.details || '').toLowerCase()
    const code = String(error?.code || '')
    return (
        code === 'PGRST202' ||
        code === '42883' ||
        (msg.includes('function') && msg.includes('does not exist'))
    )
}

const ERRO_MIGRACAO_TITULO_PLANOS =
    'Coluna titulo ausente na tabela de observações. Execute scripts/sql/planos_observacoes.sql no Supabase (migração do título).'

/**
 * Códigos marcados na impressão de planos (respeita checked / apenasLoja / selecionavel).
 * @param {Array<{ linhas?: object[] }>} categorias
 */
export function coletarCodigosCategoriasPlanos(categorias) {
    const set = new Set()
    for (const cat of categorias || []) {
        for (const linha of cat.linhas || []) {
            if (linha.checked === false) continue
            if (linha.apenasLoja) continue
            if (linha.selecionavel === false) continue
            const codigo = normalizarCodigoProcedimento(linha.codigo)
            if (codigo) set.add(codigo)
        }
    }
    return [...set]
}

function mapearObservacao(row) {
    const vinculos = Array.isArray(row?.planos_observacoes_procedimentos)
        ? row.planos_observacoes_procedimentos
        : []
    const codigos = [
        ...new Set(
            vinculos
                .map((v) => normalizarCodigoProcedimento(v.procedimento_codigo))
                .filter(Boolean),
        ),
    ].sort((a, b) => a.localeCompare(b, 'pt-BR'))
    return {
        id: Number(row.id),
        titulo: String(row.titulo || '').trim(),
        mensagem: String(row.mensagem || '').trim(),
        ativa: row.ativa !== false,
        geral: row.geral === true,
        ordem: Number(row.ordem) || 0,
        codigosProcedimentos: codigos,
        createdAt: row.created_at || null,
        updatedAt: row.updated_at || null,
    }
}

/**
 * @returns {Promise<{ ok: true, itens: object[] } | { ok: false, erro: string, missingTable?: boolean }>}
 */
export async function listarPlanosObservacoes() {
    const montarSelect = ({ titulo, geral }) =>
        `id, ${titulo ? 'titulo, ' : ''}mensagem, ativa, ${geral ? 'geral, ' : ''}ordem, created_at, updated_at, planos_observacoes_procedimentos(procedimento_codigo)`
    const consultar = (flags) =>
        supabase
            .from('planos_observacoes')
            .select(montarSelect(flags))
            .order('ordem', { ascending: true })
            .order('id', { ascending: true })

    const flags = { titulo: true, geral: true }
    let { data, error } = await consultar(flags)

    if (error && flags.geral && isMissingGeralColumnError(error)) {
        flags.geral = false
        ;({ data, error } = await consultar(flags))
    }
    if (error && flags.titulo && isMissingTituloColumnError(error)) {
        flags.titulo = false
        flags.geral = false
        ;({ data, error } = await consultar(flags))
    }

    if (error) {
        if (isMissingTableError(error)) {
            return {
                ok: false,
                missingTable: true,
                erro:
                    'Tabelas de observações ainda não existem. Execute scripts/sql/planos_observacoes.sql no Supabase.',
            }
        }
        return { ok: false, erro: error.message || 'Erro ao carregar observações.' }
    }

    return { ok: true, itens: (data || []).map(mapearObservacao) }
}

/**
 * @param {{
 *   id?: number | null,
 *   titulo?: string,
 *   mensagem: string,
 *   ativa?: boolean,
 *   ordem?: number,
 *   codigosProcedimentos: string[],
 * }} payload
 */
export async function salvarPlanosObservacao(payload) {
    const titulo = String(payload?.titulo || '').trim()
    const mensagem = String(payload?.mensagem || '').trim()
    if (!titulo) return { ok: false, erro: 'Informe o título da observação (ex.: Atendimentos Domiciliares).' }
    if (!mensagem) return { ok: false, erro: 'Informe o texto da observação.' }

    const geral = payload?.geral === true
    const codigos = geral
        ? []
        : [
              ...new Set(
                  (payload?.codigosProcedimentos || [])
                      .map(normalizarCodigoProcedimento)
                      .filter(Boolean),
              ),
          ]
    if (!geral && !codigos.length) {
        return { ok: false, erro: 'Vincule ao menos um procedimento que dispara a observação.' }
    }

    const idExistente = payload?.id != null && Number(payload.id) > 0 ? Number(payload.id) : null
    const ativa = payload?.ativa !== false
    const ordem = Number.isFinite(Number(payload?.ordem)) ? Number(payload.ordem) : 0
    const agora = new Date().toISOString()

    const { data: rpcId, error: rpcError } = geral
        ? { data: null, error: null }
        : await supabase.rpc('salvar_planos_observacao_com_vinculos', {
        p_id: idExistente,
        p_titulo: titulo,
        p_mensagem: mensagem,
        p_ativa: ativa,
        p_ordem: ordem,
        p_codigos: codigos,
    })
    if (!rpcError && rpcId != null) {
        return { ok: true, id: Number(rpcId) }
    }
    if (rpcError && !isMissingRpcSalvarObservacaoError(rpcError)) {
        if (isMissingTableError(rpcError)) {
            return {
                ok: false,
                missingTable: true,
                erro:
                    'Tabelas de observações ainda não existem. Execute scripts/sql/planos_observacoes.sql no Supabase.',
            }
        }
        if (isMissingTituloColumnError(rpcError)) {
            return { ok: false, erro: ERRO_MIGRACAO_TITULO_PLANOS }
        }
        return { ok: false, erro: rpcError.message || 'Erro ao salvar observação.' }
    }

    let observacaoId = idExistente
    const rowBase = { mensagem, ativa, ordem, updated_at: agora, titulo, geral }
    const { geral: _geral, ...rowSemGeral } = rowBase

    if (idExistente) {
        const executarUpdate = (row) =>
            supabase.from('planos_observacoes').update(row).eq('id', idExistente).select('id')
        let { data: updated, error } = await executarUpdate(rowBase)
        if (error && isMissingGeralColumnError(error)) {
            if (geral) return { ok: false, erro: ERRO_MIGRACAO_GERAL }
            ;({ data: updated, error } = await executarUpdate(rowSemGeral))
        }
        if (error && isMissingTituloColumnError(error)) {
            return { ok: false, erro: ERRO_MIGRACAO_TITULO_PLANOS }
        }
        if (error) {
            if (isMissingTableError(error)) {
                return {
                    ok: false,
                    missingTable: true,
                    erro:
                        'Tabelas de observações ainda não existem. Execute scripts/sql/planos_observacoes.sql no Supabase.',
                }
            }
            return { ok: false, erro: error.message || 'Erro ao atualizar observação.' }
        }
        if (!updated?.length) {
            return {
                ok: false,
                erro: 'Não foi possível atualizar a observação (registro não encontrado ou sem permissão).',
            }
        }
    } else {
        const executarInsert = (row) =>
            supabase.from('planos_observacoes').insert(row).select('id').single()
        let { data, error } = await executarInsert(rowBase)
        if (error && isMissingGeralColumnError(error)) {
            if (geral) return { ok: false, erro: ERRO_MIGRACAO_GERAL }
            ;({ data, error } = await executarInsert(rowSemGeral))
        }
        if (error && isMissingTituloColumnError(error)) {
            return { ok: false, erro: ERRO_MIGRACAO_TITULO_PLANOS }
        }
        if (error) {
            if (isMissingTableError(error)) {
                return {
                    ok: false,
                    missingTable: true,
                    erro:
                        'Tabelas de observações ainda não existem. Execute scripts/sql/planos_observacoes.sql no Supabase.',
                }
            }
            return { ok: false, erro: error.message || 'Erro ao criar observação.' }
        }
        observacaoId = Number(data.id)
    }

    let vinculosAntigos = []
    if (observacaoId) {
        const { data: antigos } = await supabase
            .from('planos_observacoes_procedimentos')
            .select('procedimento_codigo')
            .eq('observacao_id', observacaoId)
        vinculosAntigos = (antigos || []).map((v) => v.procedimento_codigo).filter(Boolean)
    }

    const { error: errDel } = await supabase
        .from('planos_observacoes_procedimentos')
        .delete()
        .eq('observacao_id', observacaoId)
    if (errDel) {
        return { ok: false, erro: errDel.message || 'Erro ao atualizar vínculos.' }
    }

    if (!codigos.length) return { ok: true, id: observacaoId }

    const rows = codigos.map((procedimento_codigo) => ({
        observacao_id: observacaoId,
        procedimento_codigo,
    }))
    const { error: errIns } = await supabase.from('planos_observacoes_procedimentos').insert(rows)
    if (errIns) {
        if (vinculosAntigos.length) {
            await supabase.from('planos_observacoes_procedimentos').insert(
                vinculosAntigos.map((procedimento_codigo) => ({
                    observacao_id: observacaoId,
                    procedimento_codigo,
                })),
            )
        }
        return { ok: false, erro: errIns.message || 'Erro ao vincular procedimentos.' }
    }

    return { ok: true, id: observacaoId }
}

export async function excluirPlanosObservacao(id) {
    const observacaoId = Number(id)
    if (!Number.isFinite(observacaoId) || observacaoId <= 0) {
        return { ok: false, erro: 'Observação inválida.' }
    }
    const { error } = await supabase.from('planos_observacoes').delete().eq('id', observacaoId)
    if (error) {
        if (isMissingTableError(error)) {
            return {
                ok: false,
                missingTable: true,
                erro:
                    'Tabelas de observações ainda não existem. Execute scripts/sql/planos_observacoes.sql no Supabase.',
            }
        }
        return { ok: false, erro: error.message || 'Erro ao excluir observação.' }
    }
    return { ok: true }
}

/**
 * @param {string[]} codigos
 * @returns {Promise<Array<{ titulo: string, mensagem: string }>>}
 */
export async function resolverMensagensObservacoesPlanosPorCodigos(codigos) {
    const setCodigos = new Set(
        (codigos || []).map(normalizarCodigoProcedimento).filter(Boolean),
    )
    if (!setCodigos.size) return []

    const lista = await listarPlanosObservacoes()
    if (!lista.ok) return []

    return lista.itens
        .filter((item) => item.ativa)
        .filter((item) =>
            (item.codigosProcedimentos || []).some((c) =>
                setCodigos.has(normalizarCodigoProcedimento(c)),
            ),
        )
        .map((item) => ({
            titulo: item.titulo || '',
            mensagem: item.mensagem || '',
        }))
        .filter((item) => item.mensagem)
}

/**
 * @param {Array<{ linhas?: object[] }>} categorias
 */
export async function resolverMensagensObservacoesPorCategorias(categorias) {
    return resolverMensagensObservacoesPlanosPorCodigos(coletarCodigosCategoriasPlanos(categorias))
}

/**
 * Distribui as observações ativas entre as categorias (grupos) e as gerais.
 * @param {Array<{ id: number|string, linhas?: object[] }>} categorias
 * @returns {Promise<{ porGrupo: Record<string, Array<{ titulo: string, mensagem: string }>>, gerais: Array<{ titulo: string, mensagem: string }> }>}
 */
export async function resolverObservacoesPlanosPorGrupo(categorias) {
    const lista = await listarPlanosObservacoes()
    if (!lista.ok) return { porGrupo: {}, gerais: [] }
    const grupos = (categorias || []).map((cat) => ({
        chave: String(cat.id),
        codigos: coletarCodigosCategoriasPlanos([cat]),
    }))
    return distribuirObservacoes({ grupos, observacoes: lista.itens })
}
