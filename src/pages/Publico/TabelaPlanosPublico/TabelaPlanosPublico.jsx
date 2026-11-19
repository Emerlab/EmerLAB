import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { clientePlanosPadrao } from '../../../lib/apiV1/planosPublicosApi.js'
import BuscaProcedimentos from './BuscaProcedimentos.jsx'
import { IconeInfo, IconeSeta, IconeWhatsapp } from './iconesTabelaPlanos.jsx'
import {
    filtrarGrupos,
    formatarReais,
    hrefWhatsappSemResultado,
    hrefWhatsappTabela,
    totalProcedimentos,
    trechosComDestaque,
} from './logicaTabelaPlanos.js'
import { criarClientePlanosMock } from './mockTabelaPlanos.js'
import PainelProcedimento from './PainelProcedimento.jsx'
import './TabelaPlanosPublico.css'
import TextoObservacao from './TextoObservacao.jsx'

const CHAVE_ULTIMA_CIDADE = 'tp_ultima_cidade'

function lerUltimaCidade() {
    try {
        return window.localStorage.getItem(CHAVE_ULTIMA_CIDADE) || ''
    } catch {
        return ''
    }
}

function guardarUltimaCidade(id) {
    try {
        window.localStorage.setItem(CHAVE_ULTIMA_CIDADE, String(id))
    } catch {
        /* navegação privada ou bloqueio: a página funciona sem lembrar */
    }
}

function Destacado({ texto, consulta }) {
    return trechosComDestaque(texto, consulta).map((t, i) =>
        t.destaque ? (
            <mark key={i} className="tp_marca">
                {t.texto}
            </mark>
        ) : (
            <span key={i}>{t.texto}</span>
        ),
    )
}

/**
 * Página pública /tabela-planos. `cliente` e `aleatorio` são injetáveis (testes e demonstração).
 * Estado da escolha na URL: ?cidade=&plano=&q=
 */
export default function TabelaPlanosPublico({ cliente: clienteProp, aleatorio }) {
    const [params, setParams] = useSearchParams()
    const clienteReal = useMemo(() => clienteProp || clientePlanosPadrao(), [clienteProp])
    const demo = !clienteReal
    const cliente = useMemo(() => clienteReal || criarClientePlanosMock(), [clienteReal])

    const cidadeParam = params.get('cidade') || ''
    const planoParam = params.get('plano') || ''
    const consulta = params.get('q') || ''

    const [filtros, setFiltros] = useState({ status: 'carregando', data: null, mensagem: '' })
    const [tabela, setTabela] = useState({ status: 'ocioso', data: null, codigo: '', mensagem: '' })
    const [tentFiltros, setTentFiltros] = useState(0)
    const [tentTabela, setTentTabela] = useState(0)
    const [abertos, setAbertos] = useState(() => new Set())
    const [painel, setPainel] = useState(null) // { proc, grupoNome }
    const origemFocoRef = useRef(null)

    const atualizar = useCallback(
        (mudancas) => {
            setParams(
                (atual) => {
                    const novo = new URLSearchParams(atual)
                    for (const [k, v] of Object.entries(mudancas)) {
                        if (v === '' || v === null || v === undefined) novo.delete(k)
                        else novo.set(k, String(v))
                    }
                    return novo
                },
                { replace: true },
            )
        },
        [setParams],
    )

    // O CSS global do app põe `overflow-x: hidden` no body (< 1024 px), o que vira um contêiner de rolagem e
    // impede o `position: sticky` da busca. `clip` corta o excesso sem criar contêiner; restaura ao sair.
    useEffect(() => {
        const anterior = document.body.style.overflowX
        document.body.style.overflowX = 'clip'
        return () => {
            document.body.style.overflowX = anterior
        }
    }, [])

    // Filtros (cidades e planos)
    useEffect(() => {
        let cancelado = false
        setFiltros({ status: 'carregando', data: null, mensagem: '' })
        cliente
            .filtros()
            .then((data) => !cancelado && setFiltros({ status: 'ok', data, mensagem: '' }))
            .catch((e) => !cancelado && setFiltros({ status: 'erro', data: null, mensagem: e?.message || '' }))
        return () => {
            cancelado = true
        }
    }, [cliente, tentFiltros])

    const cidades = filtros.data?.cidades || []
    const cidade = cidades.find((c) => String(c.id) === cidadeParam) || null
    const plano = cidade?.planos.find((p) => p.chave === planoParam || String(p.id) === planoParam) || null

    // Última cidade lembrada e plano padrão (o primeiro da cidade)
    useEffect(() => {
        if (filtros.status !== 'ok') return
        if (!cidadeParam) {
            const salva = lerUltimaCidade()
            if (salva && cidades.some((c) => String(c.id) === salva)) atualizar({ cidade: salva })
            return
        }
        if (cidade && !plano) atualizar({ plano: cidade.planos[0]?.chave || '' })
    }, [filtros.status, cidadeParam, cidade, plano, cidades, atualizar])

    // Tabela
    useEffect(() => {
        if (!cidade || !plano) {
            setTabela({ status: 'ocioso', data: null, codigo: '', mensagem: '' })
            return undefined
        }
        let cancelado = false
        setTabela({ status: 'carregando', data: null, codigo: '', mensagem: '' })
        cliente
            .tabela({ cidade: cidade.id, plano: plano.chave })
            .then((data) => {
                if (cancelado) return
                setTabela({ status: 'ok', data, codigo: '', mensagem: '' })
                setAbertos(new Set(data.grupos?.length ? [data.grupos[0].id] : []))
            })
            .catch((e) => !cancelado && setTabela({ status: 'erro', data: null, codigo: e?.codigo || '', mensagem: e?.message || '' }))
        return () => {
            cancelado = true
        }
    }, [cliente, cidade, plano, tentTabela])

    const gruposFiltrados = useMemo(() => filtrarGrupos(tabela.data?.grupos, consulta), [tabela.data, consulta])
    const buscando = Boolean(consulta.trim())
    const total = totalProcedimentos(gruposFiltrados)
    const resumo = buscando
        ? total === 0
            ? 'Nenhum procedimento encontrado.'
            : `${total} procedimento${total === 1 ? '' : 's'} em ${gruposFiltrados.length} grupo${gruposFiltrados.length === 1 ? '' : 's'}.`
        : ''

    function escolherCidade(id) {
        if (id) guardarUltimaCidade(id)
        atualizar({ cidade: id, plano: '', q: '' })
    }

    function alternarGrupo(id) {
        setAbertos((atual) => {
            const novo = new Set(atual)
            if (novo.has(id)) novo.delete(id)
            else novo.add(id)
            return novo
        })
    }

    function irParaGrupo(id) {
        setAbertos((atual) => new Set(atual).add(id))
        window.requestAnimationFrame(() => document.getElementById(`tp-grupo-${id}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }))
    }

    function abrirPainel(proc, grupoNome, elemento) {
        origemFocoRef.current = elemento
        setPainel({ proc, grupoNome })
    }

    function fecharPainel() {
        setPainel(null)
        const alvo = origemFocoRef.current
        window.requestAnimationFrame(() => alvo?.focus?.())
    }

    const hrefWhats = hrefWhatsappTabela({ cidade, plano, procedimento: painel?.proc })
    const observacoes = tabela.data?.observacoes || {}
    const gerais = (tabela.data?.observacoes_gerais || []).map((id) => observacoes[id]).filter(Boolean)

    const planosDaCidade = cidade?.planos || []
    const temTabela = tabela.status === 'ok' && gruposFiltrados.length > 0

    return (
        <main className="tp_page">
            <div className="tp_miolo">
                {demo ? (
                    <p className="tp_faixa_demo" role="status">
                        Dados de exemplo: a API ainda não está configurada neste ambiente.
                    </p>
                ) : null}

                <header className="tp_hero">
                    <h1 className="tp_hero__titulo">Veja o que o seu plano cobre</h1>
                    <p className="tp_hero__sub">Escolha onde você mora e veja carência, limite e quem atende cada procedimento.</p>

                    <div className="tp_escolha">
                        <label className="tp_campo">
                            <span className="tp_campo__rotulo">Moro em</span>
                            <span className="tp_select">
                                <select
                                    value={cidade ? String(cidade.id) : ''}
                                    onChange={(e) => escolherCidade(e.target.value)}
                                    disabled={filtros.status !== 'ok'}
                                    aria-label="Cidade com cobertura"
                                >
                                    <option value="">{filtros.status === 'carregando' ? 'Carregando cidades…' : 'Selecione a cidade'}</option>
                                    {cidades.map((c) => (
                                        <option key={c.id} value={c.id}>
                                            {c.nome} ({c.uf})
                                        </option>
                                    ))}
                                </select>
                                <IconeSeta />
                            </span>
                        </label>

                        {cidade ? (
                            <div className="tp_campo">
                                <span className="tp_campo__rotulo" id="tp-rotulo-plano">
                                    Quero ver o plano
                                </span>
                                <div className="tp_planos" role="group" aria-labelledby="tp-rotulo-plano">
                                    {planosDaCidade.map((p) => (
                                        <button
                                            key={p.id}
                                            type="button"
                                            className="tp_plano"
                                            aria-pressed={plano?.id === p.id}
                                            onClick={() => atualizar({ plano: p.chave, q: '' })}
                                        >
                                            {p.nome}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ) : null}
                    </div>
                </header>

                {filtros.status === 'erro' ? (
                    <div className="tp_aviso" role="alert">
                        <p>{filtros.mensagem || 'Não foi possível carregar as cidades.'}</p>
                        <button type="button" className="tp_btn tp_btn--contorno" onClick={() => setTentFiltros((t) => t + 1)}>
                            Tentar de novo
                        </button>
                    </div>
                ) : null}

                <BuscaProcedimentos
                    valor={consulta}
                    onChange={(v) => atualizar({ q: v })}
                    termosPopulares={filtros.data?.termos_populares || []}
                    desabilitado={!plano}
                    resumo={resumo}
                />

                {filtros.status === 'ok' && !cidade ? (
                    <div className="tp_vazio">
                        <h2>Comece pela cidade</h2>
                        <p>Escolha onde você mora para ver os planos e os procedimentos com cobertura.</p>
                    </div>
                ) : null}

                {tabela.status === 'carregando' ? (
                    <div className="tp_esqueleto tp_esqueleto--tabela" aria-busy="true" aria-label="Carregando tabela">
                        <span />
                        <span />
                        <span />
                        <span />
                    </div>
                ) : null}

                {tabela.status === 'erro' && tabela.codigo === 'plano_indisponivel_na_cidade' ? (
                    <div className="tp_vazio">
                        <h2>Plano indisponível nesta cidade</h2>
                        <p>Escolha outro plano ou outra cidade.</p>
                    </div>
                ) : null}

                {tabela.status === 'erro' && tabela.codigo !== 'plano_indisponivel_na_cidade' ? (
                    <div className="tp_aviso" role="alert">
                        <p>{tabela.mensagem || 'Não foi possível carregar a tabela.'}</p>
                        <button type="button" className="tp_btn tp_btn--contorno" onClick={() => setTentTabela((t) => t + 1)}>
                            Tentar de novo
                        </button>
                    </div>
                ) : null}

                {tabela.status === 'ok' && (tabela.data.grupos || []).length === 0 ? (
                    <div className="tp_aviso">
                        <p>Ainda não há procedimentos publicados para este plano nesta cidade. Fale com a gente.</p>
                        <a className="tp_btn" href={hrefWhatsappSemResultado({ cidade, plano })} target="_blank" rel="noreferrer">
                            Falar no WhatsApp
                        </a>
                    </div>
                ) : null}

                {tabela.status === 'ok' && buscando && gruposFiltrados.length === 0 && (tabela.data.grupos || []).length > 0 ? (
                    <div className="tp_aviso">
                        <p>Não encontramos “{consulta}” neste plano. Fale com a gente que ajudamos.</p>
                        <a className="tp_btn" href={hrefWhatsappSemResultado({ cidade, plano, assunto: consulta })} target="_blank" rel="noreferrer">
                            Falar no WhatsApp
                        </a>
                    </div>
                ) : null}

                {temTabela ? (
                    <div className="tp_corpo">
                        <nav className="tp_indice" aria-label="Ir para o grupo">
                            {gruposFiltrados.map((g) => (
                                <button key={g.id} type="button" className="tp_indice__item" onClick={() => irParaGrupo(g.id)}>
                                    <span>{g.nome}</span>
                                    <span className="tp_indice__n">{g.procedimentos.length}</span>
                                </button>
                            ))}
                        </nav>

                        <div className="tp_grupos">
                            {gruposFiltrados.map((g) => {
                                const aberto = buscando || abertos.has(g.id)
                                return (
                                    <section key={g.id} id={`tp-grupo-${g.id}`} className="tp_grupo" aria-labelledby={`tp-grupo-titulo-${g.id}`}>
                                        <h2 id={`tp-grupo-titulo-${g.id}`} className="tp_grupo_titulo">
                                            <button
                                                type="button"
                                                className="tp_grupo_btn"
                                                aria-expanded={aberto}
                                                aria-controls={`tp-grupo-corpo-${g.id}`}
                                                onClick={() => alternarGrupo(g.id)}
                                                disabled={buscando}
                                            >
                                                <span className="tp_grupo_btn__nome">{g.nome}</span>
                                                <span className="tp_grupo_btn__n">{g.procedimentos.length}</span>
                                                {g.limite_grupo ? <span className="tp_limite_grupo">Limite do grupo: {g.limite_grupo}</span> : null}
                                                <span className="tp_seta" aria-hidden="true" />
                                            </button>
                                        </h2>
                                        {aberto ? (
                                            <div id={`tp-grupo-corpo-${g.id}`} className="tp_tabela_caixa">
                                                <table className="tp_tabela">
                                                    <thead>
                                                        <tr>
                                                            <th scope="col">Procedimento</th>
                                                            <th scope="col" className="tp_num">
                                                                Diferença
                                                            </th>
                                                            <th scope="col">Carência</th>
                                                            <th scope="col">Limite</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {g.procedimentos.map((p) => (
                                                            <tr key={p.codigo}>
                                                                <td className="tp_td_proc">
                                                                    <button
                                                                        type="button"
                                                                        className="tp_proc"
                                                                        onClick={(e) => abrirPainel(p, g.nome, e.currentTarget)}
                                                                        aria-haspopup="dialog"
                                                                    >
                                                                        <span className="tp_proc__nome">
                                                                            <Destacado texto={p.nome} consulta={consulta} />
                                                                            {p.observacoes?.length ? (
                                                                                <span className="tp_obs_marca" title="Tem observação" role="img" aria-label="Tem observação">
                                                                                    <IconeInfo />
                                                                                </span>
                                                                            ) : null}
                                                                        </span>
                                                                        <span className="tp_proc__cod">{p.codigo}</span>
                                                                    </button>
                                                                </td>
                                                                <td data-label="Diferença" className="tp_num tp_td_preco">
                                                                    {p.diferenca ? formatarReais(p.diferenca) : <span className="tp_incluso">Incluso</span>}
                                                                </td>
                                                                <td data-label="Carência">{p.carencia || '—'}</td>
                                                                <td data-label="Limite">{p.limite || '—'}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        ) : null}
                                    </section>
                                )
                            })}

                            {gerais.length > 0 ? (
                                <aside className="tp_gerais" aria-label="Observações gerais">
                                    <h2 className="tp_gerais__titulo">Informações importantes</h2>
                                    <ol>
                                        {gerais.map((o) => (
                                            <li key={o.id}>
                                                {o.titulo ? <strong>{o.titulo}. </strong> : null}
                                                <TextoObservacao texto={o.mensagem} />
                                            </li>
                                        ))}
                                    </ol>
                                </aside>
                            ) : null}
                        </div>
                    </div>
                ) : null}
            </div>

            {painel ? (
                <PainelProcedimento
                    procedimento={painel.proc}
                    grupoNome={painel.grupoNome}
                    observacoes={observacoes}
                    cidade={cidade}
                    plano={plano}
                    cliente={cliente}
                    aleatorio={aleatorio}
                    onFechar={fecharPainel}
                />
            ) : null}

            <div className="tp_fabs">
                {hrefWhats ? (
                    <a className="tp_fab" href={hrefWhats} target="_blank" rel="noreferrer" title="Falar no WhatsApp">
                        <IconeWhatsapp />
                        <span>Falar no WhatsApp</span>
                    </a>
                ) : (
                    <button
                        type="button"
                        className="tp_fab is-disabled"
                        disabled
                        aria-label="WhatsApp (escolha a cidade e o plano)"
                        title="Escolha a cidade e o plano para falar no WhatsApp"
                    >
                        <IconeWhatsapp />
                        <span>Falar no WhatsApp</span>
                    </button>
                )}
            </div>
        </main>
    )
}
