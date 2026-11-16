import { describe, it, expect } from 'vitest'
import { eventosParaMim } from './eventosConversa.js'

const eu = 'eu@x.com'
const c = (o) => ({ waId: '5511', atendenteEmail: null, naoLidas: 0, mencionados: [], ultimaMinha: false, ...o })

describe('eventosParaMim', () => {
    it('detecta transferência', () => {
        expect(eventosParaMim([c({})], [c({ atendenteEmail: eu })], eu)[0].tipo).toBe('transferida')
    })
    it('detecta resposta em conversa minha', () => {
        const r = eventosParaMim([c({ atendenteEmail: eu })], [c({ atendenteEmail: eu, naoLidas: 1 })], eu)
        expect(r[0].tipo).toBe('resposta')
    })
    it('ignora mensagem minha e conversa de outro', () => {
        expect(eventosParaMim([c({ atendenteEmail: eu })], [c({ atendenteEmail: eu, naoLidas: 1, ultimaMinha: true })], eu)).toEqual([])
        expect(eventosParaMim([c({})], [c({ atendenteEmail: 'o@x.com', naoLidas: 2 })], eu)).toEqual([])
    })
    it('detecta menção nova, uma vez', () => {
        const dep = c({ mencionados: [eu] })
        expect(eventosParaMim([c({})], [dep], eu)[0].tipo).toBe('mencao')
        expect(eventosParaMim([dep], [dep], eu)).toEqual([])
    })
})
