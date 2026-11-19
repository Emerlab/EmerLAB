import { describe, expect, it, vi } from 'vitest'
import { criarClientePlanos } from './planosPublicosApi.js'

const resposta = (status, corpo) => ({ ok: status >= 200 && status < 300, status, json: async () => corpo })

describe('criarClientePlanos', () => {
    it('envia X-Api-Key e monta a query certa', async () => {
        const fetchImpl = vi.fn(async () => resposta(200, { ok: true }))
        const c = criarClientePlanos({ baseUrl: 'https://api.exemplo.com/', chave: 'emer_rede_X', fetchImpl })
        await c.tabela({ cidade: 1, plano: 'basico' })
        await c.prestadores({ cidade: 1, procedimento: 'CONS-001' })
        await c.filtros()
        expect(fetchImpl.mock.calls.map((x) => x[0])).toEqual([
            'https://api.exemplo.com/v1/planos/tabela?cidade=1&plano=basico',
            'https://api.exemplo.com/v1/planos/prestadores?cidade=1&procedimento=CONS-001',
            'https://api.exemplo.com/v1/planos/filtros',
        ])
        expect(fetchImpl.mock.calls[0][1].headers['X-Api-Key']).toBe('emer_rede_X')
    })

    it('reaproveita o cache na segunda chamada igual', async () => {
        const fetchImpl = vi.fn(async () => resposta(200, { a: 1 }))
        const c = criarClientePlanos({ chave: 'k', fetchImpl })
        await c.filtros()
        await c.filtros()
        expect(fetchImpl).toHaveBeenCalledTimes(1)
    })

    it('propaga codigo e status do erro e não guarda a falha em cache', async () => {
        const fetchImpl = vi
            .fn()
            .mockResolvedValueOnce(resposta(404, { erro: { codigo: 'plano_indisponivel_na_cidade', mensagem: 'Indisponível.' } }))
            .mockResolvedValueOnce(resposta(200, { grupos: [] }))
        const c = criarClientePlanos({ chave: 'k', fetchImpl })
        await expect(c.tabela({ cidade: 2, plano: 'basico' })).rejects.toMatchObject({
            codigo: 'plano_indisponivel_na_cidade',
            status: 404,
            message: 'Indisponível.',
        })
        await expect(c.tabela({ cidade: 2, plano: 'basico' })).resolves.toEqual({ grupos: [] })
        expect(fetchImpl).toHaveBeenCalledTimes(2)
    })

    it('erro de rede vira Error com codigo rede', async () => {
        const c = criarClientePlanos({
            chave: 'k',
            fetchImpl: async () => {
                throw new TypeError('x')
            },
        })
        await expect(c.filtros()).rejects.toMatchObject({ codigo: 'rede', status: 0 })
    })
})
