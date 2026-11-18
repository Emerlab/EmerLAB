import { describe, expect, it, vi } from 'vitest'
import JSZip from 'jszip'
import { gerarZipPlanosCidade } from './gerarZipPlanosCidade.js'

const planos = [
    { id: 1, nome: 'Plano A', chave: 'a' },
    { id: 2, nome: 'Plano B', chave: 'b' },
]
const modos = [
    { planoId: 1, selecao: { 'X|base': false } },
    { planoId: '2', selecao: {} },
]

function criarDeps(extra = {}) {
    const ordem = []
    const deps = {
        carregarLinhas: vi.fn(async ({ planoId }) => {
            ordem.push(planoId)
            return {
                pdfUrl: `u${planoId}`,
                planoNome: planoId === 1 ? 'Plano A' : 'Plano B',
                cidadeNome: 'Cidade/X',
                categorias: [
                    { id: 1, nome: 'C', linhas: [{ linhaKey: 'X|base', checked: true, selecionavel: true }] },
                ],
            }
        }),
        resolverObservacoes: vi.fn(async () => ({ porGrupo: { 10: [{ titulo: 't', mensagem: 'm' }] }, gerais: ['obs'] })),
        gerarPdf: vi.fn(async () => new Uint8Array([1, 2, 3])),
        criarZip: () => new JSZip(),
        ...extra,
    }
    return { deps, ordem }
}

const base = {
    cidadeTabelaId: 10,
    municipioNome: 'Cidade',
    incluirCidadesParalelas: false,
    planosLista: [],
    planosDisponiveis: planos,
    modos,
}

describe('gerarZipPlanosCidade', () => {
    it('gera zip com um pdf por plano, na ordem, com progresso', async () => {
        const { deps, ordem } = criarDeps()
        const arquivos = []
        deps.criarZip = () => ({
            file: (nome) => arquivos.push(nome),
            generateAsync: async () => new Blob(['zip']),
        })
        const onProgresso = vi.fn()
        const r = await gerarZipPlanosCidade({ ...base, onProgresso }, deps)
        expect(ordem).toEqual([1, 2])
        expect(r.planoIds).toEqual([1, 2])
        expect(r.nomeZip).toBe('Planos Cidade X.zip')
        expect(r.blob).toBeInstanceOf(Blob)
        expect(arquivos).toEqual(['Plano A Cidade X.pdf', 'Plano B Cidade X.pdf'])
        expect(onProgresso.mock.calls.map((c) => c.slice(0, 2))).toEqual([[1, 2], [2, 2]])
    })

    it('aplica a selecao do preset nas categorias', async () => {
        const { deps } = criarDeps()
        await gerarZipPlanosCidade(base, deps)
        const a = deps.gerarPdf.mock.calls[0][0]
        expect(a.categorias[0].linhas[0].checked).toBe(false)
        expect(a.observacoes).toEqual(['obs'])
        expect(a.observacoesPorGrupo).toEqual({ 10: [{ titulo: 't', mensagem: 'm' }] })
        expect(deps.resolverObservacoes).toHaveBeenCalledWith(a.categorias)
        expect(a.pdfUrl).toBe('u1')
        const b = deps.gerarPdf.mock.calls[1][0]
        expect(b.categorias[0].linhas[0].checked).toBe(true)
    })

    it('rejeita sem gerar nada quando falta preset', async () => {
        const { deps } = criarDeps()
        await expect(
            gerarZipPlanosCidade({ ...base, modos: [modos[0]] }, deps),
        ).rejects.toThrow('Plano Plano B sem preset salvo')
        expect(deps.gerarPdf).not.toHaveBeenCalled()
        expect(deps.carregarLinhas).not.toHaveBeenCalled()
    })

    it('envolve a falha do segundo plano', async () => {
        const { deps } = criarDeps({
            gerarPdf: vi
                .fn()
                .mockResolvedValueOnce(new Uint8Array([1]))
                .mockRejectedValueOnce(new Error('boom')),
        })
        await expect(gerarZipPlanosCidade(base, deps)).rejects.toThrow('Falha ao gerar Plano B: boom')
    })
})
