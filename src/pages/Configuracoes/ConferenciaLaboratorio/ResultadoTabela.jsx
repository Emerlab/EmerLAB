import React, { memo, useEffect, useRef, useState } from 'react'
import {
    formatarDataConferencia,
    formatarValorConferencia,
} from '../../../lib/configuracoes/conferenciaLaboratorioPrecos.js'
import { rotuloStatusConferencia } from '../../../lib/configuracoes/conferencia/index.js'
import logoE from '../../../assets/logo_E.png'

const TAMANHO_PAGINA = 150

function classeStatus(status) {
    if (String(status || '').startsWith('OK') || status === 'PERFIL_EQUIVALENTE' || status === 'VALOR_ACEITO') {
        return 'is-ok'
    }
    if (status === 'REVISAO_MANUAL') return 'is-rev'
    if (String(status || '').startsWith('ORFAO')) return 'is-orf'
    return 'is-div'
}

function textoDiferencaValor(r) {
    const dv = r.diferenca_valor
    if (dv == null || dv === '') return '—'
    const sinal = Number(dv) > 0 ? '+' : ''
    return `${sinal}${formatarValorConferencia(Math.abs(dv)).replace('R$', '').trim()}`
}

function cliqueAbreDetalhe(e) {
    return !e.target.closest('input, button, label, a')
}

function CheckboxIndeterminado({ checked, indeterminate, onChange, label }) {
    const ref = useRef(null)
    useEffect(() => {
        if (ref.current) ref.current.indeterminate = Boolean(indeterminate)
    }, [indeterminate])
    return (
        <input
            ref={ref}
            type="checkbox"
            checked={checked}
            onChange={onChange}
            onClick={(e) => e.stopPropagation()}
            aria-label={label}
        />
    )
}

function ThOrdenavel({ coluna, ordem, onOrdenar, className, children }) {
    const ativo = ordem.chave === coluna
    return (
        <th
            className={className}
            aria-sort={ativo ? (ordem.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
        >
            <button
                type="button"
                className={`conf_lab_th_sort${ativo ? ' is-on' : ''}`}
                onClick={() => onOrdenar(coluna)}
            >
                {children}
                <span className="conf_lab_th_seta" aria-hidden>
                    {ativo ? (ordem.dir === 'asc' ? '▲' : '▼') : '↕'}
                </span>
            </button>
        </th>
    )
}

const LinhaResultado = memo(function LinhaResultado({ r, indice, selecionado, podeEditar, onToggle, onAbrir }) {
    return (
        <tbody
            className={`conf_lab_par ${classeStatus(r.status)}${selecionado ? ' is-sel' : ''}`}
            onClick={(e) => {
                if (cliqueAbreDetalhe(e)) onAbrir(r)
            }}
        >
            <tr>
                <td className="conf_lab_col_sel" rowSpan={2}>
                    {podeEditar ? (
                        <input
                            type="checkbox"
                            checked={selecionado}
                            onChange={() => onToggle(r.id)}
                            onClick={(e) => e.stopPropagation()}
                            aria-label={`Selecionar linha ${indice + 1}`}
                        />
                    ) : (
                        indice + 1
                    )}
                </td>
                <td className="conf_lab_col_status" rowSpan={2}>
                    <span className={`conf_lab_badge ${classeStatus(r.status)}`}>
                        {rotuloStatusConferencia(r.status)}
                    </span>
                </td>
                <td className="conf_lab_col_origem">
                    <img src={logoE} alt="Plano" title="Plano" className="conf_lab_ico_plano" />
                </td>
                <td>{r.honorarios ? r.tutor_honorarios || '—' : '—'}</td>
                <td>{r.honorarios ? r.pet_honorarios || '—' : '—'}</td>
                <td className="conf_lab_col_data">
                    {r.honorarios ? formatarDataConferencia(r.data_honorarios) : '—'}
                </td>
                <td>{r.honorarios ? r.exame_honorarios || '—' : '—'}</td>
                <td className="conf_lab_col_valor">
                    {r.honorarios ? formatarValorConferencia(r.valor_honorarios) : '—'}
                </td>
                <td className="conf_lab_col_difdias" rowSpan={2}>
                    {r.diferenca_dias ?? '—'}
                </td>
                <td className="conf_lab_col_difvalor" rowSpan={2}>
                    {textoDiferencaValor(r)}
                </td>
                <td className="conf_lab_col_conf" rowSpan={2}>
                    {r.confianca || '—'}
                </td>
                <td className="conf_lab_col_resultado" rowSpan={2}>
                    <span>{r.motivo || '—'}</span>
                    <small>{r.revisao?.acao || r.acao || 'Revisar'}</small>
                </td>
            </tr>
            <tr>
                <td className="conf_lab_col_origem">
                    <span className="conf_lab_ico_lab" title="Laboratório" aria-label="Laboratório">
                        <span className="conf_lab_frasco" aria-hidden="true" />
                    </span>
                </td>
                <td>{r.mellis ? r.tutor_mellislab || '—' : '—'}</td>
                <td>{r.mellis ? r.pet_mellislab || '—' : '—'}</td>
                <td className="conf_lab_col_data">
                    {r.mellis ? formatarDataConferencia(r.data_mellislab) : '—'}
                </td>
                <td>{r.mellis ? r.exame_mellislab || '—' : '—'}</td>
                <td className="conf_lab_col_valor">
                    {r.mellis ? formatarValorConferencia(r.valor_mellislab) : '—'}
                </td>
            </tr>
        </tbody>
    )
})

const COLUNAS = [
    { id: 'tutor', rotulo: 'Tutor' },
    { id: 'animal', rotulo: 'Animal' },
    { id: 'data', rotulo: 'Data', className: 'conf_lab_col_data' },
    { id: 'exame', rotulo: 'Exame' },
    { id: 'valor', rotulo: 'Valor', className: 'conf_lab_col_valor' },
    { id: 'difdias', rotulo: 'Dif dias', className: 'conf_lab_col_difdias' },
    { id: 'difvalor', rotulo: 'Dif Valor', className: 'conf_lab_col_difvalor' },
    { id: 'confianca', rotulo: 'Confiança', className: 'conf_lab_col_conf' },
    { id: 'resultado', rotulo: 'Resultado' },
]

/**
 * Tabela de resultados com paginação incremental: só renderiza `TAMANHO_PAGINA` linhas por vez
 * e cada linha é memoizada (marcar uma caixa não redesenha as demais).
 */
export default function ResultadoTabela({
    linhas,
    selecionados,
    podeEditar,
    ordem,
    onOrdenar,
    onToggle,
    onToggleTodos,
    onAbrir,
    todosMarcados,
    algunsMarcados,
}) {
    // `resetKey` é usado como `key` pelo pai: ao mudar filtro/busca/ordem o componente reinicia a paginação.
    const [limite, setLimite] = useState(TAMANHO_PAGINA)

    const exibidas = linhas.length > limite ? linhas.slice(0, limite) : linhas

    return (
        <>
            <div className="conf_lab_table_wrap conf_lab_table_wrap_compact overflow-x-auto">
                <table className="conf_lab_table conf_lab_table_compact">
                    <thead>
                        <tr>
                            <th className="conf_lab_col_sel">
                                {podeEditar ? (
                                    <CheckboxIndeterminado
                                        checked={todosMarcados}
                                        indeterminate={algunsMarcados && !todosMarcados}
                                        onChange={onToggleTodos}
                                        label="Selecionar todas as linhas filtradas"
                                    />
                                ) : null}
                            </th>
                            <ThOrdenavel
                                coluna="status"
                                ordem={ordem}
                                onOrdenar={onOrdenar}
                                className="conf_lab_col_status"
                            >
                                Status
                            </ThOrdenavel>
                            <th className="conf_lab_col_origem" aria-label="Origem" />
                            {COLUNAS.map((c) => (
                                <ThOrdenavel
                                    key={c.id}
                                    coluna={c.id}
                                    ordem={ordem}
                                    onOrdenar={onOrdenar}
                                    className={c.className}
                                >
                                    {c.rotulo}
                                </ThOrdenavel>
                            ))}
                        </tr>
                    </thead>
                    {exibidas.map((r, i) => (
                        <LinhaResultado
                            key={r.id}
                            r={r}
                            indice={i}
                            selecionado={selecionados.has(r.id)}
                            podeEditar={podeEditar}
                            onToggle={onToggle}
                            onAbrir={onAbrir}
                        />
                    ))}
                </table>
            </div>
            {linhas.length > exibidas.length ? (
                <div className="conf_lab_actions">
                    <span className="conf_lab_muted">
                        Mostrando {exibidas.length} de {linhas.length} linhas.
                    </span>
                    <button
                        type="button"
                        className="credenciamento_main_action_btn secondary"
                        onClick={() => setLimite((v) => v + TAMANHO_PAGINA)}
                    >
                        Mostrar mais {Math.min(TAMANHO_PAGINA, linhas.length - exibidas.length)}
                    </button>
                    <button
                        type="button"
                        className="credenciamento_main_action_btn secondary"
                        onClick={() => setLimite(linhas.length)}
                    >
                        Mostrar todas
                    </button>
                </div>
            ) : null}
            {!linhas.length ? <p className="conf_lab_muted">Nenhuma linha neste filtro.</p> : null}
        </>
    )
}
