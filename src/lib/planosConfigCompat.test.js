import { describe, expect, it } from 'vitest'
import { criarBancoFalso } from './bancoFalsoMemoria.testutil.js'
import { gravarPlanoConfig } from './planosConfigCompat.js'

describe('gravarPlanoConfig', () => {
    it('cria a linha em maiúsculas quando não existe', async () => {
        const { supabase, tab } = criarBancoFalso()
        const r = await gravarPlanoConfig(supabase, { planoId: 4, procedimento: 'out2-005', limite: '5', carencia: '30 Dias' })
        expect(r).toMatchObject({ status: 'criado', error: null })
        expect(tab('planos_config').map(({ id, ...resto }) => resto)).toEqual([
            { plano_id: 4, procedimento: 'OUT2-005', limite: '5', carencia: '30 Dias' },
        ])
    })

    it('atualiza a linha existente, mesmo gravada em caixa diferente', async () => {
        const { supabase, tab } = criarBancoFalso()
        tab('planos_config').push({ id: 1, plano_id: 4, procedimento: 'out2-005', limite: '', carencia: '' })
        const r = await gravarPlanoConfig(supabase, { planoId: 4, procedimento: 'OUT2-005', limite: '8', carencia: '45 Dias' })
        expect(r).toMatchObject({ status: 'atualizado', error: null })
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

describe('gravarPlanoConfig com configId (menos idas ao banco)', () => {
    it('com configId atualiza direto: só um update, sem buscar antes', async () => {
        const { supabase, tab, db } = criarBancoFalso()
        tab('planos_config').push({ id: 7, plano_id: 4, procedimento: 'OUT2-005', limite: '1', carencia: 'x' })
        const r = await gravarPlanoConfig(supabase, { planoId: 4, procedimento: 'OUT2-005', carencia: '45 Dias', configId: 7 })
        expect(r).toEqual({ status: 'atualizado', error: null, configId: 7 })
        expect(db.chamadas).toEqual(['update:planos_config'])
        expect(tab('planos_config')[0]).toMatchObject({ limite: '1', carencia: '45 Dias' })
    })

    it('criar devolve o id da linha criada', async () => {
        const { supabase, tab } = criarBancoFalso()
        const r = await gravarPlanoConfig(supabase, { planoId: 4, procedimento: 'out2-005', limite: '5' })
        expect(r.status).toBe('criado')
        expect(r.configId).toBe(tab('planos_config')[0].id)
    })

    it('sem configId, atualizar devolve o id da linha encontrada', async () => {
        const { supabase, tab } = criarBancoFalso()
        tab('planos_config').push({ id: 9, plano_id: 4, procedimento: 'OUT2-005', limite: '', carencia: '' })
        const r = await gravarPlanoConfig(supabase, { planoId: 4, procedimento: 'OUT2-005', limite: '8' })
        expect(r).toEqual({ status: 'atualizado', error: null, configId: 9 })
    })

    it('erro no update com configId devolve status erro', async () => {
        const { supabase, tab, falhar } = criarBancoFalso()
        tab('planos_config').push({ id: 7, plano_id: 4, procedimento: 'OUT2-005', limite: '', carencia: '' })
        falhar('planos_config', 'update', () => true, 'sem permissão')
        const r = await gravarPlanoConfig(supabase, { planoId: 4, procedimento: 'OUT2-005', limite: '8', configId: 7 })
        expect(r.status).toBe('erro')
        expect(r.error.message).toBe('sem permissão')
    })
})
