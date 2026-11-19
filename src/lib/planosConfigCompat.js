/**
 * Inserção em planos_config sem upsert/ON CONFLICT.
 */

const variantesProcedimento = (cod) => {
    const t = String(cod ?? '').trim()
    if (!t) return []
    return [...new Set([t, t.toUpperCase(), t.toLowerCase()])]
}

const jaExistePlanoConfig = async (supabase, planoNum, variantes) => {
    const { data, error } = await supabase
        .from('planos_config')
        .select('id, procedimento')
        .eq('plano_id', planoNum)
        .in('procedimento', variantes)
        .limit(1)

    if (error) return { exists: false, error }
    return { exists: (data || []).length > 0, error: null }
}

export const inserirPlanoConfigSeNaoExiste = async (
    supabase,
    { planoId, procedimento, limite = '', carencia = '' }
) => {
    const planoNum = Number(planoId)
    const variantes = variantesProcedimento(procedimento)
    const procGravar = String(procedimento).trim().toUpperCase()

    if (!variantes.length) {
        return { status: 'erro', error: new Error('Código do procedimento inválido.') }
    }

    const check = await jaExistePlanoConfig(supabase, planoNum, variantes)
    if (check.error) return { status: 'erro', error: check.error }
    if (check.exists) return { status: 'ja_existia', error: null }

    const { error: errInsert } = await supabase.from('planos_config').insert({
        plano_id: planoNum,
        procedimento: procGravar,
        limite,
        carencia,
    })

    if (errInsert) {
        if (isDuplicateConfigError(errInsert)) return { status: 'ja_existia', error: null }
        return { status: 'erro', error: errInsert }
    }

    return { status: 'ok', error: null }
}

const isDuplicateConfigError = (error) => {
    const msg = String(error?.message || '').toLowerCase()
    return msg.includes('23505') || msg.includes('duplicate') || msg.includes('unique')
}

const buscarIdPlanoConfig = async (supabase, planoNum, variantes) => {
    const { data, error } = await supabase
        .from('planos_config')
        .select('id')
        .eq('plano_id', planoNum)
        .in('procedimento', variantes)
        .limit(1)

    if (error) return { id: null, error }
    return { id: data?.[0]?.id ?? null, error: null }
}

/**
 * Cria ou atualiza limite/carência de um procedimento num plano (sem upsert/ON CONFLICT).
 * Campo omitido (undefined) não é alterado numa atualização e entra em branco numa criação.
 */
export const gravarPlanoConfig = async (supabase, { planoId, procedimento, limite, carencia }) => {
    const planoNum = Number(planoId)
    const variantes = variantesProcedimento(procedimento)
    if (!variantes.length) {
        return { status: 'erro', error: new Error('Código do procedimento inválido.') }
    }
    const procGravar = String(procedimento).trim().toUpperCase()

    const atualizar = async (id) => {
        const campos = {}
        if (limite !== undefined) campos.limite = limite
        if (carencia !== undefined) campos.carencia = carencia
        if (Object.keys(campos).length === 0) return { status: 'atualizado', error: null }
        const { error } = await supabase.from('planos_config').update(campos).eq('id', id)
        return error ? { status: 'erro', error } : { status: 'atualizado', error: null }
    }

    const busca = await buscarIdPlanoConfig(supabase, planoNum, variantes)
    if (busca.error) return { status: 'erro', error: busca.error }
    if (busca.id != null) return atualizar(busca.id)

    const { error: errInsert } = await supabase.from('planos_config').insert({
        plano_id: planoNum,
        procedimento: procGravar,
        limite: limite ?? '',
        carencia: carencia ?? '',
    })
    if (!errInsert) return { status: 'criado', error: null }

    if (isDuplicateConfigError(errInsert)) {
        const nova = await buscarIdPlanoConfig(supabase, planoNum, variantes)
        if (nova.id != null) return atualizar(nova.id)
    }
    return { status: 'erro', error: errInsert }
}
