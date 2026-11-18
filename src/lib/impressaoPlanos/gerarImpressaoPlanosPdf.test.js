import { beforeAll, describe, expect, it } from 'vitest'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import {
    LINHAS_QUE_ACOMPANHAM_BLOCO,
    linhasALevarComBloco,
    montarSecoesImpressao,
    paginarSecoesPlanos,
} from './gerarImpressaoPlanosPdf.js'
import {
    ALTURA_CABECALHO_BLOCO,
    PADDING_FINAL_BLOCO,
    alturasItensBloco,
} from '../pdf/blocoInformacoesPdf.js'
import { medirItemObservacaoModelo } from '../pdf/observacoesModeloPdf.js'

// Página falsa que grava as chamadas de desenho (fontes reais Helvetica para as medidas).
const WIDTH = 595.28
const HEIGHT = 841.89
const MARGIN_TOP = 86
const SECTION_GAP = 16
const MARGIN_BOTTOM = 58

let fonts

beforeAll(async () => {
    const doc = await PDFDocument.create()
    const regular = await doc.embedFont(StandardFonts.Helvetica)
    const bold = await doc.embedFont(StandardFonts.HelveticaBold)
    fonts = { light: regular, regular, bold, medium: regular, italic: regular }
})

function criarPaginaFalsa() {
    const chamadas = []
    const gravar = (op) => (...args) => chamadas.push({ op, args })
    return {
        chamadas,
        drawText: gravar('drawText'),
        drawLine: gravar('drawLine'),
        drawRectangle: gravar('drawRectangle'),
        drawSvgPath: gravar('drawSvgPath'),
        drawImage: gravar('drawImage'),
        drawCircle: gravar('drawCircle'),
    }
}

async function paginar(categorias, observacoesPorGrupo) {
    const secoes = montarSecoesImpressao(categorias, observacoesPorGrupo)
    const paginas = []
    await paginarSecoesPlanos({
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

function categoria(id, nome, nLinhas, extra = {}) {
    return {
        id,
        nome,
        linhas: Array.from({ length: nLinhas }, (_, i) => ({
            procedimentoId: 1000 + i,
            nome: `Procedimento ${id}-${i + 1}`,
            diferenca: 'R$ 10,00',
            carencia: '30 dias',
            limite: '1 por ano',
            ...(extra.linha || {}),
        })),
        ...(extra.cat || {}),
    }
}

const textoLongo =
    'Este procedimento exige autorizacao previa da central e apresentacao do pedido medico ' +
    'veterinario com assinatura e carimbo, alem de exames complementares quando solicitados ' +
    'pela auditoria, conforme regulamento vigente do plano contratado pelo tutor do animal.'

describe('linhasALevarComBloco', () => {
    it('leva as últimas linhas só quando a fatia é vazia, deixando ao menos 1', () => {
        expect(LINHAS_QUE_ACOMPANHAM_BLOCO).toBe(2)
        expect(linhasALevarComBloco({ linhasNestaPagina: 10, fatiaVazia: false })).toBe(0)
        expect(linhasALevarComBloco({ linhasNestaPagina: 0, fatiaVazia: true })).toBe(0)
        expect(linhasALevarComBloco({ linhasNestaPagina: 1, fatiaVazia: true })).toBe(0)
        expect(linhasALevarComBloco({ linhasNestaPagina: 2, fatiaVazia: true })).toBe(1)
        expect(linhasALevarComBloco({ linhasNestaPagina: 3, fatiaVazia: true })).toBe(2)
        expect(linhasALevarComBloco({ linhasNestaPagina: 10, fatiaVazia: true })).toBe(2)
        expect(linhasALevarComBloco({ linhasNestaPagina: 10, fatiaVazia: true, max: 3 })).toBe(3)
    })
})

describe('paginarSecoesPlanos — bloco Informações por grupo', () => {
    it('seção sem observações: nenhum bloco, cartão termina no padding do card', async () => {
        const paginas = await paginar([categoria(1, 'Consultas', 3)], {})
        expect(paginas).toHaveLength(1)
        expect(textos(paginas[0])).not.toContain('Informações')
        const [cartao] = cartoes(paginas[0])
        const topoLinhas = HEIGHT - MARGIN_TOP - SECTION_GAP - 44 - 36
        expect(cartao.bottom).toBeCloseTo(topoLinhas - 3 * 34 - 12, 6)
    })

    it('1 observação curta: bloco dentro do cartão, que vai até o fim do bloco', async () => {
        const paginas = await paginar(
            [categoria(1, 'Consultas', 3), categoria(2, 'Exames', 2)],
            { 1: [{ titulo: 'Aviso', mensagem: 'Levar documento.' }] },
        )
        expect(paginas).toHaveLength(1)
        const t = textos(paginas[0])
        expect(t.filter((x) => x === 'Informações')).toHaveLength(1)
        expect(numerosItens(paginas[0])).toEqual([1])
        const [c1, c2] = cartoes(paginas[0])
        const topoLinhas = HEIGHT - MARGIN_TOP - SECTION_GAP - 44 - 36
        const yFimLinhas = topoLinhas - 3 * 34
        // O cartão passa do fim das linhas pelo bloco inteiro (sem somar CARD_PADDING_BOTTOM).
        expect(c1.bottom).toBeLessThan(yFimLinhas - ALTURA_CABECALHO_BLOCO)
        const sep = paginas[0].chamadas.find(
            (c) => c.op === 'drawLine' && c.args[0].start.y === yFimLinhas - 8,
        )
        expect(sep).toBeTruthy()
        // Próxima seção mantém o mesmo espaçamento entre cartões de hoje (2 × SECTION_GAP).
        expect(c1.bottom - c2.top).toBeCloseTo(2 * SECTION_GAP, 6)
        // Nada é desenhado abaixo do cartão da primeira seção (entre ele e o seguinte).
        const textoAbaixo = paginas[0].chamadas.filter(
            (c) => c.op === 'drawText' && c.args[1].y < c1.bottom && c.args[1].y > c2.top,
        )
        expect(textoAbaixo).toEqual([])
        // O último texto do bloco fica dentro do cartão.
        const textosBloco = paginas[0].chamadas.filter(
            (c) => c.op === 'drawText' && c.args[1].y < yFimLinhas && c.args[1].y > c1.bottom,
        )
        expect(textosBloco.length).toBeGreaterThan(0)
        // A seção sem observações não ganha bloco.
        expect(c2.bottom).toBeCloseTo(c2.top - 44 - 36 - 2 * 34 - 12, 6)
    })

    it('muitas observações longas: divide em páginas, título repetido, numeração continua', async () => {
        const obs = Array.from({ length: 14 }, (_, i) => ({
            titulo: `Regra ${i + 1}`,
            mensagem: textoLongo,
        }))
        const paginas = await paginar(
            [categoria(1, 'Cirurgias', 4), categoria(2, 'Exames', 2)],
            { 1: obs },
        )
        expect(paginas.length).toBeGreaterThanOrEqual(2)
        const todos = paginas.flatMap(numerosItens)
        expect(todos).toEqual(Array.from({ length: 14 }, (_, i) => i + 1))
        expect(numerosItens(paginas[0]).length).toBeGreaterThan(0)
        expect(numerosItens(paginas[1])[0]).toBe(numerosItens(paginas[0]).length + 1)
        // Página de continuação: barra de título do grupo repetida, sem cabeçalho de tabela.
        const t2 = textos(paginas[1])
        expect(t2).toContain('Grupo de ')
        expect(t2).toContain('Cirurgias')
        expect(t2).toContain('Informações')
        // Cabeçalho de tabela só aparece depois, no cartão da seção seguinte (Exames).
        const iInfo = t2.indexOf('Informações')
        expect(iInfo).toBeGreaterThanOrEqual(0)
        expect(t2.slice(0, iInfo)).not.toContain('Procedimento')
        expect(t2.indexOf('Exames')).toBeGreaterThan(iInfo)
        // Nenhum cartão passa da margem inferior.
        for (const p of paginas) {
            for (const c of cartoes(p)) expect(c.bottom).toBeGreaterThanOrEqual(MARGIN_BOTTOM - 1e-6)
        }
        // A seção seguinte aparece depois do bloco (na última página).
        const ultima = paginas[paginas.length - 1]
        expect(textos(ultima)).toContain('Exames')
    })

    it('bloco que só cabia descontando o padding do cartão agora fica na mesma página', async () => {
        // A (2 linhas) + B (10 linhas) deixam ~57,9pt entre o fim das linhas de B e o limite
        // das linhas (MARGIN_BOTTOM + CARD_PADDING_BOTTOM): o bloco (35 + 23,5 + 4 = 62,5) não
        // cabia; com o limite MARGIN_BOTTOM (~69,9pt) cabe.
        const obs = [{ titulo: 'Aviso', mensagem: 'Levar documento.' }]
        const secoes = montarSecoesImpressao([categoria(1, 'A', 2), categoria(2, 'B', 10)], {
            2: obs,
        })
        const [hItem] = alturasItensBloco({
            itens: secoes[1].infoItens,
            innerW: WIDTH - 2 * 42,
            medirItem: (item, w) => medirItemObservacaoModelo(item, fonts, w),
        })
        const alturaBloco = ALTURA_CABECALHO_BLOCO + hItem + PADDING_FINAL_BLOCO
        const yFimLinhasB =
            HEIGHT - MARGIN_TOP - (SECTION_GAP + 44 + 36 + 2 * 34 + 12) - (SECTION_GAP + 44 + 36) -
            SECTION_GAP - 10 * 34
        expect(yFimLinhasB - (MARGIN_BOTTOM + 12)).toBeLessThan(alturaBloco)
        expect(yFimLinhasB - MARGIN_BOTTOM).toBeGreaterThanOrEqual(alturaBloco)

        const paginas = await paginar([categoria(1, 'A', 2), categoria(2, 'B', 10)], { 2: obs })
        expect(paginas).toHaveLength(1)
        expect(numerosItens(paginas[0])).toEqual([1])
        const [, cB] = cartoes(paginas[0])
        expect(cB.bottom).toBeCloseTo(yFimLinhasB - alturaBloco, 6)
        expect(cB.bottom).toBeGreaterThanOrEqual(MARGIN_BOTTOM - 1e-6)
    })

    it('nenhum item cabe: as 2 últimas linhas vão para a página seguinte junto com o bloco', async () => {
        // 17 linhas de 34 deixam ~23,9pt até MARGIN_BOTTOM: nenhum item cabe.
        const paginas = await paginar([categoria(1, 'Consultas', 17)], {
            1: [{ titulo: 'Aviso', mensagem: 'Levar documento.' }],
        })
        expect(paginas).toHaveLength(2)
        const t1 = textos(paginas[0])
        expect(t1).not.toContain('Informações')
        expect(t1).toContain('Procedimento 1-15')
        expect(t1).not.toContain('Procedimento 1-16')
        expect(t1).not.toContain('Procedimento 1-17')
        const [c1] = cartoes(paginas[0])
        const topoLinhas = HEIGHT - MARGIN_TOP - SECTION_GAP - 44 - 36
        expect(c1.bottom).toBeCloseTo(topoLinhas - 15 * 34 - 12, 6)

        const t2 = textos(paginas[1])
        const ordem = ['Grupo de ', 'Consultas', 'Procedimento', 'Procedimento 1-16', 'Procedimento 1-17', 'Informações']
        const posicoes = ordem.map((x) => t2.indexOf(x))
        expect(posicoes.every((p) => p >= 0)).toBe(true)
        expect([...posicoes].sort((a, b) => a - b)).toEqual(posicoes)
        expect(numerosItens(paginas[1])).toEqual([1])
        // Um único cartão na página seguinte: linhas e bloco juntos.
        expect(cartoes(paginas[1])).toHaveLength(1)
    })

    it('seção com 1 linha na página e bloco que não cabe: nada é levado', async () => {
        // A (12 linhas) empurra B (1 linha) para perto do fim; o bloco de B não cabe.
        const paginas = await paginar([categoria(1, 'A', 12), categoria(2, 'B', 1)], {
            2: [{ titulo: 'Aviso', mensagem: 'Levar documento.' }],
        })
        expect(paginas).toHaveLength(2)
        expect(textos(paginas[0])).toContain('Procedimento 2-1')
        expect(textos(paginas[0])).not.toContain('Informações')
        const t2 = textos(paginas[1])
        expect(t2).not.toContain('Procedimento 2-1')
        expect(t2).not.toContain('Procedimento')
        expect(numerosItens(paginas[1])).toEqual([1])
    })

    it('seção com 2 linhas na página e bloco que não cabe: só 1 linha é levada', async () => {
        const paginas = await paginar([categoria(1, 'A', 11), categoria(2, 'B', 2)], {
            2: [{ titulo: 'Aviso', mensagem: 'Levar documento.' }],
        })
        expect(paginas).toHaveLength(2)
        expect(textos(paginas[0])).toContain('Procedimento 2-1')
        expect(textos(paginas[0])).not.toContain('Procedimento 2-2')
        expect(textos(paginas[0])).not.toContain('Informações')
        const t2 = textos(paginas[1])
        expect(t2).toContain('Procedimento 2-2')
        expect(t2.indexOf('Procedimento 2-2')).toBeLessThan(t2.indexOf('Informações'))
        expect(numerosItens(paginas[1])).toEqual([1])
    })

    it('limite mesclado com linhas levadas: célula fechada aqui e reaberta na seguinte', async () => {
        const cat = categoria(1, 'Vacinas', 17, {
            cat: { limiteGrupoValor: '2', textoLimiteGrupo: '2 por ano no grupo' },
        })
        const paginas = await paginar([cat], { 1: [{ titulo: 'Aviso', mensagem: 'Texto.' }] })
        expect(paginas).toHaveLength(2)
        const topoLinhas = HEIGHT - MARGIN_TOP - SECTION_GAP - 44 - 36
        // Só a célula mesclada é retângulo fora da margem esquerda (linhas e cabeçalho começam em 42).
        const celulas = (p) =>
            p.chamadas.filter((c) => c.op === 'drawRectangle' && c.args[0].x > 42)
        expect(celulas(paginas[0])).toHaveLength(1)
        expect(celulas(paginas[1])).toHaveLength(1)
        const [cel1] = celulas(paginas[0])
        expect(cel1.args[0].height).toBeCloseTo(15 * 34, 6)
        expect(cel1.args[0].y).toBeCloseTo(topoLinhas - 15 * 34, 6)
        const [cel2] = celulas(paginas[1])
        expect(cel2.args[0].height).toBeCloseTo(2 * 34, 6)
        for (const p of paginas) {
            expect(textos(p).filter((x) => x === '2 por ano no grupo')).toHaveLength(1)
        }
        const nomes = paginas.flatMap(textos).filter((x) => /^Procedimento 1-\d+$/.test(x))
        expect(nomes).toEqual(Array.from({ length: 17 }, (_, i) => `Procedimento 1-${i + 1}`))
        // Na seguinte, a célula mesclada é desenhada antes do bloco.
        const idxCel = paginas[1].chamadas.indexOf(cel2)
        const idxInfo = paginas[1].chamadas.findIndex(
            (c) => c.op === 'drawText' && c.args[0] === 'Informações',
        )
        expect(idxInfo).toBeGreaterThan(idxCel)
        expect(numerosItens(paginas[1])).toEqual([1])
    })

    it('limite de grupo mesclado é fechado antes do bloco', async () => {
        const cat = categoria(1, 'Vacinas', 4, {
            cat: { limiteGrupoValor: '2', textoLimiteGrupo: '2 por ano no grupo' },
        })
        const paginas = await paginar([cat], { 1: [{ titulo: 'Aviso', mensagem: 'Texto.' }] })
        expect(paginas).toHaveLength(1)
        const topoLinhas = HEIGHT - MARGIN_TOP - SECTION_GAP - 44 - 36
        const yFimLinhas = topoLinhas - 4 * 34
        const celulaMesclada = paginas[0].chamadas.find(
            (c) => c.op === 'drawRectangle' && c.args[0].height === 4 * 34 && c.args[0].x > 42,
        )
        expect(celulaMesclada.args[0].y).toBeCloseTo(yFimLinhas, 6)
        expect(textos(paginas[0])).toContain('2 por ano no grupo')
        // O bloco é desenhado depois da célula mesclada.
        const idxCelula = paginas[0].chamadas.indexOf(celulaMesclada)
        const idxInfo = paginas[0].chamadas.findIndex(
            (c) => c.op === 'drawText' && c.args[0] === 'Informações',
        )
        expect(idxInfo).toBeGreaterThan(idxCelula)
    })

    it('observações de categoria sem linhas impressas não saem e não travam', async () => {
        const vazia = categoria(9, 'Vazia', 2, { linha: { checked: false } })
        const paginas = await paginar([vazia, categoria(1, 'Consultas', 2)], {
            9: [{ titulo: 'X', mensagem: 'Nao sai.' }],
        })
        expect(paginas).toHaveLength(1)
        expect(textos(paginas[0])).not.toContain('Informações')
    })

    it('varredura: qualquer ponto de fim das linhas não perde nem repete item', async () => {
        const obs = Array.from({ length: 5 }, (_, i) => ({
            titulo: `Regra ${i + 1}`,
            mensagem: i % 2 ? textoLongo : 'Curta.',
        }))
        const esperadas = (id, n) => Array.from({ length: n }, (_, i) => `Procedimento ${id}-${i + 1}`)
        for (const grupo of [false, true]) {
            for (let n = 1; n <= 40; n += 1) {
                const extra = grupo
                    ? { cat: { limiteGrupoValor: '2', textoLimiteGrupo: '2 por ano no grupo' } }
                    : {}
                const paginas = await paginar([categoria(1, 'A', n, extra), categoria(2, 'B', 3)], {
                    1: obs,
                })
                expect(paginas.flatMap(numerosItens)).toEqual([1, 2, 3, 4, 5])
                // Toda linha aparece exatamente uma vez, em ordem.
                const nomes = paginas.flatMap(textos).filter((x) => /^Procedimento \d-\d+$/.test(x))
                expect(nomes).toEqual([...esperadas(1, n), ...esperadas(2, 3)])
                if (grupo) {
                    // O texto do limite mesclado aparece em toda página com linhas de A.
                    for (const p of paginas) {
                        const temA = textos(p).some((x) => /^Procedimento 1-\d+$/.test(x))
                        expect(textos(p).includes('2 por ano no grupo')).toBe(temA)
                    }
                }
                for (const p of paginas) {
                    for (const c of cartoes(p)) {
                        expect(c.bottom).toBeGreaterThanOrEqual(MARGIN_BOTTOM - 1e-6)
                    }
                }
                expect(textos(paginas[paginas.length - 1])).toContain('B')
                expect(paginas.length).toBeLessThan(10)
            }
        }
    })
})
