import { useCallback, useEffect, useRef, useState } from 'react'
import { sortearPrestadores } from '../../../lib/apiV1/sortearPrestadores.js'
import { contatosDistintos, formatarReais, hrefWhatsappSemResultado } from './logicaTabelaPlanos.js'
import TextoObservacao from './TextoObservacao.jsx'
import { IconeFechar, IconeWhatsapp } from './iconesTabelaPlanos.jsx'

const FOCAVEIS = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Painel do procedimento: folha inferior no celular, lateral no desktop.
 * Foco preso enquanto aberto, Esc fecha e o foco volta à linha de origem.
 */
export default function PainelProcedimento({ procedimento, grupoNome, observacoes, cidade, plano, cliente, aleatorio, onFechar }) {
    const painelRef = useRef(null)
    const fecharRef = useRef(null)
    const [estado, setEstado] = useState({ status: 'carregando', lista: [], total: 0 })
    const [sorteio, setSorteio] = useState({ sorteados: [], restantes: 0, vistos: [] })
    const [tentativa, setTentativa] = useState(0)

    useEffect(() => {
        let cancelado = false
        setEstado({ status: 'carregando', lista: [], total: 0 })
        cliente
            .prestadores({ cidade: cidade.id, procedimento: procedimento.codigo })
            .then((r) => {
                if (cancelado) return
                const lista = r?.prestadores || []
                const primeiro = sortearPrestadores(lista, { aleatorio })
                setEstado({ status: 'ok', lista, total: r?.total ?? lista.length })
                setSorteio({ ...primeiro, vistos: primeiro.sorteados.map((p) => p.id) })
            })
            .catch((e) => {
                if (!cancelado) setEstado({ status: 'erro', lista: [], total: 0, mensagem: e?.message })
            })
        return () => {
            cancelado = true
        }
    }, [cliente, cidade.id, procedimento.codigo, aleatorio, tentativa])

    useEffect(() => {
        fecharRef.current?.focus()
    }, [])

    const sortearOutros = useCallback(() => {
        setSorteio((atual) => {
            const proximo = sortearPrestadores(estado.lista, { excluirIds: atual.vistos, aleatorio })
            // Quando todos já foram vistos, o sorteio recomeça: zera o histórico para não acumular.
            const todosVistos = new Set([...atual.vistos, ...proximo.sorteados.map((p) => p.id)]).size >= estado.lista.length
            return { ...proximo, vistos: todosVistos ? proximo.sorteados.map((p) => p.id) : [...atual.vistos, ...proximo.sorteados.map((p) => p.id)] }
        })
    }, [estado.lista, aleatorio])

    function aoTeclar(e) {
        if (e.key === 'Escape') {
            e.stopPropagation()
            onFechar()
            return
        }
        if (e.key !== 'Tab') return
        const itens = [...(painelRef.current?.querySelectorAll(FOCAVEIS) || [])]
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

    const obs = (procedimento.observacoes || []).map((id) => observacoes?.[id]).filter(Boolean)
    const podeSortearMais = estado.lista.length > sorteio.sorteados.length

    return (
        <div className="tp_painel_fundo" onMouseDown={(e) => e.target === e.currentTarget && onFechar()}>
            <aside
                ref={painelRef}
                className="tp_painel"
                role="dialog"
                aria-modal="true"
                aria-labelledby="tp-painel-titulo"
                onKeyDown={aoTeclar}
            >
                <header className="tp_painel__head">
                    <div>
                        <p className="tp_painel__grupo">{grupoNome}</p>
                        <h2 id="tp-painel-titulo" className="tp_painel__titulo">
                            {procedimento.nome}
                        </h2>
                        <p className="tp_painel__cod">{procedimento.codigo}</p>
                    </div>
                    <button ref={fecharRef} type="button" className="tp_icone_btn" onClick={onFechar} aria-label="Fechar">
                        <IconeFechar />
                    </button>
                </header>

                <dl className="tp_fatos">
                    <div>
                        <dt>Diferença</dt>
                        <dd>{procedimento.diferenca ? formatarReais(procedimento.diferenca) : 'Incluso'}</dd>
                    </div>
                    <div>
                        <dt>Carência</dt>
                        <dd>{procedimento.carencia || '—'}</dd>
                    </div>
                    <div>
                        <dt>Limite</dt>
                        <dd>{procedimento.limite || '—'}</dd>
                    </div>
                </dl>

                {obs.length > 0 ? (
                    <section className="tp_painel__sec" aria-label="Observações">
                        {obs.map((o) => (
                            <div key={o.id} className="tp_obs">
                                {o.titulo ? <strong>{o.titulo}</strong> : null}
                                <p>
                                    <TextoObservacao texto={o.mensagem} />
                                </p>
                            </div>
                        ))}
                    </section>
                ) : null}

                <section className="tp_painel__sec" aria-label="Onde fazer">
                    <h3 className="tp_painel__sub">
                        Onde fazer em {cidade.nome}
                        {estado.status === 'ok' && estado.total > 0 ? <span className="tp_contagem">{estado.total}</span> : null}
                    </h3>

                    {estado.status === 'carregando' ? (
                        <div className="tp_esqueleto" aria-busy="true" aria-label="Carregando prestadores">
                            <span />
                            <span />
                            <span />
                        </div>
                    ) : null}

                    {estado.status === 'erro' ? (
                        <div className="tp_aviso" role="alert">
                            <p>{estado.mensagem || 'Não foi possível carregar os prestadores.'}</p>
                            <button type="button" className="tp_btn tp_btn--contorno" onClick={() => setTentativa((t) => t + 1)}>
                                Tentar de novo
                            </button>
                        </div>
                    ) : null}

                    {estado.status === 'ok' && estado.lista.length === 0 ? (
                        <div className="tp_aviso">
                            <p>Ainda não temos prestador para este procedimento nesta região. Fale com a gente que ajudamos a encontrar.</p>
                            <a
                                className="tp_btn"
                                href={hrefWhatsappSemResultado({ cidade, plano, assunto: procedimento.nome })}
                                target="_blank"
                                rel="noreferrer"
                            >
                                Falar no WhatsApp
                            </a>
                        </div>
                    ) : null}

                    {estado.status === 'ok' && sorteio.sorteados.length > 0 ? (
                        <>
                            <ul className="tp_prestadores">
                                {sorteio.sorteados.map((p) => (
                                    <li key={p.id} className="tp_prestador">
                                        <strong>{p.nome}</strong>
                                        {p.nome_alternativo ? <span className="tp_prestador__alt">Chama de: {p.nome_alternativo}</span> : null}
                                        {p.especialidade_principal ? <span className="tp_prestador__esp">{p.especialidade_principal}</span> : null}
                                        {p.endereco?.texto ? <span>{p.endereco.texto}</span> : null}
                                        <span className="tp_prestador__contatos">
                                            {contatosDistintos(p.contatos).map((numero) => (
                                                <a key={numero} className="tp_tel" href={`tel:+55${numero.replace(/\D/g, '')}`}>
                                                    {numero}
                                                </a>
                                            ))}
                                            {p.contatos?.whatsapp_url ? (
                                                <a className="tp_zap" href={p.contatos.whatsapp_url} target="_blank" rel="noreferrer">
                                                    <IconeWhatsapp />
                                                    WhatsApp
                                                </a>
                                            ) : null}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                            {podeSortearMais ? (
                                <button type="button" className="tp_btn tp_btn--contorno tp_sortear" onClick={sortearOutros}>
                                    Buscar mais
                                </button>
                            ) : null}
                        </>
                    ) : null}
                </section>
            </aside>
        </div>
    )
}
