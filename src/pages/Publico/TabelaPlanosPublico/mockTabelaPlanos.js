/**
 * Dados fictícios para o protótipo visual de /tabela-planos.
 * A API pública real deve devolver o mesmo formato.
 */

export const WHATSAPP_NUMERO = '555499041695'

export const MOCK_TABELA_PLANOS = {
    cidades: [
        { id: 1, label: 'Caxias do Sul', uf: 'RS' },
        { id: 2, label: 'Porto Alegre', uf: 'RS' },
        { id: 3, label: 'Passo Fundo', uf: 'RS' },
    ],
    planosPorCidade: {
        1: [
            { id: 10, nome: 'Básico' },
            { id: 20, nome: 'Clássico' },
            { id: 30, nome: 'Avançado' },
        ],
        2: [
            { id: 10, nome: 'Básico' },
            { id: 20, nome: 'Clássico' },
            { id: 30, nome: 'Avançado' },
            { id: 40, nome: 'Ultra' },
        ],
        3: [
            { id: 10, nome: 'Básico' },
            { id: 20, nome: 'Clássico' },
        ],
    },
    tabelas: {
        '1:10': {
            categorias: [
                {
                    id: 'c1',
                    nome: 'Consultas',
                    linhas: [
                        { codigo: 'CON001', nome: 'Consulta clínica geral', diferenca: 'R$ 0,00', carencia: '24 horas', limite: 'Ilimitado' },
                        { codigo: 'CON002', nome: 'Consulta retorno', diferenca: 'R$ 0,00', carencia: '—', limite: '1x / 15 dias' },
                        { codigo: 'CON003', nome: 'Consulta emergencial', diferenca: 'R$ 80,00', carencia: '24 horas', limite: '2x / mês' },
                    ],
                },
                {
                    id: 'c2',
                    nome: 'Exames laboratoriais',
                    linhas: [
                        { codigo: 'LAB010', nome: 'Hemograma completo', diferenca: 'R$ 25,00', carencia: '30 dias', limite: '2x / ano' },
                        { codigo: 'LAB011', nome: 'Bioquímico (perfil)', diferenca: 'R$ 45,00', carencia: '30 dias', limite: '2x / ano' },
                        { codigo: 'LAB012', nome: 'Urinálise', diferenca: 'R$ 20,00', carencia: '30 dias', limite: '2x / ano' },
                    ],
                },
                {
                    id: 'c3',
                    nome: 'Imagem',
                    linhas: [
                        { codigo: 'IMG001', nome: 'Radiografia simples', diferenca: 'R$ 60,00', carencia: '60 dias', limite: '2x / ano' },
                        { codigo: 'IMG002', nome: 'Ultrassonografia abdominal', diferenca: 'R$ 90,00', carencia: '60 dias', limite: '1x / ano' },
                    ],
                },
                {
                    id: 'c4',
                    nome: 'Vacinas',
                    linhas: [
                        { codigo: 'VAC001', nome: 'V8 / V10', diferenca: 'R$ 0,00', carencia: '—', limite: 'Conforme protocolo' },
                        { codigo: 'VAC002', nome: 'Antirrábica', diferenca: 'R$ 0,00', carencia: '—', limite: '1x / ano' },
                    ],
                },
            ],
        },
        '1:20': {
            categorias: [
                {
                    id: 'c1',
                    nome: 'Consultas',
                    linhas: [
                        { codigo: 'CON001', nome: 'Consulta clínica geral', diferenca: 'R$ 0,00', carencia: '24 horas', limite: 'Ilimitado' },
                        { codigo: 'CON002', nome: 'Consulta retorno', diferenca: 'R$ 0,00', carencia: '—', limite: 'Ilimitado' },
                        { codigo: 'CON003', nome: 'Consulta emergencial', diferenca: 'R$ 40,00', carencia: '24 horas', limite: '4x / mês' },
                        { codigo: 'CON004', nome: 'Consulta especializada', diferenca: 'R$ 50,00', carencia: '30 dias', limite: '2x / ano' },
                    ],
                },
                {
                    id: 'c2',
                    nome: 'Exames laboratoriais',
                    linhas: [
                        { codigo: 'LAB010', nome: 'Hemograma completo', diferenca: 'R$ 0,00', carencia: '15 dias', limite: '4x / ano' },
                        { codigo: 'LAB011', nome: 'Bioquímico (perfil)', diferenca: 'R$ 20,00', carencia: '15 dias', limite: '4x / ano' },
                        { codigo: 'LAB020', nome: 'Hormônio tireoidiano (T4)', diferenca: 'R$ 35,00', carencia: '30 dias', limite: '2x / ano' },
                    ],
                },
                {
                    id: 'c3',
                    nome: 'Imagem',
                    linhas: [
                        { codigo: 'IMG001', nome: 'Radiografia simples', diferenca: 'R$ 30,00', carencia: '30 dias', limite: '4x / ano' },
                        { codigo: 'IMG002', nome: 'Ultrassonografia abdominal', diferenca: 'R$ 50,00', carencia: '30 dias', limite: '2x / ano' },
                        { codigo: 'IMG003', nome: 'Ecocardiograma', diferenca: 'R$ 120,00', carencia: '90 dias', limite: '1x / ano' },
                    ],
                },
                {
                    id: 'c4',
                    nome: 'Vacinas',
                    linhas: [
                        { codigo: 'VAC001', nome: 'V8 / V10', diferenca: 'R$ 0,00', carencia: '—', limite: 'Conforme protocolo' },
                        { codigo: 'VAC002', nome: 'Antirrábica', diferenca: 'R$ 0,00', carencia: '—', limite: '1x / ano' },
                        { codigo: 'VAC003', nome: 'Gripe canina', diferenca: 'R$ 15,00', carencia: '—', limite: '1x / ano' },
                    ],
                },
                {
                    id: 'c5',
                    nome: 'Cirurgias eletivas',
                    linhas: [
                        { codigo: 'CIR010', nome: 'Castração macho', diferenca: 'R$ 150,00', carencia: '90 dias', limite: '1x' },
                        { codigo: 'CIR011', nome: 'Castração fêmea', diferenca: 'R$ 220,00', carencia: '90 dias', limite: '1x' },
                    ],
                },
            ],
        },
        '1:30': {
            categorias: [
                {
                    id: 'c1',
                    nome: 'Consultas',
                    linhas: [
                        { codigo: 'CON001', nome: 'Consulta clínica geral', diferenca: 'R$ 0,00', carencia: '—', limite: 'Ilimitado' },
                        { codigo: 'CON003', nome: 'Consulta emergencial', diferenca: 'R$ 0,00', carencia: '—', limite: 'Ilimitado' },
                        { codigo: 'CON004', nome: 'Consulta especializada', diferenca: 'R$ 0,00', carencia: '15 dias', limite: '4x / ano' },
                    ],
                },
                {
                    id: 'c2',
                    nome: 'Exames laboratoriais',
                    linhas: [
                        { codigo: 'LAB010', nome: 'Hemograma completo', diferenca: 'R$ 0,00', carencia: '—', limite: 'Ilimitado' },
                        { codigo: 'LAB011', nome: 'Bioquímico (perfil)', diferenca: 'R$ 0,00', carencia: '—', limite: '6x / ano' },
                    ],
                },
                {
                    id: 'c3',
                    nome: 'Imagem',
                    linhas: [
                        { codigo: 'IMG001', nome: 'Radiografia simples', diferenca: 'R$ 0,00', carencia: '15 dias', limite: 'Ilimitado' },
                        { codigo: 'IMG002', nome: 'Ultrassonografia abdominal', diferenca: 'R$ 0,00', carencia: '15 dias', limite: '4x / ano' },
                        { codigo: 'IMG003', nome: 'Ecocardiograma', diferenca: 'R$ 60,00', carencia: '30 dias', limite: '2x / ano' },
                    ],
                },
                {
                    id: 'c4',
                    nome: 'Internação',
                    linhas: [
                        { codigo: 'INT001', nome: 'Diária de internação', diferenca: 'R$ 80,00', carencia: '30 dias', limite: '5 dias / evento' },
                        { codigo: 'INT002', nome: 'UTI veterinária', diferenca: 'R$ 150,00', carencia: '60 dias', limite: '3 dias / evento' },
                    ],
                },
            ],
        },
        '2:10': {
            categorias: [
                {
                    id: 'c1',
                    nome: 'Consultas',
                    linhas: [
                        { codigo: 'CON001', nome: 'Consulta clínica geral', diferenca: 'R$ 0,00', carencia: '24 horas', limite: 'Ilimitado' },
                        { codigo: 'CON003', nome: 'Consulta emergencial', diferenca: 'R$ 90,00', carencia: '24 horas', limite: '2x / mês' },
                    ],
                },
                {
                    id: 'c2',
                    nome: 'Exames laboratoriais',
                    linhas: [
                        { codigo: 'LAB010', nome: 'Hemograma completo', diferenca: 'R$ 30,00', carencia: '30 dias', limite: '2x / ano' },
                        { codigo: 'LAB011', nome: 'Bioquímico (perfil)', diferenca: 'R$ 50,00', carencia: '30 dias', limite: '2x / ano' },
                    ],
                },
                {
                    id: 'c3',
                    nome: 'Vacinas',
                    linhas: [
                        { codigo: 'VAC001', nome: 'V8 / V10', diferenca: 'R$ 0,00', carencia: '—', limite: 'Conforme protocolo' },
                        { codigo: 'VAC002', nome: 'Antirrábica', diferenca: 'R$ 0,00', carencia: '—', limite: '1x / ano' },
                    ],
                },
                {
                    id: 'c4',
                    nome: 'Imagem',
                    linhas: [
                        { codigo: 'IMG001', nome: 'Radiografia simples', diferenca: 'R$ 70,00', carencia: '60 dias', limite: '2x / ano' },
                    ],
                },
            ],
        },
        '2:20': {
            categorias: [
                {
                    id: 'c1',
                    nome: 'Consultas',
                    linhas: [
                        { codigo: 'CON001', nome: 'Consulta clínica geral', diferenca: 'R$ 0,00', carencia: '24 horas', limite: 'Ilimitado' },
                        { codigo: 'CON004', nome: 'Consulta especializada', diferenca: 'R$ 55,00', carencia: '30 dias', limite: '2x / ano' },
                    ],
                },
                {
                    id: 'c2',
                    nome: 'Exames laboratoriais',
                    linhas: [
                        { codigo: 'LAB010', nome: 'Hemograma completo', diferenca: 'R$ 0,00', carencia: '15 dias', limite: '4x / ano' },
                        { codigo: 'LAB020', nome: 'Hormônio tireoidiano (T4)', diferenca: 'R$ 40,00', carencia: '30 dias', limite: '2x / ano' },
                    ],
                },
                {
                    id: 'c3',
                    nome: 'Imagem',
                    linhas: [
                        { codigo: 'IMG002', nome: 'Ultrassonografia abdominal', diferenca: 'R$ 55,00', carencia: '30 dias', limite: '2x / ano' },
                    ],
                },
                {
                    id: 'c4',
                    nome: 'Vacinas',
                    linhas: [
                        { codigo: 'VAC001', nome: 'V8 / V10', diferenca: 'R$ 0,00', carencia: '—', limite: 'Conforme protocolo' },
                    ],
                },
            ],
        },
        '2:30': {
            categorias: [
                {
                    id: 'c1',
                    nome: 'Consultas',
                    linhas: [
                        { codigo: 'CON001', nome: 'Consulta clínica geral', diferenca: 'R$ 0,00', carencia: '—', limite: 'Ilimitado' },
                        { codigo: 'CON003', nome: 'Consulta emergencial', diferenca: 'R$ 0,00', carencia: '—', limite: 'Ilimitado' },
                    ],
                },
                {
                    id: 'c2',
                    nome: 'Exames laboratoriais',
                    linhas: [
                        { codigo: 'LAB010', nome: 'Hemograma completo', diferenca: 'R$ 0,00', carencia: '—', limite: 'Ilimitado' },
                    ],
                },
                {
                    id: 'c3',
                    nome: 'Imagem',
                    linhas: [
                        { codigo: 'IMG001', nome: 'Radiografia simples', diferenca: 'R$ 0,00', carencia: '15 dias', limite: 'Ilimitado' },
                        { codigo: 'IMG003', nome: 'Ecocardiograma', diferenca: 'R$ 70,00', carencia: '30 dias', limite: '2x / ano' },
                    ],
                },
                {
                    id: 'c4',
                    nome: 'Internação',
                    linhas: [
                        { codigo: 'INT001', nome: 'Diária de internação', diferenca: 'R$ 90,00', carencia: '30 dias', limite: '5 dias / evento' },
                    ],
                },
            ],
        },
        '2:40': {
            categorias: [
                {
                    id: 'c1',
                    nome: 'Consultas',
                    linhas: [
                        { codigo: 'CON001', nome: 'Consulta clínica geral', diferenca: 'R$ 0,00', carencia: '—', limite: 'Ilimitado' },
                        { codigo: 'CON003', nome: 'Consulta emergencial', diferenca: 'R$ 0,00', carencia: '—', limite: 'Ilimitado' },
                        { codigo: 'CON004', nome: 'Consulta especializada', diferenca: 'R$ 0,00', carencia: '—', limite: 'Ilimitado' },
                    ],
                },
                {
                    id: 'c2',
                    nome: 'Exames laboratoriais',
                    linhas: [
                        { codigo: 'LAB010', nome: 'Hemograma completo', diferenca: 'R$ 0,00', carencia: '—', limite: 'Ilimitado' },
                        { codigo: 'LAB011', nome: 'Bioquímico (perfil)', diferenca: 'R$ 0,00', carencia: '—', limite: 'Ilimitado' },
                    ],
                },
                {
                    id: 'c3',
                    nome: 'Imagem',
                    linhas: [
                        { codigo: 'IMG001', nome: 'Radiografia simples', diferenca: 'R$ 0,00', carencia: '—', limite: 'Ilimitado' },
                        { codigo: 'IMG002', nome: 'Ultrassonografia abdominal', diferenca: 'R$ 0,00', carencia: '—', limite: 'Ilimitado' },
                        { codigo: 'IMG003', nome: 'Ecocardiograma', diferenca: 'R$ 0,00', carencia: '15 dias', limite: '4x / ano' },
                    ],
                },
                {
                    id: 'c4',
                    nome: 'Internação',
                    linhas: [
                        { codigo: 'INT001', nome: 'Diária de internação', diferenca: 'R$ 0,00', carencia: '15 dias', limite: '10 dias / evento' },
                        { codigo: 'INT002', nome: 'UTI veterinária', diferenca: 'R$ 50,00', carencia: '30 dias', limite: '5 dias / evento' },
                    ],
                },
                {
                    id: 'c5',
                    nome: 'Cirurgias eletivas',
                    linhas: [
                        { codigo: 'CIR010', nome: 'Castração macho', diferenca: 'R$ 0,00', carencia: '60 dias', limite: '1x' },
                        { codigo: 'CIR011', nome: 'Castração fêmea', diferenca: 'R$ 50,00', carencia: '60 dias', limite: '1x' },
                    ],
                },
            ],
        },
        '3:10': {
            categorias: [
                {
                    id: 'c1',
                    nome: 'Consultas',
                    linhas: [
                        { codigo: 'CON001', nome: 'Consulta clínica geral', diferenca: 'R$ 0,00', carencia: '24 horas', limite: 'Ilimitado' },
                        { codigo: 'CON002', nome: 'Consulta retorno', diferenca: 'R$ 0,00', carencia: '—', limite: '1x / 15 dias' },
                    ],
                },
                {
                    id: 'c2',
                    nome: 'Exames laboratoriais',
                    linhas: [
                        { codigo: 'LAB010', nome: 'Hemograma completo', diferenca: 'R$ 22,00', carencia: '30 dias', limite: '2x / ano' },
                    ],
                },
                {
                    id: 'c3',
                    nome: 'Vacinas',
                    linhas: [
                        { codigo: 'VAC001', nome: 'V8 / V10', diferenca: 'R$ 0,00', carencia: '—', limite: 'Conforme protocolo' },
                        { codigo: 'VAC002', nome: 'Antirrábica', diferenca: 'R$ 0,00', carencia: '—', limite: '1x / ano' },
                    ],
                },
                {
                    id: 'c4',
                    nome: 'Imagem',
                    linhas: [
                        { codigo: 'IMG001', nome: 'Radiografia simples', diferenca: 'R$ 55,00', carencia: '60 dias', limite: '2x / ano' },
                    ],
                },
            ],
        },
        '3:20': {
            categorias: [
                {
                    id: 'c1',
                    nome: 'Consultas',
                    linhas: [
                        { codigo: 'CON001', nome: 'Consulta clínica geral', diferenca: 'R$ 0,00', carencia: '24 horas', limite: 'Ilimitado' },
                        { codigo: 'CON003', nome: 'Consulta emergencial', diferenca: 'R$ 35,00', carencia: '24 horas', limite: '3x / mês' },
                    ],
                },
                {
                    id: 'c2',
                    nome: 'Exames laboratoriais',
                    linhas: [
                        { codigo: 'LAB010', nome: 'Hemograma completo', diferenca: 'R$ 0,00', carencia: '15 dias', limite: '4x / ano' },
                        { codigo: 'LAB011', nome: 'Bioquímico (perfil)', diferenca: 'R$ 18,00', carencia: '15 dias', limite: '4x / ano' },
                    ],
                },
                {
                    id: 'c3',
                    nome: 'Imagem',
                    linhas: [
                        { codigo: 'IMG001', nome: 'Radiografia simples', diferenca: 'R$ 28,00', carencia: '30 dias', limite: '4x / ano' },
                        { codigo: 'IMG002', nome: 'Ultrassonografia abdominal', diferenca: 'R$ 48,00', carencia: '30 dias', limite: '2x / ano' },
                    ],
                },
                {
                    id: 'c4',
                    nome: 'Vacinas',
                    linhas: [
                        { codigo: 'VAC001', nome: 'V8 / V10', diferenca: 'R$ 0,00', carencia: '—', limite: 'Conforme protocolo' },
                        { codigo: 'VAC002', nome: 'Antirrábica', diferenca: 'R$ 0,00', carencia: '—', limite: '1x / ano' },
                    ],
                },
            ],
        },
    },
}

export function chaveTabela(cidadeId, planoId) {
    return `${cidadeId}:${planoId}`
}

export function mensagemWhatsappPlano(planoNome, cidadeLabel, uf) {
    return `Olá! Vim pelo site, tenho interesse no plano ${planoNome} de ${cidadeLabel}-${uf}`
}
