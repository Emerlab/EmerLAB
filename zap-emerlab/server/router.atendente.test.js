import { describe, it, expect, vi } from 'vitest'

vi.mock('./db.js', () => ({
    db: () => ({}),
    ok: ({ data }) => data,
    DbError: class extends Error {},
    buscarUsuarioPorEmail: vi.fn(),
    buscarUsuarioPorId: vi.fn(),
    idsDepartamentos: vi.fn(() => []),
    invalidarUsuarios: vi.fn(),
    listarDepartamentos: vi.fn(async () => []),
    invalidarDepartamentos: vi.fn(),
}))
vi.mock('./wati.js', () => ({ WatiError: class extends Error {}, watiEmPausa: () => false }))

const { __teste } = await import('./router.js')
const { exigirSerAtendente } = __teste

const AGORA = Date.parse('2026-11-23T12:00:00Z')
const h = (horas) => new Date(AGORA - horas * 3600 * 1000).toISOString()
const eu = { email: 'eu@emerdog.com.br', papel: 'atendente' }
const admin = { email: 'adm@emerdog.com.br', papel: 'admin' }

describe('quem pode responder / enviar template', () => {
    it('sem atendente: qualquer um responde', () => {
        expect(() => exigirSerAtendente({ atendente_email: null }, eu, AGORA)).not.toThrow()
    })
    it('o próprio atendente responde (sem diferenciar maiúsculas)', () => {
        expect(() => exigirSerAtendente({ atendente_email: 'EU@emerdog.com.br' }, eu, AGORA)).not.toThrow()
    })
    it('conversa ativa com outro atendente: atendente comum leva 403', () => {
        const meta = { atendente_email: 'outro@emerdog.com.br', ultima_cliente_em: h(2) }
        expect(() => exigirSerAtendente(meta, eu, AGORA)).toThrow(/Assuma a conversa/)
    })
    it('admin responde mesmo com a conversa ativa de outro atendente', () => {
        const meta = { atendente_email: 'outro@emerdog.com.br', ultima_cliente_em: h(2) }
        expect(() => exigirSerAtendente(meta, admin, AGORA)).not.toThrow()
    })
    it('conversa expirada (>24h) com outro atendente: atendente comum assume ao enviar', () => {
        const meta = { atendente_email: 'outro@emerdog.com.br', ultima_cliente_em: h(30) }
        expect(() => exigirSerAtendente(meta, eu, AGORA)).not.toThrow()
    })
    it('conversa que o cliente nunca respondeu conta como expirada', () => {
        const meta = { atendente_email: 'outro@emerdog.com.br', ultima_cliente_em: null }
        expect(() => exigirSerAtendente(meta, eu, AGORA)).not.toThrow()
    })
})
