/**
 * Sessões da Conferência guardadas no IndexedDB do navegador (30 dias).
 *
 * - `sessoes`: estado completo (pesado).
 * - `meta`: só os metadados de cada sessão (leve) — a listagem nunca lê o estado completo.
 * - Cada sessão pertence a um usuário (`usuarioId`); outro usuário no mesmo navegador não a vê.
 *   Sessões antigas, sem dono, continuam visíveis e passam a ter dono no próximo salvamento.
 * - Salvar = uma única transação (get + put nas duas stores), sem varrer as demais sessões.
 */
const DB_NOME = 'emerdog-conf-lab'
const DB_VERSAO = 2
const STORE = 'sessoes'
const STORE_META = 'meta'
const TTL_MS = 30 * 24 * 60 * 60 * 1000

function abrirDb() {
    return new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined') {
            reject(new Error('IndexedDB indisponível.'))
            return
        }
        const req = indexedDB.open(DB_NOME, DB_VERSAO)
        req.onupgradeneeded = (ev) => {
            const db = req.result
            if (!db.objectStoreNames.contains(STORE)) {
                db.createObjectStore(STORE, { keyPath: 'id' })
            }
            if (!db.objectStoreNames.contains(STORE_META)) {
                const meta = db.createObjectStore(STORE_META, { keyPath: 'id' })
                if (ev.oldVersion >= 1) {
                    // Migra as sessões v1 para a store de metadados.
                    const cursor = req.transaction.objectStore(STORE).openCursor()
                    cursor.onsuccess = () => {
                        const c = cursor.result
                        if (!c) return
                        meta.put(metaDeRegistro(c.value))
                        c.continue()
                    }
                }
            }
        }
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error || new Error('Falha ao abrir sessões.'))
    })
}

function comTransacao(mode, work) {
    return abrirDb().then(
        (db) =>
            new Promise((resolve, reject) => {
                const tx = db.transaction([STORE, STORE_META], mode)
                let resultado
                work(tx.objectStore(STORE), tx.objectStore(STORE_META), (val) => {
                    resultado = val
                })
                tx.oncomplete = () => {
                    db.close()
                    resolve(resultado)
                }
                tx.onerror = () => {
                    db.close()
                    reject(tx.error)
                }
                tx.onabort = () => {
                    db.close()
                    reject(tx.error || new Error('Transação abortada.'))
                }
            }),
    )
}

function semBruto(obj) {
    if (Array.isArray(obj)) return obj.map(semBruto)
    if (obj && typeof obj === 'object') {
        const out = {}
        for (const [k, v] of Object.entries(obj)) {
            if (k === 'bruto') continue
            out[k] = semBruto(v)
        }
        return out
    }
    return obj
}

function novoId() {
    return `s-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function sessaoExpirada(reg, agora = Date.now()) {
    const t = Date.parse(reg?.expiraEm || '')
    if (Number.isFinite(t)) return t <= agora
    const u = Date.parse(reg?.atualizadoEm || reg?.criadoEm || '')
    if (!Number.isFinite(u)) return true
    return agora - u > TTL_MS
}

export function montarEstadoSessao({
    passo,
    laboratorioId,
    laboratorioNome,
    periodoYm,
    nomesArquivos,
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
} = {}) {
    return semBruto({
        versao: 4,
        passo: passo || 'setup',
        laboratorioId: laboratorioId ? Number(laboratorioId) : null,
        laboratorioNome: laboratorioNome || '',
        periodoYm: periodoYm || '',
        nomesArquivos: nomesArquivos || { base: '', plano: '', lab: '' },
        headersHonorarios: headersHonorarios || [],
        headersMellis: headersMellis || [],
        headersBase: headersBase || [],
        mapColsHonorarios: mapColsHonorarios || {},
        mapColsMellis: mapColsMellis || {},
        mapColsBase: mapColsBase || {},
        linhasHonorarios: linhasHonorarios || [],
        linhasMellis: linhasMellis || [],
        linhasBase: linhasBase || [],
        vinculosBase: vinculosBase || {},
        faltHonorarios: faltHonorarios || [],
        faltMellis: faltMellis || [],
        faltBase: faltBase || [],
        resultados: resultados || [],
        resumo: resumo || null,
        revisoes: revisoes || [],
        equivalencias: equivalencias || [],
        aliasesPessoa: aliasesPessoa || [],
        perfis: perfis || [],
    })
}

function metaDeRegistro(reg) {
    const e = reg?.estado || {}
    const resumo = e.resumo || {}
    return {
        id: reg.id,
        usuarioId: reg.usuarioId ?? null,
        criadoEm: reg.criadoEm,
        atualizadoEm: reg.atualizadoEm,
        expiraEm: reg.expiraEm,
        passo: e.passo || 'setup',
        laboratorioId: e.laboratorioId || null,
        laboratorioNome: e.laboratorioNome || '',
        periodoYm: e.periodoYm || '',
        nomesArquivos: e.nomesArquivos || { base: '', plano: '', lab: '' },
        totais: {
            plano: (e.linhasHonorarios || []).length,
            lab: (e.linhasMellis || []).length,
            pares: resumo.itensConferidos ?? (e.resultados || []).length,
            orfaos: (resumo.orfaosMellis || 0) + (resumo.orfaosHonorarios || 0),
        },
    }
}

function visivelPara(meta, usuarioId) {
    return meta.usuarioId == null || String(meta.usuarioId) === String(usuarioId || '')
}

export async function expurgarSessoesExpiradas() {
    const agora = Date.now()
    return comTransacao('readwrite', (store, meta, done) => {
        const req = meta.getAll()
        req.onsuccess = () => {
            for (const m of req.result || []) {
                if (sessaoExpirada(m, agora)) {
                    store.delete(m.id)
                    meta.delete(m.id)
                }
            }
            done()
        }
    })
}

export async function listarSessoesConferencia(usuarioId) {
    await expurgarSessoesExpiradas()
    return comTransacao('readonly', (_store, meta, done) => {
        const req = meta.getAll()
        req.onsuccess = () => {
            done(
                (req.result || [])
                    .filter((m) => !sessaoExpirada(m) && visivelPara(m, usuarioId))
                    .sort((a, b) => String(b.atualizadoEm || '').localeCompare(a.atualizadoEm || '')),
            )
        }
    })
}

export async function carregarSessaoLocal(usuarioId, id) {
    if (!id) return null
    return comTransacao('readonly', (store, meta, done) => {
        const req = store.get(id)
        req.onsuccess = () => {
            const reg = req.result
            done(
                !reg || sessaoExpirada(reg) || !visivelPara({ usuarioId: reg.usuarioId }, usuarioId)
                    ? null
                    : reg,
            )
        }
    })
}

/** Uma transação só: lê o criadoEm existente e grava sessão + metadados. */
export async function salvarSessaoLocal(usuarioId, id, estado) {
    const agora = new Date()
    const atualizadoEm = agora.toISOString()
    const expiraEm = new Date(agora.getTime() + TTL_MS).toISOString()
    const estadoLimpo = montarEstadoSessao(estado)
    return comTransacao('readwrite', (store, meta, done) => {
        const gravar = (existente, novoSempre = false) => {
            const sid = existente?.id || (!novoSempre && id) || novoId()
            const registro = {
                id: sid,
                usuarioId: usuarioId || existente?.usuarioId || null,
                criadoEm: existente?.criadoEm || atualizadoEm,
                atualizadoEm,
                expiraEm,
                estado: estadoLimpo,
            }
            store.put(registro)
            const m = metaDeRegistro(registro)
            meta.put(m)
            done(m)
        }
        if (!id) {
            gravar(null)
            return
        }
        const req = store.get(id)
        req.onsuccess = () => {
            const ex = req.result
            const meu = ex && visivelPara({ usuarioId: ex.usuarioId }, usuarioId)
            gravar(meu ? ex : null, Boolean(ex && !meu))
        }
    })
}

export async function excluirSessaoLocal(usuarioId, id) {
    if (!id) return
    await comTransacao('readwrite', (store, meta, done) => {
        const req = meta.get(id)
        req.onsuccess = () => {
            if (!req.result || visivelPara(req.result, usuarioId)) {
                store.delete(id)
                meta.delete(id)
            }
            done()
        }
    })
}

export function sessaoTemConteudo(estado) {
    return Boolean(
        (estado?.linhasHonorarios || []).length ||
            (estado?.linhasMellis || []).length ||
            (estado?.linhasBase || []).length ||
            (estado?.resultados || []).length,
    )
}

export function formatarQuandoSessao(iso) {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return '—'
    return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}
