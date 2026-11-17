import { supabase } from './supabase.js'

/**
 * Modelo de negociação (única porta de leitura dos valores negociados).
 *
 *   prestadores.id ──< negociacoes_vet.prestador_id     (dono do valor — USE ESTE)
 *   veterinarios.id ─< negociacoes_vet.veterinario_id   (ID da NEGOCIAÇÃO — legado)
 *
 * `prestadores.id` e `veterinarios.id` são sequências independentes: o 57 de um
 * NÃO é o 57 do outro. Para achar valores de um prestador, filtre sempre por
 * `negociacoes_vet.prestador_id`; nunca junte `veterinario_id` com `prestadores.id`.
 */

/** Id positivo e inteiro, ou null. */
function idPrestadorValido(prestadorId) {
    const n = Number(prestadorId)
    return Number.isInteger(n) && n > 0 ? n : null
}

/**
 * Consulta de `negociacoes_vet` restrita ao prestador.
 * Devolve o builder do Supabase (encadeie `.in`, `.eq` etc.) ou `null` se o id for inválido.
 */
export function negociacoesVetDoPrestador(prestadorId, colunas = '*', opcoes = {}, client = supabase) {
    const pid = idPrestadorValido(prestadorId)
    if (pid == null) return null
    return client.from('negociacoes_vet').select(colunas, opcoes).eq('prestador_id', pid)
}
