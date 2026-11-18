import { describe, expect, it } from 'vitest'
import {
    ajustarDestaqueAoTitulo,
    contarLinhasQueCabem,
    decidirPartirGrupo,
    limiteInferiorLinhas,
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

describe('paginação com padding do card', () => {
    it('limite inferior soma margem e padding do card', () => {
        expect(limiteInferiorLinhas(58)).toBe(70)
    })

    it('conta linhas com a mesma regra do laço (soma acumulada <= espaço)', () => {
        expect(contarLinhasQueCabem([30, 30, 30], 60)).toBe(2)
        expect(contarLinhasQueCabem([30, 30, 30], 59)).toBe(1)
        expect(contarLinhasQueCabem([30, 30], 500)).toBe(2)
    })

    it('usar o limite com padding evita uma linha a mais que o laço desenharia', () => {
        const y = 300
        const limite = limiteInferiorLinhas(58)
        const alturas = Array(10).fill(34)
        const n = contarLinhasQueCabem(alturas, y - limite)
        expect(y - n * 34).toBeGreaterThanOrEqual(limite)
    })

    it('partir grupo: >=5 aqui e >=2 na próxima; senão adia', () => {
        expect(decidirPartirGrupo({ linhasQueCabem: 5, restantes: 2 })).toBe(true)
        expect(decidirPartirGrupo({ linhasQueCabem: 4, restantes: 6 })).toBe(false)
        expect(decidirPartirGrupo({ linhasQueCabem: 8, restantes: 1 })).toBe(false)
    })
})

describe('ajustarDestaqueAoTitulo', () => {
    const font = { widthOfTextAtSize: (t, s) => t.length * s * 0.5 }

    it('mantém o texto que cabe', () => {
        expect(ajustarDestaqueAoTitulo('Cães Adultos', font, 10, 200)).toBe('Cães Adultos')
    })

    it('texto longo termina com reticências e cabe', () => {
        const r = ajustarDestaqueAoTitulo('Categoria muito longa de procedimentos', font, 10, 100)
        expect(r.endsWith('…')).toBe(true)
        expect(font.widthOfTextAtSize(r, 10)).toBeLessThanOrEqual(100)
    })

    it('palavra única maior que a barra é truncada com reticências', () => {
        const r = ajustarDestaqueAoTitulo('Superlongapalavrasemespacos', font, 10, 60)
        expect(r.endsWith('…')).toBe(true)
        expect(font.widthOfTextAtSize(r, 10)).toBeLessThanOrEqual(60)
    })
})
