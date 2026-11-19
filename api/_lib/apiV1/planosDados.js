/**
 * Leitura em lote dos dados da tabela de planos pública (somente SELECT) e cache de 5 minutos por instância.
 * Complementa `carregarBaseRede` (prestadores, cidades, planos, procedimentos) com valores, limites,
 * modos de seleção e observações. Mesma política de `redeDados.js`: junta chamadas em voo, não guarda
 * falha e serve a última base boa. Colunas listadas uma a uma.
 */
const PAGINA = 1000
const VALIDADE_MS = 5 * 60 * 1000
const GRACA_MS = 30 * 1000

let guardado = null
let emVoo = null

async function todas(montar) {
    const linhas = []
    for (let inicio = 0; ; inicio += PAGINA) {
        const { data, error } = await montar().range(inicio, inicio + PAGINA - 1)
        if (error) throw error
        const lote = data || []
        linhas.push(...lote)
        if (lote.length < PAGINA) return linhas
    }
}

const msgDe = (e) => String(e?.message || e?.details || '').toLowerCase()
const colunaAusente = (e, coluna) => msgDe(e).includes(coluna) || String(e?.code) === '42703'
const tabelaAusente = (e) =>
    String(e?.code) === '42P01' ||
    String(e?.code) === 'PGRST205' ||
    msgDe(e).includes('does not exist') ||
    msgDe(e).includes('schema cache')

/** Tabela opcional (ainda não criada em algum ambiente): vazia em vez de derrubar a API. */
async function opcional(fn) {
    try {
        return await fn()
    } catch (e) {
        if (tabelaAusente(e)) return []
        throw e
    }
}

async function lerModos(admin) {
    const montar = (colunas) => () => admin.from('impressao_planos_modos').select(colunas).order('plano_id').order('cidade_id')
    try {
        return await todas(montar('plano_id, cidade_id, finalidade, selecao'))
    } catch (e) {
        if (!colunaAusente(e, 'finalidade')) throw e
        // Antes da migração: toda linha é do modo `impressao`.
        const linhas = await todas(montar('plano_id, cidade_id, selecao'))
        return linhas.map((l) => ({ ...l, finalidade: 'impressao' }))
    }
}

async function lerObservacoes(admin) {
    const montar = (colunas) => () => admin.from('planos_observacoes').select(colunas).order('ordem').order('id')
    const filhos = 'planos_observacoes_procedimentos(procedimento_codigo)'
    const tentativas = [
        `id, titulo, mensagem, ativa, geral, ordem, ${filhos}`,
        `id, titulo, mensagem, ativa, ordem, ${filhos}`,
        `id, mensagem, ativa, ordem, ${filhos}`,
    ]
    let linhas = null
    let ultimo = null
    for (const sql of tentativas) {
        try {
            linhas = await todas(montar(sql))
            break
        } catch (e) {
            ultimo = e
            if (!colunaAusente(e, 'geral') && !colunaAusente(e, 'titulo')) throw e
        }
    }
    if (!linhas) throw ultimo
    return linhas.map((r) => ({
        id: Number(r.id),
        titulo: r.titulo ?? '',
        mensagem: r.mensagem ?? '',
        ativa: r.ativa !== false,
        geral: r.geral === true,
        ordem: Number(r.ordem) || 0,
        codigosProcedimentos: (r.planos_observacoes_procedimentos || []).map((p) => p.procedimento_codigo).filter(Boolean),
    }))
}

async function lerBasePlanos(admin) {
    const t = (tabela, colunas, ordem) => () => {
        let q = admin.from(tabela).select(colunas)
        for (const o of ordem) q = q.order(o)
        return q
    }
    const [planosCidade, planosConfig, limitesGrupo, categorias, modos, observacoes] = await Promise.all([
        todas(t('planos_cidade', 'plano_id, cidade_id, procedimento_cod, diferenca', ['id'])),
        todas(t('planos_config', 'plano_id, procedimento, limite, carencia', ['id'])),
        opcional(() => todas(t('categoria_limites_grupo', 'id, categoria_id, plano_id, limite', ['id']))),
        todas(t('categorias', 'id, nome, usa_limite_grupo', ['id'])),
        opcional(() => lerModos(admin)),
        opcional(() => lerObservacoes(admin)),
    ])
    return { planosCidade, planosConfig, limitesGrupo, categorias, modos, observacoes }
}

/** Base da tabela de planos em cache por 5 minutos (uma leitura em voo por vez; erro não é guardado). */
export function carregarBasePlanos(admin) {
    if (guardado && guardado.expira > Date.now()) return Promise.resolve(guardado.valor)
    if (emVoo) return emVoo
    const promessa = (async () => {
        try {
            const valor = await lerBasePlanos(admin)
            guardado = { valor, expira: Date.now() + VALIDADE_MS }
            return valor
        } catch (e) {
            if (guardado) {
                console.error('[api-v1] recarga da base de planos falhou; servindo a última base:', e?.message || 'desconhecido')
                guardado = { valor: guardado.valor, expira: Date.now() + GRACA_MS }
                return guardado.valor
            }
            throw e
        } finally {
            emVoo = null
        }
    })()
    emVoo = promessa
    return promessa
}

/** Zera o cache (testes). */
export function limparCachePlanos() {
    guardado = null
    emVoo = null
}
