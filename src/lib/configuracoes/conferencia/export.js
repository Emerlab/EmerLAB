import { statusEhDivergencia, resumirConferencia } from './index.js'

const COLUNAS_PLANAS = [
    { header: 'status', key: 'status', width: 24 },
    { header: 'tutor_plano', key: 'tutor_plano', width: 28 },
    { header: 'tutor_laboratorio', key: 'tutor_laboratorio', width: 28 },
    { header: 'pet_plano', key: 'pet_plano', width: 16 },
    { header: 'pet_laboratorio', key: 'pet_laboratorio', width: 16 },
    { header: 'data_plano', key: 'data_plano', width: 14 },
    { header: 'data_laboratorio', key: 'data_laboratorio', width: 14 },
    { header: 'diferenca_dias', key: 'diferenca_dias', width: 14 },
    { header: 'exame_plano', key: 'exame_plano', width: 36 },
    { header: 'exame_laboratorio', key: 'exame_laboratorio', width: 36 },
    { header: 'valor_plano', key: 'valor_plano', width: 16 },
    { header: 'valor_laboratorio', key: 'valor_laboratorio', width: 16 },
    { header: 'diferenca_valor', key: 'diferenca_valor', width: 16 },
    { header: 'confianca', key: 'confianca', width: 12 },
    { header: 'motivo', key: 'motivo', width: 40 },
    { header: 'acao_resultado', key: 'acao_resultado', width: 16 },
]

function isoParaBr(iso) {
    const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/)
    return m ? `${m[3]}/${m[2]}/${m[1]}` : iso || ''
}

function linhaPlana(r) {
    const dv = r.diferenca_valor
    const sinal = Number.isFinite(Number(dv)) && Number(dv) > 0 ? '+' : ''
    return {
        status: r.status || '',
        tutor_plano: r.tutor_honorarios || '',
        tutor_laboratorio: r.tutor_mellislab || '',
        pet_plano: r.pet_honorarios || '',
        pet_laboratorio: r.pet_mellislab || '',
        data_plano: isoParaBr(r.data_honorarios),
        data_laboratorio: isoParaBr(r.data_mellislab),
        diferenca_dias: r.diferenca_dias == null ? '' : r.diferenca_dias,
        exame_plano: r.exame_honorarios || '',
        exame_laboratorio: r.exame_mellislab || '',
        valor_plano: r.valor_honorarios ?? '',
        valor_laboratorio: r.valor_mellislab ?? '',
        diferenca_valor:
            dv == null || dv === '' ? '' : `${sinal}${Number(dv).toFixed(2).replace('.', ',')}`,
        confianca: r.confianca || '',
        motivo: r.motivo || '',
        acao_resultado: r.acao || '',
    }
}

function preencherAba(ws, linhas) {
    ws.columns = COLUNAS_PLANAS
    ws.getRow(1).font = { bold: true }
    ws.views = [{ state: 'frozen', ySplit: 1 }]
    for (const r of linhas || []) ws.addRow(linhaPlana(r))
}

function sanitizarNome(nome) {
    return String(nome || 'laboratorio')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 40)
}

export async function exportarConferenciaHonorariosExcel({
    resultados = [],
    resumo = null,
    revisoes = [],
    laboratorioNome = '',
    periodoYm = '',
} = {}) {
    const { default: ExcelJS } = await import('exceljs')
    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'EmerLAB'

    const tot = resumo || resumirConferencia(resultados)
    const wsResumo = workbook.addWorksheet('RESUMO')
    wsResumo.columns = [
        { header: 'Indicador', key: 'indicador', width: 32 },
        { header: 'Quantidade', key: 'quantidade', width: 14 },
        { header: 'Valor', key: 'valor', width: 16 },
    ]
    wsResumo.getRow(1).font = { bold: true }
    const indicadores = [
        ['Laboratório', '', laboratorioNome || ''],
        ['Competência', '', periodoYm || ''],
        ['Total Plano', '', tot.totalHonorarios],
        ['Total Laboratório', '', tot.totalMellis],
        ['Itens conferidos', tot.itensConferidos, ''],
        ['Itens OK', tot.itensOk, ''],
        ['Valores divergentes', tot.valoresDivergentes, ''],
        ['Datas divergentes', tot.datasDivergentes, ''],
        ['Órfãos Laboratório', tot.orfaosMellis, ''],
        ['Órfãos Plano', tot.orfaosHonorarios, ''],
        ['Revisões manuais', tot.revisoesManuais, ''],
        ['Valores aceitos (com justificativa)', tot.valoresAceitos ?? 0, ''],
        ['Linhas ignoradas', tot.ignorados ?? 0, ''],
        ['Diferença financeira', '', tot.diferencaFinanceira],
        ['Valores cobrados a mais', '', tot.valoresCobradosAMais],
        ['Valores cobrados a menos', '', tot.valoresCobradosAMenos],
    ]
    for (const [indicador, quantidade, valor] of indicadores) {
        wsResumo.addRow({ indicador, quantidade, valor })
    }

    preencherAba(workbook.addWorksheet('COMPARACAO'), resultados)
    preencherAba(
        workbook.addWorksheet('DIVERGENCIAS'),
        resultados.filter((r) => statusEhDivergencia(r.status)),
    )
    preencherAba(
        workbook.addWorksheet('ORFAOS_LABORATORIO'),
        resultados.filter((r) => r.status === 'ORFAO_MELLISLAB'),
    )
    preencherAba(
        workbook.addWorksheet('ORFAOS_PLANO'),
        resultados.filter((r) => r.status === 'ORFAO_HONORARIOS'),
    )

    const wsRev = workbook.addWorksheet('REVISOES_MANUAIS')
    wsRev.columns = [
        { header: 'usuario', key: 'usuario', width: 24 },
        { header: 'data_hora', key: 'data_hora', width: 22 },
        { header: 'acao_revisao', key: 'acao_revisao', width: 24 },
        { header: 'registro', key: 'registro', width: 28 },
        { header: 'justificativa', key: 'justificativa', width: 40 },
        ...COLUNAS_PLANAS,
    ]
    wsRev.getRow(1).font = { bold: true }
    // Cada revisão é ligada ao resultado atual pelo id (ou, se a linha foi desfeita, à última linha que a carrega).
    const porId = new Map((resultados || []).map((r) => [r.id, r]))
    const fonteRev = revisoes.length
        ? revisoes
        : (resultados || []).filter((r) => r.revisao).map((r) => ({ ...r.revisao, resultadoId: r.id }))
    for (const item of fonteRev) {
        const r = porId.get(item.resultadoId) || (resultados || []).find((x) => x.revisao === item) || {}
        wsRev.addRow({
            usuario: item.usuario || r.revisao?.usuario || '',
            data_hora: item.dataHora || r.revisao?.dataHora || '',
            acao_revisao: item.acao || r.revisao?.acao || '',
            registro: item.resultadoId || r.id || '',
            justificativa: item.justificativa || r.revisao?.justificativa || '',
            ...linhaPlana(r),
        })
    }

    const buffer = await workbook.xlsx.writeBuffer()
    const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const nomeArquivo = `conferencia-honorarios-${sanitizarNome(laboratorioNome) || 'lab'}${
        periodoYm ? `-${periodoYm}` : ''
    }.xlsx`
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = nomeArquivo
    a.click()
    URL.revokeObjectURL(url)
    return { nomeArquivo, total: (resultados || []).length }
}
