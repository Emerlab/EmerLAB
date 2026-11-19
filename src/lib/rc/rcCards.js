// Lógica compartilhada (pura) dos cards da Rede Credenciada.
// Usada por api/rc-pdf.js e scripts/rc/generate-rc-pdf.mjs. Sem imports de node/puppeteer/supabase.
import { montarRotuloAtendimentoRc } from './rotuloAtendimentoRc.js'
import { buildMapaOrdemRc, ordenarLinhasRc } from './ordenarCardsRc.js'

export const normalizarTexto = (texto) =>
    String(texto || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toUpperCase()

export const escaparHtml = (valor) =>
    String(valor ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;')

export const formatarTelefone = (valor) => {
    const digitos = String(valor || '').replace(/\D/g, '').slice(0, 11)
    if (!digitos) return '-'
    if (digitos.length <= 2) return `(${digitos}`
    if (digitos.length <= 6) return `(${digitos.slice(0, 2)}) ${digitos.slice(2)}`
    if (digitos.length <= 10) return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 6)}-${digitos.slice(6)}`
    return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 7)}-${digitos.slice(7)}`
}

export const textoCredenciado = (descricao) => normalizarTexto(descricao).includes('CREDENCIAD')

export const chunk = (arr, size) => {
    const out = []
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
    return out
}

export const ptParaIn = (pt) => `${Number(pt) / 72}in`

export const montarCards = (base, cidadesSelecionadas) => {
    const cidadePorId = new Map(base.cidades.map((c) => [Number(c.id), c]))
    const situacaoPorId = new Map(base.situacoes.map((s) => [Number(s.id), s]))
    const especialidadePorId = new Map(base.especialidades.map((e) => [Number(e.id), e]))
    const prestadorPorId = new Map(base.prestadores.map((p) => [Number(p.id), p]))
    const cidadesPorPrestador = new Map()
    const especialidadesPorPrestador = new Map()
    const estabelecimentosPorVeterinario = new Map()

    base.prestadorCidades.forEach((item) => {
        const chave = Number(item.prestador_id)
        if (!cidadesPorPrestador.has(chave)) cidadesPorPrestador.set(chave, [])
        cidadesPorPrestador.get(chave).push(item)
    })
    base.prestadorEspecialidades.forEach((item) => {
        const chave = Number(item.prestador_id)
        if (!especialidadesPorPrestador.has(chave)) especialidadesPorPrestador.set(chave, [])
        especialidadesPorPrestador.get(chave).push(item)
    })
    base.prestadorEstabelecimentos.forEach((item) => {
        const chave = Number(item.veterinario_id)
        if (!estabelecimentosPorVeterinario.has(chave)) estabelecimentosPorVeterinario.set(chave, [])
        estabelecimentosPorVeterinario.get(chave).push(item)
    })

    const linhas = base.prestadores.map((prestador) => {
        const cidadesDoPrestador = cidadesPorPrestador.get(Number(prestador.id)) || []
        const cidadePrincipalRel = cidadesDoPrestador.find((item) => item.principal)
        const cidadePrincipalId = Number(prestador.cidade_id || cidadePrincipalRel?.cidade_id || 0)
        const cidadePrincipalNome = cidadePorId.get(cidadePrincipalId)?.nome || '-'
        const cidadesSecundarias = cidadesDoPrestador
            .filter((item) => !item.principal && Number(item.cidade_id) !== cidadePrincipalId)
            .map((item) => cidadePorId.get(Number(item.cidade_id))?.nome)
            .filter(Boolean)
        const especialidadesDoPrestador = especialidadesPorPrestador.get(Number(prestador.id)) || []
        const especialidadePrincipalRel = especialidadesDoPrestador.find((item) => item.principal)
        const especialidadePrincipalId = Number(prestador.especialidade_id || especialidadePrincipalRel?.especialidade_id || 0)
        const especialidadePrincipalObj = especialidadePorId.get(especialidadePrincipalId)
        const especialidadePrincipalNome = especialidadePrincipalObj?.nome || '-'
        const tipoEspecialidade = normalizarTexto(especialidadePrincipalObj?.tipo || '')
        const nomesEspecialidadesPrestador = especialidadesDoPrestador
            .map((rel) => especialidadePorId.get(Number(rel.especialidade_id))?.nome)
            .filter(Boolean)
        const temEspecialidadeDomiciliar = nomesEspecialidadesPrestador.some((nome) =>
            normalizarTexto(nome).includes('DOMICILIAR')
        )
        const temEspecialidadeLocal = [
            especialidadePrincipalObj,
            ...especialidadesDoPrestador.map((rel) => especialidadePorId.get(Number(rel.especialidade_id))),
        ].some((esp) => esp && normalizarTexto(esp.tipo) === 'LOCAL')
        const situacaoDescricao = situacaoPorId.get(Number(prestador.situacao_id))?.descricao || '-'
        const estabelecimentosVinculados = (estabelecimentosPorVeterinario.get(Number(prestador.id)) || [])
            .map((rel) => prestadorPorId.get(Number(rel.estabelecimento_id)))
            .filter(Boolean)
        const nomesClinicasVinculadas = [
            ...new Set(estabelecimentosVinculados.map((item) => String(item.nome || '').trim()).filter(Boolean)),
        ]
        const telefonesVinculados = [...new Set(estabelecimentosVinculados.map((item) => String(item.telefone || '').trim()).filter(Boolean))]
        const modalidadesVinculadas = [...new Set(estabelecimentosVinculados.map((item) => String(item.nome || '').trim()).filter(Boolean))]
        const telefoneEfetivo = estabelecimentosVinculados.length ? telefonesVinculados.join(' | ') || prestador.telefone || '' : prestador.telefone || ''
        const modalidadeEfetiva = estabelecimentosVinculados.length ? modalidadesVinculadas.join(' | ') || prestador.modalidade || '' : prestador.modalidade || ''
        const modalidadeOriginal = String(prestador.modalidade || '')
        const temModalidadeVolante = normalizarTexto(modalidadeOriginal).includes('VOLANTE')
        return {
            id: Number(prestador.id),
            nome: prestador.nome || '-',
            cidadePrincipalNome,
            cidadesSecundarias,
            especialidadePrincipalNome,
            especialidadePrincipalId,
            tipoEspecialidade,
            situacaoDescricao,
            telefoneEfetivo,
            modalidadeEfetiva,
            endereco: prestador.endereco || '',
            telefone: prestador.telefone || '',
            temEspecialidadeDomiciliar,
            possuiVinculoClinica: estabelecimentosVinculados.length > 0,
            nomesClinicasVinculadas,
            temModalidadeVolante,
            temEspecialidadeLocal,
        }
    })

    const alvoNorm = cidadesSelecionadas.map((c) => normalizarTexto(c))
    const mapaOrdem = buildMapaOrdemRc(base.especialidades)
    const filtrados = linhas
        .filter((item) => textoCredenciado(item.situacaoDescricao))
        .filter((item) => {
            const cidadesItem = [item.cidadePrincipalNome, ...item.cidadesSecundarias].map(normalizarTexto)
            return alvoNorm.some((cidade) => cidadesItem.includes(cidade))
        })
    return ordenarLinhasRc(filtrados, mapaOrdem)
}

export const gerarHtmlCards = (cardsPorPagina, pageWidthPt, pageHeightPt, icones) => {
    const pageWidthIn = Number(pageWidthPt) / 72
    const pageHeightIn = Number(pageHeightPt) / 72
    const { estetoscopio, telefone: telefoneIcon } = icones
    const pages = cardsPorPagina
        .map((cards) => {
            const blocos = cards
                .map((item) => {
                    const especialidade = escaparHtml(item.especialidadePrincipalNome || '-')
                    const nome = escaparHtml(item.nome || '-')
                    const atendimento = escaparHtml(montarRotuloAtendimentoRc(item))
                    const telefone = escaparHtml(formatarTelefone(item.telefoneEfetivo || item.telefone || '-'))
                    return `
                        <article class="card">
                            <header class="card-topo"><span>${especialidade}</span></header>
                            <div class="card-corpo">
                                <h3>${nome}</h3>
                                <p><img class="icon" src="${estetoscopio}" alt="" width="12" height="12" /><span>${atendimento}</span></p>
                                <p><img class="icon" src="${telefoneIcon}" alt="" width="12" height="12" /><span>${telefone}</span></p>
                            </div>
                        </article>
                    `
                })
                .join('')
            return `<section class="sheet"><div class="grade">${blocos}</div></section>`
        })
        .join('')

    return `
        <!doctype html>
        <html lang="pt-BR">
          <head>
            <meta charset="utf-8" />
            <style>
              @page { size: ${pageWidthIn}in ${pageHeightIn}in; margin: 0; }
              html, body { margin: 0; padding: 0; }
              body { font-family: Arial, Helvetica, sans-serif; background: transparent; }
              .sheet { width: ${pageWidthIn}in; height: ${pageHeightIn}in; box-sizing: border-box; padding: 98pt 14pt 98pt; page-break-after: always; }
              .sheet:last-child { page-break-after: auto; }
              .grade {
                display: grid;
                grid-template-columns: repeat(2, minmax(0, 1fr));
                grid-template-rows: repeat(5, minmax(0, 1fr));
                gap: 12pt;
                height: 100%;
                align-items: stretch;
              }
              .card { border-radius: 16pt; border: .8pt solid #d9e6f0; background: #fff; overflow: hidden; min-height: 0; }
              .card-topo { height: 24pt; display: flex; align-items: center; justify-content: center; background: #1c3455; color: #fff; font-weight: 700; font-size: 13pt; white-space: nowrap; overflow: hidden; padding: 0 8pt; }
              .card-topo > span { display: block; max-width: 100%; white-space: nowrap; overflow: hidden; text-align: center; }
              .card-corpo { padding: 8pt 10pt 7pt; display: grid; gap: 7pt; min-height: 0; }
              .card-corpo h3 { margin: 0; text-align: center; color: #1a2e4a; font-size: 12pt; font-weight: 700; white-space: nowrap; overflow: hidden; }
              .card-corpo p { margin: 0; color: #5e7188; font-size: 10pt; display: grid; grid-template-columns: 12pt 1fr; align-items: start; gap: 6pt; }
              .card-corpo p span:last-child {
                overflow-wrap: anywhere;
                word-break: break-word;
                white-space: normal;
                line-height: 1.18;
              }
              .icon { width: 12pt; height: 12pt; display: block; object-fit: contain; margin-top: 1pt; }
            </style>
          </head>
          <body>${pages}</body>
        </html>
    `
}
