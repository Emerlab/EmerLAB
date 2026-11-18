// Utilitários de teste: página falsa que grava as chamadas de desenho e cenário de referência.
import { PDFDocument, StandardFonts } from 'pdf-lib'

export const WIDTH = 595.28
export const HEIGHT = 841.89

export async function criarFontes() {
    const doc = await PDFDocument.create()
    const regular = await doc.embedFont(StandardFonts.Helvetica)
    const bold = await doc.embedFont(StandardFonts.HelveticaBold)
    return { light: regular, regular, bold, medium: regular, italic: regular }
}

export function criarPaginaFalsa() {
    const chamadas = []
    const gravar =
        (op) =>
        (...args) =>
            chamadas.push({ op, args })
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

/** Serialização estável das chamadas (fontes viram o nome, números arredondados). */
export function serializarChamadas(paginas) {
    return JSON.parse(
        JSON.stringify(
            paginas.map((p) => p.chamadas),
            (_k, v) => {
                if (v && typeof v === 'object' && typeof v.widthOfTextAtSize === 'function') {
                    return `font:${v.name}`
                }
                if (typeof v === 'number') return Math.round(v * 10000) / 10000
                return v
            },
        ),
    )
}

/** Cenário de referência SEM observações: várias seções, nomes longos, várias páginas. */
export function secoesCenarioSemObservacoes() {
    const linhas = (prefixo, n, nomeLongo = false) =>
        Array.from({ length: n }, (_, i) => ({
            codigo: `${prefixo}${i + 1}`,
            procedimento: nomeLongo
                ? `${prefixo} procedimento com nome bastante comprido para quebrar em varias linhas ${i + 1}`
                : `${prefixo} procedimento ${i + 1}`,
            porteP: 10 + i,
            porteM: 20 + i,
            porteG: 30 + i,
        }))
    return [
        { categoriaNome: 'Consultas', linhas: linhas('Con', 30) },
        { categoriaNome: 'Cirurgias', linhas: linhas('Cir', 22, true) },
        { categoriaNome: 'Exames', linhas: linhas('Exa', 3) },
    ]
}
