import { describe, expect, it } from 'vitest'
import { criarBancoFalso } from './bancoFalsoMemoria.testutil.js'
import { gravarPlanoConfig } from './planosConfigCompat.js'

describe('gravarPlanoConfig', () => {
    it('cria a linha em maiúsculas quando não existe', async () => {
        const { supabase, tab } = criarBancoFalso()
        const r = await gravarPlanoConfig(supabase, { planoId: 4, procedimento: 'out2-005', limite: '5', carencia: '30 Dias' })
        expect(r).toEqual({ status: 'criado', error: null })
        expect(tab('planos_config').map(({ id, ...resto }) => resto)).toEqual([
            { plano_id: 4, procedimento: 'OUT2-005', limite: '5', carencia: '30 Dias' },
        ])
    })

    it('atualiza a linha existente, mesmo gravada em caixa diferente', async () => {
        const { supabase, tab } = criarBancoFalso()
        tab('planos_config').push({ id: 1, plano_id: 4, procedimento: 'out2-005', limite: '', carencia: '' })
        const r = await gravarPlanoConfig(supabase, { planoId: 4, procedimento: 'OUT2-005', limite: '8', carencia: '45 Dias' })
        expect(r).toEqual({ status: 'atualizado', error: null })
        expect(tab('planos_config')).toEqual([
            { id: 1, plano_id: 4, procedimento: 'out2-005', limite: '8', carencia: '45 Dias' },
        ])
    })

    it('não mexe em outro plano', async () => {
        const { supabase, tab } = criarBancoFalso()
        tab('planos_config').push({ id: 1, plano_id: 3, procedimento: 'OUT2-005', limite: '1', carencia: 'x' })
        await gravarPlanoConfig(supabase, { planoId: 4, procedimento: 'OUT2-005', limite: '8', carencia: 'y' })
        expect(tab('planos_config').find((r) => r.plano_id === 3)).toEqual({
            id: 1, plano_id: 3, procedimento: 'OUT2-005', limite: '1', carencia: 'x',
        })
        expect(tab('planos_config')).toHaveLength(2)
    })

    it('devolve erro quando o código é vazio, sem chamar o banco', async () => {
        const { supabase, db } = criarBancoFalso()
        const r = await gravarPlanoConfig(supabase, { planoId: 4, procedimento: '  ', limite: '', carencia: '' })
        expect(r.status).toBe('erro')
        expect(r.error).toBeInstanceOf(Error)
        expect(db.chamadas).toEqual([])
    })

    it('atualização parcial: só o campo informado muda, o outro permanece (Important 1)', async () => {
        const { supabase, tab } = criarBancoFalso()
        tab('planos_config').push({ id: 1, plano_id: 4, procedimento: 'OUT2-005', limite: '10 - Grupo X', carencia: '' })
        const r = await gravarPlanoConfig(supabase, { planoId: 4, procedimento: 'OUT2-005', carencia: '45 Dias' })
        expect(r.status).toBe('atualizado')
        expect(tab('planos_config')[0]).toEqual({ id: 1, plano_id: 4, procedimento: 'OUT2-005', limite: '10 - Grupo X', carencia: '45 Dias' })
    })

    it('criação com só um campo grava o outro em branco', async () => {
        const { supabase, tab } = criarBancoFalso()
        await gravarPlanoConfig(supabase, { planoId: 4, procedimento: 'OUT2-005', carencia: '45 Dias' })
        expect(tab('planos_config')[0]).toMatchObject({ limite: '', carencia: '45 Dias' })
    })
})
