import { supabase, buscarTodosPaginado } from '../supabase.js'
import { distribuirObservacoes } from '../pdf/distribuirObservacoes.js'

function isMissingTableError(error) {
    const msg = String(error?.message || error?.details || '').toLowerCase()
    const code = String(error?.code || '')
    return (
        code === '42P01' ||
        code === 'PGRST205' ||
        (msg.includes('honorarios_observacoes') &&
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

const ERRO_MIGRACAO_TITULO_HONORARIOS =
    'Coluna titulo ausente na tabela de observações. Execute scripts/sql/honorarios_observacoes.sql no Supabase (migração do título).'

export function normalizarCodigoProcedimento(codigo) {
    return String(codigo || '')
        .trim()
        .toUpperCase()
}

export function coletarCodigosSecoesHonorarios(secoes) {
    const set = new Set()
    for (const secao of secoes || []) {
        for (const linha of secao.linhas || []) {
            if (linha.checked === false) continue
            const codigo = normalizarCodigoProcedimento(linha.codigo)
            if (codigo) set.add(codigo)
        }
    }
    return [...set]
}

function mapearObservacao(row) {
    const vinculos = Array.isArray(row?.honorarios_observacoes_procedimentos)
        ? row.honorarios_observacoes_procedimentos
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
 * Lista observações com procedimentos vinculados.
 * @returns {Promise<{ ok: true, itens: object[] } | { ok: false, erro: string, missingTable?: boolean }>}
 */
export async function listarHonorariosObservacoes() {
    const montarSelect = ({ titulo, geral }) =>
        `id, ${titulo ? 'titulo, ' : ''}mensagem, ativa, ${geral ? 'geral, ' : ''}ordem, created_at, updated_at, honorarios_observacoes_procedimentos(procedimento_codigo)`
    const consultar = (flags) =>
        supabase
            .from('honorarios_observacoes')
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
                    'Tabelas de observações ainda não existem. Execute scripts/sql/honorarios_observacoes.sql no Supabase.',
            }
        }
        return { ok: false, erro: error.message || 'Erro ao carregar observações.' }
    }

    const itens = (data || []).map(mapearObservacao)
    return { ok: true, itens }
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
export async function salvarHonorariosObservacao(payload) {
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
        : await supabase.rpc('salvar_honorarios_observacao_com_vinculos', {
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
                    'Tabelas de observações ainda não existem. Execute scripts/sql/honorarios_observacoes.sql no Supabase.',
            }
        }
        if (isMissingTituloColumnError(rpcError)) {
            return { ok: false, erro: ERRO_MIGRACAO_TITULO_HONORARIOS }
        }
        return { ok: false, erro: rpcError.message || 'Erro ao salvar observação.' }
    }

    let observacaoId = idExistente
    const rowBase = { mensagem, ativa, ordem, updated_at: agora, titulo, geral }
    const { geral: _geral, ...rowSemGeral } = rowBase

    if (idExistente) {
        const executarUpdate = (row) =>
            supabase.from('honorarios_observacoes').update(row).eq('id', idExistente).select('id')
        let { data: updated, error } = await executarUpdate(rowBase)
        if (error && isMissingGeralColumnError(error)) {
            if (geral) return { ok: false, erro: ERRO_MIGRACAO_GERAL }
            ;({ data: updated, error } = await executarUpdate(rowSemGeral))
        }
        if (error && isMissingTituloColumnError(error)) {
            return { ok: false, erro: ERRO_MIGRACAO_TITULO_HONORARIOS }
        }
        if (error) {
            if (isMissingTableError(error)) {
                return {
                    ok: false,
                    missingTable: true,
                    erro:
                        'Tabelas de observações ainda não existem. Execute scripts/sql/honorarios_observacoes.sql no Supabase.',
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
            supabase.from('honorarios_observacoes').insert(row).select('id').single()
        let { data, error } = await executarInsert(rowBase)
        if (error && isMissingGeralColumnError(error)) {
            if (geral) return { ok: false, erro: ERRO_MIGRACAO_GERAL }
            ;({ data, error } = await executarInsert(rowSemGeral))
        }
        if (error && isMissingTituloColumnError(error)) {
            return { ok: false, erro: ERRO_MIGRACAO_TITULO_HONORARIOS }
        }
        if (error) {
            if (isMissingTableError(error)) {
                return {
                    ok: false,
                    missingTable: true,
                    erro:
                        'Tabelas de observações ainda não existem. Execute scripts/sql/honorarios_observacoes.sql no Supabase.',
                }
            }
            return { ok: false, erro: error.message || 'Erro ao criar observação.' }
        }
        observacaoId = Number(data.id)
    }

    let vinculosAntigos = []
    if (observacaoId) {
        const { data: antigos } = await supabase
            .from('honorarios_observacoes_procedimentos')
            .select('procedimento_codigo')
            .eq('observacao_id', observacaoId)
        vinculosAntigos = (antigos || []).map((v) => v.procedimento_codigo).filter(Boolean)
    }

    const { error: errDel } = await supabase
        .from('honorarios_observacoes_procedimentos')
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
    const { error: errIns } = await supabase
        .from('honorarios_observacoes_procedimentos')
        .insert(rows)
    if (errIns) {
        if (vinculosAntigos.length) {
            await supabase.from('honorarios_observacoes_procedimentos').insert(
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

export async function excluirHonorariosObservacao(id) {
    const observacaoId = Number(id)
    if (!Number.isFinite(observacaoId) || observacaoId <= 0) {
        return { ok: false, erro: 'Observação inválida.' }
    }
    const { error } = await supabase.from('honorarios_observacoes').delete().eq('id', observacaoId)
    if (error) {
        if (isMissingTableError(error)) {
            return {
                ok: false,
                missingTable: true,
                erro:
                    'Tabelas de observações ainda não existem. Execute scripts/sql/honorarios_observacoes.sql no Supabase.',
            }
        }
        return { ok: false, erro: error.message || 'Erro ao excluir observação.' }
    }
    return { ok: true }
}

/**
 * Itens ativos cujo vínculo cruza com os códigos impressos (ordem preservada).
 * @param {string[]} codigos
 * @returns {Promise<Array<{ titulo: string, mensagem: string }>>}
 */
export async function resolverMensagensObservacoesPorCodigos(codigos) {
    const setCodigos = new Set(
        (codigos || []).map(normalizarCodigoProcedimento).filter(Boolean),
    )
    if (!setCodigos.size) return []

    const lista = await listarHonorariosObservacoes()
    if (!lista.ok) return []

    return lista.itens
        .filter((item) => item.ativa)
        .filter((item) =>
            (item.codigosProcedimentos || []).some((c) => setCodigos.has(normalizarCodigoProcedimento(c))),
        )
        .map((item) => ({
            titulo: item.titulo || '',
            mensagem: item.mensagem || '',
        }))
        .filter((item) => item.mensagem)
}

/**
 * @param {object[]} secoes
 * @returns {Promise<Array<{ titulo: string, mensagem: string }>>}
 */
export async function resolverMensagensObservacoesPorSecoes(secoes) {
    return resolverMensagensObservacoesPorCodigos(coletarCodigosSecoesHonorarios(secoes))
}

/**
 * Chave do grupo (cartão) de uma seção no PDF de honorários.
 * @param {{ categoriaNome?: string, nome?: string }} secao
 */
export function chaveGrupoHonorarios(secao) {
    return String(secao?.categoriaNome || secao?.nome || 'Categoria')
}

/**
 * Distribui as observações ativas entre os grupos (seções) e as gerais.
 * @param {object[]} secoes
 * @returns {Promise<{ porGrupo: Record<string, Array<{ titulo: string, mensagem: string }>>, gerais: Array<{ titulo: string, mensagem: string }> }>}
 */
export async function resolverObservacoesHonorariosPorSecoes(secoes) {
    const lista = await listarHonorariosObservacoes()
    if (!lista.ok) return { porGrupo: {}, gerais: [] }
    const grupos = (secoes || []).map((secao) => ({
        chave: chaveGrupoHonorarios(secao),
        codigos: coletarCodigosSecoesHonorarios([secao]),
    }))
    return distribuirObservacoes({ grupos, observacoes: lista.itens })
}

export async function listarProcedimentosParaObservacoes() {
    const [{ data, error }, { data: cats, error: errCats }] = await Promise.all([
        buscarTodosPaginado(() =>
            supabase
                .from('procedimentos')
                .select('id, codigo, nome, categoria_id')
                .order('codigo', { ascending: true }),
        ),
        supabase.from('categorias').select('id, nome').order('id', { ascending: true }),
    ])
    if (error) return { ok: false, erro: error.message || 'Erro ao carregar procedimentos.', itens: [] }
    if (errCats) {
        return { ok: false, erro: errCats.message || 'Erro ao carregar categorias.', itens: [] }
    }
    const mapaCat = new Map(
        (cats || []).map((c) => [Number(c.id), String(c.nome || '').trim() || `Categoria ${c.id}`]),
    )
    return {
        ok: true,
        itens: (data || []).map((p) => {
            const categoriaId = p.categoria_id != null ? Number(p.categoria_id) : null
            return {
                id: p.id,
                codigo: normalizarCodigoProcedimento(p.codigo),
                nome: String(p.nome || '').trim(),
                categoriaId,
                categoriaNome:
                    categoriaId != null
                        ? mapaCat.get(categoriaId) || `Categoria ${categoriaId}`
                        : 'Sem categoria',
            }
        }),
    }
}
