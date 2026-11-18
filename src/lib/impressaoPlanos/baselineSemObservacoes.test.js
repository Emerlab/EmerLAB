import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { montarSecoesImpressao, paginarSecoesPlanos } from './gerarImpressaoPlanosPdf.js'
import {
    HEIGHT,
    WIDTH,
    cenariosPlanosSemObservacoes,
    criarFontes,
    criarPaginaFalsa,
    serializarChamadas,
} from './paginaFalsaPlanos.testutil.js'

let fonts
beforeAll(async () => {
    fonts = await criarFontes()
})

describe('paginarSecoesPlanos — linha de base sem observações', () => {
    // O JSON foi gerado com o gerador de antes da feature (commit 3248696) e confirmado idêntico
    // ao código atual com observacoesPorGrupo = {}; aqui só trava o desenho.
    const esperado = JSON.parse(
        readFileSync(new URL('./baseline-sem-observacoes.json', import.meta.url), 'utf8'),
    )

    for (const [nome, categorias] of Object.entries(cenariosPlanosSemObservacoes())) {
        it(`desenha exatamente o que o código anterior desenhava: ${nome}`, async () => {
            expect(esperado[nome].length).toBeGreaterThan(1)
            const paginas = []
            await paginarSecoesPlanos({
                secoes: montarSecoesImpressao(categorias, {}),
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
            expect(serializarChamadas(paginas)).toEqual(esperado[nome])
        })
    }
})
