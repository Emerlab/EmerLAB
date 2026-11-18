/* global process */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { chunk, gerarHtmlCards, montarCards } from './rcCards.js'

const RES = 'Rua das Flores, 730 — Casa — Centro — 20000-000'
const COM = 'Av. Brasil, 1200 — Loja 2 — Centro — 20000-100'

const prest = (id, nome, extra = {}) => ({
    id, nome, telefone: '21999990000', cidade_id: 1, endereco: '', modalidade: '', especialidade_id: 1, situacao_id: 1, ativo: true, ...extra,
})
const base = {
    cidades: [{ id: 1, nome: 'Rio de Janeiro' }],
    situacoes: [{ id: 1, descricao: 'Credenciado' }],
    especialidades: [
        { id: 1, nome: 'Anestesista', tipo: 'Especialidade', ordem_rc: 1 },
        { id: 2, nome: 'Clinica', tipo: 'Local', ordem_rc: 2 },
        { id: 3, nome: 'Atendimento Domiciliar', tipo: 'Especialidade', ordem_rc: 3 },
    ],
    prestadores: [
        prest(1, 'Dra Individual', { endereco: RES }),
        prest(2, 'Clinica Boa', { especialidade_id: 2, endereco: COM }),
        prest(3, 'Clinica Casa', { especialidade_id: 2, endereco: RES }),
        prest(4, 'Dr Domiciliar', { especialidade_id: 3, endereco: RES }),
        prest(5, 'Dr Volante', { endereco: RES, modalidade: 'Volante' }),
        prest(6, 'Dr Vinculado', { endereco: RES }),
        prest(7, 'Clinica Pio X', { especialidade_id: 2, endereco: COM }),
    ],
    prestadorCidades: [],
    prestadorEspecialidades: [{ prestador_id: 1, especialidade_id: 1, principal: true }],
    prestadorEstabelecimentos: [{ veterinario_id: 6, estabelecimento_id: 7, principal: true }],
}
const html = () => gerarHtmlCards(chunk(montarCards(base, ['Rio de Janeiro']), 10), 600, 800, { estetoscopio: 'e', telefone: 't' })
const cardDe = (h, nome) => h.split('<article').find((a) => a.includes(`<h3>${nome}</h3>`))

describe('rcCards', () => {
    it('individual nunca imprime endereço; Local comercial imprime; Local residencial não', () => {
        const h = html()
        expect(cardDe(h, 'Dra Individual')).toContain('Atendimento em clínicas parceiras')
        expect(cardDe(h, 'Clinica Boa')).toContain(COM)
        expect(cardDe(h, 'Clinica Casa')).toContain('Atendimento em clínicas parceiras')
        expect(cardDe(h, 'Dr Domiciliar')).toContain('Atendimento Domiciliar')
        expect(cardDe(h, 'Dr Volante')).toContain('Atendimento em clínicas parceiras')
        expect(cardDe(h, 'Dr Vinculado')).toContain('Atendimentos na Clinica Pio X')
        expect(h).not.toContain('730')
        expect(h).not.toContain('Flores')
    })

    it('varredura: HTML inteiro de individual não contém o endereço', () => {
        for (const modalidade of ['', 'Pio X', 'Volante', RES, COM])
            for (const endereco of [RES, COM, 'Rua X, 1 — Casa — Y', ''])
                for (const dom of [false, true]) {
                    const b = {
                        ...base,
                        prestadores: [prest(1, 'Indiv', { endereco, modalidade })],
                        prestadorEspecialidades: dom ? [{ prestador_id: 1, especialidade_id: 3, principal: false }] : [],
                        prestadorEstabelecimentos: [],
                    }
                    const h = gerarHtmlCards(chunk(montarCards(b, ['Rio de Janeiro']), 10), 600, 800, { estetoscopio: 'e', telefone: 't' })
                    if (endereco) expect(h).not.toContain(endereco)
                    expect(h).not.toContain('20000-')
                }
    })

    it('entrypoints não redefinem a lógica e importam do módulo compartilhado', () => {
        for (const f of ['api/rc-pdf.js', 'scripts/rc/generate-rc-pdf.mjs']) {
            const t = fs.readFileSync(path.resolve(process.cwd(), f), 'utf8')
            expect(t).not.toMatch(/const (gerarHtmlCards|montarCards|montarPrestadoresRc)\b/)
            expect(t).not.toMatch(/item\.endereco/)
            expect(t).toMatch(/from '.*\/rc\/rcCards\.js'/)
        }
    })
})
