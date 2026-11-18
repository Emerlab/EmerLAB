import { supabase } from '../supabase.js'

/** Última geração do zip de planos da cidade, ou null se nunca foi gerado. */
export async function buscarUltimaGeracaoZip(cidadeId) {
    if (!cidadeId) return null
    const { data, error } = await supabase
        .from('impressao_planos_geracoes')
        .select('gerado_em, gerado_por, plano_ids')
        .eq('cidade_id', Number(cidadeId))
        .order('gerado_em', { ascending: false })
        .limit(1)
        .maybeSingle()
    if (error) throw error
    if (!data) return null

    let geradoPorNome = null
    if (data.gerado_por) {
        const { data: perfil } = await supabase
            .from('profiles')
            .select('name')
            .eq('id', data.gerado_por)
            .maybeSingle()
        geradoPorNome = perfil?.name || null
    }

    return {
        geradoEm: data.gerado_em || null,
        geradoPor: data.gerado_por || null,
        geradoPorNome,
        planoIds: Array.isArray(data.plano_ids) ? data.plano_ids.map(Number) : [],
    }
}

/** Registra que o zip da cidade foi gerado agora pelo usuário logado. */
export async function registrarGeracaoZip(cidadeId, planoIds) {
    if (!cidadeId) throw new Error('Cidade é obrigatória para registrar a geração.')
    const {
        data: { session },
    } = await supabase.auth.getSession()
    const userId = session?.user?.id || null
    if (!userId) throw new Error('Sessão expirada. Entre novamente para registrar a geração.')
    const { error } = await supabase.from('impressao_planos_geracoes').insert({
        cidade_id: Number(cidadeId),
        plano_ids: (planoIds || []).map(Number),
        gerado_por: userId,
    })
    if (error) throw error
}
