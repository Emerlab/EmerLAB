import { describe, expect, it } from 'vitest'
import { runConferencia } from './index.js'
import { sugerirEncaixes } from './sugestoes.js'

const L = (p) => ({
    prontuario: '1',
    tutor: 'João Silva',
    pet: 'Rex',
    data: '2026-07-05',
    exame: 'Urocultura',
    valor: 80,
    ...p,
})

describe('sugestões de encaixe de órfãos', () => {
    it('ordena pelo que mais se parece e ignora o que não tem nada a ver', () => {
        const { resultados } = runConferencia({
            honorarios: [
                L({ id: 'h1', pet: 'Rex' }),
                L({ id: 'h2', tutor: 'Ana Lima', pet: 'Luna', exame: 'T4', valor: 30 }),
            ],
            mellislab: [L({ id: 'm1', pet: 'Rexx' })],
        })
        const lab = resultados.find((r) => r.status === 'ORFAO_MELLISLAB')
        const planos = resultados.filter((r) => r.status === 'ORFAO_HONORARIOS')
        const sug = sugerirEncaixes(lab, planos)
        expect(sug).toHaveLength(1)
        expect(sug[0].id).toBe('orfao:honorarios:h1')
        expect(sug[0].motivos).toContain('pet parecido')
    })

    it('funciona também a partir do órfão do plano', () => {
        const { resultados } = runConferencia({
            honorarios: [L({ id: 'h1', pet: 'Rex' })],
            mellislab: [L({ id: 'm1', pet: 'Rexx' })],
        })
        const pl = resultados.find((r) => r.status === 'ORFAO_HONORARIOS')
        const labs = resultados.filter((r) => r.status === 'ORFAO_MELLISLAB')
        expect(sugerirEncaixes(pl, labs)[0].id).toBe('orfao:mellislab:m1')
    })
})
