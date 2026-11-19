import { describe, expect, it } from 'vitest'
import {
    filtrarGrupos,
    formatarReais,
    contatosDistintos,
    hrefWhatsappTabela,
    partesTextoObservacao,
    procedimentoBateConsulta,
    totalProcedimentos,
    trechosComDestaque,
} from './logicaTabelaPlanos.js'
import { criarClientePlanosMock } from './mockTabelaPlanos.js'

const grupos = [
    {
        id: 1,
        nome: 'Imagem',
        procedimentos: [
            { codigo: 'IMG001', nome: 'Radiografia simples', termos: ['radiografia', 'raio x'] },
            { codigo: 'IMG002', nome: 'Ultrassonografia abdominal', termos: ['ultrassom'] },
        ],
    },
    { id: 2, nome: 'Cirurgias', procedimentos: [{ codigo: 'CIR001', nome: 'Castração macho', termos: ['castracao', 'esterilizacao'] }] },
]

describe('busca', () => {
    it('"raio x" acha a radiografia pelos termos (sinônimo)', () => {
        const r = filtrarGrupos(grupos, 'raio x')
        expect(r.map((g) => g.nome)).toEqual(['Imagem'])
        expect(r[0].procedimentos.map((p) => p.codigo)).toEqual(['IMG001'])
    })

    it('"CASTRACAO" (sem acento, maiúsculas) acha "Castração macho"', () => {
        expect(totalProcedimentos(filtrarGrupos(grupos, 'CASTRACAO'))).toBe(1)
    })

    it('acha pelo código e pelo nome com acento digitado sem acento', () => {
        expect(procedimentoBateConsulta(grupos[0].procedimentos[0], 'img001')).toBe(true)
        expect(totalProcedimentos(filtrarGrupos(grupos, 'ultrassonografia'))).toBe(1)
    })

    it('sem consulta devolve tudo; sem acerto devolve []', () => {
        expect(filtrarGrupos(grupos, '  ')).toBe(grupos)
        expect(filtrarGrupos(grupos, 'xyz')).toEqual([])
    })
})

describe('trechosComDestaque', () => {
    it('marca o trecho ignorando acento e caixa', () => {
        expect(trechosComDestaque('Castração macho', 'CASTRACAO')).toEqual([
            { texto: 'Castração', destaque: true },
            { texto: ' macho', destaque: false },
        ])
    })

    it('acerto por sinônimo não destaca nada e mantém o texto inteiro', () => {
        expect(trechosComDestaque('Radiografia simples', 'raio x')).toEqual([{ texto: 'Radiografia simples', destaque: false }])
    })

    it('sem consulta devolve o texto', () => {
        expect(trechosComDestaque('Consulta', '')).toEqual([{ texto: 'Consulta', destaque: false }])
    })
})

describe('formatação e WhatsApp', () => {
    it('formata reais em pt-BR', () => {
        expect(formatarReais(1234.5).replace(/\s/g, ' ')).toBe('R$ 1.234,50')
        expect(formatarReais('x')).toBe('—')
    })

    it('WhatsApp só existe com cidade e plano e cita o procedimento aberto', () => {
        const cidade = { nome: 'Caxias do Sul', uf: 'RS' }
        const plano = { nome: 'Básico' }
        expect(hrefWhatsappTabela({ cidade })).toBeNull()
        const sem = decodeURIComponent(hrefWhatsappTabela({ cidade, plano }))
        expect(sem).toContain('plano Básico de Caxias do Sul-RS')
        const com = decodeURIComponent(hrefWhatsappTabela({ cidade, plano, procedimento: { nome: 'Radiografia simples' } }))
        expect(com).toContain('Radiografia simples')
    })
})

describe('mock no formato da API', () => {
    it('devolve filtros, tabela e prestadores como a API; plano fora da cidade dá 404 com codigo', async () => {
        const c = criarClientePlanosMock()
        const f = await c.filtros()
        expect(f.cidades[0].planos[0]).toHaveProperty('chave')
        const t = await c.tabela({ cidade: 1, plano: 'basico' })
        expect(t.grupos[0].procedimentos[0]).toHaveProperty('termos')
        expect(t.observacoes_gerais.every((id) => t.observacoes[id])).toBe(true)
        await expect(c.tabela({ cidade: 3, plano: 'ultra' })).rejects.toMatchObject({ codigo: 'plano_indisponivel_na_cidade' })
        expect((await c.prestadores({ cidade: 1, procedimento: 'CON001' })).total).toBe(7)
    })
})

describe('partesTextoObservacao', () => {
    it('separa **negrito** do texto, sem os asteriscos', () => {
        expect(partesTextoObservacao('Cancelamento **sem aviso de 24 horas** gera taxa.')).toEqual([
            { tipo: 'texto', texto: 'Cancelamento ', negrito: false },
            { tipo: 'texto', texto: 'sem aviso de 24 horas', negrito: true },
            { tipo: 'texto', texto: ' gera taxa.', negrito: false },
        ])
    })

    it('transforma URL em link e não leva a pontuação final', () => {
        expect(partesTextoObservacao('Veja em https://emerdog.com.br.')).toEqual([
            { tipo: 'texto', texto: 'Veja em ', negrito: false },
            { tipo: 'link', texto: 'https://emerdog.com.br', href: 'https://emerdog.com.br', negrito: false },
            { tipo: 'texto', texto: '.', negrito: false },
        ])
    })

    it('link dentro do negrito continua sendo link e continua em negrito', () => {
        expect(partesTextoObservacao('**Consulte https://emerdog.com.br**')).toEqual([
            { tipo: 'texto', texto: 'Consulte ', negrito: true },
            { tipo: 'link', texto: 'https://emerdog.com.br', href: 'https://emerdog.com.br', negrito: true },
        ])
    })

    it('texto vazio ou nulo não gera partes e asterisco solto fica como texto', () => {
        expect(partesTextoObservacao('')).toEqual([])
        expect(partesTextoObservacao(null)).toEqual([])
        expect(partesTextoObservacao('a * b')).toEqual([{ tipo: 'texto', texto: 'a * b', negrito: false }])
    })
})

describe('contatosDistintos', () => {
    it('não repete o mesmo número em telefone e celular', () => {
        expect(contatosDistintos({ telefone: '(54) 99967-2810', celular: '(54) 99967-2810' })).toEqual(['(54) 99967-2810'])
    })

    it('mantém dois números diferentes, ignora vazios e formatação', () => {
        expect(contatosDistintos({ telefone: '(54) 3291-6341', celular: '54 99967-2810' })).toEqual(['(54) 3291-6341', '54 99967-2810'])
        expect(contatosDistintos({ telefone: '(54) 3000-0000', celular: '54 3000 0000' })).toEqual(['(54) 3000-0000'])
        expect(contatosDistintos({ telefone: null, celular: '' })).toEqual([])
        expect(contatosDistintos(undefined)).toEqual([])
    })
})
