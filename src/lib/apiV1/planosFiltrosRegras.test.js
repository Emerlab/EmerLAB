import { describe, expect, it } from 'vitest'
import { atendeMunicipios, montarCredenciados } from './redeRegras.js'
import {
    montarFiltrosPublicos,
    municipiosDaCidadeTabela,
    prestadoresDoProcedimento,
    realizadoresPorCodigo,
} from './planosFiltrosRegras.js'
import { TERMOS_POPULARES } from './planosSinonimos.js'

const ESPECIALIDADES = [
    { id: 1, nome: 'Clinica 24h', tipo: 'Local' },
    { id: 2, nome: 'Clinica', tipo: 'Local' },
    { id: 8, nome: 'Dermatologista', tipo: 'Especialidade' },
]
const PLANOS = [
    { id: 1, nome: 'Básico' },
    { id: 2, nome: 'Clássico' },
    { id: 3, nome: 'Avançado' },
    { id: 4, nome: 'Ultra' },
    { id: 5, nome: 'Apenas Loja' },
]

const prestador = (dados) => ({
    ativo: true,
    situacao_id: 4,
    tipo: 'Especialidade',
    especialidade_id: 8,
    telefone: '51999990000',
    celular: null,
    endereco_logradouro: null,
    endereco_numero: null,
    endereco_complemento: null,
    endereco_bairro: null,
    endereco_cidade: null,
    endereco_uf: null,
    cep: null,
    ...dados,
})

const base = (extra = {}) => ({
    prestadores: [],
    situacoes: [{ id: 4, descricao: 'Credenciado' }],
    estabelecimentos: [],
    procedimentos: [
        { id: 1, codigo: 'C1', nome: 'Consulta', categoria_id: null, plano_base_id: 1 },
        { id: 2, codigo: 'C2', nome: 'Raio X', categoria_id: null, plano_base_id: 1 },
    ],
    prestadorProcedimentos: [],
    prestadorCidades: [],
    cidadesCredenciamento: [],
    especialidades: ESPECIALIDADES,
    prestadorEspecialidades: [],
    beneficios: [],
    prestadorBeneficios: [],
    beneficiosObs: [],
    planos: PLANOS,
    planosCidade: [],
    cidades: [],
    municipiosVinculo: [],
    categorias: [],
    ...extra,
})

const vinculo = (prestadorId, cod, nome_alternativo = null) => ({ prestador_id: prestadorId, procedimento_cod: cod, nome_alternativo })

describe('atendeMunicipios', () => {
    const base1 = base({
        prestadores: [
            prestador({ id: 1, nome: 'Principal POA', endereco_cidade: 'Porto Alegre', endereco_uf: 'RS' }),
            prestador({ id: 2, nome: 'Atende POA', endereco_cidade: 'Canoas', endereco_uf: 'RS' }),
            prestador({ id: 3, nome: 'Outra UF', endereco_cidade: 'Porto Alegre', endereco_uf: 'SC' }),
        ],
        cidadesCredenciamento: [{ id: 10, nome: 'Porto Alegre', uf: 'RS' }],
        prestadorCidades: [{ prestador_id: 2, cidade_id: 10 }],
    })
    const lista = montarCredenciados(base1)
    const quem = (municipios) => lista.filter((c) => atendeMunicipios(c, municipios)).map((c) => c.id)

    it('casa pela cidade principal e por cidades_atende, e não por outra UF', () => {
        expect(quem([{ nome: 'Porto Alegre', uf: 'RS' }])).toEqual([2, 1])
    })

    it('aceita lista vazia sem casar ninguém', () => {
        expect(quem([])).toEqual([])
    })
})

describe('municipiosDaCidadeTabela', () => {
    it('inclui a cidade da tabela e os municípios vinculados', () => {
        const b = base({
            cidades: [{ id: 7, nome: 'Porto Alegre', uf: 'RS' }],
            municipiosVinculo: [{ cidade_id: 7, uf: 'RS', municipio_nome: 'Gravataí' }, { cidade_id: 8, uf: 'RS', municipio_nome: 'Outra' }],
        })
        expect(municipiosDaCidadeTabela(b, 7)).toEqual([
            { nome: 'Porto Alegre', uf: 'RS' },
            { nome: 'Gravataí', uf: 'RS' },
        ])
        expect(municipiosDaCidadeTabela(b, 99)).toEqual([])
    })

    it('"Porto Alegre e Região" vinculada casa com prestador de Porto Alegre', () => {
        const b = base({
            prestadores: [prestador({ id: 1, nome: 'A', endereco_cidade: 'Porto Alegre', endereco_uf: 'RS' })],
            cidades: [{ id: 7, nome: 'Porto Alegre e Região', uf: 'RS' }],
        })
        const [c] = montarCredenciados(b)
        expect(atendeMunicipios(c, municipiosDaCidadeTabela(b, 7))).toBe(true)
    })
})

describe('montarFiltrosPublicos', () => {
    it('omite cidade sem plano, nunca lista apenas loja, ordena planos e cidades', () => {
        const b = base({
            cidades: [
                { id: 1, nome: 'Zeta', uf: 'RS' },
                { id: 2, nome: 'Alfa', uf: 'RS' },
                { id: 3, nome: 'Sem plano', uf: 'RS' },
                { id: 4, nome: 'So loja', uf: 'RS' },
            ],
            planosCidade: [
                { plano_id: 4, cidade_id: 2 },
                { plano_id: 1, cidade_id: 2 },
                { plano_id: 1, cidade_id: 2 },
                { plano_id: 5, cidade_id: 2 },
                { plano_id: 2, cidade_id: 1 },
                { plano_id: 5, cidade_id: 4 },
            ],
        })
        const f = montarFiltrosPublicos(b)
        expect(f.cidades.map((c) => c.nome)).toEqual(['Alfa', 'Zeta'])
        expect(f.cidades[0]).toEqual({
            id: 2,
            nome: 'Alfa',
            uf: 'RS',
            planos: [
                { id: 1, chave: 'basico', nome: 'Básico' },
                { id: 4, chave: 'ultra', nome: 'Ultra' },
            ],
        })
        expect(JSON.stringify(f)).not.toMatch(/loja/i)
        expect(f.termos_populares).toEqual(TERMOS_POPULARES)
    })
})

describe('realizadoresPorCodigo', () => {
    it('mapeia código para ids dos que atendem os municípios', () => {
        const b = base({
            prestadores: [
                prestador({ id: 1, nome: 'A', endereco_cidade: 'Canoas', endereco_uf: 'RS' }),
                prestador({ id: 2, nome: 'B', endereco_cidade: 'Canoas', endereco_uf: 'RS' }),
                prestador({ id: 3, nome: 'C', endereco_cidade: 'Rio', endereco_uf: 'RJ' }),
            ],
            prestadorProcedimentos: [vinculo(1, 'C1'), vinculo(2, 'C1'), vinculo(2, 'C2'), vinculo(3, 'C1')],
        })
        const mapa = realizadoresPorCodigo(montarCredenciados(b), [{ nome: 'Canoas', uf: 'RS' }])
        expect(mapa.get('C1')).toEqual([1, 2])
        expect(mapa.get('C2')).toEqual([2])
        expect(mapa.has('C9')).toBe(false)
    })
})

describe('prestadoresDoProcedimento', () => {
    const MUN = [{ nome: 'Canoas', uf: 'RS' }]
    const CHAVES = ['id', 'nome', 'especialidade_principal', 'cidade_principal', 'contatos', 'endereco', 'nome_alternativo'].sort()

    const baseCompleta = () =>
        base({
            prestadores: [
                prestador({
                    id: 1,
                    nome: 'Zeta Clínica',
                    especialidade_id: 2,
                    tipo: 'Local',
                    endereco_cidade: 'Canoas',
                    endereco_uf: 'RS',
                    endereco_logradouro: 'Rua A',
                    endereco_numero: '10',
                    cpf_cnpj: '123',
                    chave_pix: 'pix@x',
                    email: 'a@b.c',
                    observacoes: 'segredo',
                }),
                prestador({ id: 2, nome: 'Alfa Derma', endereco_cidade: 'Canoas', endereco_uf: 'RS', endereco_logradouro: 'Rua B' }),
                prestador({ id: 3, nome: 'Sem vínculo', endereco_cidade: 'Canoas', endereco_uf: 'RS' }),
                prestador({ id: 4, nome: 'Inativo', ativo: false, endereco_cidade: 'Canoas', endereco_uf: 'RS' }),
                prestador({ id: 5, nome: 'Longe', endereco_cidade: 'Rio', endereco_uf: 'RJ' }),
            ],
            prestadorProcedimentos: [vinculo(1, 'C1', 'Consulta Zeta'), vinculo(2, 'C1', 'Consulta Alfa'), vinculo(4, 'C1'), vinculo(5, 'C1')],
        })

    it('só ativos com o código, por nome, endereço null para não Local, nome_alternativo do próprio vínculo', () => {
        const r = prestadoresDoProcedimento(montarCredenciados(baseCompleta()), MUN, 'c1')
        expect(r.total).toBe(2)
        expect(r.prestadores.map((p) => p.id)).toEqual([2, 1])
        expect(r.prestadores[0].endereco).toBeNull()
        expect(r.prestadores[0].nome_alternativo).toBe('Consulta Alfa')
        expect(r.prestadores[1].nome_alternativo).toBe('Consulta Zeta')
        expect(r.prestadores[1].endereco).toEqual({ texto: expect.stringContaining('Rua A') })
    })

    it('tem exatamente as chaves permitidas, sem dados sensíveis', () => {
        const r = prestadoresDoProcedimento(montarCredenciados(baseCompleta()), MUN, 'C1')
        for (const p of r.prestadores) {
            expect(Object.keys(p).sort()).toEqual(CHAVES)
            expect(Object.keys(p.contatos).sort()).toEqual(['celular', 'telefone', 'whatsapp_url'])
            if (p.endereco) expect(Object.keys(p.endereco)).toEqual(['texto'])
            if (p.cidade_principal) expect(Object.keys(p.cidade_principal).sort()).toEqual(['nome', 'uf'])
        }
        const json = JSON.stringify(r)
        for (const proibido of ['123', 'pix@x', 'a@b.c', 'segredo']) expect(json).not.toContain(proibido)
    })

    it('corta em 100 e informa o total sem corte', () => {
        const prestadores = Array.from({ length: 120 }, (_, i) =>
            prestador({ id: i + 1, nome: `P${String(i + 1).padStart(3, '0')}`, endereco_cidade: 'Canoas', endereco_uf: 'RS' }),
        )
        const b = base({ prestadores, prestadorProcedimentos: prestadores.map((p) => vinculo(p.id, 'C1')) })
        const r = prestadoresDoProcedimento(montarCredenciados(b), MUN, 'C1')
        expect(r.prestadores).toHaveLength(100)
        expect(r.total).toBe(120)
    })

    it('código sem realizador devolve lista vazia', () => {
        expect(prestadoresDoProcedimento(montarCredenciados(baseCompleta()), MUN, 'C2')).toEqual({ total: 0, prestadores: [] })
    })
})
