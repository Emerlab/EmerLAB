import React, { useState } from 'react'
import { textoCelulaLimiteGrupo } from '../../../lib/categoriaLimitesGrupo.js'
import { CHAVES_PLANOS_MATRIZ } from '../../../lib/matrizCarenciasLimites.js'
import { CHAVE_PLANO_APENAS_LOJA, ROTULO_PLANO } from '../../../lib/planosHierarquia.js'

/**
 * Tabela de uma categoria na matriz de carências e limites: 4 planos × (limite, carência).
 * Do plano base para cima as células editam; abaixo vale «<base> Acima» (somente leitura).
 * O rascunho de cada input vive aqui; a gravação é do pai (`onSalvarCelula` devolve true/false).
 *
 * Layout: no PC a tabela tem largura mínima e rola na horizontal (nada é cortado); abaixo de 640 px a classe
 * `tabela-cartoes` (src/lib/tabelaCartoes.js + global-styles.css) vira um cartão por procedimento, por isso
 * cada célula traz `data-label` («Básico · Limite»).
 */
export default function MatrizCarenciasLimitesTabela({
    secao,
    somenteLeitura,
    edicaoAtiva,
    onSalvarCelula,
    onColar,
    onLimpar,
    onOrdenar,
    indicadorOrdenacao,
    classeNome,
}) {
    const [rascunhos, setRascunhos] = useState({})
    const [editando, setEditando] = useState(null)

    const confirmar = async (linha, chave, campo) => {
        const chaveRascunho = `${linha.codigo}|${chave}|${campo}`
        const bruto = rascunhos[chaveRascunho]
        if (bruto === undefined) return
        try {
            if (bruto !== (linha.celulas[chave]?.[campo] ?? '')) {
                await onSalvarCelula(linha, chave, campo, bruto)
            }
        } finally {
            setRascunhos((anterior) => {
                const copia = { ...anterior }
                delete copia[chaveRascunho]
                return copia
            })
        }
    }

    const renderCelula = (linha, linhaIndex, chave, campo) => {
        const celula = linha.celulas[chave]
        const chaveTd = `${linha.codigo}-${chave}-${campo}`
        const rotuloCampo = campo === 'limite' ? 'Limite' : 'Carência'
        const rotulo = `${ROTULO_PLANO[chave]} · ${rotuloCampo}`
        if (!celula) return <td key={chaveTd} data-label={rotulo} className='supertabelaplanos_td_centro' />

        if (celula.modo === 'acima') {
            // Limite e carência trazem o mesmo texto: no cartão do celular só a primeira aparece.
            const duplicada = campo === 'carencia'
            return (
                <td
                    key={chaveTd}
                    data-label={ROTULO_PLANO[chave]}
                    className={`supertabelaplanos_td_centro supertabelaplanos_celula_acima${
                        duplicada ? ' supertabelaplanos_celula_acima_dup' : ''
                    }`}
                >
                    <span className='supertabelaplanos_matriz_valor' title={celula[campo]}>
                        {celula[campo]}
                    </span>
                </td>
            )
        }

        if (campo === 'limite' && celula.limiteGrupo) {
            const textoCompleto = textoCelulaLimiteGrupo(celula.limiteGrupo, secao.categoriaNome)
            return (
                <td
                    key={chaveTd}
                    data-label={rotulo}
                    className='supertabelaplanos_td_centro supertabelaplanos_limite_grupo_cell'
                    title={textoCompleto}
                >
                    <span>Grupo: {celula.limiteGrupo}</span>
                </td>
            )
        }

        const valorGravado = celula[campo] ?? ''
        const chaveRascunho = `${linha.codigo}|${chave}|${campo}`
        const vazio = !String(valorGravado).trim()
        return (
            <td
                key={chaveTd}
                data-label={rotulo}
                className={`supertabelaplanos_td_centro${vazio ? ' supertabelaplanos_celula_vazia' : ''}`}
            >
                {edicaoAtiva && editando === chaveRascunho ? (
                    <textarea
                        className='table_cell_input_text supertabelaplanos_matriz_textarea'
                        rows={2}
                        autoFocus
                        aria-label={`${rotuloCampo} ${ROTULO_PLANO[chave]} — ${linha.codigo}`}
                        value={rascunhos[chaveRascunho] ?? valorGravado}
                        onChange={(event) =>
                            setRascunhos((anterior) => ({
                                ...anterior,
                                [chaveRascunho]: event.target.value.replace(/\s*\n\s*/g, ' '),
                            }))
                        }
                        onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                                event.preventDefault()
                                event.currentTarget.blur()
                            } else if (event.key === 'Escape') {
                                event.preventDefault()
                                setRascunhos((anterior) => {
                                    const copia = { ...anterior }
                                    delete copia[chaveRascunho]
                                    return copia
                                })
                                setEditando(null)
                            }
                        }}
                        onBlur={() => {
                            const pendente = confirmar(linha, chave, campo)
                            setEditando(null)
                            return pendente
                        }}
                        onPaste={(event) => {
                            event.preventDefault()
                            onColar(secao.linhas, linhaIndex, chave, campo, event.clipboardData?.getData('text') || '')
                        }}
                    />
                ) : edicaoAtiva ? (
                    <div
                        className='supertabelaplanos_matriz_valor_editavel'
                        role='textbox'
                        tabIndex={0}
                        aria-label={`${rotuloCampo} ${ROTULO_PLANO[chave]} — ${linha.codigo}`}
                        title={rascunhos[chaveRascunho] ?? valorGravado}
                        onFocus={() => setEditando(chaveRascunho)}
                    >
                        <span className='supertabelaplanos_matriz_valor'>
                            {rascunhos[chaveRascunho] ?? (valorGravado || '\u00a0')}
                        </span>
                    </div>
                ) : (
                    <span className='supertabelaplanos_matriz_valor' title={valorGravado}>
                        {valorGravado || '\u00a0'}
                    </span>
                )}
            </td>
        )
    }

    return (
        <div className='supertabelaplanos_matriz_scroll'>
            <table className='table_main supertabelaplanos_matriz tabela-cartoes'>
                <colgroup>
                    <col className='supertabelaplanos_matriz_col_codigo' />
                    <col className='supertabelaplanos_matriz_col_nome' />
                    {CHAVES_PLANOS_MATRIZ.flatMap((chave) => [
                        <col key={`${chave}-l`} className='supertabelaplanos_matriz_col_limite' />,
                        <col key={`${chave}-c`} className='supertabelaplanos_matriz_col_carencia' />,
                    ])}
                    {!somenteLeitura && <col className='supertabelaplanos_matriz_col_acao' />}
                </colgroup>
                <thead>
                    <tr>
                        <th rowSpan={2} className='table_header' onClick={() => onOrdenar(secao.categoriaId, 'codigo')}>
                            Código{indicadorOrdenacao('codigo')}
                        </th>
                        <th
                            rowSpan={2}
                            className='table_header supertabelaplanos_th_nome'
                            onClick={() => onOrdenar(secao.categoriaId, 'procedimento')}
                        >
                            Nome{indicadorOrdenacao('procedimento')}
                        </th>
                        {CHAVES_PLANOS_MATRIZ.map((chave) => (
                            <th
                                key={chave}
                                colSpan={2}
                                className='table_header table_header_no_sort supertabelaplanos_th_centro'
                            >
                                {ROTULO_PLANO[chave]}
                            </th>
                        ))}
                        {!somenteLeitura && (
                            <th rowSpan={2} className='table_header table_header_no_sort'>
                                Ação
                            </th>
                        )}
                    </tr>
                    <tr>
                        {CHAVES_PLANOS_MATRIZ.flatMap((chave) => [
                            <th key={`${chave}-l`} className='table_header table_header_no_sort supertabelaplanos_th_centro'>
                                Limite
                            </th>,
                            <th key={`${chave}-c`} className='table_header table_header_no_sort supertabelaplanos_th_centro'>
                                Carência
                            </th>,
                        ])}
                    </tr>
                </thead>
                <tbody>
                    {secao.linhas.map((linha, linhaIndex) => (
                        <tr key={`${secao.categoriaId}-${linha.codigo}-mx`}>
                            <td className='table_text_left supertabelaplanos_matriz_td_codigo' data-label='Código'>
                                {linha.codigo}
                            </td>
                            <td
                                data-label=''
                                className={`table_text_left supertabelaplanos_td_nome ${classeNome(linha.procedimento)}`}
                            >
                                <span className='supertabelaplanos_nome_com_flag'>
                                    {linha.procedimento}
                                    {linha.apenasLoja ? (
                                        <span className='supertabelaplanos_flag_loja' title={ROTULO_PLANO[CHAVE_PLANO_APENAS_LOJA]}>
                                            Loja
                                        </span>
                                    ) : null}
                                </span>
                            </td>
                            {CHAVES_PLANOS_MATRIZ.flatMap((chave) => [
                                renderCelula(linha, linhaIndex, chave, 'limite'),
                                renderCelula(linha, linhaIndex, chave, 'carencia'),
                            ])}
                            {!somenteLeitura && (
                                <td data-label='' className='supertabelaplanos_matriz_td_acao'>
                                    <button
                                        type='button'
                                        className='table_delete_btn'
                                        onClick={(event) => onLimpar(linha, { ignorarConfirmacao: event.shiftKey })}
                                        title='Limpar limites e carências deste procedimento, SHIFT = limpar rápido'
                                    >
                                        🧹
                                    </button>
                                </td>
                            )}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}
