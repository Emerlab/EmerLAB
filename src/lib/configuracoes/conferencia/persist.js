import { supabase } from '../../supabase.js'
import { idsEspecialidadeLaboratorio, normalizarTextoBusca } from '../../prestadorCadastroHelpers.js'

/**
 * Regras da Conferência Laboratório persistidas por laboratório
 * (equivalências de exame, tutor alternativo, perfis, vínculos com a Valores de Base)
 * e trilha de revisão. Migração: supabase/migrations/pendentes/20261113120000_*.sql
 */

/** Só "tabela/RPC inexistente" é tratada como migração pendente — outros erros (RLS, rede) aparecem. */
export function erroTabelaAusente(error) {
    const txt = `${error?.code || ''} ${error?.message || error || ''}`
    return /42P01|PGRST205|PGRST202|does not exist|could not find the (table|function)|schema cache/i.test(txt)
}

const MSG_MIGRACAO =
    'As regras ainda não são salvas no banco (migração pendente). Elas valem só nesta sessão.'

function motivoErro(error) {
    return erroTabelaAusente(error) ? MSG_MIGRACAO : error?.message || String(error)
}

async function uidAtual() {
    try {
        const { data } = await supabase.auth.getSession()
        return data?.session?.user?.id || null
    } catch {
        return null
    }
}

function idLab(laboratorioId) {
    const id = Number(laboratorioId)
    return Number.isFinite(id) && id > 0 ? id : null
}

export async function listarLaboratorios() {
    const { data: esp, error: errE } = await supabase.from('especialidades').select('id, nome')
    if (errE) throw errE
    const ids = idsEspecialidadeLaboratorio(esp || [])
    const { data, error } = await supabase
        .from('prestadores')
        .select('id, nome, ativo')
        .in('especialidade_id', ids)
        .order('nome', { ascending: true })
        .limit(1000)
    if (error) throw error
    return (data || []).map((p) => ({ id: p.id, nome: p.nome, ativo: p.ativo !== false }))
}

/**
 * Carrega todas as regras do laboratório de uma vez.
 * @returns {{ ok: boolean, migracaoPendente?: boolean, motivo?: string, equivalencias, aliasesPessoa, perfis, vinculos }}
 */
export async function carregarRegrasLaboratorio(laboratorioId) {
    const id = idLab(laboratorioId)
    const vazio = { equivalencias: [], aliasesPessoa: [], perfis: [], vinculos: [] }
    if (!id) return { ok: false, motivo: 'Selecione o laboratório.', ...vazio }
    try {
        const [eq, al, pf, vb] = await Promise.all([
            supabase
                .from('lab_exame_equivalencia')
                .select('id, nome_a, nome_b')
                .eq('laboratorio_id', id)
                .eq('ativo', true)
                .order('nome_a', { ascending: true }),
            supabase
                .from('lab_pessoa_alias')
                .select('id, tipo, nome_plano, nome_lab')
                .eq('laboratorio_id', id)
                .eq('ativo', true),
            supabase
                .from('lab_exame_perfil')
                .select(
                    'id, nome, descricao, valor, vigencia_inicio, vigencia_fim, ativo, lab_exame_perfil_item(id, nome_exame)',
                )
                .eq('laboratorio_id', id)
                .eq('ativo', true)
                .order('nome', { ascending: true }),
            supabase
                .from('lab_vinculo_base')
                .select('exame_normalizado, exame_plano, codigo_base, nome_base')
                .eq('laboratorio_id', id),
        ])
        const erro = eq.error || al.error || pf.error || vb.error
        if (erro) {
            return {
                ok: false,
                migracaoPendente: erroTabelaAusente(erro),
                motivo: motivoErro(erro),
                ...vazio,
            }
        }
        return {
            ok: true,
            equivalencias: (eq.data || []).map((r) => ({ id: r.id, a: r.nome_a, b: r.nome_b })),
            aliasesPessoa: (al.data || []).map((r) => ({
                id: r.id,
                tipo: r.tipo || 'tutor',
                nomePlano: r.nome_plano,
                nomeLab: r.nome_lab,
            })),
            perfis: (pf.data || []).map((p) => ({
                id: p.id,
                nome: p.nome,
                descricao: p.descricao,
                valor: p.valor,
                vigencia_inicio: p.vigencia_inicio,
                vigencia_fim: p.vigencia_fim,
                ativo: p.ativo !== false,
                exames: (p.lab_exame_perfil_item || []).map((i) => i.nome_exame),
            })),
            vinculos: (vb.data || []).map((v) => ({
                chave: v.exame_normalizado,
                exame: v.exame_plano,
                codigo: v.codigo_base,
                nome: v.nome_base,
            })),
        }
    } catch (e) {
        return { ok: false, motivo: e?.message || String(e), ...vazio }
    }
}

async function executar(promessa) {
    try {
        const { data, error } = await promessa
        if (error) return { ok: false, migracaoPendente: erroTabelaAusente(error), motivo: motivoErro(error) }
        return { ok: true, data }
    } catch (e) {
        return { ok: false, motivo: e?.message || String(e) }
    }
}

export async function salvarEquivalenciaExame({ laboratorioId, nomeA, nomeB }) {
    const id = idLab(laboratorioId)
    const a = String(nomeA || '').trim()
    const b = String(nomeB || '').trim()
    if (!id || !a || !b) return { ok: false, motivo: 'Dados incompletos.' }
    const r = await executar(
        supabase
            .from('lab_exame_equivalencia')
            .upsert(
                {
                    laboratorio_id: id,
                    nome_a: a,
                    nome_a_normalizado: normalizarTextoBusca(a),
                    nome_b: b,
                    nome_b_normalizado: normalizarTextoBusca(b),
                    ativo: true,
                    criado_por: await uidAtual(),
                    atualizado_em: new Date().toISOString(),
                },
                { onConflict: 'laboratorio_id,nome_a_normalizado,nome_b_normalizado' },
            )
            .select('id')
            .single(),
    )
    return r.ok ? { ok: true, id: r.data?.id } : r
}

export async function atualizarEquivalenciaExame({ id, nomeA, nomeB }) {
    const a = String(nomeA || '').trim()
    const b = String(nomeB || '').trim()
    if (!id || !a || !b) return { ok: false, motivo: 'Dados incompletos.' }
    return executar(
        supabase
            .from('lab_exame_equivalencia')
            .update({
                nome_a: a,
                nome_a_normalizado: normalizarTextoBusca(a),
                nome_b: b,
                nome_b_normalizado: normalizarTextoBusca(b),
                atualizado_em: new Date().toISOString(),
            })
            .eq('id', id),
    )
}

export async function removerEquivalenciaExame(id) {
    if (!id) return { ok: true }
    return executar(
        supabase
            .from('lab_exame_equivalencia')
            .update({ ativo: false, atualizado_em: new Date().toISOString() })
            .eq('id', id),
    )
}

export async function salvarAliasPessoa({ laboratorioId, nomePlano, nomeLab, tipo = 'tutor' }) {
    const id = idLab(laboratorioId)
    const p = String(nomePlano || '').trim()
    const l = String(nomeLab || '').trim()
    if (!id || !p || !l) return { ok: false, motivo: 'Dados incompletos.' }
    return executar(
        supabase.from('lab_pessoa_alias').upsert(
            {
                laboratorio_id: id,
                tipo,
                nome_plano: p,
                nome_plano_normalizado: normalizarTextoBusca(p),
                nome_lab: l,
                nome_lab_normalizado: normalizarTextoBusca(l),
                ativo: true,
                criado_por: await uidAtual(),
            },
            { onConflict: 'laboratorio_id,tipo,nome_plano_normalizado,nome_lab_normalizado' },
        ),
    )
}

export async function salvarPerfilExame({
    laboratorioId,
    nome,
    descricao,
    valor,
    vigenciaInicio,
    vigenciaFim,
    exames,
}) {
    const id = idLab(laboratorioId)
    const titulo = String(nome || '').trim()
    if (!id || !titulo) return { ok: false, motivo: 'Informe o nome do perfil.' }
    const valorNum =
        valor == null || valor === '' ? null : Number(String(valor).replace(',', '.'))
    const r = await executar(
        supabase.rpc('salvar_lab_exame_perfil', {
            p_laboratorio_id: id,
            p_nome: titulo,
            p_descricao: String(descricao || '').trim() || null,
            p_valor: Number.isFinite(valorNum) ? valorNum : null,
            p_vigencia_inicio: vigenciaInicio || null,
            p_vigencia_fim: vigenciaFim || null,
            p_itens: (exames || [])
                .map((e) => String(e || '').trim())
                .filter(Boolean)
                .map((nomeExame) => ({
                    nome_exame: nomeExame,
                    nome_exame_normalizado: normalizarTextoBusca(nomeExame),
                })),
            p_criado_por: await uidAtual(),
        }),
    )
    return r.ok ? { ok: true, id: r.data } : r
}

export async function removerPerfilExame(id) {
    if (!id) return { ok: true }
    return executar(
        supabase
            .from('lab_exame_perfil')
            .update({ ativo: false, atualizado_em: new Date().toISOString() })
            .eq('id', id),
    )
}

export async function salvarVinculoBase({ laboratorioId, exame, chave, codigo, nome }) {
    const id = idLab(laboratorioId)
    if (!id || !chave || !codigo) return { ok: false, motivo: 'Dados incompletos.' }
    return executar(
        supabase.from('lab_vinculo_base').upsert(
            {
                laboratorio_id: id,
                exame_normalizado: chave,
                exame_plano: exame || chave,
                codigo_base: String(codigo),
                nome_base: nome || null,
                criado_por: await uidAtual(),
                atualizado_em: new Date().toISOString(),
            },
            { onConflict: 'laboratorio_id,exame_normalizado' },
        ),
    )
}

export async function removerVinculoBase({ laboratorioId, chave }) {
    const id = idLab(laboratorioId)
    if (!id || !chave) return { ok: true }
    return executar(
        supabase.from('lab_vinculo_base').delete().eq('laboratorio_id', id).eq('exame_normalizado', chave),
    )
}

/** Grava a trilha das decisões manuais (best-effort: falha não bloqueia o trabalho). */
export async function registrarRevisoes({ laboratorioId, periodoYm, sessaoId, revisoes }) {
    const id = idLab(laboratorioId)
    const lista = (revisoes || []).filter(Boolean)
    if (!id || !lista.length) return { ok: true }
    const uid = await uidAtual()
    const linhas = lista.map((r) => ({
        laboratorio_id: id,
        periodo_ym: /^\d{4}-(0[1-9]|1[0-2])$/.test(periodoYm || '') ? periodoYm : null,
        sessao_id: sessaoId || null,
        usuario_id: uid,
        usuario_nome: r.usuario || null,
        acao: r.acao,
        resultado_id: r.resultadoId || null,
        status_final: r.statusFinal || null,
        justificativa: r.justificativa || null,
        dados: { emMassa: Boolean(r.emMassa), dataHora: r.dataHora || null, resumo: r.resumoLinha || null },
    }))
    return executar(supabase.from('lab_conferencia_revisao').insert(linhas))
}

/**
 * Casa os vínculos salvos (exame do plano → código na base) com os itens da base desta conferência.
 * Só preenche chaves que o usuário ainda não definiu nesta sessão.
 */
export function resolverVinculosSalvos(vinculosSalvos, linhasBase, vinculosAtuais = {}) {
    const porCodigo = new Map()
    for (const b of linhasBase || []) {
        const cod = String(b.codigo || '').trim()
        if (cod && !porCodigo.has(cod)) porCodigo.set(cod, b)
    }
    const out = {}
    for (const v of vinculosSalvos || []) {
        if (!v.chave || vinculosAtuais[v.chave]) continue
        const item = porCodigo.get(String(v.codigo || '').trim())
        if (item) out[v.chave] = item.id
    }
    return out
}

// ---------------------------------------------------------------------------------------------------------------
// Memória extra: valores aceitos e importação (colunas + Valores de Base guardada). Funções separadas de
// `carregarRegrasLaboratorio` para que a falta destas tabelas nunca derrube o carregamento das demais regras.
// ---------------------------------------------------------------------------------------------------------------

/** @returns {Promise<{ ok: boolean, migracaoPendente?: boolean, valoresAceitos: Array, importacoes: object }>} */
export async function carregarMemoriaLaboratorio(laboratorioId) {
    const id = idLab(laboratorioId)
    const vazio = { valoresAceitos: [], importacoes: {} }
    if (!id) return { ok: false, ...vazio }
    try {
        const [va, im] = await Promise.all([
            supabase
                .from('lab_valor_aceito')
                .select('id, exame, valor_plano, valor_lab, justificativa, criado_em')
                .eq('laboratorio_id', id)
                .order('criado_em', { ascending: false }),
            supabase
                .from('lab_importacao_memoria')
                .select('origem, nome_arquivo, mapa_colunas, linhas, atualizado_em')
                .eq('laboratorio_id', id),
        ])
        const erro = va.error || im.error
        if (erro) return { ok: false, migracaoPendente: erroTabelaAusente(erro), motivo: motivoErro(erro), ...vazio }
        const importacoes = {}
        for (const r of im.data || []) {
            importacoes[r.origem] = {
                nomeArquivo: r.nome_arquivo || '',
                mapaColunas: r.mapa_colunas || {},
                linhas: Array.isArray(r.linhas) ? r.linhas : null,
                atualizadoEm: r.atualizado_em,
            }
        }
        return {
            ok: true,
            valoresAceitos: (va.data || []).map((r) => ({
                id: r.id,
                exame: r.exame,
                valorPlano: Number(r.valor_plano),
                valorLab: Number(r.valor_lab),
                justificativa: r.justificativa || '',
                criadoEm: r.criado_em,
            })),
            importacoes,
        }
    } catch (e) {
        return { ok: false, motivo: e?.message || String(e), ...vazio }
    }
}

export async function salvarValorAceito({ laboratorioId, exame, valorPlano, valorLab, justificativa }) {
    const id = idLab(laboratorioId)
    const plano = Number(valorPlano)
    const lab = Number(valorLab)
    if (!id || !String(exame || '').trim() || !Number.isFinite(plano) || !Number.isFinite(lab)) {
        return { ok: false, motivo: 'Dados incompletos.' }
    }
    const r = await executar(
        supabase
            .from('lab_valor_aceito')
            .upsert(
                {
                    laboratorio_id: id,
                    exame_normalizado: normalizarTextoBusca(exame),
                    exame: String(exame).trim(),
                    valor_plano: Math.round(plano * 100) / 100,
                    valor_lab: Math.round(lab * 100) / 100,
                    justificativa: String(justificativa || '').trim() || null,
                    criado_por: await uidAtual(),
                },
                { onConflict: 'laboratorio_id,exame_normalizado,valor_plano,valor_lab' },
            )
            .select('id')
            .single(),
    )
    return r.ok ? { ok: true, id: r.data?.id } : r
}

export async function removerValorAceito(id) {
    if (!id) return { ok: true }
    return executar(supabase.from('lab_valor_aceito').delete().eq('id', id))
}

/** Guarda as colunas mapeadas (e, para Valores de Base, as linhas) do último arquivo enviado deste laboratório. */
export async function salvarImportacaoMemoria({ laboratorioId, origem, nomeArquivo, mapaColunas, linhas = null }) {
    const id = idLab(laboratorioId)
    if (!id || !['valores_base', 'honorarios', 'mellislab'].includes(origem)) return { ok: false, motivo: 'Dados incompletos.' }
    return executar(
        supabase.from('lab_importacao_memoria').upsert(
            {
                laboratorio_id: id,
                origem,
                nome_arquivo: nomeArquivo || null,
                mapa_colunas: mapaColunas || {},
                linhas: origem === 'valores_base' ? linhas : null,
                atualizado_por: await uidAtual(),
                atualizado_em: new Date().toISOString(),
            },
            { onConflict: 'laboratorio_id,origem' },
        ),
    )
}

export async function removerAliasPessoa(id) {
    if (!id) return { ok: true }
    return executar(supabase.from('lab_pessoa_alias').update({ ativo: false }).eq('id', id))
}
