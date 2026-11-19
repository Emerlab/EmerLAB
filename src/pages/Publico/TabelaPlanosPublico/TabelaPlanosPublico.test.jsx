import { describe, expect, it } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import TabelaPlanosPublico from './TabelaPlanosPublico.jsx'
import { criarClientePlanosMock } from './mockTabelaPlanos.js'

// Sem DOM de teste no projeto: aqui só o primeiro render (estado inicial). O comportamento
// (busca, painel, sorteio, filtros) está em logicaTabelaPlanos.test.js e sortearPrestadores.test.js,
// e a interação foi conferida no navegador.
const renderizar = (props = {}) =>
    renderToString(
        <MemoryRouter initialEntries={['/tabela-planos']}>
            <TabelaPlanosPublico {...props} />
        </MemoryRouter>,
    )

describe('TabelaPlanosPublico (primeiro render)', () => {
    it('sem cliente nem variáveis de ambiente mostra a faixa de dados de exemplo', () => {
        expect(renderizar()).toContain('Dados de exemplo')
    })

    it('com cliente injetado não mostra a faixa', () => {
        expect(renderizar({ cliente: criarClientePlanosMock() })).not.toContain('Dados de exemplo')
    })

    it('a busca está sempre no documento (desabilitada até haver plano) e o WhatsApp começa desabilitado com dica', () => {
        const html = renderizar({ cliente: criarClientePlanosMock() })
        expect(html).toContain('aria-label="Buscar procedimento"')
        expect(html).toMatch(/<input[^>]*disabled[^>]*aria-label="Buscar procedimento"|aria-label="Buscar procedimento"[^>]*disabled/)
        expect(html).toContain('Escolha a cidade e o plano para falar no WhatsApp')
    })
})
