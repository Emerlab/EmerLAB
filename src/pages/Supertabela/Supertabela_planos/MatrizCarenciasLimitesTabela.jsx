import React, { memo, useMemo, useRef, useState } from 'react'
import { textoCelulaLimiteGrupo } from '../../../lib/categoriaLimitesGrupo.js'
import { CHAVES_PLANOS_MATRIZ } from '../../../lib/matrizCarenciasLimites.js'
import { CHAVE_PLANO_APENAS_LOJA, ROTULO_PLANO } from '../../../lib/planosHierarquia.js'

/**
 * Tabela de uma categoria na matriz de carências e limites: 4 planos × (limite, carência).
 * Do plano base para cima as células editam; abaixo vale «<base> Acima» (somente leitura).
 *
 * Desempenho (centenas de linhas por categoria):
 * - o rascunho de cada célula vive na própria célula (`CelulaEditavel`), então digitar só renderiza ela;
 * - cada linha é `memo` e só renderiza quando o objeto `linha` muda (o pai troca só a linha editada);
 * - as ações chegam por um objeto estável (lido via ref), para a identidade das props não mudar a cada render.
 * A gravação é do pai: `onSalvarCelula` é chamado ao sair da célula e o pai atualiza a tela de imediato
 * (e desfaz se a gravação falhar).
 *
 * Layout: no PC a tabela tem largura mínima e rola na horizontal; abaixo de 640 px a classe `tabela-cartoes`
 * (src/lib/tabelaCartoes.js + global-styles.css) vira um cartão por procedimento, por isso cada célula traz
 * `data-label` («Básico · Limite»).
 */

const CelulaEditavel = memo(function CelulaEditavel({ valorGravado, rotulo, rotuloAria, edicaoAtiva, onSalvar, onColar }) {
    const [editando, setEditando] = useState(false)
    const [rascunho, setRascunho] = useState(null)
    const descartarRef = useRef(false)

    const vazio = !String(valorGravado).trim()
    const exibido = rascunho ?? valorGravado

    const encerrar = () => {
        setEditando(false)
        const bruto = rascunho
        setRascunho(null)
        if (descartarRef.current) {
            descartarRef.current = false
            return
        }
        if (bruto !== null && bruto !== valorGravado) onSalvar(bruto)
    }

    let conteudo
    if (edicaoAtiva && editando) {
        conteudo = (
            <textarea
                className='table_cell_input_text supertabelaplanos_matriz_textarea'
                rows={2}
                autoFocus
                aria-label={rotuloAria}
                value={exibido}
                onChange={(event) => setRascunho(event.target.value.replace(/\s*\n\s*/g, ' '))}
                onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                        event.preventDefault()
                        event.currentTarget.blur()
                    } else if (event.key === 'Escape') {
                        event.preventDefault()
                        descartarRef.current = true
                        setRascunho(null)
                        setEditando(false)
                    }
                }}
                onBlur={encerrar}
                onPaste={(event) => {
                    event.preventDefault()
                    onColar(event.clipboardData?.getData('text') || '')
                }}
            />
        )
    } else if (edicaoAtiva) {
        conteudo = (
            <div
                className='supertabelaplanos_matriz_valor_editavel'
                role='textbox'
                tabIndex={0}
                aria-label={rotuloAria}
                title={exibido}
                onFocus={() => {
                    descartarRef.current = false
                    setEditando(true)
                }}
            >
                <span className='supertabelaplanos_matriz_valor'>{exibido || ' '}</span>
            </div>
        )
    } else {
        conteudo = (
            <span className='supertabelaplanos_matriz_valor' title={valorGravado}>
                {valorGravado || ' '}
            </span>
        )
    }

    return (
        <td data-label={rotulo} className={`supertabelaplanos_td_centro${vazio ? ' supertabelaplanos_celula_vazia' : ''}`}>
            {conteudo}
        </td>
    )
})

const celulaEstatica = (linha, chave, campo, categoriaNome) => {
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
        return (
            <td
                key={chaveTd}
                data-label={rotulo}
                className='supertabelaplanos_td_centro supertabelaplanos_limite_grupo_cell'
                title={textoCelulaLimiteGrupo(celula.limiteGrupo, categoriaNome)}
            >
                <span>Grupo: {celula.limiteGrupo}</span>
            </td>
        )
    }
    return null
}

const LinhaMatriz = memo(function LinhaMatriz({ linha, linhaIndex, categoriaNome, somenteLeitura, edicaoAtiva, acoes }) {
    const renderCelula = (chave, campo) => {
        const estatica = celulaEstatica(linha, chave, campo, categoriaNome)
        if (estatica) return estatica
        const celula = linha.celulas[chave]
        const rotuloCampo = campo === 'limite' ? 'Limite' : 'Carência'
        return (
            <CelulaEditavel
                key={`${linha.codigo}-${chave}-${campo}`}
                valorGravado={celula[campo] ?? ''}
                rotulo={`${ROTULO_PLANO[chave]} · ${rotuloCampo}`}
                rotuloAria={`${rotuloCampo} ${ROTULO_PLANO[chave]} — ${linha.codigo}`}
                edicaoAtiva={edicaoAtiva}
                onSalvar={(valor) => acoes.salvar(linha, chave, campo, valor)}
                onColar={(texto) => acoes.colar(linhaIndex, chave, campo, texto)}
            />
        )
    }

    return (
        <tr>
            <td className='table_text_left supertabelaplanos_matriz_td_codigo' data-label='Código'>
                {linha.codigo}
            </td>
            <td data-label='' className={`table_text_left supertabelaplanos_td_nome ${acoes.classeNome(linha.procedimento)}`}>
                <span className='supertabelaplanos_nome_com_flag'>
                    {linha.procedimento}
                    {linha.apenasLoja ? (
                        <span className='supertabelaplanos_flag_loja' title={ROTULO_PLANO[CHAVE_PLANO_APENAS_LOJA]}>
                            Loja
                        </span>
                    ) : null}
                </span>
            </td>
            {CHAVES_PLANOS_MATRIZ.flatMap((chave) => [renderCelula(chave, 'limite'), renderCelula(chave, 'carencia')])}
            {!somenteLeitura && (
                <td data-label='' className='supertabelaplanos_matriz_td_acao'>
                    <button
                        type='button'
                        className='table_delete_btn'
                        onClick={(event) => acoes.limpar(linha, { ignorarConfirmacao: event.shiftKey })}
                        title='Limpar limites e carências deste procedimento, SHIFT = limpar rápido'
                    >
                        🧹
                    </button>
                </td>
            )}
        </tr>
    )
})

export default function MatrizCarenciasLimitesTabela(props) {
    const { secao, somenteLeitura, edicaoAtiva, onOrdenar, indicadorOrdenacao } = props

    const propsRef = useRef(props)
    propsRef.current = props

    // Objeto estável: as linhas (memo) não podem re-renderizar só porque o pai recriou as funções.
    const acoes = useMemo(
        () => ({
            salvar: (linha, chave, campo, valor) => propsRef.current.onSalvarCelula(linha, chave, campo, valor),
            colar: (linhaIndex, chave, campo, texto) =>
                propsRef.current.onColar(propsRef.current.secao.linhas, linhaIndex, chave, campo, texto),
            limpar: (linha, opcoes) => propsRef.current.onLimpar(linha, opcoes),
            classeNome: (texto) => propsRef.current.classeNome(texto),
        }),
        []
    )

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
                        <LinhaMatriz
                            key={`${secao.categoriaId}-${linha.codigo}-mx`}
                            linha={linha}
                            linhaIndex={linhaIndex}
                            categoriaNome={secao.categoriaNome}
                            somenteLeitura={somenteLeitura}
                            edicaoAtiva={edicaoAtiva}
                            acoes={acoes}
                        />
                    ))}
                </tbody>
            </table>
        </div>
    )
}
