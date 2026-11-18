import React, { memo, useEffect, useMemo, useRef, useState } from 'react'
import {
    formatarDataConferencia,
    formatarValorConferencia,
} from '../../../lib/configuracoes/conferenciaLaboratorioPrecos.js'
import { rotuloStatusConferencia } from '../../../lib/configuracoes/conferencia/index.js'
import { agruparPorTutor, camposIguais } from '../../../lib/configuracoes/conferencia/visaoResultado.js'

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
    if (dv == null || dv === '') return ''
    const n = Number(dv)
    if (!Number.isFinite(n) || n === 0) return ''
    return `${n > 0 ? '+' : '−'}${formatarValorConferencia(Math.abs(n))}`
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

/**
 * Um campo da linha: se Plano e Laboratório concordam, aparece uma vez; se divergem, aparecem empilhados e
 * destacados; se só existe um lado (órfão), mostra esse lado marcado.
 */
function Campo({ temPlano, temLab, plano, lab, igual, formatar = (v) => v || '—', extra }) {
    if (temPlano && temLab) {
        if (igual(plano, lab)) {
            return (
                <>
                    <span>{formatar(plano)}</span>
                    {extra}
                </>
            )
        }
        return (
            <div className="conf_lab_campo_dif">
                <span>
                    <em>Plano</em> {formatar(plano)}
                </span>
                <span>
                    <em>Lab</em> {formatar(lab)}
                </span>
                {extra}
            </div>
        )
    }
    if (temPlano) {
        return (
            <>
                <span>{formatar(plano)}</span>
                {extra}
            </>
        )
    }
    if (temLab) {
        return (
            <>
                <span>{formatar(lab)}</span>
                {extra}
            </>
        )
    }
    return <span>—</span>
}

function OrigemTag({ r }) {
    if (r.honorarios && r.mellis) return null
    return (
        <small className="conf_lab_origem_tag">{r.honorarios ? 'Só no plano' : 'Só no laboratório'}</small>
    )
}

function CelulasDaLinha({ r }) {
    const temPlano = Boolean(r.honorarios)
    const temLab = Boolean(r.mellis)
    const dias = r.diferenca_dias
    const difValor = textoDiferencaValor(r)
    return (
        <>
            <td className="conf_lab_col_tutor">
                <Campo
                    temPlano={temPlano}
                    temLab={temLab}
                    plano={r.tutor_honorarios}
                    lab={r.tutor_mellislab}
                    igual={camposIguais.texto}
                />
            </td>
            <td>
                <Campo
                    temPlano={temPlano}
                    temLab={temLab}
                    plano={r.pet_honorarios}
                    lab={r.pet_mellislab}
                    igual={camposIguais.texto}
                />
            </td>
            <td className="conf_lab_col_data">
                <Campo
                    temPlano={temPlano}
                    temLab={temLab}
                    plano={r.data_honorarios}
                    lab={r.data_mellislab}
                    igual={camposIguais.data}
                    formatar={formatarDataConferencia}
                    extra={
                        dias != null && dias !== '' && Number(dias) !== 0 ? (
                            <small className="conf_lab_dif_nota">{dias} dia(s) de diferença</small>
                        ) : null
                    }
                />
            </td>
            <td>
                <Campo
                    temPlano={temPlano}
                    temLab={temLab}
                    plano={r.exame_honorarios}
                    lab={r.exame_mellislab}
                    igual={camposIguais.texto}
                />
            </td>
            <td className="conf_lab_col_valor">
                <Campo
                    temPlano={temPlano}
                    temLab={temLab}
                    plano={r.valor_honorarios}
                    lab={r.valor_mellislab}
                    igual={camposIguais.valor}
                    formatar={formatarValorConferencia}
                    extra={difValor ? <small className="conf_lab_dif_nota">{difValor}</small> : null}
                />
            </td>
        </>
    )
}

const LinhaResultado = memo(function LinhaResultado({
    r,
    indice,
    selecionado,
    podeEditar,
    onToggle,
    onAbrir,
    filha = false,
}) {
    return (
        <tr
            className={`conf_lab_lin ${classeStatus(r.status)}${selecionado ? ' is-sel' : ''}${filha ? ' is-filha' : ''}`}
            onClick={(e) => {
                if (cliqueAbreDetalhe(e)) onAbrir(r)
            }}
        >
            <td className="conf_lab_col_sel">
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
            <td className="conf_lab_col_status">
                <span className={`conf_lab_badge ${classeStatus(r.status)}`}>
                    {rotuloStatusConferencia(r.status)}
                </span>
                <OrigemTag r={r} />
            </td>
            <CelulasDaLinha r={r} />
            <td className="conf_lab_col_resultado">
                <span>{r.motivo || '—'}</span>
                <small>
                    {r.confianca ? `Confiança ${String(r.confianca).toLowerCase()} · ` : ''}
                    {r.revisao?.acao || r.acao || 'Revisar'}
                </small>
            </td>
        </tr>
    )
})

function somaValores(rows, campo) {
    return rows.reduce((s, r) => s + (Number.isFinite(Number(r[campo])) ? Number(r[campo]) : 0), 0)
}

function LinhaGrupo({ grupo, selecionados, podeEditar, onToggleGrupo, aberto, onAlternar }) {
    const { rows } = grupo
    const primeira = rows[0]
    const marcadas = rows.filter((r) => selecionados.has(r.id)).length
    const porStatus = new Map()
    rows.forEach((r) => porStatus.set(r.status, (porStatus.get(r.status) || 0) + 1))
    return (
        <tr className={`conf_lab_lin conf_lab_grupo ${marcadas ? 'is-sel' : ''}`}>
            <td className="conf_lab_col_sel">
                {podeEditar ? (
                    <CheckboxIndeterminado
                        checked={marcadas === rows.length}
                        indeterminate={marcadas > 0 && marcadas < rows.length}
                        onChange={() => onToggleGrupo(rows, marcadas !== rows.length)}
                        label={`Selecionar os ${rows.length} exames deste tutor`}
                    />
                ) : null}
            </td>
            <td className="conf_lab_col_status">
                {[...porStatus.entries()].map(([st, n]) => (
                    <span key={st} className={`conf_lab_badge ${classeStatus(st)}`}>
                        {n}× {rotuloStatusConferencia(st)}
                    </span>
                ))}
            </td>
            <td className="conf_lab_col_tutor">
                <Campo
                    temPlano={Boolean(primeira.honorarios)}
                    temLab={Boolean(primeira.mellis)}
                    plano={primeira.tutor_honorarios}
                    lab={primeira.tutor_mellislab}
                    igual={camposIguais.texto}
                />
            </td>
            <td>
                <Campo
                    temPlano={Boolean(primeira.honorarios)}
                    temLab={Boolean(primeira.mellis)}
                    plano={primeira.pet_honorarios}
                    lab={primeira.pet_mellislab}
                    igual={camposIguais.texto}
                />
            </td>
            <td className="conf_lab_col_data">—</td>
            <td>
                <strong>{rows.length} exames</strong>
            </td>
            <td className="conf_lab_col_valor">
                <span>{formatarValorConferencia(somaValores(rows, 'valor_honorarios'))}</span>
                <small className="conf_lab_dif_nota">lab {formatarValorConferencia(somaValores(rows, 'valor_mellislab'))}</small>
            </td>
            <td className="conf_lab_col_resultado">
                <button type="button" className="credenciamento_main_action_btn secondary" onClick={onAlternar}>
                    {aberto ? 'Recolher' : `Revisar os ${rows.length}`}
                </button>
            </td>
        </tr>
    )
}

const COLUNAS = [
    { id: 'tutor', rotulo: 'Tutor', className: 'conf_lab_col_tutor' },
    { id: 'animal', rotulo: 'Animal' },
    { id: 'data', rotulo: 'Data', className: 'conf_lab_col_data' },
    { id: 'exame', rotulo: 'Exame' },
    { id: 'valor', rotulo: 'Valor', className: 'conf_lab_col_valor' },
    { id: 'resultado', rotulo: 'Resultado' },
]

/**
 * Tabela de resultados: uma linha por par (o que é igual aparece uma vez; o que difere, destacado), agrupamento
 * opcional por tutor, densidade e paginação incremental. Cada linha é memoizada.
 */
export default function ResultadoTabela({
    linhas,
    selecionados,
    podeEditar,
    ordem,
    onOrdenar,
    onToggle,
    onToggleTodos,
    onToggleVarios,
    onAbrir,
    todosMarcados,
    algunsMarcados,
}) {
    // `key` do pai reinicia paginação e grupos abertos ao mudar filtro/busca/ordem.
    const [limite, setLimite] = useState(TAMANHO_PAGINA)
    const [agrupar, setAgrupar] = useState(true)
    const [compacta, setCompacta] = useState(false)
    const [abertos, setAbertos] = useState(() => new Set())

    const exibidas = linhas.length > limite ? linhas.slice(0, limite) : linhas
    const itens = useMemo(
        () => (agrupar ? agruparPorTutor(exibidas) : exibidas.map((r) => ({ tipo: 'linha', r }))),
        [agrupar, exibidas],
    )

    const alternarGrupo = (chave) =>
        setAbertos((prev) => {
            const novo = new Set(prev)
            if (novo.has(chave)) novo.delete(chave)
            else novo.add(chave)
            return novo
        })

    let contador = 0
    return (
        <>
            <div className="conf_lab_tabela_barra">
                <label className="conf_lab_toggle">
                    <input type="checkbox" checked={agrupar} onChange={(e) => setAgrupar(e.target.checked)} />
                    Agrupar por tutor
                </label>
                <label className="conf_lab_toggle">
                    <input type="checkbox" checked={compacta} onChange={(e) => setCompacta(e.target.checked)} />
                    Densidade compacta
                </label>
            </div>
            <div className="conf_lab_table_wrap conf_lab_tabela_rolagem">
                <table className={`conf_lab_table conf_lab_tabela_v2${compacta ? ' is-compacta' : ''}`}>
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
                    <tbody>
                        {itens.map((item) => {
                            if (item.tipo === 'linha') {
                                const i = contador++
                                return (
                                    <LinhaResultado
                                        key={item.r.id}
                                        r={item.r}
                                        indice={i}
                                        selecionado={selecionados.has(item.r.id)}
                                        podeEditar={podeEditar}
                                        onToggle={onToggle}
                                        onAbrir={onAbrir}
                                    />
                                )
                            }
                            const aberto = abertos.has(item.chave)
                            contador += item.rows.length
                            return (
                                <React.Fragment key={`g|${item.chave}`}>
                                    <LinhaGrupo
                                        grupo={item}
                                        selecionados={selecionados}
                                        podeEditar={podeEditar}
                                        onToggleGrupo={onToggleVarios}
                                        aberto={aberto}
                                        onAlternar={() => alternarGrupo(item.chave)}
                                    />
                                    {aberto
                                        ? item.rows.map((r, k) => (
                                              <LinhaResultado
                                                  key={r.id}
                                                  r={r}
                                                  indice={k}
                                                  filha
                                                  selecionado={selecionados.has(r.id)}
                                                  podeEditar={podeEditar}
                                                  onToggle={onToggle}
                                                  onAbrir={onAbrir}
                                              />
                                          ))
                                        : null}
                                </React.Fragment>
                            )
                        })}
                    </tbody>
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
