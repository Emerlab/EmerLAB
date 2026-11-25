import { describe, it, expect, vi, beforeEach } from 'vitest'

const gravacoes = []
let mensagensWati = []
let chamadasListar = 0
let listarImpl = null

vi.mock('./db.js', () => {
    const cadeia = (tabela) => ({
        upsert: (obj) => {
            gravacoes.push({ tabela, obj })
            return Promise.resolve({ data: null, error: null })
        },
    })
    return {
        db: () => ({ from: cadeia }),
        ok: ({ data, error }) => {
            if (error) throw new Error(error.message)
            return data
        },
        DbError: class extends Error {},
        buscarUsuarioPorEmail: vi.fn(),
        buscarUsuarioPorId: vi.fn(),
        idsDepartamentos: vi.fn(() => []),
        invalidarUsuarios: vi.fn(),
        listarDepartamentos: vi.fn(async () => []),
        invalidarDepartamentos: vi.fn(),
    }
})

vi.mock('./wati.js', () => {
    class WatiError extends Error {}
    return {
        WatiError,
        watiEmPausa: () => false,
        invalidarCache: vi.fn(),
        listarMensagens: async () => {
            chamadasListar += 1
            if (listarImpl) return listarImpl(chamadasListar)
            return { mensagens: mensagensWati, temMais: false }
        },
        detalheContato: vi.fn(async () => ({ teams: [] })),
    }
})

const { __teste } = await import('./router.js')
const { sincronizarAtribuicaoDoWebhook, precisaSincronizarAtribuicao, ultimaSyncAtribuicao } = __teste

const atribuicao = (email) => ({
    id: 'ev1',
    eventType: 'ticket',
    created: '2026-11-25T13:08:00Z',
    eventDescription: `The chat has been assigned to ${email} by Bot.`,
})
const doBot = { operatorName: 'Bot', operatorEmail: '' }
const humano = { operatorName: 'Mayara', operatorEmail: 'mayara@emerdog.com.br' }

describe('atribuição feita pelo bot da WATI', () => {
    beforeEach(() => {
        gravacoes.length = 0
        chamadasListar = 0
        mensagensWati = []
        ultimaSyncAtribuicao.clear()
        listarImpl = null
    })

    it('decide quando conferir', () => {
        expect(precisaSincronizarAtribuicao({ atendente_email: null }, false, {})).toBe(true)
        expect(precisaSincronizarAtribuicao(null, false, {})).toBe(true)
        expect(precisaSincronizarAtribuicao({ atendente_email: 'a@x.com' }, false, {})).toBe(false)
        expect(precisaSincronizarAtribuicao({ atendente_email: 'a@x.com' }, true, doBot)).toBe(true)
        expect(precisaSincronizarAtribuicao({ atendente_email: 'a@x.com' }, true, humano)).toBe(false)
        expect(precisaSincronizarAtribuicao({ atendente_email: null, status: 'resolvida' }, true, doBot)).toBe(false)
    })

    it('grava o atendente que a WATI já atribuiu', async () => {
        mensagensWati = [atribuicao('mayara@emerdog.com.br')]
        const achou = await sincronizarAtribuicaoDoWebhook('5554996032507', { atendente_email: null, status: 'aberta' }, true, doBot)
        expect(achou).toBe(true)
        expect(gravacoes).toHaveLength(1)
        expect(gravacoes[0].obj).toMatchObject({ wa_id: '5554996032507', atendente_email: 'mayara@emerdog.com.br' })
        expect(chamadasListar).toBe(1)
    })

    it('confere de novo se a atribuição ainda não tinha sido gravada', async () => {
        listarImpl = async (n) => ({ mensagens: n === 1 ? [] : [atribuicao('mayara@emerdog.com.br')], temMais: false })
        const achou = await sincronizarAtribuicaoDoWebhook('5554996032507', { atendente_email: null, status: 'aberta' }, true, doBot)
        expect(chamadasListar).toBe(2)
        expect(achou).toBe(true)
        expect(gravacoes[0].obj.atendente_email).toBe('mayara@emerdog.com.br')
    })

    it('não grava nada quando o atendente já é o mesmo', async () => {
        mensagensWati = [atribuicao('mayara@emerdog.com.br')]
        const achou = await sincronizarAtribuicaoDoWebhook('5554996032507', { atendente_email: 'Mayara@emerdog.com.br' }, true, doBot)
        expect(achou).toBe(false)
        expect(gravacoes).toHaveLength(0)
    })

    it('limita a uma conferência por conversa a cada 15 s', async () => {
        mensagensWati = [atribuicao('mayara@emerdog.com.br')]
        const meta = { atendente_email: null, status: 'aberta' }
        const t = Date.now()
        await sincronizarAtribuicaoDoWebhook('5554996032507', meta, true, doBot, t)
        const chamadas = chamadasListar
        const achou = await sincronizarAtribuicaoDoWebhook('5554996032507', meta, true, doBot, t + 5000)
        expect(achou).toBe(false)
        expect(chamadasListar).toBe(chamadas)
        await sincronizarAtribuicaoDoWebhook('5554996032507', meta, true, doBot, t + 16000)
        expect(chamadasListar).toBeGreaterThan(chamadas)
    })

    it('erro da WATI não derruba o webhook', async () => {
        listarImpl = async () => {
            throw new Error('boom')
        }
        const achou = await sincronizarAtribuicaoDoWebhook('5554996032507', { atendente_email: null }, false, {})
        expect(achou).toBe(false)
    })
})
