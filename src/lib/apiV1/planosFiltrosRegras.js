/**
 * Regras puras da API pública da tabela de planos: filtros (cidades com planos) e prestadores por procedimento.
 * Sem I/O. Reaproveita `montarCredenciados`/`atendeMunicipios` de redeRegras.js (regra de cidade não é reimplementada).
 * Não importar nada que importe src/lib/supabase.js.
 */
import { mapearPlanos, obterChavePlanoPorId, ORDEM_PLANOS } from '../planosHierarquia.js'
import { atendeMunicipios, montarMunicipiosPorCidade } from './redeRegras.js'
import { TERMOS_POPULARES } from './planosSinonimos.js'

const LIMITE_PRESTADORES = 100

const compararNome = (a, b) => String(a).localeCompare(String(b), 'pt-BR', { sensitivity: 'base' })
const normCodigo = (c) => String(c || '').trim().toUpperCase()

/** Cidade da tabela de valores + municípios vinculados a ela. */
export function municipiosDaCidadeTabela(base, cidadeId) {
    return montarMunicipiosPorCidade(base).get(Number(cidadeId)) || []
}

/** Cidades que têm ao menos um plano da hierarquia em `planosCidade` (sem "apenas loja"), mais os termos populares. */
export function montarFiltrosPublicos(base) {
    const mapa = mapearPlanos(base.planos || [])
    const planosDaCidade = new Map()
    for (const r of base.planosCidade || []) {
        if (r.cidade_id === null || r.cidade_id === undefined) continue
        const cid = Number(r.cidade_id)
        if (!planosDaCidade.has(cid)) planosDaCidade.set(cid, new Set())
        planosDaCidade.get(cid).add(Number(r.plano_id))
    }
    const cidades = []
    for (const c of base.cidades || []) {
        const ids = planosDaCidade.get(Number(c.id))
        if (!ids) continue
        const planos = ORDEM_PLANOS.filter((chave) => mapa[chave] && ids.has(mapa[chave].id) && obterChavePlanoPorId(mapa[chave].id, mapa) === chave).map(
            (chave) => ({ id: mapa[chave].id, chave, nome: mapa[chave].nome }),
        )
        if (!planos.length) continue
        cidades.push({ id: Number(c.id), nome: String(c.nome ?? '').trim(), uf: String(c.uf ?? '').trim().toUpperCase(), planos })
    }
    cidades.sort((a, b) => compararNome(a.nome, b.nome) || a.id - b.id)
    return { cidades, termos_populares: [...TERMOS_POPULARES] }
}

/** código do procedimento → ids dos credenciados que o realizam e atendem os municípios (ordem da lista recebida). */
export function realizadoresPorCodigo(credenciados, municipios) {
    const mapa = new Map()
    for (const c of credenciados || []) {
        if (!atendeMunicipios(c, municipios)) continue
        for (const p of c.procedimentos) {
            if (!mapa.has(p.codigo)) mapa.set(p.codigo, [])
            mapa.get(p.codigo).push(c.id)
        }
    }
    return mapa
}

/** Prestadores de um procedimento na região, só com os campos permitidos (lista fechada), no máximo 100. */
export function prestadoresDoProcedimento(credenciados, municipios, codigo) {
    const alvo = normCodigo(codigo)
    const elegiveis = []
    for (const c of credenciados || []) {
        if (!atendeMunicipios(c, municipios)) continue
        const proc = c.procedimentos.find((p) => p.codigo === alvo)
        if (proc) elegiveis.push({ c, proc })
    }
    elegiveis.sort((a, b) => compararNome(a.c.nome, b.c.nome) || a.c.id - b.c.id)
    const prestadores = elegiveis.slice(0, LIMITE_PRESTADORES).map(({ c, proc }) => ({
        id: c.id,
        nome: c.nome,
        especialidade_principal: c.especialidadePrincipal,
        cidade_principal: c.cidadePrincipal ? { nome: c.cidadePrincipal.nome, uf: c.cidadePrincipal.uf } : null,
        contatos: { telefone: c.contatos.telefone, celular: c.contatos.celular, whatsapp_url: c.contatos.whatsapp_url },
        endereco: c.temLocal ? { texto: c.endereco.texto } : null,
        nome_alternativo: proc.nome_alternativo,
    }))
    return { total: elegiveis.length, prestadores }
}
