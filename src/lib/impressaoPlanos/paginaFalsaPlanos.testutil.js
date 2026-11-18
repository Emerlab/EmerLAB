// Utilitários de teste do Planos: reaproveita a página falsa e define os cenários sem observações.
export {
    WIDTH,
    HEIGHT,
    criarFontes,
    criarPaginaFalsa,
    serializarChamadas,
} from '../impressaoHonorarios/paginaFalsaHonorarios.testutil.js'

function linhasCategoria(id, n, { nomeLongo = false, isentaEm = [] /* índices que usam o procedimento 23 (isento do limite de grupo) */ } = {}) {
    return Array.from({ length: n }, (_, i) => ({
        procedimentoId: isentaEm.includes(i) ? 23 : id * 1000 + i,
        nome: nomeLongo
            ? `Procedimento ${id} com nome bastante comprido para quebrar em varias linhas ${i + 1}`
            : `Procedimento ${id}-${i + 1}`,
        diferenca: 'R$ 10,00',
        carencia: '30 dias',
        limite: '1 por ano',
    }))
}

/** Cenários SEM observações: (a) várias páginas, (b) limite de grupo mesclado, (c) grupo dividido entre páginas. */
export function cenariosPlanosSemObservacoes() {
    return {
        multiPaginas: [
            { id: 1, nome: 'Consultas', linhas: linhasCategoria(1, 30) },
            { id: 2, nome: 'Cirurgias', linhas: linhasCategoria(2, 22, { nomeLongo: true }) },
            { id: 3, nome: 'Exames', linhas: linhasCategoria(3, 3) },
        ],
        limiteGrupoMesclado: [
            { id: 1, nome: 'Consultas', linhas: linhasCategoria(1, 5) },
            {
                id: 2,
                nome: 'Vacinas',
                limiteGrupoValor: '2',
                textoLimiteGrupo: '2 por ano no grupo',
                linhas: linhasCategoria(2, 6),
            },
            { id: 3, nome: 'Exames', linhas: linhasCategoria(3, 2) },
        ],
        grupoDivididoEntrePaginas: [
            { id: 1, nome: 'Consultas', linhas: linhasCategoria(1, 8) },
            {
                id: 2,
                nome: 'Internação',
                limiteGrupoValor: '3',
                textoLimiteGrupo: '3 por ano no grupo',
                linhas: linhasCategoria(2, 40, { nomeLongo: true, isentaEm: [5] }),
            },
        ],
    }
}
