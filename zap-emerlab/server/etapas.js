// Tempo por etapa de cada pedido, para achar onde uma rota lenta gasta o tempo (WATI, banco, tempo real…).
// Cada pedido roda dentro de um contexto (AsyncLocalStorage); `etapa('nome', trabalho)` mede o trabalho e soma ao
// pedido. Quando o pedido passa de LIMITE_MS, uma linha "[zap-etapas]" vai para o log da Vercel com as etapas mais
// demoradas. Etapas feitas em paralelo (Promise.all) somam mais que o total: cada uma é medida por si.
// Fora de um pedido (testes, scripts) `etapa` só executa o trabalho, sem custo nem erro.
import { AsyncLocalStorage } from 'node:async_hooks'

const armazem = new AsyncLocalStorage()
export const LIMITE_ETAPAS_MS = 1000

/** Linha de log: etapas ordenadas pelo maior tempo total, "nome=ms" ou "nome=ms×n" quando repetiu. */
export function formatarEtapas(etapas, max = 10) {
    return [...etapas.entries()]
        .sort((a, b) => b[1].ms - a[1].ms)
        .slice(0, max)
        .map(([nome, v]) => `${nome}=${Math.round(v.ms)}ms${v.n > 1 ? `×${v.n}` : ''}`)
        .join(' | ')
}

/** Roda `fn` num contexto de medição; ao terminar a resposta (`res`), registra se o pedido foi lento. */
export function medirEtapas(rotulo, res, fn, limiteMs = LIMITE_ETAPAS_MS) {
    const ctx = { t0: performance.now(), etapas: new Map() }
    res.once('finish', () => {
        const total = performance.now() - ctx.t0
        if (total >= limiteMs) console.warn(`[zap-etapas] ${rotulo} ${Math.round(total)}ms :: ${formatarEtapas(ctx.etapas) || '(sem etapas medidas)'}`)
    })
    return armazem.run(ctx, fn)
}

/** Mede `trabalho` (função ou promessa) e devolve o mesmo resultado/erro. */
export function etapa(nome, trabalho) {
    const ctx = armazem.getStore()
    const executar = async () => (typeof trabalho === 'function' ? trabalho() : trabalho)
    if (!ctx) return executar()
    const t0 = performance.now()
    return executar().finally(() => {
        const a = ctx.etapas.get(nome) || { ms: 0, n: 0 }
        a.ms += performance.now() - t0
        a.n += 1
        ctx.etapas.set(nome, a)
    })
}
