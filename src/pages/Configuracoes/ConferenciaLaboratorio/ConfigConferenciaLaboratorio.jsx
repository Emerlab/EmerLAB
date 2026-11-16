import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
    PERMISSION_KEYS,
    getStoredAccessProfile,
    hasPermission,
    usuarioPodeEditarFerramenta,
} from '../../../lib/accessControl'
import {
    CAMPOS_PLANO,
    CAMPOS_LABORATORIO,
    CAMPOS_VALORES_BASE,
    camposFaltantesMapeamento,
    mapearIndicesColunasConferencia,
} from '../../../lib/configuracoes/conferenciaLaboratorioExcel.js'
import { parsearExcelConferenciaViaWorker } from '../../../lib/configuracoes/conferenciaExcelWorkerClient.js'
import {
    resumirConferencia,
    runConferencia,
    statusEhDivergencia,
    statusEhOk,
    rotuloStatusConferencia,
} from '../../../lib/configuracoes/conferencia/index.js'
import {
    aplicarAcao,
    adicionarAliasUnico,
    adicionarEquivalenciaUnica,
    ehOrfaoStatus,
    itemAceitaAcao,
    parearOrfaos,
} from '../../../lib/configuracoes/conferencia/revisao.js'
import {
    EQUIVALENCIAS_PADRAO,
    indexarEquivalencias,
} from '../../../lib/configuracoes/conferencia/examSimilarity.js'
import {
    atualizarEquivalenciaExame,
    carregarRegrasLaboratorio,
    listarLaboratorios,
    registrarRevisoes,
    removerEquivalenciaExame,
    removerPerfilExame,
    removerVinculoBase,
    resolverVinculosSalvos,
    salvarAliasPessoa,
    salvarEquivalenciaExame,
    salvarPerfilExame,
    salvarVinculoBase,
} from '../../../lib/configuracoes/conferencia/persist.js'
import { aplicarValoresBase, examesPendentesVinculo } from '../../../lib/configuracoes/conferencia/lookupBase.js'
import { exportarConferenciaHonorariosExcel } from '../../../lib/configuracoes/conferencia/export.js'
import {
    carregarSessaoLocal,
    excluirSessaoLocal,
    formatarQuandoSessao,
    listarSessoesConferencia,
    salvarSessaoLocal,
    sessaoTemConteudo,
} from '../../../lib/configuracoes/conferencia/sessaoLocal.js'
import {
    formatarDataConferencia,
    formatarValorConferencia,
} from '../../../lib/configuracoes/conferenciaLaboratorioPrecos.js'
import CredenciamentoMainAlert from '../../../components/Toast/CredenciamentoMainAlert.jsx'
import PainelDetalheConferencia from './PainelDetalheConferencia.jsx'
import CadastroRegrasConferencia from './CadastroRegrasConferencia.jsx'
import ComboExame from './ComboExame.jsx'
import ResultadoTabela from './ResultadoTabela.jsx'
import '../../Credenciamento/Credenciamento_main/Credenciamento_main.css'
import './ConfigConferenciaLaboratorio.css'
import { PageHeader } from '../../../components/ui'
import { SelectDropdown } from '../../../components/ui/Dropdown.jsx'

function mesAtualYm() {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const ROTULO_CAMPO = {
    codigo: 'Código',
    prontuario: 'Prontuário',
    tutor: 'Tutor',
    pet: 'Pet',
    data: 'Data',
    exame: 'Exame',
    valor: 'Valor',
}

const FILTROS_RAPIDOS = [
    { id: 'todos', label: 'Todos' },
    { id: 'divergencias', label: 'Somente divergências' },
    { id: 'valores', label: 'Somente valores divergentes' },
    { id: 'orfaos', label: 'Somente órfãos' },
    { id: 'revisao', label: 'Somente revisão manual' },
    { id: 'ok', label: 'Somente OK' },
]

function UploadZone({ titulo, dica, arquivo, nomeArquivo, onFile, disabled }) {
    const [arrastando, setArrastando] = useState(false)
    const id = `conf-lab-up-${titulo.replace(/\s+/g, '-').toLowerCase()}`
    const nome = arquivo?.name || nomeArquivo || ''
    return (
        <div
            className={`conf_lab_drop${arrastando ? ' is-drag' : ''}${disabled ? ' is-busy' : ''}${nome ? ' has-file' : ''}`}
            onDragEnter={(e) => {
                e.preventDefault()
                e.stopPropagation()
                if (!disabled) setArrastando(true)
            }}
            onDragOver={(e) => {
                e.preventDefault()
                e.stopPropagation()
            }}
            onDragLeave={(e) => {
                e.preventDefault()
                e.stopPropagation()
                if (e.currentTarget === e.target) setArrastando(false)
            }}
            onDrop={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setArrastando(false)
                if (disabled) return
                const file = e.dataTransfer?.files?.[0]
                if (file) onFile(file)
            }}
        >
            <div className="conf_lab_drop_icon" aria-hidden>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                    <path
                        d="M12 3v10m0 0l3.5-3.5M12 13L8.5 9.5M4 17.5V19a2 2 0 002 2h12a2 2 0 002-2v-1.5"
                        stroke="currentColor"
                        strokeWidth="1.75"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                </svg>
            </div>
            <div className="conf_lab_drop_copy">
                <strong>{titulo}</strong>
                <span>{dica}</span>
            </div>
            <label htmlFor={id} className="conf_lab_drop_btn">
                {nome ? 'Trocar arquivo' : 'Selecionar arquivo'}
                <input
                    id={id}
                    type="file"
                    accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                    disabled={disabled}
                    onChange={(e) => onFile(e.target.files?.[0] || null)}
                />
            </label>
            {nome ? (
                <p className="conf_lab_drop_nome" title={nome}>
                    {nome}
                </p>
            ) : (
                <p className="conf_lab_drop_hint">Arraste .xlsx ou .csv aqui</p>
            )}
        </div>
    )
}

function MapaColunas({ titulo, headers, mapCols, setMapCols, campos, rotulos = {} }) {
    return (
        <div>
            <h4>{titulo}</h4>
            {campos.map((campo) => (
                <label key={`${titulo}-${campo}`}>
                    {rotulos[campo] || ROTULO_CAMPO[campo] || campo}
                    <SelectDropdown
                        value={mapCols[campo] ?? ''}
                        onChange={(e) =>
                            setMapCols((prev) => ({
                                ...prev,
                                [campo]: e.target.value === '' ? undefined : Number(e.target.value),
                            }))
                        }
                    >
                        <option value="">—</option>
                        {(headers || []).map((h, i) => (
                            <option key={`${titulo}-h-${campo}-${i}`} value={i}>
                                {h || `Coluna ${i + 1}`}
                            </option>
                        ))}
                    </SelectDropdown>
                </label>
            ))}
        </div>
    )
}

function PreviewTabela({ titulo, linhas, colunas }) {
    const cols = colunas || [
        { key: 'tutor', label: 'Tutor' },
        { key: 'pet', label: 'Pet' },
        { key: 'data', label: 'Data', tipo: 'data' },
        { key: 'exame', label: 'Exame' },
        { key: 'valor', label: 'Valor', tipo: 'valor' },
    ]
    const amostra = (linhas || []).slice(0, 8)
    const celula = (l, col) => {
        const v = l[col.key]
        if (col.tipo === 'data') return formatarDataConferencia(v)
        if (col.tipo === 'valor') return formatarValorConferencia(v ?? l.valorRelatorio ?? l.valor_base)
        return v || '—'
    }
    if (!amostra.length) {
        return (
            <div>
                <h4>{titulo}</h4>
                <p className="conf_lab_muted">Nenhuma linha válida ainda.</p>
            </div>
        )
    }
    return (
        <div className="conf_lab_preview_bloco">
            <h4>
                {titulo} ({linhas.length} linha{linhas.length === 1 ? '' : 's'})
            </h4>
            <div className="conf_lab_table_wrap overflow-x-auto">
                <table className="conf_lab_table">
                    <thead>
                        <tr>
                            {cols.map((c) => (
                                <th key={c.key}>{c.label}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {amostra.map((l) => (
                            <tr key={l.id || l.idLocal}>
                                {cols.map((c) => (
                                    <td key={c.key}>{celula(l, c)}</td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    )
}

function DashCard({ label, valor, destaque }) {
    return (
        <div className={`conf_lab_dash_card${destaque ? ` is-${destaque}` : ''}`}>
            <span>{label}</span>
            <strong>{valor}</strong>
        </div>
    )
}

function ehOrfaoPendente(r) {
    return Boolean(r) && ehOrfaoStatus(r.status) && !r.revisao?.ignorar
}

function proximoOrfaoApos(lista, idAtual, idsExcluir = []) {
    const excluir = new Set([idAtual, ...idsExcluir].filter(Boolean))
    const list = lista || []
    const idx = list.findIndex((r) => r.id === idAtual)
    const depois = idx >= 0 ? list.slice(idx + 1) : list
    const antes = idx >= 0 ? list.slice(0, idx) : []
    return [...depois, ...antes].find((r) => ehOrfaoPendente(r) && !excluir.has(r.id)) || null
}

const ACOES_MASSA = [
    { id: 'confirmar', label: 'Confirmar' },
    { id: 'nao_corresponde', label: 'Não corresponde' },
    { id: 'tutor_alternativo', label: 'Tutor alternativo' },
    { id: 'exame_equivalente', label: 'Exame equivalente' },
    { id: 'perfil_equivalente', label: 'Perfil equivalente' },
    { id: 'ignorar', label: 'Ignorar' },
]

function filtrarResultados(resultados, filtro, busca) {
    let list = resultados || []
    if (filtro === 'divergencias') list = list.filter((r) => statusEhDivergencia(r.status) && !r.revisao?.ignorar)
    if (filtro === 'valores') list = list.filter((r) => r.status === 'VALOR_DIVERGENTE')
    if (filtro === 'orfaos') {
        list = list.filter((r) => r.status === 'ORFAO_MELLISLAB' || r.status === 'ORFAO_HONORARIOS')
    }
    if (filtro === 'revisao') list = list.filter((r) => r.status === 'REVISAO_MANUAL')
    if (filtro === 'ok') list = list.filter((r) => statusEhOk(r.status))
    const t = String(busca || '')
        .trim()
        .toLowerCase()
    if (!t) return list
    return list.filter((r) =>
        [
            r.status,
            r.tutor_honorarios,
            r.tutor_mellislab,
            r.pet_honorarios,
            r.pet_mellislab,
            r.exame_honorarios,
            r.exame_mellislab,
            r.motivo,
            r.prontuario_honorarios,
            r.prontuario_mellislab,
        ]
            .join(' ')
            .toLowerCase()
            .includes(t),
    )
}

function valorOrdenacao(r, chave) {
    if (chave === 'status') return rotuloStatusConferencia(r.status)
    if (chave === 'tutor') return r.tutor_honorarios || r.tutor_mellislab || ''
    if (chave === 'animal') return r.pet_honorarios || r.pet_mellislab || ''
    if (chave === 'data') return r.data_honorarios || r.data_mellislab || ''
    if (chave === 'exame') return r.exame_honorarios || r.exame_mellislab || ''
    if (chave === 'valor') return Number(r.valor_honorarios ?? r.valor_mellislab)
    if (chave === 'difdias') return Number(r.diferenca_dias)
    if (chave === 'difvalor') return Number(r.diferenca_valor)
    if (chave === 'confianca') {
        const mapa = { BAIXA: 1, MEDIA: 2, ALTA: 3 }
        return mapa[String(r.confianca || '').toUpperCase()] ?? 0
    }
    if (chave === 'resultado') return r.motivo || r.acao || ''
    return ''
}

function compararOrdenacao(a, b) {
    const aVazio =
        a == null || a === '' || (typeof a === 'number' && !Number.isFinite(a))
    const bVazio =
        b == null || b === '' || (typeof b === 'number' && !Number.isFinite(b))
    if (aVazio && bVazio) return 0
    if (aVazio) return 1
    if (bVazio) return -1
    if (typeof a === 'number' && typeof b === 'number') return a - b
    return String(a).localeCompare(String(b), 'pt-BR', { numeric: true, sensitivity: 'base' })
}

function passoEfetivoSessao(e) {
    let passoRest = e?.passo || 'setup'
    if (passoRest === 'resultado' && !(e?.resultados || []).length) {
        passoRest =
            (e?.linhasHonorarios || []).length ||
            (e?.linhasMellis || []).length ||
            (e?.linhasBase || []).length
                ? 'preview'
                : 'setup'
    }
    return passoRest
}

function IconeHistoricoSessao() {
    return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
                d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"
                stroke="currentColor"
                strokeWidth="1.85"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <path
                d="M3 3v5h5"
                stroke="currentColor"
                strokeWidth="1.85"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <path
                d="M12 7v5l4 2"
                stroke="currentColor"
                strokeWidth="1.85"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    )
}

const ConfigConferenciaLaboratorio = () => {
    const profile = getStoredAccessProfile()
    const userId = profile?.id || ''
    const podeEditar = useMemo(() => {
        if (!profile) return false
        if (usuarioPodeEditarFerramenta(profile.permissions, 'configuracoes.conferencia_laboratorio')) {
            return true
        }
        return hasPermission(profile, PERMISSION_KEYS.CREDENCIAMENTO_EDIT)
    }, [profile])

    const [passo, setPasso] = useState('setup')
    const [processando, setProcessando] = useState(false)
    const [erro, setErro] = useState('')
    const [aviso, setAviso] = useState('')
    const [feedback, setFeedback] = useState('')

    const [laboratorios, setLaboratorios] = useState([])
    const [laboratorioId, setLaboratorioId] = useState('')
    const [periodoYm, setPeriodoYm] = useState(mesAtualYm)
    const [vinculosSalvos, setVinculosSalvos] = useState([])
    const [regrasInfo, setRegrasInfo] = useState({ carregando: false, migracaoPendente: false, motivo: '' })

    const [arquivoHonorarios, setArquivoHonorarios] = useState(null)
    const [arquivoMellis, setArquivoMellis] = useState(null)
    const [arquivoBase, setArquivoBase] = useState(null)
    const [headersHonorarios, setHeadersHonorarios] = useState([])
    const [headersMellis, setHeadersMellis] = useState([])
    const [headersBase, setHeadersBase] = useState([])
    const [mapColsHonorarios, setMapColsHonorarios] = useState({})
    const [mapColsMellis, setMapColsMellis] = useState({})
    const [mapColsBase, setMapColsBase] = useState({})
    const [linhasHonorarios, setLinhasHonorarios] = useState([])
    const [linhasMellis, setLinhasMellis] = useState([])
    const [linhasBase, setLinhasBase] = useState([])
    const [vinculosBase, setVinculosBase] = useState({})
    const [faltHonorarios, setFaltHonorarios] = useState([])
    const [faltMellis, setFaltMellis] = useState([])
    const [faltBase, setFaltBase] = useState([])

    const [resultados, setResultados] = useState([])
    const [resumo, setResumo] = useState(null)
    const [revisoes, setRevisoes] = useState([])
    const [itemAberto, setItemAberto] = useState(null)
    const [filtro, setFiltro] = useState('todos')
    const [busca, setBusca] = useState('')
    const [ordem, setOrdem] = useState({ chave: '', dir: 'asc' })
    const [regrasAberto, setRegrasAberto] = useState(false)
    const [equivalencias, setEquivalencias] = useState([])
    const [perfis, setPerfis] = useState([])
    const [aliasesPessoa, setAliasesPessoa] = useState([])
    const [selecionados, setSelecionados] = useState(() => new Set())
    const [nomesArquivosSalvos, setNomesArquivosSalvos] = useState({
        base: '',
        plano: '',
        lab: '',
    })
    const [sessoes, setSessoes] = useState([])
    const [histAberto, setHistAberto] = useState(false)
    const pendenteSalvarRef = useRef(false)
    const sessaoIdRef = useRef(null)
    const ignorarSaveRef = useRef(false)
    const histRef = useRef(null)
    const estadoSessaoRef = useRef(null)

    const laboratorioNome = useMemo(
        () => laboratorios.find((l) => String(l.id) === String(laboratorioId))?.nome || '',
        [laboratorios, laboratorioId],
    )
    const eqsPreview = useMemo(
        () => indexarEquivalencias([...EQUIVALENCIAS_PADRAO, ...equivalencias]),
        [equivalencias],
    )
    const mapeamentoOk = !faltHonorarios.length && !faltMellis.length && !faltBase.length
    const planoComBase = useMemo(
        () => aplicarValoresBase(linhasHonorarios, linhasBase, vinculosBase, eqsPreview),
        [linhasHonorarios, linhasBase, vinculosBase, eqsPreview],
    )
    const pendentesVinculo = useMemo(
        () => examesPendentesVinculo(planoComBase),
        [planoComBase],
    )
    const itensExameBase = useMemo(
        () =>
            (linhasBase || []).map((b) => ({
                id: b.id,
                rotulo: [b.codigo, b.nome || b.exame, formatarValorConferencia(b.valor)]
                    .filter(Boolean)
                    .join(' · '),
                busca: [b.codigo, b.nome || b.exame].filter(Boolean).join(' '),
            })),
        [linhasBase],
    )
    const nomesExameOpcoes = useMemo(() => {
        const mapa = new Map()
        for (const l of [...linhasBase, ...linhasHonorarios, ...linhasMellis]) {
            const nome = String(l.nome || l.exame || '').trim()
            if (!nome) continue
            const id = nome
            if (!mapa.has(id)) {
                mapa.set(id, {
                    id,
                    rotulo: [l.codigo || l.codigo_base, nome].filter(Boolean).join(' · '),
                    busca: [l.codigo, nome].filter(Boolean).join(' '),
                })
            }
        }
        return [...mapa.values()]
    }, [linhasBase, linhasHonorarios, linhasMellis])
    const podeComparar =
        podeEditar &&
        laboratorioId &&
        linhasHonorarios.length &&
        linhasMellis.length &&
        linhasBase.length &&
        mapeamentoOk &&
        !pendentesVinculo.length

    const visiveis = useMemo(() => {
        const list = filtrarResultados(resultados, filtro, busca)
        if (!ordem.chave) return list
        return [...list].sort((x, y) => {
            const c = compararOrdenacao(valorOrdenacao(x, ordem.chave), valorOrdenacao(y, ordem.chave))
            return ordem.dir === 'asc' ? c : -c
        })
    }, [resultados, filtro, busca, ordem])

    const alternarOrdem = useCallback((chave) => {
        setOrdem((prev) => {
            if (prev.chave !== chave) return { chave, dir: 'asc' }
            return { chave, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        })
    }, [])
    const idsVisiveis = useMemo(() => visiveis.map((r) => r.id), [visiveis])
    const todosVisiveisMarcados =
        idsVisiveis.length > 0 && idsVisiveis.every((id) => selecionados.has(id))
    const algunsVisiveisMarcados = idsVisiveis.some((id) => selecionados.has(id))
    const orfaosMellis = useMemo(
        () => resultados.filter((r) => r.status === 'ORFAO_MELLISLAB' && !r.revisao?.ignorar),
        [resultados],
    )
    const orfaosHonorarios = useMemo(
        () => resultados.filter((r) => r.status === 'ORFAO_HONORARIOS' && !r.revisao?.ignorar),
        [resultados],
    )

    // ── Laboratórios e regras salvas por laboratório ────────────────────────────
    useEffect(() => {
        let vivo = true
        listarLaboratorios()
            .then((lista) => vivo && setLaboratorios(lista))
            .catch((e) => {
                if (vivo) setAviso(`Não foi possível carregar os laboratórios: ${e?.message || e}`)
            })
        return () => {
            vivo = false
        }
    }, [])

    useEffect(() => {
        if (!laboratorioId) return undefined
        let vivo = true
        setRegrasInfo({ carregando: true, migracaoPendente: false, motivo: '' })
        carregarRegrasLaboratorio(laboratorioId).then((r) => {
            if (!vivo) return
            setRegrasInfo({
                carregando: false,
                migracaoPendente: Boolean(r.migracaoPendente),
                motivo: r.ok ? '' : r.motivo || '',
            })
            if (!r.ok) return
            const mesclar = (doBanco, local, adicionar) =>
                local.filter((x) => !x.id).reduce((acc, x) => adicionar(acc, x), doBanco)
            setEquivalencias((prev) => mesclar(r.equivalencias, prev, adicionarEquivalenciaUnica))
            setAliasesPessoa((prev) => mesclar(r.aliasesPessoa, prev, adicionarAliasUnico))
            setPerfis((prev) => [...r.perfis, ...prev.filter((p) => !p.id && !r.perfis.some((q) => q.nome === p.nome))])
            setVinculosSalvos(r.vinculos)
        })
        return () => {
            vivo = false
        }
    }, [laboratorioId])

    // Vínculos salvos (por código da base) viram vínculos desta conferência, sem sobrescrever os já feitos.
    useEffect(() => {
        if (!vinculosSalvos.length || !linhasBase.length) return
        const novos = resolverVinculosSalvos(vinculosSalvos, linhasBase, vinculosBase)
        if (Object.keys(novos).length) setVinculosBase((prev) => ({ ...novos, ...prev }))
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [vinculosSalvos, linhasBase])

    const trocarLaboratorio = (novoId) => {
        if (String(novoId) === String(laboratorioId)) return
        if (resultados.length && !window.confirm('Trocar o laboratório descarta o resultado atual e as decisões manuais. Continuar?')) {
            return
        }
        descartarResultados()
        setLaboratorioId(novoId)
        setEquivalencias([])
        setAliasesPessoa([])
        setPerfis([])
        setVinculosSalvos([])
        setVinculosBase({})
        setRegrasInfo({ carregando: false, migracaoPendente: false, motivo: '' })
    }

    const avisarFalhaRegra = (r) => {
        if (r && !r.ok) setAviso(r.motivo || 'Não foi possível salvar a regra no banco.')
    }

    const aprender = (ap) => {
        if (!ap) return
        if (ap.alias) {
            setAliasesPessoa((prev) => adicionarAliasUnico(prev, ap.alias))
            if (laboratorioId) {
                void salvarAliasPessoa({
                    laboratorioId,
                    nomePlano: ap.alias.nomePlano,
                    nomeLab: ap.alias.nomeLab,
                }).then(avisarFalhaRegra)
            }
        }
        if (ap.equivalencia) {
            const eq = ap.equivalencia
            setEquivalencias((prev) => adicionarEquivalenciaUnica(prev, eq))
            if (laboratorioId) {
                void salvarEquivalenciaExame({ laboratorioId, nomeA: eq.a, nomeB: eq.b }).then((r) => {
                    avisarFalhaRegra(r)
                    if (r.ok && r.id) {
                        setEquivalencias((prev) =>
                            prev.map((p) => (!p.id && p.a === eq.a && p.b === eq.b ? { ...p, id: r.id } : p)),
                        )
                    }
                })
            }
        }
    }

    const registrarRevisoesBanco = (lista) => {
        if (!laboratorioId || !lista.length) return
        void registrarRevisoes({
            laboratorioId,
            periodoYm,
            sessaoId: sessaoIdRef.current,
            revisoes: lista,
        }).then((r) => {
            if (!r.ok && !r.migracaoPendente) setAviso(`Trilha de revisão não gravada: ${r.motivo}`)
        })
    }

    // ── Sessão local (autosave leve) ───────────────────────────────────────────
    const nomesArquivosAtuais = {
        base: arquivoBase?.name || nomesArquivosSalvos.base || '',
        plano: arquivoHonorarios?.name || nomesArquivosSalvos.plano || '',
        lab: arquivoMellis?.name || nomesArquivosSalvos.lab || '',
    }

    const estadoParaSalvar = {
        passo,
        laboratorioId,
        laboratorioNome,
        periodoYm,
        nomesArquivos: nomesArquivosAtuais,
        headersHonorarios,
        headersMellis,
        headersBase,
        mapColsHonorarios,
        mapColsMellis,
        mapColsBase,
        linhasHonorarios,
        linhasMellis,
        linhasBase,
        vinculosBase,
        faltHonorarios,
        faltMellis,
        faltBase,
        resultados,
        resumo,
        revisoes,
        equivalencias,
        aliasesPessoa,
        perfis,
    }
    estadoSessaoRef.current = estadoParaSalvar

    const recarregarSessoes = async () => {
        try {
            setSessoes(await listarSessoesConferencia(userId))
        } catch (e) {
            console.warn('[conferencia] sessões locais:', e?.message || e)
        }
    }

    const persistirSessao = async () => {
        const estado = estadoSessaoRef.current
        if (!estado || !sessaoTemConteudo(estado)) return
        try {
            const meta = await salvarSessaoLocal(userId, sessaoIdRef.current, estado)
            sessaoIdRef.current = meta.id
            pendenteSalvarRef.current = false
            setSessoes((prev) => [meta, ...prev.filter((s) => s.id !== meta.id)])
        } catch (e) {
            console.warn('[conferencia] salvar sessão:', e?.message || e)
            setAviso('Não foi possível salvar a sessão neste computador (espaço ou permissão).')
        }
    }

    useEffect(() => {
        void recarregarSessoes()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    useEffect(() => {
        if (ignorarSaveRef.current) {
            ignorarSaveRef.current = false
            return undefined
        }
        if (!sessaoTemConteudo(estadoParaSalvar)) return undefined
        pendenteSalvarRef.current = true
        const t = setTimeout(() => {
            void persistirSessao()
        }, 700)
        return () => clearTimeout(t)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        passo,
        laboratorioId,
        periodoYm,
        nomesArquivosAtuais.base,
        nomesArquivosAtuais.plano,
        nomesArquivosAtuais.lab,
        headersHonorarios,
        headersMellis,
        headersBase,
        mapColsHonorarios,
        mapColsMellis,
        mapColsBase,
        linhasHonorarios,
        linhasMellis,
        linhasBase,
        vinculosBase,
        faltHonorarios,
        faltMellis,
        faltBase,
        resultados,
        resumo,
        revisoes,
        equivalencias,
        aliasesPessoa,
        perfis,
    ])

    useEffect(() => {
        // Só avisa ao sair se ainda há alteração que não chegou a ser gravada na sessão local.
        const onBeforeUnload = (e) => {
            if (!pendenteSalvarRef.current) return
            e.preventDefault()
            e.returnValue = ''
        }
        const onVisivel = () => {
            if (document.visibilityState === 'hidden') void persistirSessao()
        }
        window.addEventListener('beforeunload', onBeforeUnload)
        document.addEventListener('visibilitychange', onVisivel)
        return () => {
            window.removeEventListener('beforeunload', onBeforeUnload)
            document.removeEventListener('visibilitychange', onVisivel)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    useEffect(() => {
        if (!histAberto) return undefined
        const onDoc = (e) => {
            if (!histRef.current?.contains(e.target)) setHistAberto(false)
        }
        document.addEventListener('mousedown', onDoc)
        return () => document.removeEventListener('mousedown', onDoc)
    }, [histAberto])

    // ── Importação ─────────────────────────────────────────────────────────────
    const parseArquivo = async (arquivo, mapCols, origem) => {
        const buffer = await arquivo.arrayBuffer()
        return parsearExcelConferenciaViaWorker(buffer, {
            mapeamentoManual: mapCols,
            origem,
        })
    }

    const aplicarParse = (parsed, origem) => {
        const auto = mapearIndicesColunasConferencia(parsed.headers || [], {}, origem)
        const falt = parsed.faltantes || camposFaltantesMapeamento(parsed.idx || auto.idx, { origem })
        const preencherMapa = (prev, campos) => {
            const next = { ...prev }
            for (const campo of campos) {
                if (next[campo] == null && auto.idx[campo] >= 0) next[campo] = auto.idx[campo]
            }
            return next
        }
        if (origem === 'valores_base') {
            setHeadersBase(parsed.headers || [])
            setLinhasBase(parsed.linhas || [])
            setFaltBase(falt)
            setMapColsBase((prev) => preencherMapa(prev, CAMPOS_VALORES_BASE))
        } else if (origem === 'honorarios') {
            setHeadersHonorarios(parsed.headers || [])
            setLinhasHonorarios(parsed.linhas || [])
            setFaltHonorarios(falt)
            setMapColsHonorarios((prev) => preencherMapa(prev, CAMPOS_PLANO))
        } else {
            setHeadersMellis(parsed.headers || [])
            setLinhasMellis(parsed.linhas || [])
            setFaltMellis(falt)
            setMapColsMellis((prev) => preencherMapa(prev, CAMPOS_LABORATORIO))
        }
        return falt
    }

    /** Limpa o resultado e as decisões manuais (que dependem dos arquivos/regras atuais). */
    function descartarResultados() {
        setResultados([])
        setResumo(null)
        setRevisoes([])
        setSelecionados(new Set())
        setItemAberto(null)
        setFiltro('todos')
        setBusca('')
    }

    const receberArquivo = async (file, origem) => {
        if (!file) return
        if (resultados.length) {
            const msg = revisoes.length
                ? 'Trocar o arquivo descarta o resultado atual e as decisões manuais já feitas. Continuar?'
                : 'Trocar o arquivo descarta o resultado atual. Continuar?'
            if (!window.confirm(msg)) return
            descartarResultados()
        }
        if (origem === 'valores_base') {
            setArquivoBase(file)
            setVinculosBase({})
        } else if (origem === 'honorarios') setArquivoHonorarios(file)
        else setArquivoMellis(file)
        const mapa =
            origem === 'valores_base' ? mapColsBase : origem === 'honorarios' ? mapColsHonorarios : mapColsMellis
        setErro('')
        setProcessando(true)
        try {
            const parsed = await parseArquivo(file, mapa, origem)
            const falt = aplicarParse(parsed, origem)
            if (parsed.erro && falt.length) setErro(parsed.erro)
            else setPasso('preview')
        } catch (e) {
            setErro(e?.message || String(e))
        } finally {
            setProcessando(false)
        }
    }

    const onFileBase = (file) => receberArquivo(file, 'valores_base')
    const onFileHonorarios = (file) => receberArquivo(file, 'honorarios')
    const onFileMellis = (file) => receberArquivo(file, 'mellislab')

    const reparseComMapeamento = async () => {
        if (!arquivoBase || !arquivoHonorarios || !arquivoMellis) {
            setErro('Envie as três planilhas: Valores de Base, Relatório Plano e Relatório Laboratório.')
            return
        }
        if (resultados.length && !window.confirm('Atualizar a prévia descarta o resultado atual. Continuar?')) {
            return
        }
        setProcessando(true)
        setErro('')
        try {
            const [b, h, m] = await Promise.all([
                parseArquivo(arquivoBase, mapColsBase, 'valores_base'),
                parseArquivo(arquivoHonorarios, mapColsHonorarios, 'honorarios'),
                parseArquivo(arquivoMellis, mapColsMellis, 'mellislab'),
            ])
            const faltB = aplicarParse(b, 'valores_base')
            const faltH = aplicarParse(h, 'honorarios')
            const faltM = aplicarParse(m, 'mellislab')
            if (faltB.length || faltH.length || faltM.length || b.erro || h.erro || m.erro) {
                setErro(b.erro || h.erro || m.erro || 'Ajuste o mapeamento das colunas obrigatórias.')
                return
            }
            descartarResultados()
            setPasso('preview')
            setFeedback('Prévia atualizada. Confira as linhas e os vínculos de exame antes de comparar.')
        } catch (e) {
            setErro(e?.message || String(e))
        } finally {
            setProcessando(false)
        }
    }

    const alterarVinculo = (p, id) => {
        setVinculosBase((prev) => {
            const next = { ...prev }
            if (!id) delete next[p.chave]
            else next[p.chave] = id
            return next
        })
        setVinculosSalvos((prev) => prev.filter((v) => v.chave !== p.chave))
        if (!laboratorioId) return
        if (!id) {
            void removerVinculoBase({ laboratorioId, chave: p.chave }).then(avisarFalhaRegra)
            return
        }
        const item = linhasBase.find((b) => String(b.id) === String(id))
        if (!item?.codigo) return
        const salvo = { chave: p.chave, exame: p.exame, codigo: item.codigo, nome: item.nome || item.exame }
        setVinculosSalvos((prev) => [...prev, salvo])
        void salvarVinculoBase({
            laboratorioId,
            chave: salvo.chave,
            exame: salvo.exame,
            codigo: salvo.codigo,
            nome: salvo.nome,
        }).then(avisarFalhaRegra)
    }

    // ── Comparação ─────────────────────────────────────────────────────────────
    const executarComparacao = async () => {
        if (!podeComparar) {
            setErro(
                !laboratorioId
                    ? 'Selecione o laboratório antes de comparar (as regras são guardadas por laboratório).'
                    : pendentesVinculo.length
                      ? 'Vincule os exames do plano à lista de Valores de Base (ambiguidades são manuais).'
                      : 'Mapeie as três planilhas e gere a prévia antes de comparar.',
            )
            return
        }
        if (
            resultados.length &&
            revisoes.length &&
            !window.confirm(
                'Já existem decisões manuais neste resultado. Comparar de novo descarta essas decisões. Continuar?',
            )
        ) {
            return
        }
        setProcessando(true)
        setErro('')
        // Deixa o "Comparando…" aparecer antes do cálculo.
        await new Promise((resolve) => setTimeout(resolve, 30))
        try {
            const out = runConferencia({
                honorarios: linhasHonorarios,
                mellislab: linhasMellis,
                valoresBase: linhasBase,
                vinculosBase,
                equivalencias,
                aliasesPessoa,
                perfis,
            })
            setResultados(out.resultados)
            setResumo(out.resumo)
            setRevisoes([])
            setSelecionados(new Set())
            setItemAberto(null)
            setPasso('resultado')
            setFeedback('Comparação concluída. O valor oficial é o de Valores de Base.')
        } catch (e) {
            setErro(e?.message || String(e))
        } finally {
            setProcessando(false)
        }
    }

    const aplicarEstadoSessao = (e) => {
        const passoRest = passoEfetivoSessao(e)
        setPasso(passoRest)
        setLaboratorioId(e.laboratorioId ? String(e.laboratorioId) : '')
        setPeriodoYm(e.periodoYm || mesAtualYm())
        setVinculosSalvos([])
        setNomesArquivosSalvos(e.nomesArquivos || { base: '', plano: '', lab: '' })
        setArquivoHonorarios(null)
        setArquivoMellis(null)
        setArquivoBase(null)
        setHeadersHonorarios(e.headersHonorarios || [])
        setHeadersMellis(e.headersMellis || [])
        setHeadersBase(e.headersBase || [])
        setMapColsHonorarios(e.mapColsHonorarios || {})
        setMapColsMellis(e.mapColsMellis || {})
        setMapColsBase(e.mapColsBase || {})
        setLinhasHonorarios(e.linhasHonorarios || [])
        setLinhasMellis(e.linhasMellis || [])
        setLinhasBase(e.linhasBase || [])
        setVinculosBase(e.vinculosBase || {})
        setFaltHonorarios(e.faltHonorarios || [])
        setFaltMellis(e.faltMellis || [])
        setFaltBase(e.faltBase || [])
        setResultados(e.resultados || [])
        setResumo(e.resumo || null)
        setRevisoes(e.revisoes || [])
        setEquivalencias(e.equivalencias || [])
        setAliasesPessoa(e.aliasesPessoa || [])
        setPerfis(e.perfis || [])
        setSelecionados(new Set())
        setItemAberto(null)
        setFiltro('todos')
        setBusca('')
        setOrdem({ chave: '', dir: 'asc' })
    }

    const restaurarSessao = async (id) => {
        setProcessando(true)
        setErro('')
        try {
            const reg = await carregarSessaoLocal(userId, id)
            if (!reg?.estado) {
                setErro('Sessão não encontrada ou já expirou (30 dias).')
                await recarregarSessoes()
                return
            }
            ignorarSaveRef.current = true
            sessaoIdRef.current = reg.id
            aplicarEstadoSessao(reg.estado)
            await salvarSessaoLocal(userId, reg.id, {
                ...reg.estado,
                passo: passoEfetivoSessao(reg.estado),
            })
            await recarregarSessoes()
            setHistAberto(false)
            setFeedback(`Sessão restaurada (${formatarQuandoSessao(reg.atualizadoEm)}).`)
        } catch (e) {
            setErro(e?.message || String(e))
        } finally {
            setProcessando(false)
        }
    }

    const excluirSessao = async (id, ev) => {
        ev?.stopPropagation?.()
        try {
            await excluirSessaoLocal(userId, id)
            if (sessaoIdRef.current === id) sessaoIdRef.current = null
            await recarregarSessoes()
            setFeedback('Sessão excluída.')
        } catch (e) {
            setErro(e?.message || String(e))
        }
    }

    // ── Revisão manual ─────────────────────────────────────────────────────────
    const nomeUsuario = profile?.nome || userId || ''

    const registrarRevisao = async (item, acao, extra = {}) => {
        const revisao = {
            ...extra,
            acao,
            usuario: nomeUsuario,
            dataHora: new Date().toISOString(),
            justificativa: String(extra.justificativa || '').trim(),
            resultadoId: item.id,
            ignorar: acao === 'ignorar',
        }
        const ctx = { equivalencias, aliasesPessoa }
        let proximoResultados
        let aprendizado
        let selecaoRemover = [item.id]
        let selecaoAdd = []
        let excluirDaFila = [item.id]

        if (acao === 'parear') {
            const oposto = resultados.find((r) => r.id === extra.opostoId)
            const out = parearOrfaos(resultados, item, oposto, ctx, revisao)
            if (out.erro) {
                setErro(out.erro)
                return
            }
            proximoResultados = out.resultados
            selecaoRemover = [item.id, oposto.id]
            selecaoAdd = [out.par.id]
            excluirDaFila = [item.id, oposto.id]
            revisao.statusFinal = out.par.status
        } else {
            const out = aplicarAcao(resultados, item.id, acao, extra, revisao, ctx)
            if (out.erro) {
                setErro(out.erro)
                return
            }
            proximoResultados = out.resultados
            aprendizado = out.aprendizado
            revisao.statusFinal = proximoResultados.find((r) => r.revisao === revisao)?.status || ''
        }

        setRevisoes((prev) => [...prev, revisao])
        setResultados(proximoResultados)
        setResumo(resumirConferencia(proximoResultados))
        setSelecionados((prev) => {
            const s = new Set(prev)
            for (const id of selecaoRemover) s.delete(id)
            for (const id of selecaoAdd) s.add(id)
            return s
        })
        const avancar = acao === 'parear' || acao === 'confirmar' || acao === 'ignorar'
        const fila = visiveis.length ? visiveis : resultados
        const proximo = avancar
            ? proximoOrfaoApos(fila, item.id, excluirDaFila.filter((x) => x !== item.id))
            : null
        setItemAberto(proximo ? proximoResultados.find((r) => r.id === proximo.id) || null : null)
        aprender(aprendizado)
        registrarRevisoesBanco([revisao])
        setFeedback(
            acao === 'parear'
                ? proximo
                    ? 'Correspondência encaixada. Abrindo o próximo órfão.'
                    : 'Correspondência encaixada. Não há mais órfãos na lista.'
                : 'Ação registrada no histórico.',
        )
    }

    const alternarSelecao = useCallback((id) => {
        setSelecionados((prev) => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }, [])

    const alternarTodosVisiveis = () => {
        setSelecionados((prev) => {
            const next = new Set(prev)
            if (todosVisiveisMarcados) {
                for (const id of idsVisiveis) next.delete(id)
            } else {
                for (const id of idsVisiveis) next.add(id)
            }
            return next
        })
    }

    const aplicarAcaoEmMassa = (acao) => {
        if (!podeEditar) return
        const alvos = resultados.filter((r) => selecionados.has(r.id) && itemAceitaAcao(r, acao))
        if (!alvos.length) {
            setErro('Nenhuma das linhas selecionadas aceita essa ação.')
            return
        }
        const agora = new Date().toISOString()
        const ctx = { equivalencias, aliasesPessoa }
        let atual = resultados
        const feitas = []
        let falhas = 0
        let aliases = aliasesPessoa
        let eqs = equivalencias
        const aprendidos = []
        for (const item of alvos) {
            const revisao = {
                acao,
                usuario: nomeUsuario,
                dataHora: agora,
                justificativa: '',
                resultadoId: item.id,
                ignorar: acao === 'ignorar',
                emMassa: true,
            }
            const out = aplicarAcao(atual, item.id, acao, {}, revisao, { equivalencias: eqs, aliasesPessoa: aliases })
            if (out.erro) {
                falhas += 1
                continue
            }
            atual = out.resultados
            revisao.statusFinal = atual.find((r) => r.revisao === revisao)?.status || ''
            feitas.push(revisao)
            if (out.aprendizado?.alias) {
                aliases = adicionarAliasUnico(aliases, out.aprendizado.alias)
                aprendidos.push(out.aprendizado)
            }
            if (out.aprendizado?.equivalencia) {
                eqs = adicionarEquivalenciaUnica(eqs, out.aprendizado.equivalencia)
                aprendidos.push(out.aprendizado)
            }
        }
        void ctx
        if (!feitas.length) {
            setErro('Nenhuma das linhas selecionadas pôde receber essa ação.')
            return
        }
        setRevisoes((prev) => [...prev, ...feitas])
        setResultados(atual)
        setResumo(resumirConferencia(atual))
        aprendidos.forEach(aprender)
        registrarRevisoesBanco(feitas)
        setSelecionados(new Set())
        const pulados = selecionados.size - feitas.length
        setFeedback(
            pulados
                ? `Ação aplicada em ${feitas.length} linha(s). ${pulados} não aceita(m) essa ação${falhas ? ` (${falhas} com erro)` : ''}.`
                : `Ação aplicada em ${feitas.length} linha(s).`,
        )
    }

    // ── Regras (equivalências e perfis) ────────────────────────────────────────
    const semLaboratorioAviso = () =>
        !laboratorioId
            ? ' Selecione um laboratório para guardar para os próximos meses.'
            : ''

    const salvarEquivalencia = async (a, b) => {
        if (!String(a || '').trim() || !String(b || '').trim()) {
            setErro('Informe os dois nomes da equivalência.')
            return
        }
        const eq = { a: a.trim(), b: b.trim() }
        setEquivalencias((prev) => adicionarEquivalenciaUnica(prev, eq))
        if (!laboratorioId) {
            setFeedback(`Equivalência adicionada nesta conferência.${semLaboratorioAviso()}`)
            return
        }
        const r = await salvarEquivalenciaExame({ laboratorioId, nomeA: eq.a, nomeB: eq.b })
        avisarFalhaRegra(r)
        if (r.ok && r.id) {
            setEquivalencias((prev) =>
                prev.map((p) => (!p.id && p.a === eq.a && p.b === eq.b ? { ...p, id: r.id } : p)),
            )
            setFeedback(`Equivalência guardada para ${laboratorioNome || 'o laboratório'}.`)
        }
    }

    const atualizarEquivalencia = async (idx, a, b) => {
        const i = Number(idx)
        const atual = equivalencias[i]
        if (!atual) return
        if (!String(a || '').trim() || !String(b || '').trim()) {
            setErro('Informe os dois nomes da equivalência.')
            return
        }
        setEquivalencias((prev) =>
            prev.map((p, j) => (j === i ? { ...p, a: a.trim(), b: b.trim() } : p)),
        )
        if (atual.id) avisarFalhaRegra(await atualizarEquivalenciaExame({ id: atual.id, nomeA: a, nomeB: b }))
        setFeedback('Equivalência atualizada.')
    }

    const removerEquivalencia = async (idx) => {
        const i = Number(idx)
        const atual = equivalencias[i]
        if (!atual) return
        setEquivalencias((prev) => prev.filter((_, j) => j !== i))
        if (atual.id) avisarFalhaRegra(await removerEquivalenciaExame(atual.id))
        setFeedback('Equivalência removida.')
    }

    const salvarPerfil = async (dados) => {
        if (!String(dados?.nome || '').trim()) {
            setErro('Informe o nome do perfil.')
            return
        }
        const local = {
            nome: dados.nome.trim(),
            descricao: dados.descricao,
            valor: dados.valor,
            vigencia_inicio: dados.vigenciaInicio || null,
            vigencia_fim: dados.vigenciaFim || null,
            exames: dados.exames || [],
        }
        setPerfis((prev) => [...prev, local])
        if (!laboratorioId) {
            setFeedback(`Perfil adicionado nesta conferência.${semLaboratorioAviso()}`)
            return
        }
        const r = await salvarPerfilExame({ laboratorioId, ...dados })
        avisarFalhaRegra(r)
        if (r.ok && r.id) {
            setPerfis((prev) => prev.map((p) => (p === local ? { ...p, id: r.id } : p)))
            setFeedback(`Perfil guardado para ${laboratorioNome || 'o laboratório'}.`)
        }
    }

    const removerPerfil = async (idx) => {
        const i = Number(idx)
        const atual = perfis[i]
        if (!atual) return
        setPerfis((prev) => prev.filter((_, j) => j !== i))
        if (atual.id) avisarFalhaRegra(await removerPerfilExame(atual.id))
        setFeedback('Perfil removido.')
    }

    const codigoElabDoItem = (item) => item?.honorarios?.codigo_base || item?.honorarios?.codigo || ''

    const etapas = [
        { id: 'setup', label: '1. Importar', liberada: true },
        {
            id: 'preview',
            label: '2. Prévia',
            liberada: Boolean(
                headersHonorarios.length ||
                    headersMellis.length ||
                    headersBase.length ||
                    linhasHonorarios.length,
            ),
        },
        { id: 'resultado', label: '3. Resultado', liberada: Boolean(resultados.length) },
    ]

    return (
        <main className="el-page credenciamento_main conf_lab_page">
            <PageHeader
                kicker="Configurações"
                title="Conferência Laboratório × Plano"
                description="O valor oficial vem da planilha Valores de Base. O Relatório Plano busca esse valor pelo nome do exame (vínculos ambíguos são manuais). O Relatório Laboratório traz o valor lançado."
            />

            {erro ? (
                <CredenciamentoMainAlert message={erro} onClose={() => setErro('')} />
            ) : null}
            {aviso ? (
                <CredenciamentoMainAlert
                    className="is-aviso"
                    message={aviso}
                    onClose={() => setAviso('')}
                />
            ) : null}
            {feedback ? (
                <CredenciamentoMainAlert
                    className="is-sucesso"
                    message={feedback}
                    onClose={() => setFeedback('')}
                />
            ) : null}

            <nav className="conf_lab_steps" aria-label="Etapas da conferência">
                {etapas.map((etapa) => (
                    <button
                        key={etapa.id}
                        type="button"
                        className={`conf_lab_step_btn${passo === etapa.id ? ' is-active' : ''}${etapa.liberada ? '' : ' is-disabled'}`}
                        disabled={!etapa.liberada}
                        onClick={() => setPasso(etapa.id)}
                    >
                        {etapa.label}
                    </button>
                ))}
            </nav>

            {passo === 'setup' || passo === 'preview' ? (
                <section className="conf_lab_card">
                    <div className="conf_lab_card_topo">
                        <h2>Importar e mapear</h2>
                        <div className="conf_lab_hist" ref={histRef}>
                            <button
                                type="button"
                                className={`conf_lab_hist_btn${histAberto ? ' is-open' : ''}`}
                                title="Sessões salvas (até 30 dias)"
                                aria-label="Sessões salvas"
                                aria-expanded={histAberto}
                                onClick={() => {
                                    setHistAberto((v) => !v)
                                    void recarregarSessoes()
                                }}
                            >
                                <IconeHistoricoSessao />
                                {sessoes.length ? (
                                    <span className="conf_lab_hist_qtd">{sessoes.length}</span>
                                ) : null}
                            </button>
                            {histAberto ? (
                                <div
                                    className="conf_lab_hist_painel"
                                    role="dialog"
                                    aria-label="Sessões salvas"
                                >
                                    <header>
                                        <strong>Sessões salvas</strong>
                                        <span>
                                            Guardadas neste computador por até 30 dias.
                                        </span>
                                    </header>
                                    {sessoes.length === 0 ? (
                                        <p className="conf_lab_muted">
                                            Nenhuma sessão nos últimos 30 dias.
                                        </p>
                                    ) : (
                                        <ul>
                                            {sessoes.map((s) => {
                                                const arqs = [
                                                    s.nomesArquivos?.plano,
                                                    s.nomesArquivos?.lab,
                                                    s.nomesArquivos?.base,
                                                ]
                                                    .filter(Boolean)
                                                    .join(' · ')
                                                return (
                                                    <li key={s.id}>
                                                        <button
                                                            type="button"
                                                            className="conf_lab_hist_item"
                                                            disabled={processando}
                                                            onClick={() =>
                                                                void restaurarSessao(s.id)
                                                            }
                                                        >
                                                            <span className="conf_lab_hist_quando">
                                                                {formatarQuandoSessao(
                                                                    s.atualizadoEm,
                                                                )}
                                                            </span>
                                                            <span className="conf_lab_hist_arqs">
                                                                {arqs || 'Planilhas importadas'}
                                                            </span>
                                                            <span className="conf_lab_hist_tot">
                                                                {s.totais.plano} plano ·{' '}
                                                                {s.totais.lab} lab
                                                                {s.totais.pares
                                                                    ? ` · ${s.totais.pares} conferidos`
                                                                    : ''}
                                                                {s.passo === 'resultado'
                                                                    ? ' · resultado'
                                                                    : ''}
                                                            </span>
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="conf_lab_hist_del"
                                                            title="Excluir sessão"
                                                            aria-label="Excluir sessão"
                                                            onClick={(ev) =>
                                                                void excluirSessao(s.id, ev)
                                                            }
                                                        >
                                                            ×
                                                        </button>
                                                    </li>
                                                )
                                            })}
                                        </ul>
                                    )}
                                </div>
                            ) : null}
                        </div>
                    </div>

                    <div className="conf_lab_ident !grid !grid-cols-1 gap-4 md:!grid-cols-3">
                        <label className="conf_lab_ident_campo">
                            <span>Laboratório</span>
                            <SelectDropdown
                                value={laboratorioId}
                                onChange={(e) => trocarLaboratorio(e.target.value)}
                                disabled={processando || !podeEditar}
                            >
                                <option value="">Selecione o laboratório…</option>
                                {laboratorios.map((l) => (
                                    <option key={l.id} value={String(l.id)}>
                                        {l.nome}
                                        {l.ativo ? '' : ' (inativo)'}
                                    </option>
                                ))}
                            </SelectDropdown>
                        </label>
                        <label className="conf_lab_ident_campo">
                            <span>Competência</span>
                            <input
                                type="month"
                                value={periodoYm}
                                onChange={(e) => setPeriodoYm(e.target.value)}
                                disabled={processando || !podeEditar}
                            />
                        </label>
                        <p className="conf_lab_muted conf_lab_ident_info">
                            {!laboratorioId
                                ? 'Escolha o laboratório: equivalências, perfis, tutores alternativos e vínculos ficam guardados para os próximos meses.'
                                : regrasInfo.carregando
                                  ? 'Carregando as regras deste laboratório…'
                                  : regrasInfo.migracaoPendente
                                    ? 'Regras ainda não são salvas no banco (migração pendente): valem só nesta sessão.'
                                    : regrasInfo.motivo
                                      ? `Não foi possível carregar as regras: ${regrasInfo.motivo}`
                                      : `${equivalencias.length} equivalência(s), ${aliasesPessoa.length} tutor(es) alternativo(s) e ${perfis.length} perfil(is) deste laboratório.`}
                        </p>
                    </div>

                    <div className="conf_lab_uploads conf_lab_uploads_tres !grid !grid-cols-1 gap-4 md:!grid-cols-3">
                        <UploadZone
                            titulo="Valores de Base"
                            dica="Código | Nome | Valor (oficial)"
                            arquivo={arquivoBase}
                            nomeArquivo={nomesArquivosAtuais.base}
                            onFile={(f) => void onFileBase(f)}
                            disabled={processando || !podeEditar}
                        />
                        <UploadZone
                            titulo="Relatório Plano"
                            dica="Data | Tutor | Pet | Exame (sem valor)"
                            arquivo={arquivoHonorarios}
                            nomeArquivo={nomesArquivosAtuais.plano}
                            onFile={(f) => void onFileHonorarios(f)}
                            disabled={processando || !podeEditar}
                        />
                        <UploadZone
                            titulo="Relatório Laboratório"
                            dica="Data | Tutor | Pet | Exame | Valor"
                            arquivo={arquivoMellis}
                            nomeArquivo={nomesArquivosAtuais.lab}
                            onFile={(f) => void onFileMellis(f)}
                            disabled={processando || !podeEditar}
                        />
                    </div>

                    {headersBase.length || headersHonorarios.length || headersMellis.length ? (
                        <div className="conf_lab_map_cols">
                            <h3>Mapear colunas</h3>
                            <div className="conf_lab_map_cols_grid conf_lab_map_cols_tres !grid !grid-cols-1 gap-4 md:!grid-cols-3">
                                <MapaColunas
                                    titulo="Valores de Base"
                                    headers={headersBase}
                                    mapCols={mapColsBase}
                                    setMapCols={setMapColsBase}
                                    campos={CAMPOS_VALORES_BASE}
                                    rotulos={{ exame: 'Nome' }}
                                />
                                <MapaColunas
                                    titulo="Relatório Plano"
                                    headers={headersHonorarios}
                                    mapCols={mapColsHonorarios}
                                    setMapCols={setMapColsHonorarios}
                                    campos={CAMPOS_PLANO}
                                />
                                <MapaColunas
                                    titulo="Relatório Laboratório"
                                    headers={headersMellis}
                                    mapCols={mapColsMellis}
                                    setMapCols={setMapColsMellis}
                                    campos={CAMPOS_LABORATORIO}
                                />
                            </div>
                            {(faltBase.length || faltHonorarios.length || faltMellis.length) && (
                                <p className="conf_lab_muted">
                                    Faltando Base: {faltBase.join(', ') || '—'} · Plano:{' '}
                                    {faltHonorarios.join(', ') || '—'} · Laboratório:{' '}
                                    {faltMellis.join(', ') || '—'}
                                </p>
                            )}
                        </div>
                    ) : null}

                    {passo === 'preview' ? (
                        <>
                            <div className="conf_lab_preview_grid conf_lab_preview_tres !grid !grid-cols-1 gap-4 md:!grid-cols-3">
                                <PreviewTabela
                                    titulo="Prévia Valores de Base"
                                    linhas={linhasBase}
                                    colunas={[
                                        { key: 'codigo', label: 'Código' },
                                        { key: 'nome', label: 'Nome' },
                                        { key: 'valor', label: 'Valor', tipo: 'valor' },
                                    ]}
                                />
                                <PreviewTabela
                                    titulo="Prévia Relatório Plano"
                                    linhas={planoComBase}
                                    colunas={[
                                        { key: 'tutor', label: 'Tutor' },
                                        { key: 'pet', label: 'Pet' },
                                        { key: 'data', label: 'Data', tipo: 'data' },
                                        { key: 'exame', label: 'Exame' },
                                        { key: 'codigo_base', label: 'Cód. base' },
                                        { key: 'valor_base', label: 'Valor base', tipo: 'valor' },
                                    ]}
                                />
                                <PreviewTabela
                                    titulo="Prévia Relatório Laboratório"
                                    linhas={linhasMellis}
                                />
                            </div>
                            {pendentesVinculo.length ? (
                                <div className="conf_lab_vinculos">
                                    <h3>Vincular exames do plano à lista de Valores de Base</h3>
                                    <p className="conf_lab_muted">
                                        Nome sem correspondência única. Escolha o item desta
                                        conferência. Não escolhemos automaticamente.
                                    </p>
                                    <ul>
                                        {pendentesVinculo.map((p) => (
                                            <li key={p.chave}>
                                                <span className="conf_lab_vinculo_meta">
                                                    <strong>{p.exame}</strong>
                                                    <em>
                                                        {p.valores.length
                                                            ? p.valores
                                                                  .map((v) => formatarValorConferencia(v))
                                                                  .join(' · ')
                                                            : 'sem valor de base'}
                                                    </em>
                                                    <small>
                                                        {p.qtd} incidência{p.qtd === 1 ? '' : 's'}
                                                        {p.tipo === 'ambiguo' ? ' · ambíguo' : ''}
                                                    </small>
                                                </span>
                                                <ComboExame
                                                    itens={itensExameBase}
                                                    value={vinculosBase[p.chave] || ''}
                                                    placeholder="Buscar código ou nome…"
                                                    vazio="Nenhum exame na Valores de Base"
                                                    onChange={(id) => alterarVinculo(p, id)}
                                                />
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ) : linhasHonorarios.length && linhasBase.length ? (
                                <p className="conf_lab_muted">
                                    Todos os exames do plano têm valor de base único.
                                </p>
                            ) : null}
                        </>
                    ) : null}

                    <div className="conf_lab_actions">
                        <button
                            type="button"
                            className="credenciamento_main_action_btn secondary"
                            disabled={processando || !podeEditar}
                            onClick={() => setRegrasAberto(true)}
                        >
                            Equivalências e perfis
                        </button>
                        <button
                            type="button"
                            className="credenciamento_main_action_btn secondary"
                            disabled={
                                processando || !arquivoHonorarios || !arquivoMellis || !arquivoBase
                            }
                            onClick={() => void reparseComMapeamento()}
                        >
                            {processando ? 'Lendo…' : 'Atualizar prévia'}
                        </button>
                        <button
                            type="button"
                            className="credenciamento_main_action_btn"
                            disabled={!podeComparar || processando}
                            onClick={() => void executarComparacao()}
                        >
                            {processando ? 'Comparando…' : 'Executar comparação'}
                        </button>
                    </div>
                </section>
            ) : null}

            {passo === 'resultado' && resumo ? (
                <section className="conf_lab_card">
                    <h2>Resultado da conferência</h2>
                    <div className="conf_lab_dash">
                        <DashCard
                            label="Total valor de base"
                            valor={formatarValorConferencia(resumo.totalHonorarios)}
                        />
                        <DashCard
                            label="Total laboratório"
                            valor={formatarValorConferencia(resumo.totalMellis)}
                        />
                        <DashCard label="Itens conferidos" valor={resumo.itensConferidos} />
                        <DashCard label="Itens OK" valor={resumo.itensOk} destaque="ok" />
                        <DashCard
                            label="Valores divergentes"
                            valor={resumo.valoresDivergentes}
                            destaque="warn"
                        />
                        <DashCard
                            label="Datas divergentes"
                            valor={resumo.datasDivergentes}
                            destaque="warn"
                        />
                        <DashCard label="Órfãos Laboratório" valor={resumo.orfaosMellis} />
                        <DashCard label="Órfãos Plano" valor={resumo.orfaosHonorarios} />
                        {resumo.valoresAceitos ? (
                            <DashCard label="Valores aceitos" valor={resumo.valoresAceitos} />
                        ) : null}
                        <DashCard
                            label="Revisões manuais"
                            valor={resumo.revisoesManuais}
                            destaque="rev"
                        />
                        <DashCard
                            label="Diferença financeira"
                            valor={`${formatarValorConferencia(resumo.diferencaFinanceira)} (${resumo.diferencaFinanceira >= 0 ? 'a mais' : 'a menos'})`}
                            destaque="warn"
                        />
                    </div>
                    <p className="conf_lab_muted">
                        Cobrado a mais: {formatarValorConferencia(resumo.valoresCobradosAMais)} · a
                        menos: {formatarValorConferencia(resumo.valoresCobradosAMenos)}
                    </p>

                    <div className="conf_lab_filtros">
                        {FILTROS_RAPIDOS.map((f) => (
                            <button
                                key={f.id}
                                type="button"
                                className={`conf_lab_chip${filtro === f.id ? ' is-active' : ''}`}
                                onClick={() => setFiltro(f.id)}
                            >
                                {f.label}
                            </button>
                        ))}
                        <input
                            type="search"
                            value={busca}
                            onChange={(e) => setBusca(e.target.value)}
                            placeholder="Busca textual…"
                            className="conf_lab_busca"
                        />
                    </div>

                    {podeEditar && selecionados.size > 0 ? (
                        <div className="conf_lab_massa" role="toolbar" aria-label="Ações em massa">
                            <strong>
                                {selecionados.size} selecionada{selecionados.size === 1 ? '' : 's'}
                            </strong>
                            {ACOES_MASSA.map((a) => (
                                <button
                                    key={a.id}
                                    type="button"
                                    className={`credenciamento_main_action_btn${a.id === 'confirmar' ? '' : ' secondary'}`}
                                    onClick={() => aplicarAcaoEmMassa(a.id)}
                                >
                                    {a.label}
                                </button>
                            ))}
                            <button
                                type="button"
                                className="credenciamento_main_action_btn secondary"
                                onClick={() => setSelecionados(new Set())}
                            >
                                Limpar seleção
                            </button>
                        </div>
                    ) : null}

                    <ResultadoTabela
                        key={`${filtro}|${busca}|${ordem.chave}|${ordem.dir}|${resultados.length}`}
                        linhas={visiveis}
                        selecionados={selecionados}
                        podeEditar={podeEditar}
                        ordem={ordem}
                        onOrdenar={alternarOrdem}
                        onToggle={alternarSelecao}
                        onToggleTodos={alternarTodosVisiveis}
                        onAbrir={setItemAberto}
                        todosMarcados={todosVisiveisMarcados}
                        algunsMarcados={algunsVisiveisMarcados}
                    />

                    <div className="conf_lab_orfaos_grid !grid !grid-cols-1 gap-4 md:!grid-cols-2">
                        <div>
                            <h3>Órfãos Laboratório</h3>
                            <ul>
                                {orfaosMellis.map((r) => (
                                    <li key={r.id}>
                                        <button type="button" onClick={() => setItemAberto(r)}>
                                            {r.tutor_mellislab} · {r.pet_mellislab} ·{' '}
                                            {formatarDataConferencia(r.data_mellislab)} · {r.exame_mellislab}{' '}
                                            · {formatarValorConferencia(r.valor_mellislab)} (linha{' '}
                                            {r.mellis?.linha_original || '—'})
                                        </button>
                                    </li>
                                ))}
                                {!orfaosMellis.length ? (
                                    <li className="conf_lab_muted">Nenhum órfão no laboratório.</li>
                                ) : null}
                            </ul>
                        </div>
                        <div>
                            <h3>Órfãos Plano</h3>
                            <ul>
                                {orfaosHonorarios.map((r) => (
                                    <li key={r.id}>
                                        <button type="button" onClick={() => setItemAberto(r)}>
                                            {r.tutor_honorarios} · {r.pet_honorarios} ·{' '}
                                            {formatarDataConferencia(r.data_honorarios)} · {r.exame_honorarios}{' '}
                                            · {formatarValorConferencia(r.valor_honorarios)} (linha{' '}
                                            {r.honorarios?.linha_original || '—'})
                                        </button>
                                    </li>
                                ))}
                                {!orfaosHonorarios.length ? (
                                    <li className="conf_lab_muted">Nenhum órfão no plano.</li>
                                ) : null}
                            </ul>
                        </div>
                    </div>

                    <div className="conf_lab_actions">
                        <button
                            type="button"
                            className="credenciamento_main_action_btn secondary"
                            onClick={() => setRegrasAberto(true)}
                        >
                            Equivalências e perfis
                        </button>
                        <button
                            type="button"
                            className="credenciamento_main_action_btn"
                            onClick={() =>
                                void exportarConferenciaHonorariosExcel({
                                    resultados,
                                    resumo,
                                    revisoes,
                                    laboratorioNome,
                                    periodoYm,
                                })
                            }
                        >
                            Exportar Excel
                        </button>
                    </div>
                </section>
            ) : null}

            <PainelDetalheConferencia
                item={itemAberto}
                codigoElab={itemAberto ? codigoElabDoItem(itemAberto) : ''}
                onClose={() => setItemAberto(null)}
                onAcao={(acao, extra) => itemAberto && void registrarRevisao(itemAberto, acao, extra)}
                podeEditar={podeEditar}
                orfaosPlano={orfaosHonorarios}
                orfaosLab={orfaosMellis}
                ctxMatching={{ equivalencias, aliasesPessoa }}
            />
            <CadastroRegrasConferencia
                aberto={regrasAberto}
                onClose={() => setRegrasAberto(false)}
                nomeLaboratorio={laboratorioNome}
                equivalencias={equivalencias}
                perfis={perfis}
                examesOpcoes={nomesExameOpcoes}
                onSalvarEquivalencia={(a, b) => void salvarEquivalencia(a, b)}
                onAtualizarEquivalencia={(idx, a, b) => void atualizarEquivalencia(idx, a, b)}
                onRemoverEquivalencia={(idx) => void removerEquivalencia(idx)}
                onSalvarPerfil={(dados) => void salvarPerfil(dados)}
                onRemoverPerfil={(idx) => void removerPerfil(idx)}
            />
        </main>
    )
}

export default ConfigConferenciaLaboratorio
