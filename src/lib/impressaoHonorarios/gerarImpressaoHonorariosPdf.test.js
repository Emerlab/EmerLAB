import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { ALTURA_CABECALHO_BLOCO } from '../pdf/blocoInformacoesPdf.js'
import { chaveGrupoHonorarios } from './honorariosObservacoes.js'
import { montarSecoesImpressao, paginarSecoesHonorarios } from './gerarImpressaoHonorariosPdf.js'
import {
    HEIGHT,
    WIDTH,
    criarFontes,
    criarPaginaFalsa,
    secoesCenarioSemObservacoes,
    serializarChamadas,
} from './paginaFalsaHonorarios.testutil.js'

const MARGIN_TOP = 86
const SECTION_GAP = 16
const MARGIN_BOTTOM = 58

let fonts

beforeAll(async () => {
    fonts = await criarFontes()
})

async function paginar(secoesEntrada, observacoesPorGrupo) {
    const secoes = montarSecoesImpressao(secoesEntrada, observacoesPorGrupo)
    const paginas = []
    await paginarSecoesHonorarios({
        secoes,
        fonts,
        width: WIDTH,
        height: HEIGHT,
        iconeEstetoscopio: null,
        novaPagina: async () => {
            const p = criarPaginaFalsa()
            paginas.push(p)
            return p
        },
    })
    return paginas
}

function textos(pagina) {
    return pagina.chamadas.filter((c) => c.op === 'drawText').map((c) => c.args[0])
}

/** Altura do cartão lida do caminho SVG: maior y entre os pontos finais dos comandos (M/L/A). */
function alturaDoCaminho(d) {
    let h = 0
    for (const [, , args] of d.matchAll(/([MLA])([^MLAZ]*)/g)) {
        const n = args.trim().split(/\s+/).map(Number)
        h = Math.max(h, n[n.length - 1])
    }
    return h
}

/** Cartões brancos (retângulo arredondado completo, não a barra de título só com topo). */
function cartoes(pagina) {
    return pagina.chamadas
        .filter((c) => c.op === 'drawSvgPath' && !c.args[0].startsWith('M 0 '))
        .map((c) => {
            const h = alturaDoCaminho(c.args[0])
            return { top: c.args[1].y, bottom: c.args[1].y - h }
        })
}

function numerosItens(pagina) {
    return textos(pagina)
        .filter((t) => /^\d+\) $/.test(t))
        .map((t) => Number(t.replace(') ', '')))
}

function secao(nome, nLinhas, extra = {}) {
    return {
        categoriaNome: nome,
        linhas: Array.from({ length: nLinhas }, (_, i) => ({
            codigo: `${nome}${i}`,
            procedimento: `Procedimento ${nome}-${i + 1}`,
            porteP: 10,
            porteM: 20,
            porteG: 30,
            ...(extra.linha || {}),
        })),
    }
}

const textoLongo =
    'Este procedimento exige autorizacao previa da central e apresentacao do pedido medico ' +
    'veterinario com assinatura e carimbo, alem de exames complementares quando solicitados ' +
    'pela auditoria, conforme regulamento vigente do plano contratado pelo tutor do animal.'

describe('paginarSecoesHonorarios — linha de base sem observações', () => {
    it('desenha exatamente o que o código anterior às observações por grupo desenhava', async () => {
        // O JSON foi gerado a partir do gerador ANTES da mudança (mesmo cenário, página falsa).
        const esperado = JSON.parse(
            readFileSync(new URL('./baseline-sem-observacoes.json', import.meta.url), 'utf8'),
        )
        expect(esperado.length).toBeGreaterThan(1)
        const paginas = await paginar(secoesCenarioSemObservacoes(), {})
        expect(serializarChamadas(paginas)).toEqual(esperado)
    })
})

describe('chave do grupo', () => {
    it('a chave usada pelo gerador é a mesma que o resolvedor produz para a mesma seção', () => {
        const entradas = [
            secao('Consultas', 1),
            { nome: 'Só nome', linhas: secao('x', 1).linhas },
            { categoriaNome: '', nome: '', linhas: secao('y', 1).linhas },
            { linhas: secao('z', 1).linhas },
        ]
        const geradas = montarSecoesImpressao(entradas, {})
        expect(geradas.map((s) => s.nome)).toEqual(entradas.map(chaveGrupoHonorarios))
    })

    it('observações são buscadas pela chave do resolvedor', () => {
        const [g] = montarSecoesImpressao([secao('Consultas', 1)], {
            Consultas: [{ titulo: 'A', mensagem: 'B' }],
        })
        expect(g.infoItens).toEqual([{ titulo: 'A', mensagem: 'B' }])
    })
})

describe('paginarSecoesHonorarios — bloco Informações por grupo', () => {
    const topoLinhas = HEIGHT - MARGIN_TOP - SECTION_GAP - 44 - 36

    it('seção sem observações: nenhum bloco, cartão termina no padding do card', async () => {
        const paginas = await paginar([secao('Consultas', 3)], {})
        expect(paginas).toHaveLength(1)
        expect(textos(paginas[0])).not.toContain('Informações')
        const [cartao] = cartoes(paginas[0])
        expect(cartao.bottom).toBeCloseTo(topoLinhas - 3 * 34 - 12, 6)
    })

    it('1 observação curta: bloco dentro do cartão, que vai até o fim do bloco', async () => {
        const paginas = await paginar([secao('Consultas', 3), secao('Exames', 2)], {
            Consultas: [{ titulo: 'Aviso', mensagem: 'Levar documento.' }],
        })
        expect(paginas).toHaveLength(1)
        expect(textos(paginas[0]).filter((x) => x === 'Informações')).toHaveLength(1)
        expect(numerosItens(paginas[0])).toEqual([1])
        const [c1, c2] = cartoes(paginas[0])
        const yFimLinhas = topoLinhas - 3 * 34
        expect(c1.bottom).toBeLessThan(yFimLinhas - ALTURA_CABECALHO_BLOCO)
        const sep = paginas[0].chamadas.find(
            (c) => c.op === 'drawLine' && c.args[0].start.y === yFimLinhas - 14,
        )
        expect(sep).toBeTruthy()
        expect(c1.bottom - c2.top).toBeCloseTo(2 * SECTION_GAP, 6)
        // A seção sem observações não ganha bloco.
        expect(c2.bottom).toBeCloseTo(c2.top - 44 - 36 - 2 * 34 - 12, 6)
    })

    it('muitas observações longas: divide em páginas, título repetido, numeração continua', async () => {
        const obs = Array.from({ length: 14 }, (_, i) => ({
            titulo: `Regra ${i + 1}`,
            mensagem: textoLongo,
        }))
        const paginas = await paginar([secao('Cirurgias', 4), secao('Exames', 2)], {
            Cirurgias: obs,
        })
        expect(paginas.length).toBeGreaterThanOrEqual(2)
        expect(paginas.flatMap(numerosItens)).toEqual(Array.from({ length: 14 }, (_, i) => i + 1))
        expect(numerosItens(paginas[0]).length).toBeGreaterThan(0)
        expect(numerosItens(paginas[1])[0]).toBe(numerosItens(paginas[0]).length + 1)
        const t2 = textos(paginas[1])
        expect(t2).toContain('Grupo de ')
        expect(t2).toContain('Cirurgias')
        expect(t2).toContain('Informações')
        const iInfo = t2.indexOf('Informações')
        expect(iInfo).toBeGreaterThanOrEqual(0)
        expect(t2.slice(0, iInfo)).not.toContain('Nome')
        expect(t2.indexOf('Exames')).toBeGreaterThan(iInfo)
        for (const p of paginas) {
            for (const c of cartoes(p)) expect(c.bottom).toBeGreaterThanOrEqual(MARGIN_BOTTOM - 1e-6)
        }
        expect(textos(paginas[paginas.length - 1])).toContain('Exames')
    })

    it('linhas terminam perto do limite: o bloco inteiro vai para a página seguinte', async () => {
        const paginas = await paginar([secao('Consultas', 17)], {
            Consultas: [{ titulo: 'Aviso', mensagem: 'Levar documento.' }],
        })
        expect(paginas).toHaveLength(2)
        expect(textos(paginas[0])).not.toContain('Informações')
        const [c1] = cartoes(paginas[0])
        expect(c1.bottom).toBeCloseTo(topoLinhas - 17 * 34 - 12, 6)
        expect(numerosItens(paginas[1])).toEqual([1])
        expect(textos(paginas[1])).toContain('Consultas')
        expect(textos(paginas[1])).not.toContain('Nome')
    })

    it('observações de categoria sem linhas impressas não saem e não travam', async () => {
        const vazia = secao('Vazia', 2, { linha: { checked: false } })
        const paginas = await paginar([vazia, secao('Consultas', 2)], {
            Vazia: [{ titulo: 'X', mensagem: 'Nao sai.' }],
        })
        expect(paginas).toHaveLength(1)
        expect(textos(paginas[0])).not.toContain('Informações')
    })

    it('varredura: qualquer ponto de fim das linhas não perde nem repete item', async () => {
        const obs = Array.from({ length: 5 }, (_, i) => ({
            titulo: `Regra ${i + 1}`,
            mensagem: i % 2 ? textoLongo : 'Curta.',
        }))
        for (let n = 1; n <= 40; n += 1) {
            const paginas = await paginar([secao('A', n), secao('B', 3)], { A: obs })
            expect(paginas.flatMap(numerosItens)).toEqual([1, 2, 3, 4, 5])
            for (const p of paginas) {
                for (const c of cartoes(p)) {
                    expect(c.bottom).toBeGreaterThanOrEqual(MARGIN_BOTTOM - 1e-6)
                }
            }
            expect(textos(paginas[paginas.length - 1])).toContain('B')
            expect(paginas.length).toBeLessThan(10)
        }
    })
})
