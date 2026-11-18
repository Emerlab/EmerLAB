import { describe, expect, it } from 'vitest'
import { montarRotuloAtendimentoRc, pareceEndereco, pareceResidencial } from './rotuloAtendimentoRc.js'

const PARCEIRAS = 'Atendimento em clínicas parceiras'
const RESIDENCIAL = 'Rua das Flores, 730 — Casa — Centro — 20000-000'
const COMERCIAL = 'Av. Brasil, 1200 — Loja 2 — Centro — 20000-100'

const base = {
    temEspecialidadeDomiciliar: false,
    possuiVinculoClinica: false,
    nomesClinicasVinculadas: [],
    temModalidadeVolante: false,
    modalidadeEfetiva: '',
    endereco: '',
    temEspecialidadeLocal: false,
}
const rotulo = (o) => montarRotuloAtendimentoRc({ ...base, ...o })

describe('montarRotuloAtendimentoRc', () => {
    it('individual sem modalidade, sem vínculo, com endereço residencial: clínicas parceiras', () => {
        const r = rotulo({ endereco: RESIDENCIAL })
        expect(r).toBe(PARCEIRAS)
        expect(r).not.toContain('Rua')
        expect(r).not.toContain('730')
    })

    it('individual com endereço comercial também não mostra endereço', () => {
        expect(rotulo({ endereco: COMERCIAL })).toBe(PARCEIRAS)
    })

    it('individual sem endereço: clínicas parceiras', () => {
        expect(rotulo({})).toBe(PARCEIRAS)
    })

    it('Local com endereço comercial mostra o endereço', () => {
        expect(rotulo({ temEspecialidadeLocal: true, endereco: COMERCIAL })).toBe(COMERCIAL)
    })

    it('Local com endereço residencial (Casa) cai em clínicas parceiras', () => {
        expect(rotulo({ temEspecialidadeLocal: true, endereco: RESIDENCIAL })).toBe(PARCEIRAS)
    })

    it('Local sem endereço cai em clínicas parceiras', () => {
        expect(rotulo({ temEspecialidadeLocal: true })).toBe(PARCEIRAS)
    })

    it('domiciliar tem prioridade', () => {
        expect(rotulo({ temEspecialidadeDomiciliar: true, possuiVinculoClinica: true, nomesClinicasVinculadas: ['X'] })).toBe(
            'Atendimento Domiciliar'
        )
    })

    it('vínculo com 1 clínica', () => {
        expect(rotulo({ possuiVinculoClinica: true, nomesClinicasVinculadas: ['Clínica Pio X'] })).toBe(
            'Atendimentos na Clínica Pio X'
        )
    })

    it('vínculo com 2 clínicas', () => {
        expect(rotulo({ possuiVinculoClinica: true, nomesClinicasVinculadas: ['A', 'B'] })).toBe('Atendimentos em: A, B')
    })

    it('volante', () => {
        expect(rotulo({ temModalidadeVolante: true, modalidadeEfetiva: 'Volante' })).toBe(PARCEIRAS)
    })

    it('modalidade textual comum aparece para qualquer tipo', () => {
        for (const local of [false, true]) {
            expect(rotulo({ modalidadeEfetiva: 'Desconto em banho e tosa', temEspecialidadeLocal: local })).toBe(
                'Desconto em banho e tosa'
            )
            expect(rotulo({ modalidadeEfetiva: 'Pio X', temEspecialidadeLocal: local })).toBe('Pio X')
        }
    })

    it('remove prefixo "Atendimento" da modalidade', () => {
        expect(rotulo({ modalidadeEfetiva: 'Atendimento: Pio X' })).toBe('Pio X')
    })

    it('modalidade que parece endereço: individual -> parceiras; Local comercial -> mostrada', () => {
        expect(rotulo({ modalidadeEfetiva: COMERCIAL })).toBe(PARCEIRAS)
        expect(rotulo({ modalidadeEfetiva: COMERCIAL, temEspecialidadeLocal: true })).toBe(COMERCIAL)
        expect(rotulo({ modalidadeEfetiva: RESIDENCIAL, temEspecialidadeLocal: true, endereco: COMERCIAL })).toBe(
            PARCEIRAS
        )
    })
})

describe('varredura: endereço de individual nunca aparece', () => {
    const bools = [false, true]
    const modalidades = ['', 'Pio X', COMERCIAL, RESIDENCIAL]
    const enderecos = [RESIDENCIAL, COMERCIAL, '']
    it('nenhuma combinação vaza endereço', () => {
        let n = 0
        for (const dom of bools)
            for (const vinc of bools)
                for (const vol of bools)
                    for (const mod of modalidades)
                        for (const end of enderecos) {
                            const item = {
                                ...base,
                                temEspecialidadeDomiciliar: dom,
                                possuiVinculoClinica: vinc,
                                nomesClinicasVinculadas: vinc ? ['Clínica Pio X'] : [],
                                temModalidadeVolante: vol,
                                modalidadeEfetiva: mod,
                                endereco: end,
                                temEspecialidadeLocal: false,
                            }
                            const r = montarRotuloAtendimentoRc(item)
                            n++
                            if (end) expect(r).not.toContain(end)
                            if (pareceEndereco(mod)) expect(r).not.toContain(mod)
                            expect(pareceEndereco(r)).toBe(false)
                            expect(r).not.toMatch(/\d{5}-?\d{3}/)
                        }
        expect(n).toBe(2 * 2 * 2 * 4 * 3)
    })
})

describe('pareceEndereco', () => {
    it.each([
        'Rua das Flores, 730',
        'R. Sete, 10',
        'Avenida Brasil 500',
        'Av. Atlântica, 1',
        'Travessa X, 3',
        'Estrada do Pau, 1',
        'Praça Mauá, 2',
        'qualquer coisa 20000-000',
        'texto 20000000',
    ])('positivo: %s', (t) => expect(pareceEndereco(t)).toBe(true))
    it.each(['', null, undefined, 'Pio X', 'Desconto em banho e tosa', 'Ruas e mais', 'Averiguação', 'Clínica 24h'])(
        'negativo: %s',
        (t) => expect(pareceEndereco(t)).toBe(false)
    )
})

describe('pareceResidencial', () => {
    it.each(['Rua A, 1 — Casa — Centro', 'Rua A, 1, casa', 'apto 203', 'Ap. 12', 'Apartamento 3', 'Residência Silva', 'Residencial Sol'])(
        'positivo: %s',
        (t) => expect(pareceResidencial(t)).toBe(true)
    )
    it.each(['', null, 'Casaca', 'Casaco Bar', 'Av. Brasil, 1200 — Loja 2', 'Capacidade', 'Hospital'])('negativo: %s', (t) =>
        expect(pareceResidencial(t)).toBe(false)
    )
})
