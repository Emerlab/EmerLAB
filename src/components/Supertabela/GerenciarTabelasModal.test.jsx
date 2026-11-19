import { describe, expect, it, vi } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'
import GerenciarTabelasModal from './GerenciarTabelasModal.jsx'

const cidades = [
    { id: 1, uf: 'RS', nome: 'Caxias do Sul', procedimentosAtivos: 440 },
    { id: 2, uf: 'MG', nome: 'Belo Horizonte', procedimentosAtivos: 106 },
]

function html(extra = {}) {
    return renderToString(
        <GerenciarTabelasModal
            onClose={vi.fn()}
            somenteLeitura={false}
            onNovaCidade={vi.fn()}
            cidadesOrdenadas={cidades}
            ordenarGerenciador={vi.fn()}
            indicadorOrdenacaoGerenciador={() => ''}
            onSelecionarCidade={vi.fn()}
            onAcessarCidade={vi.fn()}
            onEditarCidade={vi.fn()}
            onDuplicarCidade={vi.fn()}
            onExcluirCidade={vi.fn()}
            onBaixarExcelCidade={vi.fn()}
            colunaProcedimentos
            {...extra}
        />,
    )
}

describe('GerenciarTabelasModal (render estático)', () => {
    it('é um diálogo modal com busca, filtro de UF e uma linha por tabela', () => {
        const h = html()
        expect(h).toContain('aria-modal="true"')
        expect(h).toContain('aria-label="Buscar tabela"')
        expect(h).toContain('aria-label="Filtrar por UF"')
        expect(h).toContain('2 tabelas cadastradas')
        expect(h).toContain('Caxias do Sul')
        expect(h).toContain('Belo Horizonte')
    })

    it('cada linha tem Abrir, Editar e o menu ⋯ (que começa fechado), tudo com nome acessível', () => {
        const h = html()
        expect(h).toContain('aria-label="Abrir a tabela de Caxias do Sul"')
        expect(h).toContain('aria-label="Editar Caxias do Sul"')
        expect(h).toContain('aria-label="Mais ações de Caxias do Sul"')
        expect(h).toContain('aria-expanded="false"')
        expect(h).not.toContain('role="menu"')
    })

    it('somente leitura não oferece Nova tabela', () => {
        expect(html({ somenteLeitura: true })).not.toContain('Nova tabela')
    })
})
