import { describe, expect, it } from 'vitest'
import { distribuirObservacoes } from './distribuirObservacoes.js'

const grupos = [
    { chave: 'g1', codigos: ['A1', 'A2'] },
    { chave: 'g2', codigos: ['B1'] },
    { chave: 'g3', codigos: ['C1'] },
]

function obs(extra) {
    return {
        id: 1,
        ordem: 0,
        titulo: 'T',
        mensagem: 'M',
        ativa: true,
        geral: false,
        codigosProcedimentos: [],
        ...extra,
    }
}

describe('distribuirObservacoes', () => {
    it('observacao ligada a procedimentos de dois grupos aparece em cada um (uma vez por grupo)', () => {
        const r = distribuirObservacoes({
            grupos,
            observacoes: [obs({ codigosProcedimentos: ['B1', 'A1'] })],
        })
        expect(r.porGrupo.g1).toEqual([{ titulo: 'T', mensagem: 'M' }])
        expect(r.porGrupo.g2).toEqual([{ titulo: 'T', mensagem: 'M' }])
        expect(r.porGrupo.g3).toBeUndefined()
        expect(r.gerais).toEqual([])
    })

    it('varios procedimentos do mesmo grupo valem uma unica vez naquele grupo', () => {
        const r = distribuirObservacoes({
            grupos,
            observacoes: [obs({ codigosProcedimentos: ['A1', 'A2'] })],
        })
        expect(r.porGrupo.g1).toHaveLength(1)
        expect(Object.keys(r.porGrupo)).toEqual(['g1'])
    })

    it('tres procedimentos em tres grupos: aparece tres vezes, uma por grupo, na ordem dos grupos', () => {
        const r = distribuirObservacoes({
            grupos,
            observacoes: [obs({ codigosProcedimentos: ['C1', 'A1', 'B1'] })],
        })
        expect(Object.keys(r.porGrupo)).toEqual(['g1', 'g2', 'g3'])
        for (const chave of ['g1', 'g2', 'g3']) {
            expect(r.porGrupo[chave]).toEqual([{ titulo: 'T', mensagem: 'M' }])
        }
    })

    it('geral ativa vai so para gerais, mesmo com codigos', () => {
        const r = distribuirObservacoes({
            grupos,
            observacoes: [obs({ geral: true, codigosProcedimentos: ['A1'] })],
        })
        expect(r.gerais).toEqual([{ titulo: 'T', mensagem: 'M' }])
        expect(r.porGrupo).toEqual({})
    })

    it('inativa e geral inativa nao saem', () => {
        const r = distribuirObservacoes({
            grupos,
            observacoes: [
                obs({ id: 1, ativa: false, codigosProcedimentos: ['A1'] }),
                obs({ id: 2, ativa: false, geral: true }),
            ],
        })
        expect(r).toEqual({ porGrupo: {}, gerais: [] })
    })

    it('ligada so a codigo que nenhum grupo tem nao sai', () => {
        const r = distribuirObservacoes({
            grupos,
            observacoes: [obs({ codigosProcedimentos: ['Z9'] }), obs({ id: 2 })],
        })
        expect(r).toEqual({ porGrupo: {}, gerais: [] })
    })

    it('ordena por ordem e depois id dentro do grupo', () => {
        const r = distribuirObservacoes({
            grupos,
            observacoes: [
                obs({ id: 3, ordem: 1, titulo: 'c', codigosProcedimentos: ['A1'] }),
                obs({ id: 2, ordem: 0, titulo: 'b', codigosProcedimentos: ['A1'] }),
                obs({ id: 1, ordem: 0, titulo: 'a', codigosProcedimentos: ['A2'] }),
            ],
        })
        expect(r.porGrupo.g1.map((o) => o.titulo)).toEqual(['a', 'b', 'c'])
    })

    it('grupo sem observacoes fica sem chave', () => {
        const r = distribuirObservacoes({
            grupos,
            observacoes: [obs({ codigosProcedimentos: ['C1'] })],
        })
        expect(Object.keys(r.porGrupo)).toEqual(['g3'])
        expect('g1' in r.porGrupo).toBe(false)
    })

    it('mensagem vazia e descartada', () => {
        const r = distribuirObservacoes({
            grupos,
            observacoes: [
                obs({ id: 1, mensagem: '   ', codigosProcedimentos: ['A1'] }),
                obs({ id: 2, mensagem: '', geral: true }),
            ],
        })
        expect(r).toEqual({ porGrupo: {}, gerais: [] })
    })

    it('compara codigos ignorando caixa e espacos', () => {
        const r = distribuirObservacoes({
            grupos: [{ chave: 'g1', codigos: [' a1 '] }],
            observacoes: [obs({ codigosProcedimentos: ['A1 '] })],
        })
        expect(r.porGrupo.g1).toHaveLength(1)
    })
})
