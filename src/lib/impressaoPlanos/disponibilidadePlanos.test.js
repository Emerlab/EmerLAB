import { describe, expect, it } from 'vitest'
import { carregarDisponibilidadePlanos, decidirBloqueioZip } from './disponibilidadePlanos.js'

const planos = [
    { id: 1, nome: 'A' },
    { id: 2, nome: 'B' },
    { id: 3, nome: 'C' },
]
const mapa = { 1: new Set([10]), 2: new Set([20]), 3: new Set([10, 20]) }
const buscar = async (id) => mapa[id]

describe('carregarDisponibilidadePlanos', () => {
    it('cidade A e B não vazam planos entre si', async () => {
        const a = await carregarDisponibilidadePlanos({ planos, cidadeTabelaId: 10, buscarCidadeIds: buscar })
        const b = await carregarDisponibilidadePlanos({ planos, cidadeTabelaId: 20, buscarCidadeIds: buscar })
        expect(a.disponiveis.map((p) => p.id)).toEqual([1, 3])
        expect(b.disponiveis.map((p) => p.id)).toEqual([2, 3])
    })
    it('falha de um plano vai para comFalha e não para disponiveis', async () => {
        const r = await carregarDisponibilidadePlanos({
            planos,
            cidadeTabelaId: 10,
            buscarCidadeIds: async (id) => {
                if (id === 3) throw new Error('x')
                return mapa[id]
            },
        })
        expect(r.disponiveis.map((p) => p.id)).toEqual([1])
        expect(r.comFalha.map((p) => p.id)).toEqual([3])
    })
    it('sem cidade retorna vazio', async () => {
        const r = await carregarDisponibilidadePlanos({ planos, cidadeTabelaId: null, buscarCidadeIds: buscar })
        expect(r).toEqual({ disponiveis: [], comFalha: [] })
    })
})

describe('decidirBloqueioZip', () => {
    const ok = { podeGerar: true, motivoBloqueio: null }
    it('libera quando tudo pronto', () => {
        expect(decidirBloqueioZip({ status: ok }).bloqueado).toBe(false)
    })
    it('bloqueia verificando', () => {
        const r = decidirBloqueioZip({ status: ok, disponibilidadeCarregando: true })
        expect(r).toEqual({ bloqueado: true, mensagem: 'Verificando planos da cidade…' })
    })
    it('bloqueia e nomeia planos com falha', () => {
        const r = decidirBloqueioZip({ status: ok, planosComFalha: [{ nome: 'Ouro' }, { nome: 'Prata' }] })
        expect(r.bloqueado).toBe(true)
        expect(r.mensagem).toContain('Ouro, Prata')
    })
    it('bloqueia com motivo do status, carga ou erro', () => {
        expect(decidirBloqueioZip({ status: { podeGerar: false, motivoBloqueio: 'm' } }).mensagem).toBe('m')
        expect(decidirBloqueioZip({ status: ok, carregando: true }).bloqueado).toBe(true)
        expect(decidirBloqueioZip({ status: ok, erroCarga: 'e' }).bloqueado).toBe(true)
    })
})
