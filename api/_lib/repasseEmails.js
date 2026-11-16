/**
 * E-mails do repasse mensal (docs/repasse-mensal.md §9). Mesmo envelope visual dos demais e-mails.
 * Retorna { subject, html, text }.
 */
import { EMAIL_BRAND } from './emailBrand.js'
import { envelopeHtml, escapeHtml } from './emailTemplates.js'
import { linkWhatsapp } from '../../src/lib/repasse/repasseCore.js'

const BRAND = EMAIL_BRAND
const PRODUTO = 'Emerdog · Financeiro'

const brl = (n) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const paragrafos = (texto) =>
    String(texto || '')
        .split(/\n{2,}/)
        .map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:${BRAND.ink};">${escapeHtml(p).replace(/\n/g, '<br/>')}</p>`)
        .join('')

const linhaCartao = (rotulo, valor) =>
    `<tr><td style="padding:6px 0;font-size:13px;color:${BRAND.muted};">${escapeHtml(rotulo)}</td><td style="padding:6px 0;font-size:14px;font-weight:650;text-align:right;color:${BRAND.ink};">${escapeHtml(valor)}</td></tr>`

function cartao(linhas) {
    return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:6px 0 20px;border:1px solid ${BRAND.border};border-radius:10px;background:#f7fbfe;padding:6px 14px;"><tbody>${linhas.join('')}</tbody></table>`
}

function botaoSecundario(label, href) {
    return `<p style="margin:0 0 20px;"><a href="${escapeHtml(href)}" style="display:inline-block;border:1px solid ${BRAND.accent};color:${BRAND.accent};text-decoration:none;padding:11px 18px;border-radius:10px;font-weight:650;font-size:14px;">${escapeHtml(label)}</a></p>`
}

const textoPuro = (partes) => partes.filter(Boolean).join('\n\n')

/** Relatório para o prestador. `corpo` já vem com as variáveis aplicadas (texto livre editável). */
export function montarEmailRepasseRelatorio({ assunto, corpo, prestador, competencia, valor, atendimentos, formaPagamento, link, whatsapp, descontoRpa = null }) {
    const wa = linkWhatsapp(whatsapp, `Olá! Tenho uma dúvida sobre o relatório de repasse de ${competencia} (${prestador}).`)
    const corpoHtml = `${paragrafos(corpo)}${cartao([
        linhaCartao('Competência', competencia),
        linhaCartao('Repasse Emerdog', brl(valor)),
        ...(descontoRpa ? [linhaCartao(`Desconto de INSS (${descontoRpa.pct}%)`, `− ${brl(descontoRpa.desconto)}`), linhaCartao('Valor a receber', brl(descontoRpa.liquido))] : []),
        linhaCartao('Atendimentos', String(atendimentos)),
        linhaCartao('Forma de pagamento', formaPagamento),
    ])}${botaoSecundario('Dúvidas? WhatsApp', wa)}`
    return {
        subject: assunto,
        html: envelopeHtml({
            preheader: `Relatório de repasse de ${competencia}: ${brl(valor)}`,
            titulo: 'Relatório de repasse',
            corpoHtml,
            ctaLabel: 'Ver relatório e aprovar',
            ctaHref: link,
            produto: PRODUTO,
        }),
        text: textoPuro([corpo, `Repasse Emerdog (${competencia}): ${brl(valor)} · ${atendimentos} atendimentos`, descontoRpa ? `Desconto de INSS (${descontoRpa.pct}%): − ${brl(descontoRpa.desconto)} · Valor a receber: ${brl(descontoRpa.liquido)}` : '', `Ver relatório e aprovar: ${link}`, `Dúvidas? ${wa}`]),
    }
}

/** Reprovação → e-mail configurado (interno). */
export function montarEmailRepasseReprovacao({ prestador, competencia, valor, observacao, canal, linkInterno }) {
    const corpoHtml = `${paragrafos(`${prestador} reprovou o relatório de repasse de ${competencia}.`)}${cartao([
        linhaCartao('Prestador', prestador),
        linhaCartao('Competência', competencia),
        linhaCartao('Repasse', brl(valor)),
        linhaCartao('Canal escolhido', canal === 'whatsapp' ? 'WhatsApp' : 'E-mail'),
    ])}<p style="margin:0 0 6px;font-size:13px;color:${BRAND.muted};">O que precisa ser ajustado</p>${paragrafos(observacao)}`
    return {
        subject: `Repasse reprovado — ${prestador} (${competencia})`,
        html: envelopeHtml({ preheader: `${prestador} reprovou o repasse`, titulo: 'Relatório reprovado', corpoHtml, ctaLabel: 'Abrir na Caixa de entrada', ctaHref: linkInterno, produto: PRODUTO }),
        text: textoPuro([`${prestador} reprovou o repasse de ${competencia} (${brl(valor)}).`, `Observação: ${observacao}`, linkInterno]),
    }
}

/** Documento (NF/boleto) devolvido → prestador. */
export function montarEmailRepasseDocumentoDevolvido({ prestador, competencia, motivo, link, tipo }) {
    const nome = tipo === 'boleto' ? 'boleto' : 'nota fiscal'
    const corpoHtml = `${paragrafos(`Olá, ${prestador}. Precisamos de um ajuste na ${nome} do repasse de ${competencia}.`)}<p style="margin:0 0 6px;font-size:13px;color:${BRAND.muted};">Motivo</p>${paragrafos(motivo)}`
    return {
        subject: `Ajuste necessário — ${nome} do repasse de ${competencia}`,
        html: envelopeHtml({ preheader: `Ajuste na ${nome}`, titulo: 'Documento devolvido', corpoHtml, ctaLabel: 'Enviar novo documento', ctaHref: link, produto: PRODUTO }),
        text: textoPuro([`Ajuste necessário na ${nome} de ${competencia}.`, `Motivo: ${motivo}`, link]),
    }
}

/**
 * Comprovante de pagamento → prestador (arquivo vai anexado pela rota).
 * `meses` ([{ competencia, valor }]) lista cada mês e seu valor quando o pagamento cobre mais de um mês;
 * `valor` é o total pago.
 */
export function montarEmailRepasseComprovante({ prestador, competencia, valor, dataPagamento, forma, chavePix, vencimentoBoleto, link, whatsapp, meses = [] }) {
    const varios = Array.isArray(meses) && meses.length > 1
    const wa = linkWhatsapp(whatsapp, `Olá! Tenho uma dúvida sobre o pagamento do repasse de ${competencia} (${prestador}).`)
    const linhas = varios
        ? [
              ...meses.map((m) => linhaCartao(m.competencia, brl(m.valor))),
              linhaCartao('Total pago', brl(valor)),
          ]
        : [linhaCartao('Competência', competencia), linhaCartao('Valor pago', brl(valor))]
    linhas.push(linhaCartao('Data do pagamento', dataPagamento), linhaCartao('Forma', forma === 'pix' ? 'PIX' : 'Boleto'))
    if (forma === 'pix' && chavePix) linhas.push(linhaCartao('Chave PIX', chavePix))
    if (forma === 'boleto' && vencimentoBoleto) linhas.push(linhaCartao('Vencimento do boleto', vencimentoBoleto))
    const abertura = varios
        ? `Olá, ${prestador}. O pagamento dos seus repasses de ${meses.length} meses foi realizado, conforme o detalhamento abaixo. O comprovante segue em anexo.`
        : `Olá, ${prestador}. O pagamento do seu repasse de ${competencia} foi realizado. O comprovante segue em anexo.`
    const formaTxt = forma === 'pix' ? 'PIX' : 'boleto'
    const itensTxt = meses.map((m) => `• ${m.competencia}: ${brl(m.valor)}`).join('\n')
    const comLink = varios ? meses.filter((m) => m.link) : []
    const linksHtml = comLink.length
        ? `<p style="margin:0 0 6px;font-size:13px;color:${BRAND.muted};">Relatório e comprovante de cada mês</p><p style="margin:0 0 20px;font-size:14px;line-height:1.9;">${comLink
              .map((m) => `<a href="${escapeHtml(m.link)}" style="color:${BRAND.accent};font-weight:650;text-decoration:none;">${escapeHtml(m.competencia)} →</a>`)
              .join('<br/>')}</p>`
        : ''
    const linksTxt = comLink.length ? `Relatório e comprovante de cada mês:\n${comLink.map((m) => `• ${m.competencia}: ${m.link}`).join('\n')}` : ''
    const resumoTexto = varios
        ? `Pagamento realizado — repasses de ${meses.length} meses em ${dataPagamento} (${formaTxt}):\n${itensTxt}\nTotal pago: ${brl(valor)}. Comprovante em anexo.`
        :`Pagamento realizado — repasse de ${competencia}: ${brl(valor)} em ${dataPagamento} (${forma === 'pix' ? 'PIX' : 'boleto'}). Comprovante em anexo.`
    return {
        subject: varios ? `Pagamento realizado — repasses de ${meses.map((m) => m.competencia).join(', ')}` : `Pagamento realizado — repasse de ${competencia}`,
        html: envelopeHtml({
            preheader: `Pagamento de ${brl(valor)} realizado`,
            titulo: 'Pagamento realizado',
            corpoHtml: `${paragrafos(abertura)}${cartao(linhas)}${linksHtml}${botaoSecundario('Dúvidas? WhatsApp', wa)}`,
            ctaLabel: 'Ver relatório e comprovante',
            ctaHref: link,
            produto: PRODUTO,
        }),
        text: textoPuro([resumoTexto, linksTxt || (link && `Ver relatório e comprovante: ${link}`), `Dúvidas? ${wa}`]),
    }
}
