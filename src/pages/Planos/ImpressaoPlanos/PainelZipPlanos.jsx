import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { listarModosDaCidade } from '../../../lib/impressaoPlanos/modoImpressaoPlanos.js'
import {
    buscarUltimaGeracaoZip,
    registrarGeracaoZip,
} from '../../../lib/impressaoPlanos/geracoesZipPlanos.js'
import { calcularStatusZipPlanos } from '../../../lib/impressaoPlanos/statusZipPlanos.js'
import { decidirBloqueioZip } from '../../../lib/impressaoPlanos/disponibilidadePlanos.js'
import { gerarZipPlanosCidade } from '../../../lib/impressaoPlanos/gerarZipPlanosCidade.js'

function formatarDataHora(iso) {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return String(iso || '')
    return d.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    })
}

function baixarBlob(blob, nomeArquivo) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = nomeArquivo
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function PainelZipPlanos({
    cidadeTabelaId,
    municipioNome,
    cidadeNome,
    incluirCidadesParalelas,
    planosLista,
    planosDisponiveis,
    planosComFalha = [],
    disponibilidadeCarregando = false,
    onRevisar,
    versaoModos = 0,
    ocupado = false,
    onGerandoChange,
}) {
    const [modos, setModos] = useState([])
    const [ultimaGeracao, setUltimaGeracao] = useState(null)
    const [historicoIndisponivel, setHistoricoIndisponivel] = useState(false)
    const [carregando, setCarregando] = useState(false)
    const [erroCarga, setErroCarga] = useState('')
    const [gerando, setGerando] = useState(false)
    const [progresso, setProgresso] = useState('')
    const [erro, setErro] = useState('')
    const [aviso, setAviso] = useState('')
    const gerandoRef = useRef(false)
    const cidadeAtualRef = useRef(cidadeTabelaId)

    useEffect(() => {
        cidadeAtualRef.current = cidadeTabelaId
    }, [cidadeTabelaId])

    useEffect(() => {
        onGerandoChange?.(gerando)
    }, [gerando, onGerandoChange])

    const recarregarUltimaGeracao = useCallback(async () => {
        const cidadeDaChamada = cidadeTabelaId
        try {
            const ult = await buscarUltimaGeracaoZip(cidadeDaChamada)
            if (cidadeAtualRef.current !== cidadeDaChamada) return
            setUltimaGeracao(ult)
            setHistoricoIndisponivel(false)
        } catch {
            if (cidadeAtualRef.current !== cidadeDaChamada) return
            setUltimaGeracao(null)
            setHistoricoIndisponivel(true)
        }
    }, [cidadeTabelaId])

    useEffect(() => {
        let cancelado = false
        setErro('')
        setAviso('')
        setProgresso('')
        setErroCarga('')
        if (!cidadeTabelaId) {
            setModos([])
            setUltimaGeracao(null)
            return undefined
        }
        setCarregando(true)
        const run = async () => {
            const [rModos, rGer] = await Promise.allSettled([
                listarModosDaCidade(cidadeTabelaId),
                buscarUltimaGeracaoZip(cidadeTabelaId),
            ])
            if (cancelado) return
            if (rModos.status === 'fulfilled') {
                setModos(rModos.value || [])
            } else {
                setModos([])
                setErroCarga(rModos.reason?.message || 'Não deu para carregar os presets da cidade.')
            }
            if (rGer.status === 'fulfilled') {
                setUltimaGeracao(rGer.value)
                setHistoricoIndisponivel(false)
            } else {
                setUltimaGeracao(null)
                setHistoricoIndisponivel(true)
            }
            setCarregando(false)
        }
        void run()
        return () => {
            cancelado = true
        }
    }, [cidadeTabelaId, versaoModos])

    const status = useMemo(
        () => calcularStatusZipPlanos({ planosDisponiveis, modos, ultimaGeracao }),
        [planosDisponiveis, modos, ultimaGeracao],
    )

    const decisao = decidirBloqueioZip({
        status,
        carregando,
        erroCarga,
        disponibilidadeCarregando,
        planosComFalha,
    })
    const bloqueado = decisao.bloqueado

    const baixarTodos = async () => {
        if (gerandoRef.current || bloqueado) return
        gerandoRef.current = true
        setGerando(true)
        setErro('')
        setAviso('')
        setProgresso('Preparando…')
        const cidadeDaGeracao = cidadeTabelaId
        try {
            const { blob, nomeZip, planoIds } = await gerarZipPlanosCidade({
                cidadeTabelaId,
                municipioNome,
                incluirCidadesParalelas,
                planosLista,
                planosDisponiveis,
                modos,
                onProgresso: (atual, total, planoNome) =>
                    cidadeAtualRef.current === cidadeDaGeracao &&
                    setProgresso(`${atual} de ${total} concluídos — último: ${planoNome}`),
            })
            baixarBlob(blob, nomeZip)
            setProgresso('')
            try {
                await registrarGeracaoZip(cidadeDaGeracao, planoIds)
                await recarregarUltimaGeracao()
            } catch {
                if (cidadeAtualRef.current !== cidadeDaGeracao) return
                setAviso('Zip baixado, mas o histórico não foi gravado.')
            }
        } catch (e) {
            if (cidadeAtualRef.current !== cidadeDaGeracao) return
            setProgresso('')
            setErro(e?.message || 'Falha ao gerar o zip.')
        } finally {
            gerandoRef.current = false
            setGerando(false)
        }
    }

    return (
        <section
            className="planos_impressao_zip"
            aria-label={`Download rápido de planos — ${cidadeNome || ''}`}
        >
            <h2 className="planos_impressao_zip_titulo">Download rápido (todos os planos)</h2>

            {carregando ? <p className="planos_impressao_zip_info">Carregando presets…</p> : null}
            {erroCarga ? (
                <p className="planos_impressao_erro planos_impressao_zip_msg">{erroCarga}</p>
            ) : null}

            {status.linhas.length > 0 ? (
                <ul className="planos_impressao_zip_lista">
                    {status.linhas.map((l) => (
                        <li key={l.planoId} className="planos_impressao_zip_linha">
                            <span className="planos_impressao_zip_plano">{l.planoNome}</span>
                            <span
                                className={`planos_impressao_zip_preset${
                                    l.semPreset ? ' is-sem-preset' : ''
                                }`}
                            >
                                {l.semPreset
                                    ? 'Sem preset — revisar'
                                    : `Preset atualizado em ${formatarDataHora(l.modo.atualizadoEm)}${
                                          l.modo.atualizadoPorNome ? ` por ${l.modo.atualizadoPorNome}` : ''
                                      }`}
                            </span>
                            {l.maisNovoQueZip ? (
                                <span className="planos_impressao_zip_selo">preset novo depois do zip</span>
                            ) : null}
                            {l.semPreset ? (
                                <button
                                    type="button"
                                    className="ek-btn planos_impressao_zip_revisar"
                                    disabled={gerando || ocupado}
                                    onClick={() => onRevisar?.(l.planoId)}
                                >
                                    Revisar
                                </button>
                            ) : null}
                        </li>
                    ))}
                </ul>
            ) : null}

            <div className="planos_impressao_zip_rodape">
                <span className="planos_impressao_zip_ultimo">
                    {historicoIndisponivel
                        ? 'Histórico indisponível'
                        : ultimaGeracao
                          ? `Último zip: ${formatarDataHora(ultimaGeracao.geradoEm)}${
                                ultimaGeracao.geradoPorNome ? ` por ${ultimaGeracao.geradoPorNome}` : ''
                            }`
                          : 'Último zip: nunca gerado'}
                </span>
                <div className="planos_impressao_zip_acao">
                    <button
                        type="button"
                        className="ek-btn"
                        disabled={bloqueado || gerando}
                        onClick={() => void baixarTodos()}
                    >
                        {gerando ? 'Gerando zip…' : 'Baixar todos (.zip)'}
                    </button>
                    {decisao.mensagem ? (
                        <span className="planos_impressao_zip_motivo">{decisao.mensagem}</span>
                    ) : null}
                </div>
            </div>

            {progresso ? (
                <p className="planos_impressao_zip_info" role="status">
                    {progresso}
                </p>
            ) : null}
            {erro ? <p className="planos_impressao_erro planos_impressao_zip_msg">{erro}</p> : null}
            {aviso ? (
                <p className="planos_impressao_aviso_modo planos_impressao_zip_msg">{aviso}</p>
            ) : null}
        </section>
    )
}
