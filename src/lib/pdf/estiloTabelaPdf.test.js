import { describe, expect, it } from 'vitest'
import {
    caminhoRetanguloArredondado,
    yBaselineCentro,
    yPrimeiraLinhaBloco,
} from './estiloTabelaPdf.js'

describe('caminhoRetanguloArredondado', () => {
    it('começa em M raio 0 e usa arcos do raio', () => {
        const d = caminhoRetanguloArredondado({ width: 200, height: 40, raio: 14 })
        expect(d.startsWith('M 14 0')).toBe(true)
        expect(d).toContain('A 14 14 0 0 1')
    })

    it('limita o raio à metade da menor dimensão', () => {
        const d = caminhoRetanguloArredondado({ width: 200, height: 10, raio: 14 })
        expect(d).toContain('A 5 5')
        expect(d).not.toContain('A 14 14')
    })

    it('soTopo arredonda apenas os dois cantos de cima', () => {
        const d = caminhoRetanguloArredondado({ width: 200, height: 40, raio: 14, soTopo: true })
        expect(d.startsWith('M 0 40')).toBe(true)
        expect(d.trim().endsWith('Z')).toBe(true)
        expect(d.match(/A /g)).toHaveLength(2)
    })
})

describe('centralização vertical', () => {
    it('yBaselineCentro = meio - 0,36 * corpo', () => {
        expect(yBaselineCentro(100, 11)).toBeCloseTo(96.04, 5)
    })

    it('yPrimeiraLinhaBloco centraliza pelas maiúsculas', () => {
        expect(yPrimeiraLinhaBloco(100, 66, 1, 10, 12)).toBeCloseTo(79.4, 5)
    })
})
