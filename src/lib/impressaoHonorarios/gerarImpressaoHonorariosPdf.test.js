import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { montarSecoesImpressao, paginarSecoesHonorarios } from './gerarImpressaoHonorariosPdf.js'
import {
    HEIGHT,
    WIDTH,
    criarFontes,
    criarPaginaFalsa,
    secoesCenarioSemObservacoes,
    serializarChamadas,
} from './paginaFalsaHonorarios.testutil.js'

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
