/**
 * Dados fictícios (modo demonstração) de /tabela-planos, no MESMO formato da API pública
 * (/v1/planos/filtros, /v1/planos/tabela, /v1/planos/prestadores). Quando as variáveis
 * VITE_API_PLANOS_KEY/VITE_API_PLANOS_URL não existem, a página usa este cliente.
 */

export const WHATSAPP_NUMERO = '555499041695'

const FILTROS = {
    cidades: [
        {
            id: 1,
            nome: 'Caxias do Sul',
            uf: 'RS',
            planos: [
                { id: 10, chave: 'basico', nome: 'Básico' },
                { id: 20, chave: 'classico', nome: 'Clássico' },
                { id: 30, chave: 'avancado', nome: 'Avançado' },
            ],
        },
        {
            id: 2,
            nome: 'Porto Alegre',
            uf: 'RS',
            planos: [
                { id: 10, chave: 'basico', nome: 'Básico' },
                { id: 20, chave: 'classico', nome: 'Clássico' },
                { id: 30, chave: 'avancado', nome: 'Avançado' },
                { id: 40, chave: 'ultra', nome: 'Ultra' },
            ],
        },
        { id: 3, nome: 'Passo Fundo', uf: 'RS', planos: [{ id: 10, chave: 'basico', nome: 'Básico' }] },
    ],
    termos_populares: ['Consulta', 'Vacina', 'Raio X', 'Ultrassom', 'Castração', 'Exame de sangue', 'Cirurgia'],
}

const proc = (codigo, nome, diferenca, carencia, limite, termos, observacoes = [], realizadores = 6) => ({
    codigo,
    nome,
    carencia,
    limite,
    diferenca,
    realizadores,
    termos,
    observacoes,
})

function tabelaDe(cidade, plano, deslocamento) {
    return {
        cidade: { id: cidade.id, nome: cidade.nome, uf: cidade.uf },
        plano: { id: plano.id, chave: plano.chave, nome: plano.nome },
        origem_selecao: 'site',
        grupos: [
            {
                id: 1,
                nome: 'Consultas',
                limite_grupo: null,
                procedimentos: [
                    proc('CON001', 'Consulta clínica geral', 0, '24 horas', 'Ilimitado', ['consulta', 'clinica geral']),
                    proc('CON003', 'Consulta emergencial', 80 + deslocamento, '24 horas', '2x / mês', ['consulta', 'urgencia'], [1]),
                ],
            },
            {
                id: 2,
                nome: 'Exames laboratoriais',
                limite_grupo: '4x / ano',
                procedimentos: [
                    proc('LAB010', 'Hemograma completo', 25 + deslocamento, '30 dias', null, ['hemograma', 'exame de sangue']),
                    proc('LAB011', 'Bioquímico (perfil)', 45 + deslocamento, '30 dias', null, ['bioquimico', 'exame de sangue']),
                ],
            },
            {
                id: 3,
                nome: 'Imagem',
                limite_grupo: null,
                procedimentos: [
                    proc('IMG001', 'Radiografia simples', 60 + deslocamento, '60 dias', '2x / ano', ['radiografia', 'raio x', 'rx'], [2]),
                    proc('IMG002', 'Ultrassonografia abdominal', 90 + deslocamento, '60 dias', '1x / ano', ['ultrassonografia', 'ultrassom', 'eco'], [], 3),
                ],
            },
            {
                id: 4,
                nome: 'Cirurgias',
                limite_grupo: null,
                procedimentos: [
                    proc('CIR001', 'Castração macho', 220 + deslocamento, '90 dias', '1x / vida', ['castracao', 'esterilizacao'], [], 0),
                ],
            },
        ],
        observacoes: {
            1: { id: 1, titulo: 'Emergência', mensagem: 'Atendimento sujeito à disponibilidade do plantão da clínica.', geral: false },
            2: { id: 2, titulo: 'Radiografia', mensagem: 'Laudo em até 48 horas úteis.', geral: false },
            3: { id: 3, titulo: 'Valores', mensagem: 'Valores de exemplo para demonstração. Consulte o atendimento para confirmar.', geral: true },
        },
        observacoes_gerais: [3],
    }
}

const PRESTADORES = Array.from({ length: 7 }, (_, i) => ({
    id: 100 + i,
    nome: `Clínica Veterinária Exemplo ${i + 1}`,
    especialidade_principal: 'Clínica',
    cidade_principal: { nome: 'Caxias do Sul', uf: 'RS' },
    contatos: { telefone: `(54) 3000-000${i}`, celular: null, whatsapp_url: null },
    endereco: { texto: `Rua das Flores, ${100 + i} - Centro` },
    nome_alternativo: null,
}))

function erro(status, codigo, mensagem) {
    const e = new Error(mensagem)
    e.status = status
    e.codigo = codigo
    return e
}

/** Mesma interface de `criarClientePlanos`, sem rede. */
export function criarClientePlanosMock() {
    return {
        filtros: async () => FILTROS,
        tabela: async ({ cidade, plano }) => {
            const c = FILTROS.cidades.find((x) => String(x.id) === String(cidade))
            const p = c?.planos.find((x) => String(x.id) === String(plano) || x.chave === String(plano))
            if (!c || !p) throw erro(404, 'plano_indisponivel_na_cidade', 'Este plano não está disponível nesta cidade.')
            return tabelaDe(c, p, ((p.id - 10) / 10) * 15)
        },
        prestadores: async ({ procedimento }) => {
            const cod = String(procedimento || '').toUpperCase()
            if (cod === 'IMG002') return { total: 3, prestadores: PRESTADORES.slice(0, 3) }
            if (cod === 'CIR001') return { total: 0, prestadores: [] }
            return { total: PRESTADORES.length, prestadores: PRESTADORES }
        },
    }
}

export function mensagemWhatsappPlano(planoNome, cidadeLabel, uf, procedimentoNome) {
    const base = `Olá! Vim pelo site, tenho interesse no plano ${planoNome} de ${cidadeLabel}-${uf}`
    return procedimentoNome ? `${base}. Quero saber mais sobre: ${procedimentoNome}` : base
}
