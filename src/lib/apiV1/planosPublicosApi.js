/**
 * Cliente da API pública da tabela de planos (/v1/planos/*). Um único ponto de acesso para a página.
 * Cache de sessão por URL (a API já responde com cache de 5 min). Erro de rede/HTTP vira Error com `.codigo` e `.status`.
 */
const URL_PADRAO = 'https://api.emerlab.com.br'

function erroDe(status, corpo, causa) {
    const e = new Error(corpo?.erro?.mensagem || (causa ? 'Sem conexão com o servidor.' : 'Não foi possível carregar os dados.'))
    e.status = status
    e.codigo = corpo?.erro?.codigo || (causa ? 'rede' : 'erro_desconhecido')
    return e
}

export function criarClientePlanos({ baseUrl = URL_PADRAO, chave, fetchImpl } = {}) {
    const doFetch = fetchImpl || ((...args) => globalThis.fetch(...args))
    const cache = new Map()
    const raiz = String(baseUrl).replace(/\/+$/, '')

    function pedir(caminho, params = {}) {
        const query = new URLSearchParams()
        for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') query.set(k, String(v))
        const qs = query.toString()
        const url = `${raiz}${caminho}${qs ? `?${qs}` : ''}`
        if (cache.has(url)) return cache.get(url)
        const promessa = (async () => {
            let resp
            try {
                resp = await doFetch(url, { headers: { 'X-Api-Key': chave, Accept: 'application/json' } })
            } catch (e) {
                throw erroDe(0, null, e)
            }
            let corpo = null
            try {
                corpo = await resp.json()
            } catch {
                corpo = null
            }
            if (!resp.ok) throw erroDe(resp.status, corpo)
            return corpo
        })()
        // Falha não fica em cache: "Tentar de novo" precisa repetir a chamada.
        promessa.catch(() => cache.delete(url))
        cache.set(url, promessa)
        return promessa
    }

    return {
        filtros: () => pedir('/v1/planos/filtros'),
        tabela: ({ cidade, plano }) => pedir('/v1/planos/tabela', { cidade, plano }),
        prestadores: ({ cidade, procedimento }) => pedir('/v1/planos/prestadores', { cidade, procedimento }),
    }
}

/** Cliente configurado pelo ambiente; `null` quando faltam as variáveis (a página usa o mock de demonstração). */
export function clientePlanosPadrao() {
    const env = import.meta.env || {}
    const chave = env.VITE_API_PLANOS_KEY
    if (!chave) return null
    return criarClientePlanos({ baseUrl: env.VITE_API_PLANOS_URL || URL_PADRAO, chave })
}
