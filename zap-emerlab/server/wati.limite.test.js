import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

let pausaNoBanco = null // { ate } que "outra instância" gravou
const inseridos = []
const gravadosPausa = []

vi.mock('./env.js', () => ({
    getEnv: () => ({ watiBase: 'https://wati.teste', watiTenantId: '123', watiToken: 't', watiChannel: '' }),
}))
vi.mock('./db.js', () => ({
    db: () => ({
        from: (tabela) => ({
            select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: tabela === 'zap_wati_pausa' ? pausaNoBanco : null }) }) }),
            upsert: (obj) => {
                gravadosPausa.push(obj)
                return Promise.resolve({})
            },
            insert: (rows) => {
                inseridos.push(...rows)
                return Promise.resolve({})
            },
            delete: () => ({ lt: () => Promise.resolve({}) }),
        }),
    }),
}))

const resposta = (status, corpo = {}, cab = {}) => ({
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (k) => cab[k.toLowerCase()] ?? null },
    text: async () => JSON.stringify(corpo),
})

let wati
beforeEach(async () => {
    vi.resetModules()
    pausaNoBanco = null
    inseridos.length = 0
    gravadosPausa.length = 0
    wati = await import('./wati.js')
})
afterEach(() => vi.unstubAllGlobals())

describe('429 da WATI', () => {
    it('um 429 de leitura pausa as leituras e grava a pausa para as outras instâncias', async () => {
        const f = vi.fn(async () => resposta(429, {}, { 'retry-after': '20' }))
        vi.stubGlobal('fetch', f)
        await expect(wati.listarMensagens('5554996032507')).rejects.toMatchObject({ status: 429 })
        expect(wati.watiEmPausa()).toBe(true)
        expect(gravadosPausa).toHaveLength(1)
        // a próxima leitura nem chega à WATI
        await expect(wati.listarMensagens('5554996032507', { pagina: 2 })).rejects.toMatchObject({ status: 429 })
        expect(f).toHaveBeenCalledTimes(1)
    })

    it('com a leitura em pausa, o envio de mensagem continua saindo', async () => {
        const f = vi.fn(async (url, opts) => (opts.method === 'POST' ? resposta(200, { result: true, message: { id: 'm1' } }) : resposta(429)))
        vi.stubGlobal('fetch', f)
        await expect(wati.listarMensagens('5554996032507')).rejects.toMatchObject({ status: 429 })
        const m = await wati.enviarTexto('5554996032507', 'oi')
        expect(m).toMatchObject({ id: 'm1' })
    })

    it('respeita a pausa que outra instância gravou no banco', async () => {
        pausaNoBanco = { ate: new Date(Date.now() + 20000).toISOString() }
        const f = vi.fn(async () => resposta(200, { messages: { items: [] } }))
        vi.stubGlobal('fetch', f)
        await expect(wati.listarMensagens('5554996032507')).rejects.toMatchObject({ status: 429 })
        expect(f).not.toHaveBeenCalled()
    })

    it('pausa vencida no banco não bloqueia', async () => {
        pausaNoBanco = { ate: new Date(Date.now() - 1000).toISOString() }
        vi.stubGlobal('fetch', vi.fn(async () => resposta(200, { messages: { items: [] } })))
        await expect(wati.listarMensagens('5554996032507')).resolves.toMatchObject({ mensagens: [] })
    })
})

describe('medição das chamadas', () => {
    it('agrupa a rota sem telefone nem uuid', () => {
        const u = new URL('https://wati.teste/123/api/v1/getMessages/5554996032507?pageSize=20')
        expect(wati.rotaDaChamada(u, 'GET')).toBe('GET getMessages/:id')
        const v3 = new URL('https://wati.teste/api/ext/v3/conversations/0f8fad5b-d9cb-469f-a165-70867728950e/status')
        expect(wati.rotaDaChamada(v3, 'PUT')).toBe('PUT conversations/:id/status')
    })

    it('ao virar o minuto, despeja a contagem anterior no log e no banco', async () => {
        vi.useFakeTimers()
        try {
            vi.setSystemTime(new Date('2026-11-26T12:00:10Z'))
            vi.stubGlobal('fetch', vi.fn(async () => resposta(200, { messages: { items: [] } })))
            const log = vi.spyOn(console, 'info').mockImplementation(() => {})
            await wati.listarMensagens('5554996032507')
            await wati.listarMensagens('5554996032507', { pagina: 2 })
            vi.setSystemTime(new Date('2026-11-26T12:01:05Z'))
            await wati.listarMensagens('5551991988866')
            await vi.advanceTimersByTimeAsync(0)
            expect(log).toHaveBeenCalledWith('[wati-uso]', expect.any(String), expect.stringContaining('"chamadas":2'))
            expect(inseridos).toEqual([expect.objectContaining({ rota: 'GET getMessages/:id', chamadas: 2, limites: 0 })])
            log.mockRestore()
        } finally {
            vi.useRealTimers()
        }
    })
})
