import { describe, it, expect, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { etapa, medirEtapas, formatarEtapas } from './etapas.js'

const dormir = (ms) => new Promise((r) => setTimeout(r, ms))

describe('tempo por etapa', () => {
    it('fora de um pedido só executa o trabalho', async () => {
        await expect(etapa('x', async () => 7)).resolves.toBe(7)
        await expect(etapa('x', Promise.resolve(8))).resolves.toBe(8)
        await expect(etapa('x', () => Promise.reject(new Error('boom')))).rejects.toThrow('boom')
    })

    it('registra pedido lento com as etapas em ordem do maior para o menor', async () => {
        const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const res = new EventEmitter()
        await medirEtapas('GET conversas', res, async () => {
            await etapa('banco', () => dormir(10))
            await etapa('WATI getMessages', () => dormir(40))
            await etapa('WATI getMessages', () => dormir(40))
            res.emit('finish')
        }, 50)
        expect(aviso).toHaveBeenCalledTimes(1)
        const linha = aviso.mock.calls[0][0]
        expect(linha).toMatch(/^\[zap-etapas\] GET conversas \d+ms :: WATI getMessages=\d+ms×2 \| banco=\d+ms$/)
        aviso.mockRestore()
    })

    it('pedido rápido não gera log, e o erro da etapa continua chegando a quem chamou', async () => {
        const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const res = new EventEmitter()
        await expect(
            medirEtapas('GET x', res, async () => {
                await etapa('falha', () => Promise.reject(new Error('ruim')))
            }, 1000),
        ).rejects.toThrow('ruim')
        res.emit('finish')
        expect(aviso).not.toHaveBeenCalled()
        aviso.mockRestore()
    })

    it('formata sem repetição quando a etapa rodou uma vez', () => {
        expect(formatarEtapas(new Map([['a', { ms: 12.4, n: 1 }]]))).toBe('a=12ms')
    })
})
