import { describe, expect, it } from 'vitest'
import { runConferencia, resumirConferencia } from './index.js'
import {
    aplicarAcao,
    itemAceitaAcao,
    parearOrfaos,
    adicionarAliasUnico,
    adicionarEquivalenciaUnica,
} from './revisao.js'
import { statusEhDivergencia } from './classify.js'

function L(parcial) {
    return {
        prontuario: '100',
        tutor: 'João Silva',
        pet: 'Rex',
        data: '2026-07-05',
        exame: 'Urocultura',
        valor: 80,
        ...parcial,
    }
}

const rodar = (hon, mel, extra = {}) =>
    runConferencia({ honorarios: hon, mellislab: mel, ...extra })

describe('pareamento global (sem depender da ordem das linhas)', () => {
    it('match fraco não rouba o item do match forte que vem depois', () => {
        const { resultados } = rodar(
            [L({ id: 'h1' })],
            [L({ id: 'm1', data: '2026-07-15' }), L({ id: 'm2', prontuario: '9' })],
        )
        const par = resultados.find((r) => r.honorarios && r.mellis)
        expect(par.mellis.id).toBe('m2')
        expect(par.status).toBe('OK')
        expect(resultados.find((r) => r.status === 'ORFAO_MELLISLAB').mellis.id).toBe('m1')
    })

    it('ambíguo não consome candidato: os dois itens do plano continuam visíveis', () => {
        const { resultados, resumo } = rodar(
            [L({ id: 'h1', prontuario: '1' }), L({ id: 'h2', prontuario: '2' })],
            [L({ id: 'm1' })],
        )
        const rev = resultados.find((r) => r.status === 'REVISAO_MANUAL')
        expect(rev.honorarios).toBeNull()
        expect(rev.candidatos).toHaveLength(2)
        expect(resultados.filter((r) => r.status === 'ORFAO_HONORARIOS')).toHaveLength(2)
        expect(resumo.totalHonorarios).toBe(160)
    })

    it('registros duplicados idênticos pareiam um a um, em ordem', () => {
        const { resultados } = rodar(
            [L({ id: 'h1' }), L({ id: 'h2' })],
            [L({ id: 'm1' }), L({ id: 'm2' })],
        )
        const pares = resultados.filter((r) => r.honorarios && r.mellis)
        expect(pares).toHaveLength(2)
        expect(pares.every((p) => p.status === 'OK')).toBe(true)
        expect(resultados).toHaveLength(2)
    })

    it('3000 × 3000 linhas processam rápido (pet indexado)', () => {
        const hon = []
        const mel = []
        for (let i = 0; i < 3000; i += 1) {
            const base = {
                tutor: `Tutor ${i % 400}`,
                pet: `Pet ${i % 700}`,
                exame: `Exame ${i % 30}`,
                valor: 50 + (i % 9),
            }
            hon.push(L({ ...base, id: `h${i}`, prontuario: String(i) }))
            mel.push(L({ ...base, id: `m${i}`, prontuario: String(i) }))
        }
        const t0 = performance.now()
        const out = rodar(hon, mel)
        const ms = performance.now() - t0
        expect(out.resultados.length).toBeGreaterThan(0)
        expect(ms).toBeLessThan(5000)
    })
})

describe('definição única de divergência', () => {
    it('órfão e revisão manual contam como divergência; OK não', () => {
        expect(statusEhDivergencia('ORFAO_MELLISLAB')).toBe(true)
        expect(statusEhDivergencia('REVISAO_MANUAL')).toBe(true)
        expect(statusEhDivergencia('OK')).toBe(false)
        expect(statusEhDivergencia('VALOR_ACEITO')).toBe(false)
    })
})

describe('ações de revisão manual', () => {
    const divergente = () => rodar([L({ id: 'h1' })], [L({ id: 'm1', valor: 95 })]).resultados

    it('"Não corresponde" devolve os dois lados como órfãos', () => {
        const res = rodar([L({ id: 'h1' })], [L({ id: 'm1' })]).resultados
        const { resultados } = aplicarAcao(res, res[0].id, 'nao_corresponde', {}, { acao: 'nao_corresponde' })
        const r = resumirConferencia(resultados)
        expect(resultados.map((x) => x.status).sort()).toEqual(['ORFAO_HONORARIOS', 'ORFAO_MELLISLAB'])
        expect(r.orfaosHonorarios).toBe(1)
        expect(r.orfaosMellis).toBe(1)
        expect(r.itensConferidos).toBe(0)
    })

    it('confirmar o pareamento não esconde divergência de valor', () => {
        const res = divergente()
        expect(res[0].status).toBe('VALOR_DIVERGENTE')
        const { resultados } = aplicarAcao(res, res[0].id, 'confirmar', {}, {})
        expect(resultados[0].status).toBe('VALOR_DIVERGENTE')
        expect(resultados[0].acao).toBe('Confirmado')
    })

    it('confirmar com valor correto vira OK', () => {
        const res = rodar([L({ id: 'h1' })], [L({ id: 'm1', data: '2026-07-20' })]).resultados
        expect(res[0].status).toBe('DATA_DIVERGENTE')
        const { resultados } = aplicarAcao(res, res[0].id, 'confirmar', {}, {})
        expect(resultados[0].status).toBe('OK')
    })

    it('aceitar valor exige justificativa e gera status próprio', () => {
        const res = divergente()
        expect(itemAceitaAcao(res[0], 'aceitar_valor')).toBe(true)
        const sem = aplicarAcao(res, res[0].id, 'aceitar_valor', { justificativa: ' ' }, {})
        expect(sem.erro).toMatch(/justificativa/i)
        const ok = aplicarAcao(res, res[0].id, 'aceitar_valor', { justificativa: 'Reajuste autorizado' }, {})
        expect(ok.resultados[0].status).toBe('VALOR_ACEITO')
        expect(resumirConferencia(ok.resultados).valoresAceitos).toBe(1)
        expect(resumirConferencia(ok.resultados).itensOk).toBe(1)
    })

    it('aceitar valor não se aplica a par com valor correto', () => {
        const res = rodar([L({ id: 'h1' })], [L({ id: 'm1' })]).resultados
        expect(itemAceitaAcao(res[0], 'aceitar_valor')).toBe(false)
    })

    it('tutor alternativo aprende o alias quando o resto confere', () => {
        const res = rodar([L({ id: 'h1' })], [L({ id: 'm1', tutor: 'Maria Souza' })]).resultados
        const par = res.find((r) => r.honorarios && r.mellis)
        expect(par.status).toBe('TUTOR_DIVERGENTE')
        const out = aplicarAcao(res, par.id, 'tutor_alternativo', {}, {})
        expect(out.resultados.find((r) => r.id === par.id).status).toBe('OK_COM_TUTOR_ALTERNATIVO')
        expect(out.aprendizado.alias).toEqual({
            tipo: 'tutor',
            nomeLab: 'Maria Souza',
            nomePlano: 'João Silva',
        })
    })

    it('tutor alternativo não mascara valor divergente', () => {
        const res = rodar(
            [L({ id: 'h1' })],
            [L({ id: 'm1', tutor: 'Maria Souza', valor: 95 })],
        ).resultados
        const lab = res.find((r) => r.status === 'ORFAO_MELLISLAB')
        const pl = res.find((r) => r.status === 'ORFAO_HONORARIOS')
        const { resultados, par } = parearOrfaos(res, lab, pl, {}, {})
        const out = aplicarAcao(resultados, par.id, 'tutor_alternativo', {}, {})
        expect(out.resultados.find((r) => r.id === par.id).status).toBe('VALOR_DIVERGENTE')
    })

    it('escolher candidato de um ambíguo remove o órfão correspondente', () => {
        const res = rodar(
            [L({ id: 'h1', prontuario: '1' }), L({ id: 'h2', prontuario: '2' })],
            [L({ id: 'm1' })],
        ).resultados
        const amb = res.find((r) => r.status === 'REVISAO_MANUAL')
        const out = aplicarAcao(res, amb.id, 'confirmar', { honorariosId: 'h2' }, {})
        expect(out.erro).toBeUndefined()
        const par = out.resultados.find((r) => r.honorarios && r.mellis)
        expect(par.honorarios.id).toBe('h2')
        expect(par.status).toBe('OK')
        const orfaos = out.resultados.filter((r) => r.status === 'ORFAO_HONORARIOS')
        expect(orfaos.map((o) => o.honorarios.id)).toEqual(['h1'])
        expect(out.resultados.some((r) => r.status === 'REVISAO_MANUAL')).toBe(false)
    })

    it('candidato já usado não pode ser escolhido de novo', () => {
        const res = rodar(
            [L({ id: 'h1', prontuario: '1' }), L({ id: 'h2', prontuario: '2' })],
            [L({ id: 'm1' })],
        ).resultados
        const amb = res.find((r) => r.status === 'REVISAO_MANUAL')
        const semH2 = res.filter((r) => r.id !== 'orfao:honorarios:h2')
        expect(aplicarAcao(semH2, amb.id, 'confirmar', { honorariosId: 'h2' }, {}).erro).toMatch(
            /já foi usado/,
        )
    })

    it('encaixar órfãos monta o par e remove os dois órfãos', () => {
        const res = rodar([L({ id: 'h1', pet: 'Rex' })], [L({ id: 'm1', pet: 'Rexx' })]).resultados
        const lab = res.find((r) => r.status === 'ORFAO_MELLISLAB')
        const pl = res.find((r) => r.status === 'ORFAO_HONORARIOS')
        const out = parearOrfaos(res, lab, pl, {}, { acao: 'parear' })
        expect(out.resultados).toHaveLength(1)
        expect(out.resultados[0].honorarios.id).toBe('h1')
    })

    it('aliases e equivalências aprendidos não duplicam', () => {
        const a = { tipo: 'tutor', nomeLab: 'Maria', nomePlano: 'João' }
        expect(adicionarAliasUnico(adicionarAliasUnico([], a), { ...a, nomeLab: 'MARIA' })).toHaveLength(1)
        const e = { a: 'Urocultura', b: 'Cultura de urina' }
        expect(
            adicionarEquivalenciaUnica(adicionarEquivalenciaUnica([], e), {
                a: 'cultura de urina',
                b: 'UROCULTURA',
            }),
        ).toHaveLength(1)
    })
})
