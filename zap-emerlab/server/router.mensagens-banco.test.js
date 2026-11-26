import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import process from 'node:process'

// Fase 2: o chat sai do banco quando a conversa foi conferida com a WATI há pouco.
const estado = { meta: null, linhas: [], ops: [], erroLeitura: false }
let chamadasWati = 0
let respostaWati = { mensagens: [], temMais: false }

vi.mock('./db.js', () => {
    const consulta = (tabela) => {
        const op = { tabela, tipo: null, args: [], filtros: [] }
        const q = new Proxy(
            {},
            {
                get(_, nome) {
                    if (nome === 'then') {
                        return (res, rej) => {
                            const lendo = op.tipo === 'select' && tabela === 'zap_mensagens'
                            const r = lendo ? (estado.erroLeitura ? { data: null, error: { message: 'falhou' } } : { data: estado.linhas, error: null }) : { data: [], error: null }
                            return Promise.resolve(r).then(res, rej)
                        }
                    }
                    if (nome === 'maybeSingle') return () => Promise.resolve({ data: tabela === 'zap_conversas' ? estado.meta : null, error: null })
                    return (...args) => {
                        if (!op.tipo && ['select', 'update', 'upsert', 'insert', 'delete'].includes(nome)) {
                            op.tipo = nome
                            op.args = args
                            estado.ops.push(op)
                        } else {
                            op.filtros.push([nome, ...args])
                        }
                        return q
                    }
                },
            },
        )
        return q
    }
    return {
        db: () => ({ from: consulta, rpc: () => consulta('rpc') }),
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
            chamadasWati += 1
            return respostaWati
        },
    }
})

const { __teste } = await import('./router.js')
const { invalidar } = await import('./cache.js')

const admin = { papel: 'admin', email: 'a@emer.com', departamentos: [] }
const WA = '5554999990030'
const agora = () => new Date().toISOString()
const minutosAtras = (n) => new Date(Date.now() - n * 60000).toISOString()
const linha = (id, origem, em, raw, status = null) => ({ id: `${origem}:${id}`, em, origem, status, raw: { id, ...raw } })
const texto = (t, extra = {}) => ({ eventType: 'message', type: 'text', text: t, owner: false, ...extra })
const marcadores = () => estado.ops.filter((o) => o.tabela === 'zap_conversas' && o.tipo === 'update' && 'mensagens_ok_em' in o.args[0])
const lerChat = (query = '') => __teste.mensagens(admin, WA, new URLSearchParams(query))

beforeEach(() => {
    estado.meta = { wa_id: WA, status: 'aberta', mensagens_ok_em: agora(), mensagens_tem_mais: false }
    estado.linhas = []
    estado.ops = []
    estado.erroLeitura = false
    chamadasWati = 0
    respostaWati = { mensagens: [], temMais: false }
    delete process.env.ZAP_MENSAGENS_BANCO
    invalidar('conversas:')
})
afterEach(() => {
    delete process.env.ZAP_MENSAGENS_BANCO
})

describe('chat servido do banco', () => {
    it('conversa em dia: não chama a WATI, junta webhook e WATI sem repetir e ordena', async () => {
        estado.linhas = [
            linha('m3', 'webhook', minutosAtras(1), texto('terceira'), 'sent'),
            linha('m2', 'webhook', minutosAtras(2), texto('segunda (webhook)')),
            linha('m2', 'wati', minutosAtras(2), texto('segunda (wati)', { created: minutosAtras(2) }), 'delivered'),
            linha('m1', 'wati', minutosAtras(3), texto('primeira', { created: minutosAtras(3) })),
        ]
        const r = await lerChat()
        expect(chamadasWati).toBe(0)
        expect(r.mensagens.map((m) => m.texto)).toEqual(['primeira', 'segunda (wati)', 'terceira'])
        expect(r.temMais).toBe(false)
        expect(marcadores()).toHaveLength(0) // lido do banco não renova a marca
    })

    it('o status mais avançado entre as cópias vale (entregue/lida chegam pelo webhook)', async () => {
        estado.linhas = [
            linha('m1', 'webhook', minutosAtras(2), texto('oi', { owner: true }), 'read'),
            linha('m1', 'wati', minutosAtras(2), texto('oi', { owner: true, created: minutosAtras(2), statusString: 'SENT' }), 'sent'),
        ]
        const r = await lerChat()
        expect(r.mensagens).toHaveLength(1)
        expect(r.mensagens[0].status).toBe('read')
    })

    it('marca vencida: lê da WATI, grava no banco e renova a marca', async () => {
        estado.meta.mensagens_ok_em = minutosAtras(10)
        respostaWati = { mensagens: [{ id: 'w1', created: minutosAtras(1), ...texto('da wati') }], temMais: true }
        const r = await lerChat()
        expect(chamadasWati).toBe(1)
        expect(r.mensagens.map((m) => m.texto)).toEqual(['da wati'])
        expect(r.temMais).toBe(true)
        expect(estado.ops.some((o) => o.tabela === 'zap_mensagens' && o.tipo === 'upsert')).toBe(true)
        const [m] = marcadores()
        expect(m.args[0]).toMatchObject({ mensagens_tem_mais: true })
        expect(typeof m.args[0].mensagens_ok_em).toBe('string')
    })

    it('sem marca (migração não aplicada ou conversa nova): lê da WATI', async () => {
        estado.meta.mensagens_ok_em = null
        estado.linhas = [linha('m1', 'wati', minutosAtras(1), texto('no banco'))]
        respostaWati = { mensagens: [{ id: 'w1', created: minutosAtras(1), ...texto('da wati') }], temMais: false }
        const r = await lerChat()
        expect(chamadasWati).toBe(1)
        expect(r.mensagens.map((m) => m.texto)).toEqual(['da wati'])
    })

    it('mídia que só o webhook trouxe: confere na WATI', async () => {
        estado.linhas = [linha('m1', 'webhook', minutosAtras(1), texto('', { type: 'image', data: 'x.jpg' }))]
        respostaWati = { mensagens: [{ id: 'm1', created: minutosAtras(1), ...texto('', { type: 'image', data: 'data/x.jpg' }) }], temMais: false }
        const r = await lerChat()
        expect(chamadasWati).toBe(1)
        expect(r.mensagens[0].arquivo).toBe('data/x.jpg')
    })

    it('mídia que já veio da WATI sai do banco', async () => {
        estado.linhas = [linha('m1', 'wati', minutosAtras(1), texto('', { type: 'image', data: 'data/x.jpg', created: minutosAtras(1) }))]
        const r = await lerChat()
        expect(chamadasWati).toBe(0)
        expect(r.mensagens[0].arquivo).toBe('data/x.jpg')
    })

    it('banco vazio ou com erro: cai para a WATI', async () => {
        respostaWati = { mensagens: [{ id: 'w1', created: minutosAtras(1), ...texto('da wati') }], temMais: false }
        await lerChat()
        expect(chamadasWati).toBe(1)
        estado.erroLeitura = true
        estado.linhas = [linha('m1', 'wati', minutosAtras(1), texto('x'))]
        invalidar('conversas:')
        await lerChat()
        expect(chamadasWati).toBe(2)
    })

    it('ZAP_MENSAGENS_BANCO=0 desliga: lê da WATI e não mexe na marca', async () => {
        process.env.ZAP_MENSAGENS_BANCO = '0'
        estado.linhas = [linha('m1', 'wati', minutosAtras(1), texto('no banco'))]
        respostaWati = { mensagens: [{ id: 'w1', created: minutosAtras(1), ...texto('da wati') }], temMais: false }
        const r = await lerChat()
        expect(chamadasWati).toBe(1)
        expect(r.mensagens.map((m) => m.texto)).toEqual(['da wati'])
        expect(marcadores()).toHaveLength(0)
    })

    it('páginas antigas sempre vêm da WATI e não mexem na marca', async () => {
        estado.linhas = [linha('m1', 'wati', minutosAtras(1), texto('no banco'))]
        respostaWati = { mensagens: [{ id: 'antiga', created: minutosAtras(500), ...texto('antiga') }], temMais: false }
        const r = await lerChat('pagina=2')
        expect(chamadasWati).toBe(1)
        expect(r.mensagens.map((m) => m.texto)).toEqual(['antiga'])
        expect(marcadores()).toHaveLength(0)
    })

    it('mais de 50 mensagens no banco: devolve as 50 mais recentes e avisa que tem mais', async () => {
        estado.linhas = Array.from({ length: 60 }, (_, i) => linha(`m${i}`, 'wati', minutosAtras(i + 1), texto(`msg ${i}`, { created: minutosAtras(i + 1) })))
        const r = await lerChat()
        expect(r.mensagens).toHaveLength(50)
        expect(r.mensagens.at(-1).texto).toBe('msg 0')
        expect(r.temMais).toBe(true)
    })

    it('a WATI tinha histórico antigo (mensagens_tem_mais): continua oferecendo as anteriores', async () => {
        estado.meta.mensagens_tem_mais = true
        estado.linhas = [linha('m1', 'wati', minutosAtras(1), texto('única', { created: minutosAtras(1) }))]
        const r = await lerChat()
        expect(r.temMais).toBe(true)
    })
})

describe('manter o banco em dia', () => {
    it('webhook de entregue/lida sobe o status e nunca desce', async () => {
        estado.linhas = [
            { id: 'webhook:m1', status: 'sent' },
            { id: 'wati:m1', status: 'delivered' },
        ]
        expect(await __teste.aplicarTickNoBanco(WA, { id: 'm1' }, 'sentMessageREAD_v2')).toBe(true)
        const sobe = estado.ops.find((o) => o.tipo === 'update' && o.tabela === 'zap_mensagens')
        expect(sobe.args[0]).toEqual({ status: 'read' })
        expect(sobe.filtros.find((f) => f[0] === 'in')[2]).toEqual(['webhook:m1', 'wati:m1'])

        estado.ops = []
        estado.linhas = [{ id: 'webhook:m1', status: 'read' }]
        expect(await __teste.aplicarTickNoBanco(WA, { id: 'm1' }, 'sentMessageDELIVERED_v2')).toBe(true)
        expect(estado.ops.some((o) => o.tipo === 'update')).toBe(false)
    })

    it('tick de mensagem que não está no banco: devolve false', async () => {
        estado.linhas = []
        expect(await __teste.aplicarTickNoBanco(WA, { id: 'zzz' }, 'sentMessageREAD')).toBe(false)
        expect(await __teste.aplicarTickNoBanco(WA, {}, 'sentMessageREAD')).toBe(false) // sem id nenhum
    })

    it('webhook de tick sem a mensagem no banco derruba a marca (a próxima leitura confere na WATI)', async () => {
        estado.linhas = []
        await __teste.processarWebhook({ eventType: 'sentMessageREAD_v2', waId: WA, id: 'zzz' })
        expect(marcadores().some((m) => m.args[0].mensagens_ok_em === null)).toBe(true)
    })

    it('webhook de tick com a mensagem no banco mantém a marca', async () => {
        estado.linhas = [{ id: 'webhook:m9', status: 'sent' }]
        await __teste.processarWebhook({ eventType: 'sentMessageREAD_v2', waId: WA, id: 'm9' })
        expect(marcadores()).toHaveLength(0)
    })

    it('marcarMensagensConferidas com quando=null só derruba a marca; desligado não faz nada', async () => {
        await __teste.marcarMensagensConferidas(WA, null, null)
        expect(marcadores()[0].args[0]).toEqual({ mensagens_ok_em: null })
        estado.ops = []
        process.env.ZAP_MENSAGENS_BANCO = '0'
        await __teste.marcarMensagensConferidas(WA, null, null)
        expect(estado.ops).toHaveLength(0)
    })
})
