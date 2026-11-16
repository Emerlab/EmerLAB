import React from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../../lib/supabase.js', () => ({
    supabase: { from: vi.fn(), rpc: vi.fn(), auth: { getSession: vi.fn() } },
}))
vi.mock('../../../lib/accessControl', async () => {
    const real = await vi.importActual('../../../lib/accessControl')
    return {
        ...real,
        getStoredAccessProfile: () => ({ id: 'u1', nome: 'Teste', permissions: { 'credenciamento.edit': true } }),
        usuarioPodeEditarFerramenta: () => true,
        hasPermission: () => true,
    }
})
vi.mock('../../../assets/logo_E.png', () => ({ default: 'logo.png' }))

import ConfigConferenciaLaboratorio from './ConfigConferenciaLaboratorio.jsx'
import ResultadoTabela from './ResultadoTabela.jsx'
import { runConferencia } from '../../../lib/configuracoes/conferencia/index.js'

const L = (p) => ({
    prontuario: '1',
    tutor: 'João Silva',
    pet: 'Rex',
    data: '2026-07-05',
    exame: 'Urocultura',
    valor: 80,
    ...p,
})

describe('tela da Conferência (fumaça de renderização)', () => {
    it('renderiza a etapa de importação com seletor de laboratório e competência', () => {
        const html = renderToString(<ConfigConferenciaLaboratorio />)
        expect(html).toContain('Laboratório')
        expect(html).toContain('Competência')
        expect(html).toContain('Importar e mapear')
    })

    it('renderiza a tabela de resultados paginada', () => {
        const hon = []
        const mel = []
        for (let i = 0; i < 400; i += 1) {
            hon.push(L({ id: `h${i}`, pet: `Pet${i}`, prontuario: String(i) }))
            mel.push(L({ id: `m${i}`, pet: `Pet${i}`, prontuario: String(i), valor: i % 3 ? 80 : 90 }))
        }
        const { resultados } = runConferencia({ honorarios: hon, mellislab: mel })
        const html = renderToString(
            <ResultadoTabela
                linhas={resultados}
                selecionados={new Set()}
                podeEditar
                ordem={{ chave: '', dir: 'asc' }}
                onOrdenar={() => {}}
                onToggle={() => {}}
                onToggleTodos={() => {}}
                onAbrir={() => {}}
                todosMarcados={false}
                algunsMarcados={false}
            />,
        )
        expect(html.replace(/<!-- -->/g, '')).toContain('Mostrando 150 de 400 linhas')
        expect((html.match(/conf_lab_par /g) || []).length).toBe(150)
    })
})
