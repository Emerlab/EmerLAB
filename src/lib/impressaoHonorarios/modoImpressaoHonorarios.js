import { supabase } from '../supabase.js'

const TABELA = 'impressao_honorarios_modos'

function ehTabelaAusente(error) {
    const msg = String(error?.message || error?.details || '').toLowerCase()
    const code = String(error?.code || '')
    return (
        code === '42P01' ||
        code === 'PGRST205' ||
        msg.includes('does not exist') ||
        msg.includes('schema cache')
    )
}

function selecaoValida(selecao) {
    return (
        selecao &&
        typeof selecao === 'object' &&
        !Array.isArray(selecao) &&
        Array.isArray(selecao.ordemCategorias) &&
        selecao.categorias &&
        typeof selecao.categorias === 'object'
    )
}

/** Snapshot `{ v, ordemCategorias, categorias }` do estado atual do modal. */
export function montarSelecaoDeCategorias(categorias) {
    const ordemCategorias = []
    const mapa = {}
    for (const cat of categorias || []) {
        ordemCategorias.push(cat.id)
        const linhas = {}
        for (const l of cat.linhas || []) linhas[String(l.codigo)] = l.checked !== false
        mapa[String(cat.id)] = { ativa: cat.ativa !== false, linhas }
    }
    return { v: 1, ordemCategorias, categorias: mapa }
}

/** Aplica o modo salvo sobre as categorias atuais (sem mutar a entrada). */
export function aplicarSelecaoModo(categorias, selecao) {
    const lista = categorias || []
    if (!selecaoValida(selecao)) return lista

    const posicao = new Map(selecao.ordemCategorias.map((id, i) => [String(id), i]))
    const conhecidas = lista.filter((c) => posicao.has(String(c.id)))
    const novas = lista.filter((c) => !posicao.has(String(c.id)))
    conhecidas.sort((a, b) => posicao.get(String(a.id)) - posicao.get(String(b.id)))

    return [...conhecidas, ...novas].map((cat) => {
        const salva = selecao.categorias[String(cat.id)]
        if (!salva || typeof salva !== 'object') return { ...cat, ativa: true }
        const mapaLinhas = salva.linhas && typeof salva.linhas === 'object' ? salva.linhas : {}
        return {
            ...cat,
            ativa: salva.ativa === undefined ? true : Boolean(salva.ativa),
            linhas: (cat.linhas || []).map((l) => {
                const chave = String(l.codigo)
                return {
                    ...l,
                    checked: Object.prototype.hasOwnProperty.call(mapaLinhas, chave)
                        ? Boolean(mapaLinhas[chave])
                        : true,
                }
            }),
        }
    })
}

async function nomeDoAutor(id) {
    if (!id) return null
    const { data: perfil } = await supabase.from('profiles').select('name').eq('id', id).maybeSingle()
    return perfil?.name || null
}

export async function buscarModoImpressaoHonorarios(cidadeId) {
    if (!cidadeId) return null
    const { data, error } = await supabase
        .from(TABELA)
        .select('selecao, atualizado_em, atualizado_por')
        .eq('cidade_id', Number(cidadeId))
        .maybeSingle()
    if (error) {
        if (ehTabelaAusente(error)) return null
        throw error
    }
    if (!data) return null

    return {
        selecao: data.selecao && typeof data.selecao === 'object' ? data.selecao : {},
        atualizadoEm: data.atualizado_em || null,
        atualizadoPor: data.atualizado_por || null,
        atualizadoPorNome: await nomeDoAutor(data.atualizado_por),
    }
}

export async function salvarModoImpressaoHonorarios(cidadeId, categorias) {
    if (!cidadeId) throw new Error('Cidade é obrigatória para salvar o modo.')
    const selecao = montarSelecaoDeCategorias(categorias)
    const { data: sessaoData, error: sessaoErro } = await supabase.auth.getSession()
    if (sessaoErro) throw sessaoErro
    const user = sessaoData?.session?.user ?? null
    if (!user) throw new Error('Sessão ausente: não é possível salvar o modo.')
    const agora = new Date().toISOString()
    const row = {
        cidade_id: Number(cidadeId),
        selecao,
        atualizado_em: agora,
        atualizado_por: user.id,
    }
    const { data, error } = await supabase
        .from(TABELA)
        .upsert(row, { onConflict: 'cidade_id' })
        .select('selecao, atualizado_em, atualizado_por')
        .maybeSingle()
    if (error) throw error

    return {
        selecao: data?.selecao || selecao,
        atualizadoEm: data?.atualizado_em || agora,
        atualizadoPor: data?.atualizado_por || user.id,
        atualizadoPorNome: await nomeDoAutor(data?.atualizado_por || user.id),
    }
}

/** Texto curto para o indicador da UI. */
export function rotuloModoImpressaoHonorarios(modo) {
    if (!modo?.atualizadoEm) return 'Ainda sem modo salvo para esta cidade.'
    const quando = formatarQuandoRelativo(modo.atualizadoEm)
    const quem = modo.atualizadoPorNome ? ` · por ${modo.atualizadoPorNome}` : ''
    return `Último PDF: salvo ${quando}${quem}`
}

function formatarQuandoRelativo(iso) {
    const t = new Date(iso).getTime()
    if (!Number.isFinite(t)) return String(iso)
    const diff = Date.now() - t
    if (diff < 60_000) return 'agora'
    if (diff < 3600_000) return `há ${Math.round(diff / 60_000)} min`
    if (diff < 86400_000) return `há ${Math.round(diff / 3600_000)} h`
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
