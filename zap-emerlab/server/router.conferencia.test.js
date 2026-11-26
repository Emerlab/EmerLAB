import { describe, it, expect, vi, beforeEach } from 'vitest'

const gravacoes = []
const leituras = []
let mensagensWati = []
let linhasLista = []
let erroContatos = null

vi.mock('./db.js', () => {
    const cadeia = (tabela) => ({
        upsert: (obj) => {
            gravacoes.push({ tabela, obj })
            return Promise.resolve({ data: null, error: null })
        },
        update: () => ({ eq: () => Promise.resolve({ error: null }), in: () => Promise.resolve({ error: null }) }),
        select: () => ({
            order: () => ({ limit: () => Promise.resolve({ data: linhasLista, error: null }) }),
            eq: (_c, wa) => ({
                maybeSingle: () => {
                    leituras.push(wa)
                    return Promise.resolve({ data: { wa_id: wa, status: 'aberta' }, error: null })
                },
            }),
        }),
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
        listarMensagens: async () => ({ mensagens: mensagensWati, temMais: false }),
        listarContatos: async () => {
            if (erroContatos) throw erroContatos
            return { contatos: [] }
        },
        atualizarStatus: vi.fn(),
        detalheContato: vi.fn(async () => ({ teams: [] })),
    }
})

const { __teste } = await import('./router.js')
const { invalidar } = await import('./cache.js')

const msg = (id, text, created, extra = {}) => ({ id, eventType: 'message', text, created, owner: false, type: 'text', ...extra })
const conversa = (waId) => ({ waId, atendenteEmail: null, status: 'aberta' })

describe('conferência da lista com a WATI', () => {
    beforeEach(() => {
        gravacoes.length = 0
        leituras.length = 0
        invalidar('conversas:')
    })

    it('grava UMA vez por conversa, juntando tudo o que mudou', async () => {
        const agora = new Date().toISOString()
        mensagensWati = [
            msg('2', 'olá, preciso de ajuda', agora),
            { id: 't', eventType: 'ticket', text: 'The chat has been assigned to ana@emer.com by Bot', eventDescription: 'The chat has been assigned to ana@emer.com by Bot', created: agora },
        ]
        const c = conversa('5554999990001')
        await __teste.verificarNaWati([c], new Map(), new Map())
        const g = gravacoes.filter((x) => x.tabela === 'zap_conversas')
        expect(g).toHaveLength(1)
        expect(g[0].obj.wa_id).toBe('5554999990001')
        expect(g[0].obj.atualizado_em).toBeTruthy()
        expect(g[0].obj.ultima_msg).toBe('olá, preciso de ajuda')
        expect(g[0].obj.ultima_cliente_em).toBeTruthy()
        expect(g[0].obj.atendente_email).toBe('ana@emer.com')
        expect(c.atendenteEmail).toBe('ana@emer.com') // o card devolvido continua atualizado
        expect(c.ultimaMsg).toBe('olá, preciso de ajuda')
    })

    it('sem novidade ainda marca a conversa como conferida (1 escrita só com atualizado_em)', async () => {
        mensagensWati = []
        await __teste.verificarNaWati([conversa('5554999990002')], new Map(), new Map())
        const g = gravacoes.filter((x) => x.tabela === 'zap_conversas')
        expect(g).toHaveLength(1)
        expect(Object.keys(g[0].obj).sort()).toEqual(['atualizado_em', 'wa_id'])
    })

    it('várias conversas: confere só 1 por carga (cada uma é um getMessages; a WATI limita a conta)', async () => {
        const agora = new Date().toISOString()
        mensagensWati = [msg('9', 'oi', agora)]
        await __teste.verificarNaWati([conversa('5554999990003'), conversa('5554999990004'), conversa('5554999990005')], new Map(), new Map())
        expect(gravacoes.filter((x) => x.tabela === 'zap_conversas')).toHaveLength(1)
    })
})

describe('lista quando a WATI limita (429)', () => {
    const admin = { papel: 'admin', email: 'a@emer.com', departamentos: [] }
    beforeEach(() => {
        invalidar('conversas:')
        linhasLista = [{ wa_id: '5554999990020', nome: 'Cliente', ultima_msg: 'oi', ultima_msg_em: new Date().toISOString(), status: 'aberta' }]
    })

    it('sem busca: responde com o que o banco tem, sem erro', async () => {
        erroContatos = Object.assign(new Error('limite'), { status: 429 })
        const r = await __teste.listarConversas(admin, new URLSearchParams())
        erroContatos = null
        expect(r.conversas.map((c) => c.waId)).toEqual(['5554999990020'])
    })

    it('outro erro da WATI continua sendo erro', async () => {
        erroContatos = Object.assign(new Error('fora do ar'), { status: 500 })
        await expect(__teste.listarConversas(admin, new URLSearchParams())).rejects.toMatchObject({ status: 500 })
        erroContatos = null
    })
})

describe('metaConversa com cache de 2 s', () => {
    beforeEach(() => {
        leituras.length = 0
        invalidar('conversas:')
    })

    it('leituras seguidas da mesma conversa vão ao banco uma vez só', async () => {
        await Promise.all([__teste.metaConversa('5554999990010'), __teste.metaConversa('5554999990010')])
        await __teste.metaConversa('5554999990010')
        expect(leituras).toHaveLength(1)
        await __teste.metaConversa('5554999990011')
        expect(leituras).toHaveLength(2)
    })

    it('depois de gravar a conversa, a próxima leitura já vem do banco', async () => {
        await __teste.metaConversa('5554999990012')
        await __teste.salvarMeta('5554999990012', { status: 'resolvida' }, { avisar: false })
        await __teste.metaConversa('5554999990012')
        expect(leituras).toHaveLength(2)
    })
})
