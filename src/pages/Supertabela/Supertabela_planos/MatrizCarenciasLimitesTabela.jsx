import React, { useState } from 'react'
import { textoCelulaLimiteGrupo } from '../../../lib/categoriaLimitesGrupo.js'
import { CHAVES_PLANOS_MATRIZ } from '../../../lib/matrizCarenciasLimites.js'
import { CHAVE_PLANO_APENAS_LOJA, ROTULO_PLANO } from '../../../lib/planosHierarquia.js'

/**
 * Tabela de uma categoria na matriz de carências e limites: 4 planos × (limite, carência).
 * Do plano base para cima as células editam; abaixo vale «<base> Acima» (somente leitura).
 * O rascunho de cada input vive aqui; a gravação é do pai (`onSalvarCelula` devolve true/false).
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
        if (!celula) return <td key={chaveTd} className='supertabelaplanos_td_centro' />

        if (celula.modo === 'acima') {
            return (
                <td key={chaveTd} className='supertabelaplanos_td_centro supertabelaplanos_celula_acima'>
                    <span>{celula[campo]}</span>
                </td>
            )
        }

        if (campo === 'limite' && celula.limiteGrupo) {
            return (
                <td key={chaveTd} className='supertabelaplanos_td_centro supertabelaplanos_limite_grupo_cell'>
                    {textoCelulaLimiteGrupo(celula.limiteGrupo, secao.categoriaNome)}
                </td>
            )
        }

        const valorGravado = celula[campo] ?? ''
        const chaveRascunho = `${linha.codigo}|${chave}|${campo}`
        const vazio = !String(valorGravado).trim()
        return (
            <td
                key={chaveTd}
                className={`supertabelaplanos_td_centro${vazio ? ' supertabelaplanos_celula_vazia' : ''}`}
            >
                {edicaoAtiva ? (
                    <input
                        className='table_cell_input_text'
                        type='text'
                        aria-label={`${campo === 'limite' ? 'Limite' : 'Carência'} ${ROTULO_PLANO[chave]} — ${linha.codigo}`}
                        value={rascunhos[chaveRascunho] ?? valorGravado}
                        onChange={(event) =>
                            setRascunhos((anterior) => ({ ...anterior, [chaveRascunho]: event.target.value }))
                        }
                        onBlur={() => confirmar(linha, chave, campo)}
                        onPaste={(event) => {
                            event.preventDefault()
                            onColar(secao.linhas, linhaIndex, chave, campo, event.clipboardData?.getData('text') || '')
                        }}
                    />
                ) : (
                    <span>{valorGravado || ' '}</span>
                )}
            </td>
        )
    }

    return (
        <table className='table_main supertabelaplanos_matriz'>
            <colgroup>
                <col className='supertabelaplanos_col_codigo' style={{ width: '9%' }} />
                <col className='supertabelaplanos_col_nome' style={{ width: somenteLeitura ? '25%' : '21%' }} />
                {CHAVES_PLANOS_MATRIZ.flatMap((chave) => [
                    <col key={`${chave}-l`} style={{ width: somenteLeitura ? '8.25%' : '8%' }} />,
                    <col key={`${chave}-c`} style={{ width: somenteLeitura ? '8.25%' : '8%' }} />,
                ])}
                {!somenteLeitura && <col className='supertabelaplanos_col_acao' style={{ width: '6%' }} />}
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
                        <td className='table_text_left'>{linha.codigo}</td>
                        <td className={`table_text_left supertabelaplanos_td_nome ${classeNome(linha.procedimento)}`}>
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
                            <td>
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
    )
}
