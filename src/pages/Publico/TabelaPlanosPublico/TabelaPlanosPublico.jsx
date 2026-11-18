import { useEffect, useMemo, useRef, useState } from 'react'
import { PageHeader } from '../../../components/ui/Card.jsx'
import { EmptyState } from '../../../components/ui/States.jsx'
import { Toolbar } from '../../../components/ui/Toolbar.jsx'
import { linkWhatsapp } from '../../../lib/repasse/repasseCore.js'
import {
    chaveTabela,
    mensagemWhatsappPlano,
    MOCK_TABELA_PLANOS,
    WHATSAPP_NUMERO,
} from './mockTabelaPlanos.js'
import './TabelaPlanosPublico.css'

function IconeBusca({ className }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
            <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
    )
}

function IconeWhatsapp() {
    return (
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12.04 2C6.58 2 2.15 6.4 2.15 11.83c0 1.96.52 3.86 1.5 5.54L2 22l4.8-1.57a10 10 0 0 0 5.24 1.44h.01c5.46 0 9.89-4.4 9.89-9.83C21.93 6.4 17.5 2 12.04 2Zm5.74 13.95c-.24.68-1.4 1.25-1.94 1.33-.5.07-1.13.1-1.82-.11-.42-.13-.96-.31-1.66-.61-2.92-1.26-4.82-4.2-4.97-4.4-.14-.19-1.18-1.57-1.18-3 0-1.42.74-2.12 1.01-2.41.26-.29.58-.36.77-.36h.56c.18 0 .42-.07.66.5.24.58.82 2 .89 2.15.07.14.12.31.02.5-.1.19-.14.31-.28.48-.14.17-.3.38-.42.51-.14.14-.28.29-.12.57.16.28.7 1.15 1.5 1.86 1.03.92 1.9 1.2 2.17 1.34.27.14.43.12.59-.07.16-.19.68-.79.86-1.06.18-.28.36-.23.61-.14.24.1 1.55.73 1.82.86.27.14.45.2.52.31.07.12.07.68-.17 1.36Z" />
        </svg>
    )
}

function normalizarBusca(texto) {
    return String(texto || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim()
}

function linhaBateTermo(linha, termoNorm) {
    if (!termoNorm) return true
    const blob = normalizarBusca(`${linha.codigo} ${linha.nome}`)
    return blob.includes(termoNorm)
}

export default function TabelaPlanosPublico() {
    const { cidades, planosPorCidade, tabelas } = MOCK_TABELA_PLANOS
    const [cidadeId, setCidadeId] = useState('')
    const [planoId, setPlanoId] = useState('')
    const [grupoIdx, setGrupoIdx] = useState(0)
    const [buscaAberta, setBuscaAberta] = useState(false)
    const [termoBusca, setTermoBusca] = useState('')
    const buscaInputRef = useRef(null)

    const cidade = useMemo(
        () => cidades.find((c) => String(c.id) === String(cidadeId)) || null,
        [cidades, cidadeId],
    )

    const planos = useMemo(() => {
        if (!cidadeId) return []
        return planosPorCidade[cidadeId] || []
    }, [cidadeId, planosPorCidade])

    const plano = useMemo(
        () => planos.find((p) => String(p.id) === String(planoId)) || null,
        [planos, planoId],
    )

    const categorias = useMemo(() => {
        if (!cidadeId || !planoId) return []
        return tabelas[chaveTabela(cidadeId, planoId)]?.categorias || []
    }, [cidadeId, planoId, tabelas])

    const termoNorm = normalizarBusca(termoBusca)

    const categoriasFiltradas = useMemo(() => {
        if (!termoNorm) return categorias
        return categorias
            .map((cat) => ({
                ...cat,
                linhas: (cat.linhas || []).filter((l) => linhaBateTermo(l, termoNorm)),
            }))
            .filter((cat) => cat.linhas.length > 0)
    }, [categorias, termoNorm])

    useEffect(() => {
        setGrupoIdx(0)
    }, [cidadeId, planoId, termoNorm])

    useEffect(() => {
        if (!buscaAberta) return undefined
        const t = window.setTimeout(() => buscaInputRef.current?.focus(), 50)
        return () => window.clearTimeout(t)
    }, [buscaAberta])

    useEffect(() => {
        if (!cidadeId) {
            setPlanoId('')
            return
        }
        const lista = planosPorCidade[cidadeId] || []
        if (!lista.length) {
            setPlanoId('')
            return
        }
        if (!lista.some((p) => String(p.id) === String(planoId))) {
            setPlanoId(String(lista[0].id))
        }
    }, [cidadeId, planoId, planosPorCidade])

    const totalGrupos = categoriasFiltradas.length
    const idxSeguro = totalGrupos > 0 ? Math.min(grupoIdx, totalGrupos - 1) : 0
    const grupoAtual = totalGrupos > 0 ? categoriasFiltradas[idxSeguro] : null
    const indiceExibido = totalGrupos > 0 ? idxSeguro + 1 : 0
    const totalResultados = categoriasFiltradas.reduce((s, c) => s + c.linhas.length, 0)

    const podeWhats = Boolean(cidade && plano)
    const hrefWhats = podeWhats
        ? linkWhatsapp(
            WHATSAPP_NUMERO,
            mensagemWhatsappPlano(plano.nome, cidade.label, cidade.uf),
        )
        : undefined

    function onChangeCidade(e) {
        setCidadeId(e.target.value)
        setTermoBusca('')
        setBuscaAberta(false)
    }

    function onEscolherPlano(id) {
        setPlanoId(String(id))
        setTermoBusca('')
        setBuscaAberta(false)
    }

    return (
        <main className="ek-page tp_page">
            <PageHeader
                kicker="Emerdog"
                title="Tabela de planos"
                description="Escolha a cidade com cobertura, veja o plano e fale conosco no WhatsApp."
            />

            <Toolbar title="Cobertura" sticky={false}>
                <label className="ek-field ek-field--grow">
                    <span className="ek-label">Cidade</span>
                    <select
                        className="ek-select"
                        value={cidadeId}
                        onChange={onChangeCidade}
                        aria-label="Filtrar por cidade com cobertura"
                    >
                        <option value="">Selecione a cidade</option>
                        {cidades.map((c) => (
                            <option key={c.id} value={c.id}>
                                {c.label} ({c.uf})
                            </option>
                        ))}
                    </select>
                </label>

                {cidadeId && planos.length > 0 ? (
                    <div className="ek-field ek-field--grow">
                        <span className="ek-label">Plano</span>
                        <div className="tp_planos_scroll">
                            <div className="ek-segmented" role="group" aria-label="Planos disponíveis">
                                {planos.map((p) => (
                                    <button
                                        key={p.id}
                                        type="button"
                                        className="ek-segmented__opt"
                                        aria-pressed={String(p.id) === String(planoId)}
                                        onClick={() => onEscolherPlano(p.id)}
                                    >
                                        {p.nome}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                ) : null}
            </Toolbar>

            {!cidadeId ? (
                <EmptyState
                    title="Comece pela cidade"
                    description="Escolha onde há cobertura para ver os planos e os procedimentos."
                />
            ) : null}

            {cidadeId && plano && !grupoAtual ? (
                <EmptyState
                    title={termoNorm ? 'Nada encontrado' : 'Sem procedimentos'}
                    description={
                        termoNorm
                            ? 'Tente outro termo ou limpe a busca.'
                            : 'Não há procedimentos neste plano para a cidade selecionada.'
                    }
                />
            ) : null}

            {grupoAtual ? (
                <section className="ek-card" aria-labelledby="tp-grupo-titulo">
                    <div className="tp_grupo_head">
                        <h2 id="tp-grupo-titulo" className="ek-card__title">
                            {grupoAtual.nome}
                        </h2>
                        <span className="ek-badge">
                            {grupoAtual.linhas.length} item{grupoAtual.linhas.length === 1 ? '' : 's'}
                        </span>
                    </div>

                    <div className="ek-table-wrap">
                        <table className="ek-table ek-table--stack">
                            <thead>
                                <tr>
                                    <th>Procedimento</th>
                                    <th className="ek-num">Diferença</th>
                                    <th>Carência</th>
                                    <th>Limite</th>
                                </tr>
                            </thead>
                            <tbody>
                                {grupoAtual.linhas.map((linha) => (
                                    <tr key={`${linha.codigo}-${linha.nome}`}>
                                        <td data-label="Procedimento">
                                            <span className="tp_proc">
                                                <span className="tp_proc__nome">{linha.nome}</span>
                                                <span className="tp_proc__cod">{linha.codigo}</span>
                                            </span>
                                        </td>
                                        <td data-label="Diferença" className="ek-num">
                                            {linha.diferenca}
                                        </td>
                                        <td data-label="Carência">{linha.carencia}</td>
                                        <td data-label="Limite">{linha.limite}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {totalGrupos > 1 ? (
                        <nav className="tp_paginacao" aria-label="Paginação de grupos">
                            <button
                                type="button"
                                className="ek-btn ek-btn--secondary"
                                disabled={indiceExibido <= 1}
                                onClick={() => setGrupoIdx((i) => Math.max(0, i - 1))}
                            >
                                Anterior
                            </button>
                            <span className="tp_paginacao__meta">
                                Grupo {indiceExibido} de {totalGrupos}
                            </span>
                            <button
                                type="button"
                                className="ek-btn ek-btn--secondary"
                                disabled={indiceExibido >= totalGrupos}
                                onClick={() => setGrupoIdx((i) => Math.min(totalGrupos - 1, i + 1))}
                            >
                                Próximo
                            </button>
                        </nav>
                    ) : null}
                </section>
            ) : null}

            {buscaAberta ? (
                <div className="tp_busca_painel" role="search">
                    <span className="ek-search">
                        <IconeBusca className="ek-search__icon" />
                        <input
                            ref={buscaInputRef}
                            className="ek-input"
                            type="search"
                            placeholder="Código ou procedimento"
                            value={termoBusca}
                            onChange={(e) => setTermoBusca(e.target.value)}
                            aria-label="Buscar procedimento"
                        />
                    </span>
                    {termoNorm ? (
                        <p className="tp_busca_hint">
                            {totalGrupos === 0
                                ? 'Sem resultados neste plano.'
                                : `${totalResultados} resultado(s) em ${totalGrupos} grupo(s).`}
                        </p>
                    ) : null}
                </div>
            ) : null}

            <div className="tp_fabs">
                <button
                    type="button"
                    className={`tp_fab tp_fab--busca${buscaAberta ? ' is-open' : ''}`}
                    aria-label={buscaAberta ? 'Fechar busca' : 'Abrir busca'}
                    aria-expanded={buscaAberta}
                    disabled={!plano}
                    onClick={() => {
                        setBuscaAberta((v) => {
                            if (v) setTermoBusca('')
                            return !v
                        })
                    }}
                >
                    <IconeBusca />
                </button>

                {podeWhats ? (
                    <a
                        className="tp_fab tp_fab--whats"
                        href={hrefWhats}
                        target="_blank"
                        rel="noreferrer"
                        aria-label="Falar no WhatsApp"
                        title="Falar no WhatsApp"
                    >
                        <IconeWhatsapp />
                    </a>
                ) : (
                    <button
                        type="button"
                        className="tp_fab tp_fab--whats is-disabled"
                        disabled
                        aria-label="WhatsApp (selecione cidade e plano)"
                    >
                        <IconeWhatsapp />
                    </button>
                )}
            </div>
        </main>
    )
}
