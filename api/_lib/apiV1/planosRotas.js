/**
 * Rotas da tabela de planos pública (escopo planos:ler). Handlers finos: as regras estão em
 * src/lib/apiV1/planosRegras.js e planosFiltrosRegras.js.
 */
import { ErroValidacao, montarCredenciados, resolverPlanoId } from '../../../src/lib/apiV1/redeRegras.js'
import {
    montarFiltrosPublicos,
    municipiosDaCidadeTabela,
    prestadoresDoProcedimento,
    realizadoresPorCodigo,
} from '../../../src/lib/apiV1/planosFiltrosRegras.js'
import { montarTabelaPublica } from '../../../src/lib/apiV1/planosRegras.js'
import { carregarBaseRede } from './redeDados.js'
import { carregarBasePlanos } from './planosDados.js'
import { ErroApi, registrarRota } from './roteador.js'

const ESCOPO = 'planos:ler'
const CACHE_CONTROL = 'public, s-maxage=300, stale-while-revalidate=3600'

const textoQuery = (v) => (Array.isArray(v) ? v[0] : v)
const normCodigo = (c) => String(c ?? '').trim().toUpperCase()

function lerCidade(query) {
    const bruto = String(textoQuery(query?.cidade) ?? '').trim()
    if (!/^\d+$/.test(bruto)) throw new ErroApi(400, 'cidade_invalida', 'Informe o id numérico da cidade (veja /planos/filtros).')
    return Number(bruto)
}

function lerPlano(planos, query) {
    try {
        return resolverPlanoId(planos, textoQuery(query?.plano))
    } catch (e) {
        if (e instanceof ErroValidacao) throw new ErroApi(400, e.codigo, e.message)
        throw e
    }
}

registrarRota('GET', '/planos/filtros', ESCOPO, async ({ admin }) => {
    const base = await carregarBaseRede(admin)
    return { corpo: montarFiltrosPublicos(base), headers: { 'Cache-Control': CACHE_CONTROL } }
})

registrarRota('GET', '/planos/tabela', ESCOPO, async ({ admin, query }) => {
    const cidadeId = lerCidade(query)
    const [base, dados] = await Promise.all([carregarBaseRede(admin), carregarBasePlanos(admin)])
    const planoId = lerPlano(base.planos, query)

    const cidade = (base.cidades || []).find((c) => Number(c.id) === cidadeId)
    const linhasPlano = (dados.planosCidade || []).filter(
        (r) => Number(r.cidade_id) === cidadeId && Number(r.plano_id) === planoId,
    )
    if (!cidade || !linhasPlano.length) {
        throw new ErroApi(404, 'plano_indisponivel_na_cidade', 'Este plano não está disponível nesta cidade.')
    }

    const diferencaPorCodigo = new Map()
    for (const r of linhasPlano) {
        const cod = normCodigo(r.procedimento_cod)
        if (cod) diferencaPorCodigo.set(cod, Number(r.diferenca || 0))
    }
    const configPorCodigo = new Map()
    for (const r of dados.planosConfig || []) {
        if (Number(r.plano_id) !== planoId) continue
        const cod = normCodigo(r.procedimento)
        if (cod) {
            configPorCodigo.set(cod, {
                limite: r.limite != null ? String(r.limite) : '',
                carencia: r.carencia != null ? String(r.carencia) : '',
            })
        }
    }

    const municipios = municipiosDaCidadeTabela(base, cidadeId)
    const credenciados = montarCredenciados(base)
    const realizadores = realizadoresPorCodigo(credenciados, municipios)

    // Nomes alternativos usados pelos prestadores da região (viram termos de busca).
    const nomesAlternativosPorCodigo = new Map()
    for (const c of credenciados) {
        for (const p of c.procedimentos) {
            if (!p.nome_alternativo || !realizadores.get(p.codigo)?.includes(c.id)) continue
            if (!nomesAlternativosPorCodigo.has(p.codigo)) nomesAlternativosPorCodigo.set(p.codigo, [])
            nomesAlternativosPorCodigo.get(p.codigo).push(p.nome_alternativo)
        }
    }

    const modo = (finalidade) =>
        (dados.modos || []).find(
            (m) =>
                Number(m.plano_id) === planoId &&
                Number(m.cidade_id) === cidadeId &&
                (m.finalidade || 'impressao') === finalidade,
        ) || null

    const corpo = montarTabelaPublica({
        cidade,
        planoId,
        planos: base.planos,
        categorias: dados.categorias,
        procedimentos: base.procedimentos,
        diferencaPorCodigo,
        configPorCodigo,
        limitesGrupo: dados.limitesGrupo,
        realizadoresPorCodigo: realizadores,
        nomesAlternativosPorCodigo,
        modoSite: modo('site'),
        modoImpressao: modo('impressao'),
        observacoes: dados.observacoes,
    })
    return { corpo, headers: { 'Cache-Control': CACHE_CONTROL } }
})

registrarRota('GET', '/planos/prestadores', ESCOPO, async ({ admin, query }) => {
    const cidadeId = lerCidade(query)
    const codigo = normCodigo(textoQuery(query?.procedimento))
    if (!codigo || codigo.length > 40) throw new ErroApi(400, 'procedimento_invalido', 'Informe o código do procedimento.')
    const base = await carregarBaseRede(admin)
    if (!(base.procedimentos || []).some((p) => normCodigo(p.codigo) === codigo)) {
        throw new ErroApi(404, 'procedimento_nao_encontrado', 'Procedimento não encontrado.')
    }
    const municipios = municipiosDaCidadeTabela(base, cidadeId)
    const corpo = prestadoresDoProcedimento(montarCredenciados(base), municipios, codigo)
    return { corpo, headers: { 'Cache-Control': CACHE_CONTROL } }
})
