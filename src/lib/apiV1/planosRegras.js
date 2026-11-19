// Regras da tabela de planos pública (/v1/planos/tabela).
// Módulo puro: recebe as linhas já carregadas e devolve o payload público.
// Não importa nada que dependa de src/lib/supabase.js (cliente do navegador).
import {
    mapearPlanos,
    obterChavePlanoPorId,
    ORDEM_PLANOS,
    procedimentoPertenceAoPlanoSelecionado,
    procedimentoPlanoBaseApenasLoja,
} from '../planosHierarquia.js'
import {
    montarMapaLimiteGrupoPorCategoria,
    montarPlanosChaveDisponiveisPorCategoria,
    resolverLimiteGrupoExibicao,
} from '../categoriaLimitesGrupo.js'
import { formatarTextoCampoPlano } from '../impressaoPlanos/formatarCamposPlano.js'
import { resolverLimiteExibicao } from '../impressaoPlanos/limiteExibicaoPlanos.js'
import { montarTermosProcedimento } from './planosSinonimos.js'

/** Mesma regra padrão do PDF (`MIN_REALIZADORES_PRE_MARCAR` em mapaRealizadoresRegiao.js). */
const MIN_REALIZADORES_PRE_MARCAR = 3

const normCodigo = (c) => String(c ?? '').trim().toUpperCase()

const textoOuNulo = (valor) => {
    const t = formatarTextoCampoPlano(valor)
    return t === '—' ? null : t
}

/** Códigos (maiúsculos) marcados em `selecao` (`{ 'COD|base': true, ... }`); `null` se não houver seleção. */
export function codigosMarcados(selecao) {
    if (!selecao || typeof selecao !== 'object' || Array.isArray(selecao)) return null
    const chaves = Object.keys(selecao)
    if (!chaves.length) return null
    const codigos = new Set()
    for (const chave of chaves) {
        if (selecao[chave] !== true) continue
        const cod = normCodigo(String(chave).split('|')[0])
        if (cod) codigos.add(cod)
    }
    return codigos
}

/** Códigos (maiúsculos) com alguma chave `COD|…` em `selecao`, marcada ou não; `null` se não houver seleção. */
export function codigosPresentes(selecao) {
    if (!selecao || typeof selecao !== 'object' || Array.isArray(selecao)) return null
    const chaves = Object.keys(selecao)
    if (!chaves.length) return null
    const codigos = new Set()
    for (const chave of chaves) {
        const cod = normCodigo(String(chave).split('|')[0])
        if (cod) codigos.add(cod)
    }
    return codigos
}

// Aceita a linha de `impressao_planos_modos` (`{ selecao, ... }`) ou a própria seleção.
const selecaoDoModo = (modo) => {
    if (!modo || typeof modo !== 'object') return null
    if (Object.prototype.hasOwnProperty.call(modo, 'selecao')) return modo.selecao
    return modo
}

/**
 * Preset `site` → modo `impressao` → regra padrão. Seleção vazia conta como inexistente.
 * Só um modo vale por vez: com `site`, códigos ausentes dele seguem a regra padrão
 * (não caem no `impressao`). `codigos` = marcados; `presentes` = com chave na seleção.
 */
export function escolherSelecao({ modoSite, modoImpressao } = {}) {
    const selSite = selecaoDoModo(modoSite)
    const site = codigosMarcados(selSite)
    if (site) return { origem: 'site', codigos: site, presentes: codigosPresentes(selSite) }
    const selImpressao = selecaoDoModo(modoImpressao)
    const impressao = codigosMarcados(selImpressao)
    if (impressao) return { origem: 'impressao', codigos: impressao, presentes: codigosPresentes(selImpressao) }
    return { origem: 'padrao', codigos: null, presentes: null }
}

const ordenarObservacoes = (a, b) =>
    (Number(a.ordem) || 0) - (Number(b.ordem) || 0) || Number(a.id) - Number(b.id)

export function montarTabelaPublica(entrada) {
    const {
        cidade,
        planos = [],
        categorias = [],
        procedimentos = [],
        diferencaPorCodigo = new Map(),
        configPorCodigo = new Map(),
        limitesGrupo = [],
        realizadoresPorCodigo = new Map(),
        nomesAlternativosPorCodigo = new Map(),
        modoSite = null,
        modoImpressao = null,
        observacoes = [],
    } = entrada
    const planoId = Number(entrada.planoId)

    const mapaPlanos = mapearPlanos(planos)
    const chavePlano = obterChavePlanoPorId(planoId, mapaPlanos)
    const planoNome = planos.find((p) => Number(p.id) === planoId)?.nome || chavePlano || 'Plano'

    // Elegibilidade como no PDF: código com diferença na cidade e plano base dentro da hierarquia
    // (os "apenas loja" entram aqui só para o cálculo do limite de grupo e são descartados abaixo).
    const elegiveis = procedimentos.filter((p) => {
        if (!diferencaPorCodigo.has(normCodigo(p.codigo))) return false
        if (procedimentoPlanoBaseApenasLoja(p.plano_base_id, mapaPlanos)) return true
        return procedimentoPertenceAoPlanoSelecionado(p.plano_base_id, planoId, mapaPlanos)
    })

    const limitesGrupoPorCategoriaId = montarMapaLimiteGrupoPorCategoria(limitesGrupo, planoId)
    const contextoLimiteGrupoPlano = {
        planosChaveDisponiveisPorCategoria: montarPlanosChaveDisponiveisPorCategoria(
            elegiveis.map((p) => ({ categoriaId: p.categoria_id, planoBaseId: p.plano_base_id })),
            mapaPlanos,
            ORDEM_PLANOS,
            (planoBaseId) => obterChavePlanoPorId(planoBaseId, mapaPlanos),
        ),
        chavePlano,
        mapaPlanosPorChave: mapaPlanos,
    }

    const { origem, codigos, presentes } = escolherSelecao({ modoSite, modoImpressao })

    // Observações publicáveis: ativas e com mensagem.
    const observacoesValidas = (observacoes || [])
        .filter((o) => o && o.ativa !== false && String(o.mensagem ?? '').trim())
        .sort(ordenarObservacoes)
    const vinculadasPorCodigo = new Map()
    for (const o of observacoesValidas) {
        if (o.geral) continue
        for (const c of o.codigosProcedimentos || []) {
            const cod = normCodigo(c)
            if (!cod) continue
            if (!vinculadasPorCodigo.has(cod)) vinculadasPorCodigo.set(cod, [])
            const lista = vinculadasPorCodigo.get(cod)
            if (!lista.includes(Number(o.id))) lista.push(Number(o.id))
        }
    }

    const usadas = new Set()
    const procsPorCategoria = new Map()

    for (const proc of elegiveis) {
        const cod = normCodigo(proc.codigo)
        if (procedimentoPlanoBaseApenasLoja(proc.plano_base_id, mapaPlanos)) continue

        const realizadores = new Set(realizadoresPorCodigo.get(cod) || []).size
        if (realizadores <= 0) continue
        // Como `aplicarSelecaoModo` no PDF: código gravado usa o valor salvo; código novo, a regra padrão.
        const selecionado = presentes?.has(cod) ? codigos.has(cod) : realizadores >= MIN_REALIZADORES_PRE_MARCAR
        if (!selecionado) continue

        const catId = Number(proc.categoria_id) || 0
        const cfg = configPorCodigo.get(cod) || { limite: '', carencia: '' }
        const limiteTexto = resolverLimiteExibicao(
            { categoriaId: catId, procedimentoId: Number(proc.id), limite: cfg.limite },
            categorias,
            limitesGrupoPorCategoriaId,
            contextoLimiteGrupoPlano,
        )
        const idsObs = vinculadasPorCodigo.get(cod) || []
        idsObs.forEach((id) => usadas.add(id))

        if (!procsPorCategoria.has(catId)) procsPorCategoria.set(catId, [])
        procsPorCategoria.get(catId).push({
            codigo: cod,
            nome: String(proc.nome ?? '').trim(),
            carencia: textoOuNulo(cfg.carencia),
            limite: limiteTexto === '—' ? null : limiteTexto,
            diferenca: Number(diferencaPorCodigo.get(cod) || 0),
            realizadores,
            termos: montarTermosProcedimento({
                nome: proc.nome,
                codigo: cod,
                nomesAlternativos: nomesAlternativosPorCodigo.get(cod) || [],
            }),
            observacoes: [...idsObs],
        })
    }

    const grupos = categorias
        .filter((cat) => procsPorCategoria.has(Number(cat.id)))
        .map((cat) => {
            const catId = Number(cat.id)
            const lista = procsPorCategoria
                .get(catId)
                .sort((a, b) => a.codigo.localeCompare(b.codigo, 'pt-BR', { sensitivity: 'base' }))
            return {
                id: catId,
                nome: cat.nome,
                limite_grupo: resolverLimiteGrupoExibicao(
                    categorias,
                    limitesGrupoPorCategoriaId,
                    catId,
                    contextoLimiteGrupoPlano,
                ),
                procedimentos: lista,
            }
        })

    const observacoes_gerais = []
    const dicionario = {}
    for (const o of observacoesValidas) {
        const id = Number(o.id)
        if (o.geral) observacoes_gerais.push(id)
        else if (!usadas.has(id)) continue
        dicionario[String(id)] = {
            id,
            titulo: String(o.titulo ?? '').trim(),
            mensagem: String(o.mensagem).trim(),
            geral: Boolean(o.geral),
        }
    }

    return {
        cidade: cidade ? { id: Number(cidade.id), nome: cidade.nome, uf: cidade.uf } : null,
        plano: { id: planoId, chave: chavePlano, nome: planoNome },
        origem_selecao: origem,
        grupos,
        observacoes: dicionario,
        observacoes_gerais,
    }
}
