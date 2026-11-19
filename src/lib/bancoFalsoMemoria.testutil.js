/**
 * Banco falso em memória para testes de src/lib (sem rede). Suporta select/eq/in/limit/insert/update/delete.
 * `falhar(nomeTabela, modo, predicado)` faz a operação devolver erro quando predicado(payload) for verdadeiro.
 */
export const criarBancoFalso = () => {
    const db = { tabelas: {}, seq: 100, chamadas: [], falhas: [] }
    const tab = (n) => (db.tabelas[n] ||= [])

    const consulta = (nome) => {
        const filtros = []
        let modo = 'select'
        let payload
        let max = Infinity
        const q = {
            select: () => q,
            eq: (k, v) => (filtros.push((r) => String(r[k]) === String(v)), q),
            in: (k, vs) => (filtros.push((r) => vs.map(String).includes(String(r[k]))), q),
            limit: (n) => ((max = n), q),
            delete: () => ((modo = 'delete'), q),
            insert: (p) => ((modo = 'insert'), (payload = p), q),
            update: (p) => ((modo = 'update'), (payload = p), q),
            then: (res, rej) => Promise.resolve(exec()).then(res, rej),
        }
        function exec() {
            db.chamadas.push(`${modo}:${nome}`)
            const falha = db.falhas.find((f) => f.nome === nome && f.modo === modo && f.quando(payload))
            if (falha) return { data: null, error: new Error(falha.mensagem || 'falha simulada') }
            const linhas = tab(nome)
            if (modo === 'insert') {
                const novos = (Array.isArray(payload) ? payload : [payload]).map((r) => ({ id: db.seq++, ...r }))
                linhas.push(...novos)
                return { data: novos, error: null }
            }
            const alvo = linhas.filter((r) => filtros.every((f) => f(r)))
            if (modo === 'delete') {
                db.tabelas[nome] = linhas.filter((r) => !alvo.includes(r))
                return { data: null, error: null }
            }
            if (modo === 'update') {
                alvo.forEach((r) => Object.assign(r, payload))
                return { data: null, error: null }
            }
            return { data: alvo.slice(0, max).map((r) => ({ ...r })), error: null }
        }
        return q
    }

    return {
        db,
        tab,
        supabase: { from: (n) => consulta(n) },
        falhar: (nome, modo, quando = () => true, mensagem) => db.falhas.push({ nome, modo, quando, mensagem }),
    }
}
