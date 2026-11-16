// Padroniza o atributo `tipo` dos contatos da WATI para: cliente, nao-cliente, credenciado, nao-credenciado, outros.
// Só mexe no atributo `tipo`; valores que não reconhece são listados e NÃO são alterados.
//
// Uso (na pasta zap-emerlab, com WATI_TENANT_ID e WATI_API_TOKEN no .env.local da raiz ou no ambiente):
//   node scripts/padronizar-tipo-wati.mjs                 -> simulação (não grava nada), mostra o que mudaria
//   node scripts/padronizar-tipo-wati.mjs --limite=1 --aplicar   -> grava só 1 contato (teste)
//   node scripts/padronizar-tipo-wati.mjs --aplicar       -> grava todos
import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const aqui = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(aqui, '..', '..', '.env.local'), quiet: true })
dotenv.config({ path: path.join(aqui, '..', '.env'), quiet: true })

const { listarContatos, atualizarAtributos } = await import('../server/wati.js')

const PADRAO = ['cliente', 'nao-cliente', 'credenciado', 'nao-credenciado', 'outros']
// grafias equivalentes que podem ser corrigidas com segurança (o resto fica para decisão humana)
const ALIAS = { outro: 'outros' }
const args = process.argv.slice(2)
const aplicar = args.includes('--aplicar')
const limite = Number((args.find((a) => a.startsWith('--limite=')) || '').split('=')[1]) || Infinity
const TAMANHO = 100

const paraPadrao = (v) =>
    String(v || '')
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .trim()
        .toLowerCase()
        .replace(/[\s_]+/g, '-')

const pausa = (ms) => new Promise((r) => setTimeout(r, ms))

let vistos = 0
let semTipo = 0
let jaPadrao = 0
const ajustar = []
const desconhecidos = new Map()

for (let pagina = 1; ; pagina++) {
    const { contatos } = await listarContatos({ pagina, tamanho: TAMANHO })
    if (!contatos.length) break
    for (const c of contatos) {
        vistos++
        const param = (c.customParams || []).find((p) => String(p?.name || '').toLowerCase() === 'tipo')
        const atual = String(param?.value ?? '').trim()
        if (!atual) {
            semTipo++
            continue
        }
        const slug = paraPadrao(atual)
        const novo = ALIAS[slug] || slug
        if (atual === novo && PADRAO.includes(novo)) {
            jaPadrao++
        } else if (PADRAO.includes(novo)) {
            ajustar.push({ alvo: String(c.wAid || c.waId || c.phone || ''), nomeAtributo: param.name, de: atual, para: novo })
        } else {
            desconhecidos.set(atual, (desconhecidos.get(atual) || 0) + 1)
        }
    }
    if (contatos.length < TAMANHO) break
}

console.log(`Contatos lidos: ${vistos} · sem tipo: ${semTipo} · já padronizados: ${jaPadrao} · a ajustar: ${ajustar.length}`)
const resumo = new Map()
for (const a of ajustar) resumo.set(`${a.de} → ${a.para}`, (resumo.get(`${a.de} → ${a.para}`) || 0) + 1)
for (const [k, n] of [...resumo].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(5)}  ${k}`)
if (desconhecidos.size) {
    console.log('\nValores que NÃO batem com a lista padrão (não serão alterados — decida o destino de cada um):')
    for (const [k, n] of [...desconhecidos].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(5)}  "${k}"`)
}

if (!aplicar) {
    console.log('\nSimulação: nada foi gravado. Rode com --aplicar para gravar (use --limite=1 para testar num contato).')
    process.exit(0)
}

let ok = 0
let falhas = 0
for (const a of ajustar.slice(0, limite)) {
    try {
        await atualizarAtributos(a.alvo, [{ name: a.nomeAtributo, value: a.para }])
        ok++
        console.log(`OK    ${a.alvo}  ${a.de} → ${a.para}`)
    } catch (e) {
        falhas++
        console.log(`FALHA ${a.alvo}  ${a.de} → ${a.para}  (${e?.message || e})`)
    }
    await pausa(250)
}
console.log(`\nGravados: ${ok} · falhas: ${falhas}`)
process.exit(falhas ? 1 : 0)
