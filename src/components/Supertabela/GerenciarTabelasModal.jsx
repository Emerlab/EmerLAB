import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { normalizarTextoBusca } from '../../lib/prestadorCadastroHelpers.js'
import './GerenciarTabelasModal.css'

const FOCAVEIS = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

const Icone = ({ children }) => (
    <svg viewBox='0 0 24 24' width='15' height='15' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
        {children}
    </svg>
)
const IconeOlho = () => (
    <Icone>
        <path d='M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z' />
        <circle cx='12' cy='12' r='3' />
    </Icone>
)
const IconeLapis = () => (
    <Icone>
        <path d='M12 20h9' />
        <path d='M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z' />
    </Icone>
)
const IconeMais = () => (
    <Icone>
        <circle cx='5' cy='12' r='1.2' fill='currentColor' />
        <circle cx='12' cy='12' r='1.2' fill='currentColor' />
        <circle cx='19' cy='12' r='1.2' fill='currentColor' />
    </Icone>
)
const IconeBusca = () => (
    <Icone>
        <circle cx='11' cy='11' r='7' />
        <path d='m20 20-3.5-3.5' />
    </Icone>
)
const IconeFechar = () => (
    <Icone>
        <path d='M18 6 6 18M6 6l12 12' />
    </Icone>
)

/** Menu «⋯» de uma linha: Duplicar, Excel e Excluir. Painel em portal para não ser cortado pela tabela. */
function MenuMaisAcoes({ itens, rotulo }) {
    const [pos, setPos] = useState(null)
    const gatilhoRef = useRef(null)
    const painelRef = useRef(null)
    const aberto = pos !== null

    const fechar = (devolverFoco = true) => {
        setPos(null)
        if (devolverFoco) gatilhoRef.current?.focus()
    }

    useEffect(() => {
        if (!aberto) return undefined
        painelRef.current?.querySelector('button:not([disabled])')?.focus()
        const fora = (e) => {
            if (!painelRef.current?.contains(e.target) && !gatilhoRef.current?.contains(e.target)) setPos(null)
        }
        const fecharAoMover = () => setPos(null)
        document.addEventListener('mousedown', fora)
        window.addEventListener('resize', fecharAoMover)
        window.addEventListener('scroll', fecharAoMover, true)
        return () => {
            document.removeEventListener('mousedown', fora)
            window.removeEventListener('resize', fecharAoMover)
            window.removeEventListener('scroll', fecharAoMover, true)
        }
    }, [aberto])

    const abrir = () => {
        const r = gatilhoRef.current.getBoundingClientRect()
        setPos({ top: r.bottom + 4, right: Math.max(8, window.innerWidth - r.right) })
    }

    const aoTeclar = (e) => {
        if (e.key === 'Escape') {
            e.stopPropagation()
            fechar()
            return
        }
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
        e.preventDefault()
        const botoes = [...painelRef.current.querySelectorAll('button:not([disabled])')]
        const i = botoes.indexOf(document.activeElement)
        const prox = e.key === 'ArrowDown' ? (i + 1) % botoes.length : (i - 1 + botoes.length) % botoes.length
        botoes[prox]?.focus()
    }

    return (
        <>
            <button
                ref={gatilhoRef}
                type='button'
                className='manager_icon_btn'
                aria-haspopup='menu'
                aria-expanded={aberto}
                aria-label={`Mais ações de ${rotulo}`}
                title='Mais ações'
                onClick={() => (aberto ? fechar(false) : abrir())}
            >
                <IconeMais />
            </button>
            {aberto
                ? createPortal(
                      <div ref={painelRef} className='manager_menu' role='menu' style={{ top: pos.top, right: pos.right }} onKeyDown={aoTeclar}>
                          {itens.map((item) => (
                              <button
                                  key={item.rotulo}
                                  type='button'
                                  role='menuitem'
                                  className={`manager_menu_item${item.perigo ? ' is-danger' : ''}`}
                                  disabled={item.desabilitado}
                                  onClick={() => {
                                      fechar(false)
                                      item.aoClicar()
                                  }}
                              >
                                  {item.rotulo}
                              </button>
                          ))}
                      </div>,
                      document.body,
                  )
                : null}
        </>
    )
}

/**
 * Modal «Gerenciar tabelas»: lista à esquerda, edição à direita.
 * Teclado: Esc fecha, Tab fica preso no modal, cabeçalhos ordenam e o menu «⋯» abre com setas.
 */
export default function GerenciarTabelasModal({
    onClose,
    somenteLeitura,
    onNovaCidade,
    cidadesOrdenadas,
    ordenarGerenciador,
    indicadorOrdenacaoGerenciador,
    idCidadeEmEdicao,
    emModoNova = false,
    onSelecionarCidade,
    onAcessarCidade,
    onEditarCidade,
    onDuplicarCidade,
    onExcluirCidade,
    onBaixarExcelCidade,
    exportandoExcelCidadeId = null,
    colunaProcedimentos = false,
    edicaoAberta = false,
    painelDireito,
}) {
    const modalRef = useRef(null)
    const [busca, setBusca] = useState('')
    const [uf, setUf] = useState('')

    // Foco entra no modal ao abrir e volta ao botão de origem ao fechar.
    useEffect(() => {
        const origem = document.activeElement
        modalRef.current?.querySelector('input[type="search"]')?.focus()
        return () => origem?.focus?.()
    }, [])

    const ufs = useMemo(() => [...new Set(cidadesOrdenadas.map((c) => c.uf).filter(Boolean))].sort(), [cidadesOrdenadas])
    const visiveis = useMemo(() => {
        const t = normalizarTextoBusca(busca)
        return cidadesOrdenadas.filter((c) => (!uf || c.uf === uf) && (!t || normalizarTextoBusca(c.nome).includes(t)))
    }, [cidadesOrdenadas, busca, uf])
    const filtrando = Boolean(busca.trim() || uf)

    function aoTeclar(e) {
        if (e.key === 'Escape') {
            e.stopPropagation()
            onClose()
            return
        }
        if (e.key !== 'Tab') return
        const itens = [...(modalRef.current?.querySelectorAll(FOCAVEIS) || [])].filter((el) => el.offsetParent !== null)
        if (!itens.length) return
        const primeiro = itens[0]
        const ultimo = itens[itens.length - 1]
        if (e.shiftKey && document.activeElement === primeiro) {
            e.preventDefault()
            ultimo.focus()
        } else if (!e.shiftKey && document.activeElement === ultimo) {
            e.preventDefault()
            primeiro.focus()
        }
    }

    const cabecalho = (chave, rotulo, classe) => (
        <th className={classe}>
            <button type='button' className='manager_th_btn' onClick={() => ordenarGerenciador(chave)}>
                {rotulo}
                {indicadorOrdenacaoGerenciador(chave)}
            </button>
        </th>
    )

    return (
        <div className='manager_modal_overlay' onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
            <div
                ref={modalRef}
                className={`manager_modal manager_modal_split${edicaoAberta ? '' : ' manager_modal_list_only'}`}
                role='dialog'
                aria-modal='true'
                aria-labelledby='gerenciar-tabelas-titulo'
                onKeyDown={aoTeclar}
            >
                <div className='manager_modal_header'>
                    <div className='manager_titulo_bloco'>
                        <h3 id='gerenciar-tabelas-titulo'>Gerenciar tabelas</h3>
                        <p className='manager_subtitulo' aria-live='polite'>
                            {filtrando
                                ? `${visiveis.length} de ${cidadesOrdenadas.length} tabelas`
                                : `${cidadesOrdenadas.length} tabela${cidadesOrdenadas.length === 1 ? '' : 's'} cadastrada${cidadesOrdenadas.length === 1 ? '' : 's'}`}
                        </p>
                    </div>
                    <div className='manager_header_actions'>
                        {!somenteLeitura && (
                            <button type='button' className='manager_add_city_btn' onClick={onNovaCidade}>
                                ＋ Nova tabela
                            </button>
                        )}
                        <button type='button' className='manager_close_btn' onClick={onClose} aria-label='Fechar' title='Fechar (Esc)'>
                            <IconeFechar />
                        </button>
                    </div>
                </div>

                <div className={`manager_split_body${edicaoAberta ? ' is-editing' : ' is-list-only'}`}>
                    <aside className='manager_split_list'>
                        <div className='manager_filtros'>
                            <label className='manager_busca_campo'>
                                <IconeBusca />
                                <input
                                    type='search'
                                    className='manager_busca'
                                    value={busca}
                                    onChange={(e) => setBusca(e.target.value)}
                                    placeholder='Buscar tabela'
                                    aria-label='Buscar tabela'
                                />
                            </label>
                            {ufs.length > 1 ? (
                                <div className='manager_ufs' role='group' aria-label='Filtrar por UF'>
                                    <button type='button' className='manager_uf_chip' aria-pressed={uf === ''} onClick={() => setUf('')}>
                                        Todas
                                    </button>
                                    {ufs.map((u) => (
                                        <button
                                            key={u}
                                            type='button'
                                            className='manager_uf_chip'
                                            aria-pressed={uf === u}
                                            onClick={() => setUf(uf === u ? '' : u)}
                                        >
                                            {u}
                                            <span className='manager_uf_n'>{cidadesOrdenadas.filter((c) => c.uf === u).length}</span>
                                        </button>
                                    ))}
                                </div>
                            ) : null}
                        </div>
                        <div className='manager_table_wrap manager_table_wrap_inset'>
                            <table className='manager_table manager_table_compact'>
                                <colgroup>
                                    <col className='col_uf' />
                                    <col className='col_nome' />
                                    {colunaProcedimentos && <col className='col_proc' />}
                                    <col className='col_acoes' />
                                </colgroup>
                                <thead>
                                    <tr>
                                        {cabecalho('uf', 'UF', 'col_uf')}
                                        {cabecalho('nome', 'Tabela', 'col_nome')}
                                        {colunaProcedimentos && cabecalho('procedimentosAtivos', 'Procedimentos', 'col_proc')}
                                        <th className='col_acoes'>Ações</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {visiveis.length === 0 ? (
                                        <tr>
                                            <td className='manager_vazio' colSpan={colunaProcedimentos ? 4 : 3}>
                                                Nenhuma tabela encontrada.{' '}
                                                <button
                                                    type='button'
                                                    className='manager_link_btn'
                                                    onClick={() => {
                                                        setBusca('')
                                                        setUf('')
                                                    }}
                                                >
                                                    Limpar filtros
                                                </button>
                                            </td>
                                        </tr>
                                    ) : null}
                                    {visiveis.map((cidade) => {
                                        const selecionada =
                                            edicaoAberta &&
                                            !emModoNova &&
                                            idCidadeEmEdicao != null &&
                                            Number(idCidadeEmEdicao) === Number(cidade.id)
                                        const exportando = Number(exportandoExcelCidadeId) === Number(cidade.id)
                                        const itensMenu = [
                                            !somenteLeitura && { rotulo: 'Duplicar', aoClicar: () => onDuplicarCidade(cidade) },
                                            onBaixarExcelCidade && {
                                                rotulo: exportando ? 'Gerando Excel…' : 'Baixar em Excel',
                                                desabilitado: Number(cidade.procedimentosAtivos || 0) === 0 || exportando,
                                                aoClicar: () => onBaixarExcelCidade(cidade),
                                            },
                                            !somenteLeitura && { rotulo: 'Excluir…', perigo: true, aoClicar: () => onExcluirCidade(cidade) },
                                        ].filter(Boolean)
                                        return (
                                            <tr
                                                key={`manager-${cidade.id}`}
                                                className={selecionada ? 'is-selected' : ''}
                                                onClick={() => onSelecionarCidade(cidade)}
                                            >
                                                <td className='col_uf'>{cidade.uf ? <span className='manager_uf_badge'>{cidade.uf}</span> : '—'}</td>
                                                <td className='col_nome' title={cidade.nome}>
                                                    {cidade.nome}
                                                </td>
                                                {colunaProcedimentos && <td className='col_proc'>{cidade.procedimentosAtivos}</td>}
                                                <td className='col_acoes' onClick={(e) => e.stopPropagation()}>
                                                    <div className='manager_actions'>
                                                        <button
                                                            type='button'
                                                            className='manager_icon_btn'
                                                            onClick={() => onAcessarCidade(cidade.id)}
                                                            aria-label={`Abrir a tabela de ${cidade.nome}`}
                                                            title='Abrir a tabela'
                                                        >
                                                            <IconeOlho />
                                                        </button>
                                                        <button
                                                            type='button'
                                                            className='manager_icon_btn'
                                                            onClick={() => onEditarCidade(cidade)}
                                                            aria-label={`Editar ${cidade.nome}`}
                                                            title='Editar'
                                                        >
                                                            <IconeLapis />
                                                        </button>
                                                        {itensMenu.length ? <MenuMaisAcoes itens={itensMenu} rotulo={cidade.nome} /> : null}
                                                    </div>
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </aside>

                    <section className='manager_split_edit' aria-label='Edição da tabela' aria-hidden={!edicaoAberta}>
                        {edicaoAberta ? painelDireito : null}
                    </section>
                </div>
            </div>
        </div>
    )
}
