import { supabase } from '../supabase.js'

/**
 * Aplica o mapa salvo de seleção sobre categorias já carregadas.
 * Linhas presentes em `selecao` usam o valor gravado; linhas novas mantêm o checked atual
 * (regra ≥3 realizadores vinda de carregarLinhasImpressaoPlanos).
 */
export function aplicarSelecaoModo(categorias, selecao) {
    if (!selecao || typeof selecao !== 'object' || Array.isArray(selecao)) return categorias
    return (categorias || []).map((cat) => ({
        ...cat,
        linhas: (cat.linhas || []).map((l) => {
            if (l.apenasLoja || l.selecionavel === false) return { ...l, checked: false }
            if (Object.prototype.hasOwnProperty.call(selecao, l.linhaKey)) {
                return { ...l, checked: Boolean(selecao[l.linhaKey]) }
            }
            return l
        }),
    }))
}

/** Snapshot `{ [linhaKey]: boolean }` das linhas selecionáveis. */
export function montarSelecaoDeCategorias(categorias) {
    const selecao = {}
    for (const cat of categorias || []) {
        for (const l of cat.linhas || []) {
            if (l.apenasLoja || l.selecionavel === false) continue
            if (!l.linhaKey) continue
            selecao[l.linhaKey] = l.checked !== false
        }
    }
    return selecao
}

export const FINALIDADE_IMPRESSAO = 'impressao'
export const FINALIDADE_SITE = 'site'
export const ERRO_MIGRACAO_FINALIDADE = 'Coluna finalidade ausente no banco. Aplique a migração do preset do site.'

const normalizarFinalidade = (f) => (f === FINALIDADE_SITE ? FINALIDADE_SITE : FINALIDADE_IMPRESSAO)

/** Erro de coluna `finalidade` inexistente (banco ainda sem a migração do preset do site). */
export function erroColunaFinalidadeAusente(error) {
    if (!error) return false
    const msg = String(error.message || error.details || '').toLowerCase()
    return msg.includes('finalidade') || String(error.code) === '42703'
}

async function nomeDoAutor(autorId) {
    if (!autorId) return null
    const { data: perfil } = await supabase.from('profiles').select('name').eq('id', autorId).maybeSingle()
    return perfil?.name || null
}

export async function buscarModoImpressaoPlanos(planoId, cidadeId, finalidade = FINALIDADE_IMPRESSAO) {
    if (!planoId || !cidadeId) return null
    const alvo = normalizarFinalidade(finalidade)
    const montar = (comFinalidade) => {
        let q = supabase
            .from('impressao_planos_modos')
            .select('selecao, atualizado_em, atualizado_por')
            .eq('plano_id', Number(planoId))
            .eq('cidade_id', Number(cidadeId))
        if (comFinalidade) q = q.eq('finalidade', alvo)
        return q.maybeSingle()
    }
    let { data, error } = await montar(true)
    if (error && erroColunaFinalidadeAusente(error)) {
        // Antes da migração só existe o modo de impressão; o preset do site fica vazio.
        if (alvo !== FINALIDADE_IMPRESSAO) return null
        ;({ data, error } = await montar(false))
    }
    if (error) throw error
    if (!data) return null

    return {
        selecao: data.selecao && typeof data.selecao === 'object' ? data.selecao : {},
        atualizadoEm: data.atualizado_em || null,
        atualizadoPor: data.atualizado_por || null,
        atualizadoPorNome: await nomeDoAutor(data.atualizado_por),
    }
}

/** Todos os presets salvos de uma cidade (um por plano) para a finalidade, com nome do autor em lote. */
export async function listarModosDaCidade(cidadeId, finalidade = FINALIDADE_IMPRESSAO) {
    if (!cidadeId) return []
    const alvo = normalizarFinalidade(finalidade)
    const montar = (comFinalidade) => {
        let q = supabase
            .from('impressao_planos_modos')
            .select('plano_id, selecao, atualizado_em, atualizado_por')
            .eq('cidade_id', Number(cidadeId))
        if (comFinalidade) q = q.eq('finalidade', alvo)
        return q
    }
    let { data, error } = await montar(true)
    if (error && erroColunaFinalidadeAusente(error)) {
        if (alvo !== FINALIDADE_IMPRESSAO) return []
        ;({ data, error } = await montar(false))
    }
    if (error) throw error
    const linhas = data || []

    const autorIds = [...new Set(linhas.map((l) => l.atualizado_por).filter(Boolean))]
    const nomes = new Map()
    if (autorIds.length) {
        const { data: perfis } = await supabase.from('profiles').select('id, name').in('id', autorIds)
        for (const p of perfis || []) nomes.set(p.id, p.name || null)
    }

    return linhas.map((l) => ({
        planoId: Number(l.plano_id),
        selecao: l.selecao && typeof l.selecao === 'object' ? l.selecao : {},
        atualizadoEm: l.atualizado_em || null,
        atualizadoPor: l.atualizado_por || null,
        atualizadoPorNome: (l.atualizado_por && nomes.get(l.atualizado_por)) || null,
    }))
}

async function gravarSelecao(planoId, cidadeId, selecao, finalidade) {
    const alvo = normalizarFinalidade(finalidade)
    const {
        data: { session },
    } = await supabase.auth.getSession()
    const user = session?.user ?? null
    const agora = new Date().toISOString()
    const base = {
        plano_id: Number(planoId),
        cidade_id: Number(cidadeId),
        selecao,
        atualizado_em: agora,
        atualizado_por: user?.id || null,
    }
    const gravar = (row, onConflict) =>
        supabase.from('impressao_planos_modos').upsert(row, { onConflict }).select('selecao, atualizado_em, atualizado_por').maybeSingle()

    let { data, error } = await gravar({ ...base, finalidade: alvo }, 'plano_id,cidade_id,finalidade')
    if (error && erroColunaFinalidadeAusente(error)) {
        if (alvo !== FINALIDADE_IMPRESSAO) throw new Error(ERRO_MIGRACAO_FINALIDADE)
        ;({ data, error } = await gravar(base, 'plano_id,cidade_id'))
    }
    if (error) throw error

    return {
        selecao: data?.selecao || selecao,
        atualizadoEm: data?.atualizado_em || agora,
        atualizadoPor: data?.atualizado_por || user?.id || null,
        atualizadoPorNome: await nomeDoAutor(data?.atualizado_por),
    }
}

export async function salvarModoImpressaoPlanos(planoId, cidadeId, categorias, finalidade = FINALIDADE_IMPRESSAO) {
    if (!planoId || !cidadeId) throw new Error('Plano e cidade são obrigatórios para salvar o modo.')
    return gravarSelecao(planoId, cidadeId, montarSelecaoDeCategorias(categorias), finalidade)
}

/** Copia a seleção salva de uma finalidade para outra (ex.: do PDF para o site). Devolve o modo gravado. */
export async function copiarModoParaFinalidade(planoId, cidadeId, de, para) {
    if (!planoId || !cidadeId) throw new Error('Plano e cidade são obrigatórios para copiar o modo.')
    const origem = await buscarModoImpressaoPlanos(planoId, cidadeId, de)
    if (!origem) throw new Error('Não há modo salvo para copiar.')
    return gravarSelecao(planoId, cidadeId, origem.selecao, para)
}

/** Texto curto para o indicador da UI. `finalidade` diz qual preset está sendo editado (o texto do PDF não mudou). */
export function rotuloModoImpressao(modo, finalidade = FINALIDADE_IMPRESSAO) {
    const site = normalizarFinalidade(finalidade) === FINALIDADE_SITE
    if (!modo?.atualizadoEm) return site ? 'Ainda sem modo salvo para o site neste plano e cidade.' : 'Ainda sem modo salvo para este plano e cidade.'
    const quando = formatarQuandoRelativo(modo.atualizadoEm)
    const quem = modo.atualizadoPorNome ? ` · por ${modo.atualizadoPorNome}` : ''
    return `Modo da equipe${site ? ' (site)' : ''}: salvo ${quando}${quem}`
}

function formatarQuandoRelativo(iso) {
    const t = new Date(iso).getTime()
    if (!Number.isFinite(t)) return String(iso)
    const diff = Date.now() - t
    if (diff < 60_000) return 'agora'
    if (diff < 3600_000) {
        const m = Math.round(diff / 60_000)
        return `há ${m} min`
    }
    if (diff < 86400_000) {
        const h = Math.round(diff / 3600_000)
        return `há ${h} h`
    }
    try {
        return new Date(iso).toLocaleString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
        })
    } catch {
        return String(iso)
    }
}
