import { beforeEach, describe, expect, it, vi } from 'vitest'
import { hashChave } from './chaves.js'

const CHAVE = 'emer_rede_abc123'
const ORIGEM = 'https://cliente.exemplo.com'

const tabelas = {}
const leituras = {}
let falhar = null // (tabela, colunas) => erro | null

function montarTabelas() {
    const prest = (id, nome, extra = {}) => ({
        id,
        nome,
        ativo: true,
        situacao_id: 1,
        especialidade_id: 10,
        tipo: 'Especialidade',
        telefone: '(54) 3000-0000',
        celular: null,
        endereco_cidade: 'Caxias do Sul',
        endereco_uf: 'RS',
        cpf_cnpj: '000.000.000-00',
        chave_pix: 'segredo-pix',
        email: 'interno@emerlab.com',
        observacoes: 'obs interna',
        ...extra,
    })
    Object.assign(tabelas, {
        api_chaves: [
            {
                id: 'k1',
                hash: hashChave(CHAVE),
                escopos: ['planos:ler'],
                origens_permitidas: [ORIGEM],
                limite_por_minuto: 1000,
                ips_permitidos: [],
                expira_em: null,
                revogada_em: null,
            },
        ],
        prestadores: [
            prest(1, 'Clinica Alfa', { especialidade_id: 2, tipo: 'Local', endereco_logradouro: 'Rua A', endereco_numero: '10' }),
            prest(2, 'Dr Beta'),
            prest(3, 'Gama Descredenciado', { situacao_id: 2 }),
        ],
        situacoes: [
            { id: 1, descricao: 'Credenciado' },
            { id: 2, descricao: 'Descredenciado' },
        ],
        prestador_estabelecimentos: [],
        procedimentos: [
            { id: 1, codigo: 'CONS-001', nome: 'Consulta', categoria_id: 1, plano_base_id: 1 },
            { id: 2, codigo: 'SEM-001', nome: 'Sem realizador', categoria_id: 1, plano_base_id: 1 },
        ],
        prestador_procedimentos: [
            { prestador_id: 1, procedimento_cod: 'CONS-001', procedimento_id: 1, nome_alternativo: null },
            { prestador_id: 2, procedimento_cod: 'CONS-001', procedimento_id: 1, nome_alternativo: 'Consulta clínica' },
        ],
        prestador_cidades: [],
        cidades_credenciamento: [],
        especialidades: [
            { id: 2, nome: 'Clínica', tipo: 'Local' },
            { id: 10, nome: 'Dermatologia', tipo: 'Especialidade' },
        ],
        prestador_especialidades: [],
        beneficios_catalogo: [],
        prestador_beneficios: [],
        prestador_beneficios_obs: [],
        planos: [
            { id: 1, nome: 'Básico' },
            { id: 2, nome: 'Clássico' },
            { id: 3, nome: 'Avançado' },
            { id: 4, nome: 'Ultra' },
            { id: 5, nome: 'Apenas Loja' },
        ],
        planos_cidade: [
            { plano_id: 1, cidade_id: 1, procedimento_cod: 'CONS-001', diferenca: 50 },
            { plano_id: 1, cidade_id: 1, procedimento_cod: 'SEM-001', diferenca: 70 },
        ],
        cidades: [
            { id: 1, nome: 'Caxias do Sul', uf: 'RS' },
            { id: 2, nome: 'Sem Plano', uf: 'RS' },
        ],
        cidades_municipios_vinculo: [],
        categorias: [{ id: 1, nome: 'Consultas', usa_limite_grupo: false }],
        planos_config: [{ plano_id: 1, procedimento: 'CONS-001', limite: '2 por ano', carencia: '30 dias' }],
        categoria_limites_grupo: [],
        impressao_planos_modos: [
            { plano_id: 1, cidade_id: 1, finalidade: 'impressao', selecao: { 'CONS-001|base': true } },
        ],
        planos_observacoes: [
            {
                id: 1,
                titulo: 'Geral',
                mensagem: 'Vale para todos',
                ativa: true,
                geral: true,
                ordem: 1,
                planos_observacoes_procedimentos: [],
            },
        ],
    })
}

const admin = {
    from: (nome) => {
        if (!(nome in tabelas)) throw new Error('tabela inesperada ' + nome)
        leituras[nome] = (leituras[nome] || 0) + 1
        let colunas = null
        let faixa = null
        let modo = 'select'
        const filtros = []
        const executar = () => {
            if (modo === 'update') return { data: [], error: null }
            const erro = falhar?.(nome, colunas)
            if (erro) return { data: null, error: erro }
            let linhas = tabelas[nome].filter((r) => filtros.every((f) => f(r)))
            if (faixa) linhas = linhas.slice(faixa[0], faixa[1] + 1)
            if (colunas && colunas !== '*') {
                const cols = colunas.split(',').map((c) => c.trim())
                linhas = linhas.map((r) => Object.fromEntries(cols.map((c) => [c, r[c]])))
            }
            return { data: linhas.map((r) => ({ ...r })), error: null }
        }
        const b = {
            select: (c) => ((colunas = c), b),
            update: () => ((modo = 'update'), b),
            eq: (k, v) => (filtros.push((r) => r[k] === v), b),
            is: (k, v) => (filtros.push((r) => (r[k] ?? null) === v), b),
            order: () => b,
            range: (a, z) => ((faixa = [a, z]), b),
            maybeSingle: async () => ({ data: executar().data[0] ?? null, error: null }),
            then: (res, rej) => Promise.resolve(executar()).then(res, rej),
        }
        return b
    },
}

vi.mock('../api/serverAuth.js', () => ({
    createSupabaseAdminClient: () => admin,
    getClientIp: () => '1.2.3.4',
    validarJwtComPermissao: async () => ({ error: 'x', status: 401 }),
}))

const pedido = (caminho, query = {}) => ({
    metodo: 'GET',
    caminho,
    query,
    headers: { authorization: `Bearer ${CHAVE}`, origin: ORIGEM },
    body: {},
    ip: '1.2.3.4',
})

let roteador

beforeEach(async () => {
    vi.resetModules()
    falhar = null
    for (const k of Object.keys(leituras)) delete leituras[k]
    montarTabelas()
    roteador = await import('../../../api/_lib/apiV1/roteador.js')
    ;(await import('../../../api/_lib/apiV1/redeDados.js')).limparCacheRede()
    ;(await import('../../../api/_lib/apiV1/planosDados.js')).limparCachePlanos()
})

const CHAVES_PERMITIDAS = new Set([
    'cidades', 'termos_populares', 'id', 'nome', 'uf', 'planos', 'chave',
    'cidade', 'plano', 'origem_selecao', 'grupos', 'observacoes', 'observacoes_gerais',
    'limite_grupo', 'procedimentos', 'codigo', 'carencia', 'limite', 'diferenca', 'realizadores', 'termos',
    'titulo', 'mensagem', 'geral',
    'total', 'prestadores', 'especialidade_principal', 'cidade_principal', 'contatos',
    'telefone', 'celular', 'whatsapp_url', 'endereco', 'texto', 'nome_alternativo',
])
const SEGREDOS = ['000.000.000-00', 'segredo-pix', 'interno@emerlab.com', 'obs interna']

function auditar(valor, caminho = '$') {
    if (Array.isArray(valor)) return valor.forEach((v, i) => auditar(v, `${caminho}[${i}]`))
    if (valor && typeof valor === 'object') {
        for (const [k, v] of Object.entries(valor)) {
            // O dicionário de observações usa o id numérico como chave.
            if (!/^\d+$/.test(k)) expect(CHAVES_PERMITIDAS.has(k), `chave fora da lista em ${caminho}.${k}`).toBe(true)
            auditar(v, `${caminho}.${k}`)
        }
    }
}

describe('escopo', () => {
    it('chave só com rede:ler recebe 403 em /planos/filtros', async () => {
        tabelas.api_chaves[0].escopos = ['rede:ler']
        const r = await roteador.processarRequisicao(pedido('/planos/filtros'))
        expect(r.status).toBe(403)
        expect(r.corpo.erro.codigo).toBe('escopo_insuficiente')
    })
})

describe('GET /planos/filtros', () => {
    it('lista só cidades com plano, com cache e termos populares', async () => {
        const r = await roteador.processarRequisicao(pedido('/planos/filtros'))
        expect(r.status).toBe(200)
        expect(r.headers['Cache-Control']).toBe('public, s-maxage=300, stale-while-revalidate=3600')
        expect(r.corpo.cidades.map((c) => c.nome)).toEqual(['Caxias do Sul'])
        expect(r.corpo.termos_populares).toContain('Raio X')
    })
})

describe('GET /planos/tabela', () => {
    it('devolve os grupos pela seleção salva, com valores, limite, carência e termos', async () => {
        const r = await roteador.processarRequisicao(pedido('/planos/tabela', { cidade: '1', plano: 'basico' }))
        expect(r.status).toBe(200)
        expect(r.headers['Cache-Control']).toBe('public, s-maxage=300, stale-while-revalidate=3600')
        expect(r.corpo.origem_selecao).toBe('impressao')
        expect(r.corpo.grupos).toHaveLength(1)
        const proc = r.corpo.grupos[0].procedimentos
        expect(proc.map((p) => p.codigo)).toEqual(['CONS-001'])
        expect(proc[0]).toMatchObject({ diferenca: 50, carencia: '30 dias', limite: '2 por ano', realizadores: 2 })
        expect(proc[0].termos).toContain('consulta clinica')
        expect(r.corpo.observacoes_gerais).toEqual([1])
    })

    it('erros de parâmetro e de disponibilidade', async () => {
        const plano = await roteador.processarRequisicao(pedido('/planos/tabela', { cidade: '1', plano: 'zzz' }))
        expect([plano.status, plano.corpo.erro.codigo]).toEqual([400, 'plano_invalido'])
        const cidade = await roteador.processarRequisicao(pedido('/planos/tabela', { cidade: 'abc', plano: 'basico' }))
        expect([cidade.status, cidade.corpo.erro.codigo]).toEqual([400, 'cidade_invalida'])
        const sem = await roteador.processarRequisicao(pedido('/planos/tabela', { cidade: '2', plano: 'basico' }))
        expect([sem.status, sem.corpo.erro.codigo]).toEqual([404, 'plano_indisponivel_na_cidade'])
    })

    it('cidade com plano mas nenhum procedimento selecionável devolve grupos vazios (não 500)', async () => {
        tabelas.impressao_planos_modos = [{ plano_id: 1, cidade_id: 1, finalidade: 'impressao', selecao: { 'CONS-001|base': false } }]
        const r = await roteador.processarRequisicao(pedido('/planos/tabela', { cidade: '1', plano: 'basico' }))
        expect(r.status).toBe(200)
        expect(r.corpo.grupos).toEqual([])
    })

    it('preset site tem prioridade sobre o modo impressão', async () => {
        tabelas.impressao_planos_modos.push({ plano_id: 1, cidade_id: 1, finalidade: 'site', selecao: { 'CONS-001|base': false, 'SEM-001|base': true } })
        const r = await roteador.processarRequisicao(pedido('/planos/tabela', { cidade: '1', plano: 'basico' }))
        expect(r.corpo.origem_selecao).toBe('site')
        expect(r.corpo.grupos).toEqual([]) // SEM-001 não tem realizador; CONS-001 está desmarcado
    })
})

describe('GET /planos/prestadores', () => {
    it('devolve total e lista com endereço só para tipo Local', async () => {
        const r = await roteador.processarRequisicao(pedido('/planos/prestadores', { cidade: '1', procedimento: ' cons-001 ' }))
        expect(r.status).toBe(200)
        expect(r.corpo.total).toBe(2)
        expect(r.corpo.prestadores.map((p) => p.nome)).toEqual(['Clinica Alfa', 'Dr Beta'])
        expect(r.corpo.prestadores[0].endereco).not.toBeNull()
        expect(r.corpo.prestadores[1].endereco).toBeNull()
    })

    it('código desconhecido: 404; sem realizadores: 200 com total 0; sem código: 400', async () => {
        const nao = await roteador.processarRequisicao(pedido('/planos/prestadores', { cidade: '1', procedimento: 'XXX' }))
        expect([nao.status, nao.corpo.erro.codigo]).toEqual([404, 'procedimento_nao_encontrado'])
        const zero = await roteador.processarRequisicao(pedido('/planos/prestadores', { cidade: '1', procedimento: 'SEM-001' }))
        expect([zero.status, zero.corpo.total, zero.corpo.prestadores]).toEqual([200, 0, []])
        const vazio = await roteador.processarRequisicao(pedido('/planos/prestadores', { cidade: '1' }))
        expect([vazio.status, vazio.corpo.erro.codigo]).toEqual([400, 'procedimento_invalido'])
    })
})

describe('contrato das respostas', () => {
    it('nenhuma chave fora da lista e nenhum dado sensível nas três respostas', async () => {
        const respostas = [
            await roteador.processarRequisicao(pedido('/planos/filtros')),
            await roteador.processarRequisicao(pedido('/planos/tabela', { cidade: '1', plano: 'basico' })),
            await roteador.processarRequisicao(pedido('/planos/prestadores', { cidade: '1', procedimento: 'CONS-001' })),
        ]
        for (const r of respostas) {
            expect(r.status).toBe(200)
            auditar(r.corpo)
            const json = JSON.stringify(r.corpo)
            for (const s of SEGREDOS) expect(json).not.toContain(s)
        }
    })
})

describe('bancos sem as migrações', () => {
    it('sem a coluna geral em planos_observacoes a API responde (observação trata como não geral)', async () => {
        falhar = (tabela, colunas) =>
            tabela === 'planos_observacoes' && colunas.includes('geral') ? { code: '42703', message: 'column planos_observacoes.geral does not exist' } : null
        const r = await roteador.processarRequisicao(pedido('/planos/tabela', { cidade: '1', plano: 'basico' }))
        expect(r.status).toBe(200)
        expect(r.corpo.observacoes_gerais).toEqual([])
    })

    it('sem a coluna finalidade em impressao_planos_modos trata tudo como impressao', async () => {
        falhar = (tabela, colunas) =>
            tabela === 'impressao_planos_modos' && colunas.includes('finalidade') ? { code: '42703', message: 'column finalidade does not exist' } : null
        const r = await roteador.processarRequisicao(pedido('/planos/tabela', { cidade: '1', plano: 'basico' }))
        expect(r.status).toBe(200)
        expect(r.corpo.origem_selecao).toBe('impressao')
    })

    it('tabela de modos inexistente não derruba a API', async () => {
        falhar = (tabela) => (tabela === 'impressao_planos_modos' ? { code: '42P01', message: 'relation does not exist' } : null)
        const r = await roteador.processarRequisicao(pedido('/planos/tabela', { cidade: '1', plano: 'basico' }))
        expect(r.status).toBe(200)
        expect(r.corpo.origem_selecao).toBe('padrao')
    })
})

describe('cache', () => {
    it('chamadas seguidas leem cada tabela uma vez', async () => {
        await roteador.processarRequisicao(pedido('/planos/filtros'))
        await roteador.processarRequisicao(pedido('/planos/tabela', { cidade: '1', plano: 'basico' }))
        await roteador.processarRequisicao(pedido('/planos/tabela', { cidade: '1', plano: 'classico' }))
        await roteador.processarRequisicao(pedido('/planos/prestadores', { cidade: '1', procedimento: 'CONS-001' }))
        for (const t of ['prestadores', 'planos_config', 'impressao_planos_modos', 'planos_observacoes']) {
            expect(leituras[t], t).toBe(1)
        }
        // planos_cidade é lida uma vez pela base da rede e uma vez pela base de planos (colunas diferentes).
        expect(leituras.planos_cidade).toBe(2)
    })
})
