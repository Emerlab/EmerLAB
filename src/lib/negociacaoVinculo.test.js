import { describe, expect, it } from 'vitest'
import { negociacoesVetDoPrestador } from './negociacaoVinculo.js'

/** Cliente falso que só registra a consulta montada. */
function clienteFalso() {
    const chamadas = []
    const builder = {
        select(colunas, opcoes) {
            chamadas.push(['select', colunas, opcoes])
            return builder
        },
        eq(coluna, valor) {
            chamadas.push(['eq', coluna, valor])
            return builder
        },
    }
    return {
        chamadas,
        from(tabela) {
            chamadas.push(['from', tabela])
            return builder
        },
    }
}

describe('negociacoesVetDoPrestador', () => {
    it('filtra por prestador_id e nunca por veterinario_id', () => {
        const client = clienteFalso()
        negociacoesVetDoPrestador(57, 'procedimento_id, valor', {}, client)
        expect(client.chamadas).toContainEqual(['from', 'negociacoes_vet'])
        expect(client.chamadas).toContainEqual(['eq', 'prestador_id', 57])
        expect(client.chamadas.some(([tipo, col]) => tipo === 'eq' && col === 'veterinario_id')).toBe(false)
    })

    it('prestador 57 não vira negociação 57 (Lord Golden é negociação 57 do prestador 259)', () => {
        const client = clienteFalso()
        negociacoesVetDoPrestador(259, '*', {}, client)
        expect(client.chamadas).toContainEqual(['eq', 'prestador_id', 259])
        expect(client.chamadas).not.toContainEqual(['eq', 'prestador_id', 57])
    })

    it('repassa colunas e opções (count/head) ao select', () => {
        const client = clienteFalso()
        negociacoesVetDoPrestador('12', 'id', { count: 'exact', head: true }, client)
        expect(client.chamadas).toContainEqual(['select', 'id', { count: 'exact', head: true }])
        expect(client.chamadas).toContainEqual(['eq', 'prestador_id', 12])
    })

    it('id inválido devolve null, sem consultar o banco', () => {
        for (const invalido of [null, undefined, '', '  ', 0, -3]) {
            const client = clienteFalso()
            expect(negociacoesVetDoPrestador(invalido, '*', {}, client)).toBeNull()
            expect(client.chamadas).toEqual([])
        }
    })
})
