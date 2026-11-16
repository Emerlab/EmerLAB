import React, { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
    formatarDataConferencia,
    formatarValorConferencia,
} from '../../../lib/configuracoes/conferenciaLaboratorioPrecos.js'
import ComboExame from './ComboExame.jsx'
import { useDrawerDialog } from './useDrawerDialog.js'
import { rotuloStatusConferencia } from '../../../lib/configuracoes/conferencia/index.js'
import { nomesPessoaEquivalentes, petsEquivalentes } from '../../../lib/configuracoes/conferencia/normalize.js'
import { normalizeExam } from '../../../lib/configuracoes/conferencia/examSimilarity.js'
import { sugerirEncaixes } from '../../../lib/configuracoes/conferencia/sugestoes.js'
import { compareValues } from '../../../lib/configuracoes/conferencia/values.js'
import { JUSTIFICATIVA_MIN } from '../../../lib/configuracoes/conferencia/revisao.js'

function rotuloLinhaRelatorio(linha) {
    if (!linha) return ''
    return [
        linha.tutor,
        linha.pet,
        formatarDataConferencia(linha.data),
        linha.exame,
        formatarValorConferencia(linha.valor ?? linha.valor_base),
        linha.linha_original ? `linha ${linha.linha_original}` : '',
    ]
        .filter(Boolean)
        .join(' · ')
}

const CAMPOS_CMP = [
    { id: 'codigo', label: 'Código base' },
    { id: 'tutor', label: 'Tutor' },
    { id: 'pet', label: 'Pet' },
    { id: 'data', label: 'Data' },
    { id: 'exame', label: 'Exame' },
    { id: 'valor', label: 'Valor' },
]

function textoCampo(tipo, linha) {
    if (!linha) return '—'
    if (tipo === 'codigo') return linha.codigo_base || linha.codigo || '—'
    if (tipo === 'tutor') return linha.tutor || '—'
    if (tipo === 'pet') return linha.pet || '—'
    if (tipo === 'data') return formatarDataConferencia(linha.data)
    if (tipo === 'exame') return linha.exame || '—'
    if (tipo === 'valor') return formatarValorConferencia(linha.valor ?? linha.valor_base)
    return '—'
}

function iguaisIgnorandoCaixa(a, b) {
    const na = String(a || '').trim().toLocaleLowerCase('pt-BR')
    const nb = String(b || '').trim().toLocaleLowerCase('pt-BR')
    return Boolean(na && nb && na === nb)
}

function camposIguais(tipo, hon, mel) {
    if (!hon || !mel) return false
    if (tipo === 'codigo') {
        return iguaisIgnorandoCaixa(hon.codigo_base || hon.codigo, mel.codigo_base || mel.codigo)
    }
    if (tipo === 'tutor') {
        return (
            nomesPessoaEquivalentes(hon.tutor, mel.tutor) ||
            iguaisIgnorandoCaixa(hon.tutor, mel.tutor)
        )
    }
    if (tipo === 'pet') {
        return petsEquivalentes(hon.pet, mel.pet) || iguaisIgnorandoCaixa(hon.pet, mel.pet)
    }
    if (tipo === 'data') {
        const a = formatarDataConferencia(hon.data)
        const b = formatarDataConferencia(mel.data)
        return a !== '—' && a === b
    }
    if (tipo === 'exame') {
        const a = normalizeExam(hon.exame)
        const b = normalizeExam(mel.exame)
        return Boolean(a && b && a === b) || iguaisIgnorandoCaixa(hon.exame, mel.exame)
    }
    if (tipo === 'valor') {
        const na = Number(hon.valor ?? hon.valor_base)
        const nb = Number(mel.valor ?? mel.valor_base)
        if (!Number.isFinite(na) || !Number.isFinite(nb)) return false
        return Math.round(na * 100) === Math.round(nb * 100)
    }
    return false
}

function ComparacaoLados({ hon, mel }) {
    return (
        <div className="conf_lab_cmp grid grid-cols-1 gap-2 md:block">
            <div className="conf_lab_cmp_head flex flex-col gap-2 md:grid md:grid-cols-[7.2rem_minmax(0,1fr)_1.6rem_minmax(0,1fr)]">
                <span className="hidden md:block" />
                <h3>Plano (valor de base)</h3>
                <span className="hidden md:block" />
                <h3>Laboratório</h3>
            </div>
            {CAMPOS_CMP.map((c) => {
                const ok = camposIguais(c.id, hon, mel)
                return (
                    <div
                        key={c.id}
                        className={`conf_lab_cmp_row flex flex-col gap-1 md:grid md:grid-cols-[7.2rem_minmax(0,1fr)_1.6rem_minmax(0,1fr)]${ok ? ' is-ok' : ' is-dif'}`}
                    >
                        <span className="conf_lab_cmp_label">{c.label}</span>
                        <span className="conf_lab_cmp_val">{textoCampo(c.id, hon)}</span>
                        <span
                            className={`conf_lab_cmp_ico${ok ? ' is-ok' : ' is-dif'}`}
                            title={ok ? 'Campos iguais' : 'Campos diferentes'}
                            aria-label={ok ? 'Iguais' : 'Diferentes'}
                        >
                            {ok ? '✓' : '❗'}
                        </span>
                        <span className="conf_lab_cmp_val">{textoCampo(c.id, mel)}</span>
                    </div>
                )
            })}
        </div>
    )
}

export default function PainelDetalheConferencia({
    item,
    codigoElab,
    onClose,
    onAcao,
    podeEditar,
    orfaosPlano = [],
    orfaosLab = [],
    ctxMatching = {},
}) {
    const [escolhaOposto, setEscolhaOposto] = useState({ itemId: null, value: '' })
    const [justificativa, setJustificativa] = useState({ itemId: null, texto: '' })
    const closeRef = useDrawerDialog({ aberto: Boolean(item), onClose })
    const ehOrfaoLab = item?.status === 'ORFAO_MELLISLAB'
    const ehOrfaoPlano = item?.status === 'ORFAO_HONORARIOS'
    const ehOrfao = ehOrfaoLab || ehOrfaoPlano
    const escolhaAtual = escolhaOposto.itemId === item?.id ? escolhaOposto.value : ''
    const textoJust = justificativa.itemId === item?.id ? justificativa.texto : ''

    const itensOpostos = useMemo(() => {
        const lista = ehOrfaoLab ? orfaosPlano : ehOrfaoPlano ? orfaosLab : []
        return lista
            .filter((r) => r.id !== item?.id)
            .map((r) => {
                const linha = ehOrfaoLab ? r.honorarios : r.mellis
                if (!linha) return null
                return {
                    id: r.id,
                    rotulo: rotuloLinhaRelatorio(linha),
                    busca: rotuloLinhaRelatorio(linha),
                }
            })
            .filter(Boolean)
    }, [ehOrfaoLab, ehOrfaoPlano, orfaosPlano, orfaosLab, item?.id])

    const sugestoes = useMemo(() => {
        if (!item || !ehOrfao) return []
        const opostos = ehOrfaoLab ? orfaosPlano : orfaosLab
        return sugerirEncaixes(item, opostos, ctxMatching, 5).map((sg) => {
            const o = opostos.find((x) => x.id === sg.id)
            const linha = ehOrfaoLab ? o?.honorarios : o?.mellis
            return { ...sg, rotulo: rotuloLinhaRelatorio(linha) }
        })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [item?.id, ehOrfao, ehOrfaoLab, orfaosPlano, orfaosLab, ctxMatching.equivalencias, ctxMatching.aliasesPessoa])

    const linhaOposta = useMemo(() => {
        if (!escolhaAtual) return null
        const lista = ehOrfaoLab ? orfaosPlano : orfaosLab
        const r = lista.find((x) => String(x.id) === String(escolhaAtual))
        if (!r) return null
        return ehOrfaoLab ? r.honorarios : r.mellis
    }, [escolhaAtual, ehOrfaoLab, orfaosPlano, orfaosLab])

    if (!item) return null
    const hon = item.honorarios || (ehOrfaoLab ? linhaOposta : null)
    const mel = item.mellis || (ehOrfaoPlano ? linhaOposta : null)

    return createPortal(
        <div className="conf_lab_drawer_overlay" onClick={onClose} role="presentation">
            <aside
                className="conf_lab_drawer"
                role="dialog"
                aria-modal="true"
                aria-labelledby="conf-lab-drawer-title"
                onClick={(e) => e.stopPropagation()}
            >
                <header>
                    <div>
                        <p className="conf_lab_kicker">Detalhe da conferência</p>
                        <h2 id="conf-lab-drawer-title">{rotuloStatusConferencia(item.status)}</h2>
                        <p className="conf_lab_muted">{item.motivo}</p>
                    </div>
                    <button
                        ref={closeRef}
                        type="button"
                        className="conf_lab_drawer_close"
                        onClick={onClose}
                    >
                        Fechar
                    </button>
                </header>

                <ComparacaoLados hon={hon} mel={mel} />

                {podeEditar && ehOrfao ? (
                    <div className="conf_lab_parear_orfao">
                        <h3>
                            {ehOrfaoLab
                                ? 'Encaixar com uma linha do Relatório Plano'
                                : 'Encaixar com uma linha do Relatório Laboratório'}
                        </h3>
                        <p className="conf_lab_muted">
                            Busque e escolha a entrada do relatório oposto. A correspondência não é
                            escolhida sozinha.
                        </p>
                        {sugestoes.length ? (
                            <ul className="conf_lab_sugestoes" aria-label="Sugestões de encaixe">
                                {sugestoes.map((sg) => (
                                    <li key={sg.id}>
                                        <button
                                            type="button"
                                            className={`conf_lab_sugestao${escolhaAtual === sg.id ? ' is-on' : ''}`}
                                            onClick={() =>
                                                setEscolhaOposto({ itemId: item?.id ?? null, value: sg.id })
                                            }
                                        >
                                            <span>{sg.rotulo}</span>
                                            <small>Parecido em: {sg.motivos.join(', ') || '—'}</small>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="conf_lab_muted">Nenhuma sugestão parecida — use a busca abaixo.</p>
                        )}
                        <ComboExame
                            itens={itensOpostos}
                            value={escolhaAtual}
                            placeholder="Buscar tutor, pet, exame, valor…"
                            vazio="Nenhum órfão no lado oposto"
                            onChange={(id) =>
                                setEscolhaOposto({ itemId: item?.id ?? null, value: id })
                            }
                        />
                        <button
                            type="button"
                            className="credenciamento_main_action_btn"
                            disabled={!escolhaAtual}
                            onClick={() => onAcao('parear', { opostoId: escolhaAtual })}
                        >
                            Encaixar correspondência
                        </button>
                    </div>
                ) : null}

                {codigoElab ? (
                    <p className="conf_lab_muted">Código na Valores de Base: {codigoElab}</p>
                ) : null}

                {item.candidatos?.length > 1 && !item.honorarios ? (
                    <div className="conf_lab_candidatos">
                        <h3>Candidatos (escolha um)</h3>
                        <ul>
                            {item.candidatos.map((c) => (
                                <li key={c.id}>
                                    <span>
                                        {c.tutor} · {c.pet} · {formatarDataConferencia(c.data)} ·{' '}
                                        {c.exame} · {formatarValorConferencia(c.valor)}
                                    </span>
                                    {podeEditar ? (
                                        <button
                                            type="button"
                                            className="credenciamento_main_action_btn"
                                            disabled={!orfaosPlano.some((o) => o.honorarios?.id === c.id)}
                                            title={
                                                orfaosPlano.some((o) => o.honorarios?.id === c.id)
                                                    ? ''
                                                    : 'Este item do plano já foi usado em outro par.'
                                            }
                                            onClick={() =>
                                                onAcao('confirmar', {
                                                    honorariosId: c.id,
                                                    justificativa: textoJust,
                                                })
                                            }
                                        >
                                            Usar este
                                        </button>
                                    ) : null}
                                </li>
                            ))}
                        </ul>
                    </div>
                ) : null}

                {podeEditar && !ehOrfao ? (
                    <label className="conf_lab_justificativa">
                        <span>
                            Justificativa <small>(obrigatória para aceitar um valor divergente)</small>
                        </span>
                        <textarea
                            rows={2}
                            value={textoJust}
                            onChange={(e) => setJustificativa({ itemId: item.id, texto: e.target.value })}
                            placeholder="Ex.: reajuste autorizado pelo financeiro"
                        />
                    </label>
                ) : null}

                {podeEditar ? (
                    <footer className="conf_lab_drawer_acoes">
                        {!ehOrfao ? (
                            <>
                                <button
                                    type="button"
                                    className="credenciamento_main_action_btn"
                                    onClick={() => onAcao('confirmar', { justificativa: textoJust })}
                                >
                                    Confirmar correspondência
                                </button>
                                {item.honorarios &&
                                item.mellis &&
                                !compareValues(item.valor_honorarios, item.valor_mellislab).ok ? (
                                    <button
                                        type="button"
                                        className="credenciamento_main_action_btn secondary"
                                        disabled={textoJust.trim().length < JUSTIFICATIVA_MIN}
                                        title={
                                            textoJust.trim().length < JUSTIFICATIVA_MIN
                                                ? 'Escreva a justificativa para aceitar o valor.'
                                                : ''
                                        }
                                        onClick={() => onAcao('aceitar_valor', { justificativa: textoJust })}
                                    >
                                        Aceitar valor
                                    </button>
                                ) : null}
                                <button
                                    type="button"
                                    className="credenciamento_main_action_btn secondary"
                                    onClick={() => onAcao('nao_corresponde', { justificativa: textoJust })}
                                >
                                    Não corresponde
                                </button>
                                <button
                                    type="button"
                                    className="credenciamento_main_action_btn secondary"
                                    onClick={() => onAcao('tutor_alternativo', { justificativa: textoJust })}
                                >
                                    Tutor alternativo
                                </button>
                                <button
                                    type="button"
                                    className="credenciamento_main_action_btn secondary"
                                    onClick={() => onAcao('exame_equivalente', { justificativa: textoJust })}
                                >
                                    Exame equivalente
                                </button>
                                <button
                                    type="button"
                                    className="credenciamento_main_action_btn secondary"
                                    onClick={() => onAcao('perfil_equivalente', { justificativa: textoJust })}
                                >
                                    Perfil equivalente
                                </button>
                            </>
                        ) : null}
                        <button
                            type="button"
                            className="credenciamento_main_action_btn secondary"
                            onClick={() => onAcao('ignorar', { justificativa: textoJust })}
                        >
                            Ignorar
                        </button>
                    </footer>
                ) : null}
            </aside>
        </div>,
        document.body,
    )
}
