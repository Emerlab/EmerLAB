import { describe, it, expect } from 'vitest'
import {
  TERMOS_POPULARES,
  sinonimosDoProcedimento,
  montarTermosProcedimento,
  normalizarBusca,
} from './planosSinonimos.js'

describe('normalizarBusca', () => {
  it('minúsculas, sem acento, espaços colapsados', () => {
    expect(normalizarBusca('  RAIO   X ')).toBe('raio x')
    expect(normalizarBusca('Castração')).toBe('castracao')
    expect(normalizarBusca(null)).toBe('')
  })
})

describe('TERMOS_POPULARES', () => {
  it('lista inicial', () => {
    expect(TERMOS_POPULARES).toEqual(['Consulta', 'Vacina', 'Raio X', 'Ultrassom', 'Castração', 'Exame de sangue', 'Cirurgia'])
  })
})

describe('sinonimosDoProcedimento', () => {
  it('radiografia traz raio x', () => {
    expect(sinonimosDoProcedimento('Radiografia simples', 'IMG001')).toContain('raio x')
  })
  it('castração traz esterilizacao', () => {
    expect(sinonimosDoProcedimento('Castração macho', 'CIR001')).toContain('esterilizacao')
  })
  it('sem gatilho devolve vazio', () => {
    expect(sinonimosDoProcedimento('Consulta geral', 'CON001')).toEqual([])
  })
})

describe('montarTermosProcedimento', () => {
  it('descarta alternativo igual ao nome base e não repete', () => {
    const t = montarTermosProcedimento({
      nome: 'Radiografia simples',
      codigo: 'IMG001',
      nomesAlternativos: ['RADIOGRAFÍA simples', 'Chapa', 'chapa', 'Raio X'],
    })
    expect(t).not.toContain('radiografia simples')
    expect(t.filter((x) => x === 'chapa')).toHaveLength(1)
    expect(t.filter((x) => x === 'raio x')).toHaveLength(1)
    expect(t).toContain('rx')
  })
})
