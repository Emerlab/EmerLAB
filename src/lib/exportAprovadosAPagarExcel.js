import { formatarDataAtualizadoEm } from './pagamentosRegistros.js'
import { rotuloMesAnoCurto, rotuloTipoRepasse } from './pagamentosPrestador.js'
import { valorAReceber } from './pagamentosValor.js'

const arred = (n) => Math.round(Number(n || 0) * 100) / 100

/**
 * Linhas da exportação de «Aprovados a pagar» a partir dos grupos de `agruparPendenciasPorPrestador`.
 * O desconto do RPA é aplicado mês a mês; o total do prestador é a soma dos meses já descontados.
 */
export function montarLinhasAprovadosAPagar(grupos) {
    const resumo = []
    const meses = []
    for (const g of grupos || []) {
        let bruto = 0
        let liquido = 0
        for (const m of g.meses) {
            const b = arred(m.valor)
            const l = arred(valorAReceber(g.tipoRepasse, m.valor))
            bruto += b
            liquido += l
            meses.push({
                prestador: g.prestadorNome,
                tipo: rotuloTipoRepasse(g.tipoRepasse),
                pix: g.chavePix || '',
                competencia: rotuloMesAnoCurto(m.mes, m.ano),
                bruto: b,
                desconto: arred(b - l),
                aPagar: l,
                respostaEm: formatarDataAtualizadoEm(m.atualizadoEm),
            })
        }
        resumo.push({
            prestador: g.prestadorNome,
            tipo: rotuloTipoRepasse(g.tipoRepasse),
            pix: g.chavePix || '',
            qtdMeses: g.meses.length,
            competencias: g.meses.map((m) => rotuloMesAnoCurto(m.mes, m.ano)).join(', '),
            bruto: arred(bruto),
            desconto: arred(bruto - liquido),
            aPagar: arred(liquido),
        })
    }
    return { resumo, meses }
}

export async function exportarAprovadosAPagarExcel(grupos) {
    const { resumo, meses } = montarLinhasAprovadosAPagar(grupos)
    if (!resumo.length) return { ok: false, erro: 'Nenhum prestador para exportar.' }

    const { default: ExcelJS } = await import('exceljs')
    const wb = new ExcelJS.Workbook()
    const moeda = '"R$" #,##0.00'

    const montar = (nome, colunas, linhas, totais) => {
        const ws = wb.addWorksheet(nome, { views: [{ state: 'frozen', ySplit: 1 }] })
        ws.columns = colunas
        ws.addRows(linhas)
        const cab = ws.getRow(1)
        cab.font = { bold: true }
        cab.alignment = { vertical: 'middle', wrapText: true }
        for (const c of colunas) if (c.moeda) ws.getColumn(c.key).numFmt = moeda
        const total = ws.addRow(totais(linhas))
        total.font = { bold: true }
        ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: colunas.length } }
    }
    const soma = (linhas, k) => arred(linhas.reduce((t, l) => t + l[k], 0))

    montar(
        'Por prestador',
        [
            { header: 'Prestador', key: 'prestador', width: 38 },
            { header: 'Tipo', key: 'tipo', width: 12 },
            { header: 'Chave PIX', key: 'pix', width: 32 },
            { header: 'Meses', key: 'qtdMeses', width: 8 },
            { header: 'Competências', key: 'competencias', width: 34 },
            { header: 'Valor bruto', key: 'bruto', width: 15, moeda: true },
            { header: 'Desconto RPA', key: 'desconto', width: 15, moeda: true },
            { header: 'Total a pagar', key: 'aPagar', width: 16, moeda: true },
        ],
        resumo,
        (l) => ({ prestador: 'TOTAL', qtdMeses: l.reduce((t, x) => t + x.qtdMeses, 0), bruto: soma(l, 'bruto'), desconto: soma(l, 'desconto'), aPagar: soma(l, 'aPagar') }),
    )
    montar(
        'Por competência',
        [
            { header: 'Prestador', key: 'prestador', width: 38 },
            { header: 'Tipo', key: 'tipo', width: 12 },
            { header: 'Chave PIX', key: 'pix', width: 32 },
            { header: 'Competência', key: 'competencia', width: 14 },
            { header: 'Valor bruto', key: 'bruto', width: 15, moeda: true },
            { header: 'Desconto RPA', key: 'desconto', width: 15, moeda: true },
            { header: 'A pagar', key: 'aPagar', width: 15, moeda: true },
            { header: 'Resposta em', key: 'respostaEm', width: 14 },
        ],
        meses,
        (l) => ({ prestador: 'TOTAL', bruto: soma(l, 'bruto'), desconto: soma(l, 'desconto'), aPagar: soma(l, 'aPagar') }),
    )

    const buffer = await wb.xlsx.writeBuffer()
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `aprovados-a-pagar-${new Date().toISOString().slice(0, 10)}.xlsx`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    return { ok: true, totalLinhas: resumo.length }
}
