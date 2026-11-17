import { describe, it, expect } from 'vitest'
import { listaDeEmails, emailsDoPrestador } from '../../../api/_lib/repasseComprovante.js'

const adminCom = (row) => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }) }) })

describe('e-mails do prestador', () => {
    it('separa 1 ou 2 endereços e tira repetidos', () => {
        expect(listaDeEmails('A@x.com, b@x.com; a@x.com')).toEqual(['a@x.com', 'b@x.com'])
        expect(listaDeEmails('')).toEqual([])
    })
    it('usa os dois do financeiro; sem financeiro, só o do cadastro', async () => {
        expect(await emailsDoPrestador(adminCom({ email: 'c@x.com', email_financeiro: 'a@x.com, b@x.com' }), 1, '')).toEqual(['a@x.com', 'b@x.com'])
        expect(await emailsDoPrestador(adminCom({ email: 'c@x.com', email_financeiro: null }), 1, '')).toEqual(['c@x.com'])
    })
    it('ajuste pontual do mês tem prioridade', async () => {
        expect(await emailsDoPrestador(adminCom({ email: 'c@x.com' }), 1, 'z@x.com')).toEqual(['z@x.com'])
    })
})
