import { describe, expect, it } from 'vitest'
import { sortearPrestadores } from './sortearPrestadores.js'

const lista = (n) => Array.from({ length: n }, (_, i) => ({ id: i + 1, nome: `P${i + 1}` }))
const fixo = () => 0 // determinístico

describe('sortearPrestadores', () => {
    it('10 elegíveis → 5 distintos', () => {
        const { sorteados, restantes } = sortearPrestadores(lista(10))
        expect(sorteados).toHaveLength(5)
        expect(new Set(sorteados.map((p) => p.id)).size).toBe(5)
        expect(restantes).toBe(5)
    })

    it('3 elegíveis → os 3; 0 → []', () => {
        expect(sortearPrestadores(lista(3)).sorteados).toHaveLength(3)
        expect(sortearPrestadores(lista(3)).restantes).toBe(0)
        expect(sortearPrestadores([]).sorteados).toEqual([])
        expect(sortearPrestadores(undefined).sorteados).toEqual([])
    })

    it('excluirIds não repete enquanto houver não vistos', () => {
        const primeira = sortearPrestadores(lista(10), { aleatorio: fixo })
        const segunda = sortearPrestadores(lista(10), { excluirIds: primeira.sorteados.map((p) => p.id), aleatorio: fixo })
        const ids1 = new Set(primeira.sorteados.map((p) => p.id))
        expect(segunda.sorteados.every((p) => !ids1.has(p.id))).toBe(true)
        expect(segunda.restantes).toBe(0)
    })

    it('esgotados os não vistos recomeça do conjunto completo, sem repetir dentro do sorteio', () => {
        const todos = lista(10)
        const r = sortearPrestadores(todos, { excluirIds: todos.map((p) => p.id), aleatorio: fixo })
        expect(r.sorteados).toHaveLength(5)
        expect(new Set(r.sorteados.map((p) => p.id)).size).toBe(5)
    })

    it('com poucos não vistos completa com os já mostrados', () => {
        const r = sortearPrestadores(lista(10), { excluirIds: [1, 2, 3, 4, 5, 6, 7, 8], aleatorio: fixo })
        expect(r.sorteados).toHaveLength(5)
        expect(new Set(r.sorteados.map((p) => p.id)).size).toBe(5)
        expect(r.sorteados.map((p) => p.id)).toEqual(expect.arrayContaining([9, 10]))
    })

    it('com aleatorio injetado o resultado é determinístico', () => {
        const a = sortearPrestadores(lista(8), { aleatorio: fixo }).sorteados.map((p) => p.id)
        const b = sortearPrestadores(lista(8), { aleatorio: fixo }).sorteados.map((p) => p.id)
        expect(a).toEqual(b)
    })
})
