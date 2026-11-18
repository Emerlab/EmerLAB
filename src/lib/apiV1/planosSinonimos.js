// Sinônimos e termos de busca da tabela de planos pública.
// Módulo puro: usado pela API (Node) e pela página (React). Sem imports.

export const TERMOS_POPULARES = ['Consulta', 'Vacina', 'Raio X', 'Ultrassom', 'Castração', 'Exame de sangue', 'Cirurgia']

// gatilho (já normalizado) -> termos (já normalizados)
const SINONIMOS = {
  radiografia: ['raio x', 'rx', 'radiografico'],
  castracao: ['castrar', 'esterilizacao'],
  ultrassonografia: ['ultrassom', 'eco', 'ultra som'],
  hemograma: ['exame de sangue', 'sangue'],
  vacina: ['imunizacao'],
}

export function normalizarBusca(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

// eslint-disable-next-line no-unused-vars
export function sinonimosDoProcedimento(nome, codigo) {
  const base = normalizarBusca(nome)
  const saida = []
  for (const [gatilho, termos] of Object.entries(SINONIMOS)) {
    if (base.includes(gatilho)) {
      for (const t of termos) if (!saida.includes(t)) saida.push(t)
    }
  }
  return saida
}

export function montarTermosProcedimento({ nome, codigo, nomesAlternativos } = {}) {
  const nomeBase = normalizarBusca(nome)
  const saida = []
  const candidatos = [
    ...sinonimosDoProcedimento(nome, codigo),
    ...(Array.isArray(nomesAlternativos) ? nomesAlternativos : []).map(normalizarBusca),
  ]
  for (const t of candidatos) {
    if (t && t !== nomeBase && !saida.includes(t)) saida.push(t)
  }
  return saida
}
