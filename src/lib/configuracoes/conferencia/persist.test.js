import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../supabase.js', () => ({
    supabase: {
        rpc: vi.fn(),
        from: vi.fn(),
        auth: {
            getSession: vi.fn(async () => ({ data: { session: { user: { id: 'user-1' } } } })),
        },
    },
}))

import { supabase } from '../../supabase.js'
import {
    carregarRegrasLaboratorio,
    erroTabelaAusente,
    resolverVinculosSalvos,
    salvarPerfilExame,
} from './persist.js'

function consulta(resultado) {
    const q = {
        select: () => q,
        eq: () => q,
        order: () => q,
        then: (res, rej) => Promise.resolve(resultado).then(res, rej),
    }
    return q
}

describe('erroTabelaAusente', () => {
    it('só reconhece tabela/função inexistente — erros de permissão aparecem', () => {
        expect(erroTabelaAusente({ code: '42P01', message: 'relation does not exist' })).toBe(true)
        expect(erroTabelaAusente({ code: 'PGRST205', message: 'Could not find the table' })).toBe(true)
        expect(erroTabelaAusente({ code: '42501', message: 'permission denied' })).toBe(false)
        expect(erroTabelaAusente({ code: 'PGRST301', message: 'JWT expired' })).toBe(false)
    })
})

describe('carregarRegrasLaboratorio', () => {
    beforeEach(() => vi.clearAllMocks())

    it('sinaliza migração pendente quando as tabelas não existem', async () => {
        supabase.from.mockImplementation(() =>
            consulta({ data: null, error: { code: '42P01', message: 'relation does not exist' } }),
        )
        const out = await carregarRegrasLaboratorio(12)
        expect(out.ok).toBe(false)
        expect(out.migracaoPendente).toBe(true)
        expect(out.equivalencias).toEqual([])
    })

    it('não esconde erro de permissão como se fosse tabela ausente', async () => {
        supabase.from.mockImplementation(() =>
            consulta({ data: null, error: { code: '42501', message: 'permission denied' } }),
        )
        const out = await carregarRegrasLaboratorio(12)
        expect(out.ok).toBe(false)
        expect(out.migracaoPendente).toBe(false)
        expect(out.motivo).toMatch(/permission denied/)
    })

    it('mapeia as regras do banco', async () => {
        supabase.from.mockImplementation((tabela) => {
            const dados = {
                lab_exame_equivalencia: [{ id: 'e1', nome_a: 'A', nome_b: 'B' }],
                lab_pessoa_alias: [{ id: 'a1', tipo: 'tutor', nome_plano: 'João', nome_lab: 'Maria' }],
                lab_exame_perfil: [
                    { id: 'p1', nome: 'Perfil', valor: 10, ativo: true, lab_exame_perfil_item: [{ nome_exame: 'T4' }] },
                ],
                lab_vinculo_base: [{ exame_normalizado: 'hemograma', exame_plano: 'Hemograma', codigo_base: '55' }],
            }
            return consulta({ data: dados[tabela], error: null })
        })
        const out = await carregarRegrasLaboratorio(12)
        expect(out.ok).toBe(true)
        expect(out.equivalencias).toEqual([{ id: 'e1', a: 'A', b: 'B' }])
        expect(out.aliasesPessoa[0]).toMatchObject({ nomePlano: 'João', nomeLab: 'Maria' })
        expect(out.perfis[0].exames).toEqual(['T4'])
        expect(out.vinculos[0]).toMatchObject({ chave: 'hemograma', codigo: '55' })
    })
})

describe('resolverVinculosSalvos', () => {
    it('casa pelo código da base desta conferência e respeita o que já foi vinculado', () => {
        const base = [
            { id: 'base-r2', codigo: '55' },
            { id: 'base-r3', codigo: '77' },
        ]
        const salvos = [
            { chave: 'hemograma', codigo: '55' },
            { chave: 'ureia', codigo: '77' },
            { chave: 'tsh', codigo: '99' },
        ]
        expect(resolverVinculosSalvos(salvos, base, { ureia: 'base-r9' })).toEqual({ hemograma: 'base-r2' })
    })
})

describe('salvarPerfilExame', () => {
    beforeEach(() => vi.clearAllMocks())

    it('devolve o motivo quando a RPC falha e não grava itens soltos', async () => {
        supabase.rpc.mockResolvedValue({
            data: null,
            error: { message: 'duplicate key value violates unique constraint' },
        })
        const out = await salvarPerfilExame({ laboratorioId: 12, nome: 'Perfil cardio', exames: ['Hemograma', 'T4'] })
        expect(out.ok).toBe(false)
        expect(out.motivo).toMatch(/duplicate key/i)
        expect(supabase.rpc).toHaveBeenCalledTimes(1)
        expect(supabase.rpc.mock.calls[0][0]).toBe('salvar_lab_exame_perfil')
        expect(supabase.from).not.toHaveBeenCalled()
    })

    it('devolve o id retornado pela RPC', async () => {
        supabase.rpc.mockResolvedValue({ data: 'uuid-77', error: null })
        const out = await salvarPerfilExame({ laboratorioId: 12, nome: 'Perfil cardio', exames: ['Hemograma'] })
        expect(out).toEqual({ ok: true, id: 'uuid-77' })
    })
})
