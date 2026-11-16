import { describe, expect, it } from 'vitest'
import { montarEmailRepasseComprovante } from '../../../api/_lib/repasseEmails.js'

const base = { prestador: 'Duovet', dataPagamento: '16/11/2026', forma: 'pix', chavePix: '51990065292', link: 'https://x/r', whatsapp: '5551999999999' }

describe('e-mail de comprovante', () => {
    it('um mês: layout de sempre', () => {
        const m = montarEmailRepasseComprovante({ ...base, competencia: 'nov/2026', valor: 690 })
        expect(m.subject).toBe('Pagamento realizado — repasse de nov/2026')
        expect(m.html).toContain('Valor pago')
        expect(m.html).not.toContain('Total pago')
    })

    it('vários meses: lista cada mês com o valor e o total', () => {
        const meses = [
            { competencia: 'set/2026', valor: 400.5 },
            { competencia: 'out/2026', valor: 410 },
            { competencia: 'nov/2026', valor: 690 },
        ]
        const m = montarEmailRepasseComprovante({ ...base, competencia: 'set/2026, out/2026, nov/2026', valor: 1500.5, meses })
        expect(m.subject).toBe('Pagamento realizado — repasses de set/2026, out/2026, nov/2026')
        for (const mes of meses) expect(m.html).toContain(mes.competencia)
        expect(m.html).toContain('Total pago')
        const texto = m.text.replaceAll(String.fromCharCode(160), ' ')
        expect(texto).toContain('• set/2026: R$ 400,50')
        expect(texto).toContain('• nov/2026: R$ 690,00')
        expect(texto).toContain('Total pago: R$ 1.500,50')
    })

    it('vários meses: um link de relatório por mês', () => {
        const meses = [
            { competencia: 'set/2026', valor: 400, link: 'https://x/r/set' },
            { competencia: 'out/2026', valor: 410, link: 'https://x/r/out' },
        ]
        const m = montarEmailRepasseComprovante({ ...base, competencia: 'set/2026, out/2026', valor: 810, meses })
        expect(m.html).toContain('https://x/r/set')
        expect(m.html).toContain('https://x/r/out')
        expect(m.text).toContain('• out/2026: https://x/r/out')
    })
})
