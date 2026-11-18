import { describe, it, expect } from 'vitest'
import {
    nomeArquivoImpressaoPlanosPdf,
    nomeArquivoZipPlanos,
    calcularStatusZipPlanos,
} from './statusZipPlanos.js'

const planos = [
    { id: 1, nome: 'Básico', chave: 'basico' },
    { id: 2, nome: 'Clássico', chave: 'classico' },
    { id: 3, nome: 'Master', chave: 'master' },
    { id: 4, nome: 'Premium', chave: 'premium' },
]
const modo = (planoId, atualizadoEm = '2026-11-01T10:00:00Z') => ({
    planoId,
    selecao: {},
    atualizadoEm,
    atualizadoPor: 'u',
    atualizadoPorNome: 'Fulano',
})

describe('nomes de arquivo', () => {
    it('sanitiza nome do PDF', () => {
        expect(nomeArquivoImpressaoPlanosPdf('Básico', 'São/Paulo: SP')).toBe('Básico São Paulo SP.pdf')
    })
    it('mantém o comportamento atual com nomes vazios', () => {
        expect(nomeArquivoImpressaoPlanosPdf('', '')).toBe('.pdf')
    })
    it('nome do zip', () => {
        expect(nomeArquivoZipPlanos('Caxias do Sul')).toBe('Planos Caxias do Sul.zip')
        expect(nomeArquivoZipPlanos('A/B*C')).toBe('Planos A B C.zip')
        expect(nomeArquivoZipPlanos('A\\B"C|D<E>F?')).toBe('Planos A B C D E F.zip')
    })
})

describe('calcularStatusZipPlanos', () => {
    it('libera com todos os presets', () => {
        const r = calcularStatusZipPlanos({
            planosDisponiveis: planos,
            modos: planos.map((p) => modo(p.id)),
            ultimaGeracao: null,
        })
        expect(r.podeGerar).toBe(true)
        expect(r.motivoBloqueio).toBeNull()
        expect(r.linhas).toHaveLength(4)
        expect(r.linhas.every((l) => !l.semPreset && !l.maisNovoQueZip)).toBe(true)
    })
    it('bloqueia e cita plano sem preset', () => {
        const r = calcularStatusZipPlanos({
            planosDisponiveis: planos,
            modos: [modo(1), modo(3), modo(4)],
            ultimaGeracao: null,
        })
        expect(r.podeGerar).toBe(false)
        expect(r.motivoBloqueio).toBe('Sem preset salvo: Clássico — revise esses planos antes de gerar')
        expect(r.linhas[1].semPreset).toBe(true)
        expect(r.linhas[1].modo).toBeNull()
    })
    it('cita vários planos sem preset', () => {
        const r = calcularStatusZipPlanos({ planosDisponiveis: planos, modos: [modo(3), modo(4)], ultimaGeracao: null })
        expect(r.motivoBloqueio).toBe('Sem preset salvo: Básico, Clássico — revise esses planos antes de gerar')
    })
    it('sem planos', () => {
        const r = calcularStatusZipPlanos({ planosDisponiveis: [], modos: [], ultimaGeracao: null })
        expect(r.podeGerar).toBe(false)
        expect(r.motivoBloqueio).toBe('Nenhum plano disponível nesta cidade')
        expect(r.linhas).toEqual([])
    })
    it('preset mais novo que o zip', () => {
        const r = calcularStatusZipPlanos({
            planosDisponiveis: planos,
            modos: [modo(1, '2026-11-10T00:00:00Z'), modo(2, '2026-10-01T00:00:00Z'), modo(3), modo(4)],
            ultimaGeracao: { geradoEm: '2026-11-05T00:00:00Z' },
        })
        expect(r.linhas.map((l) => l.maisNovoQueZip)).toEqual([true, false, false, false])
    })
    it('tolera entradas ausentes', () => {
        const r = calcularStatusZipPlanos({ planosDisponiveis: planos })
        expect(r.podeGerar).toBe(false)
    })
})
