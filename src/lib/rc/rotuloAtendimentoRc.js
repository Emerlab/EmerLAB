// Rótulo de "Atendimento" dos cards da Rede Credenciada (PDF).
// Regra de privacidade: o endereço cadastrado de um prestador individual
// (que pode ser residencial) NUNCA pode ser impresso. Módulo puro (sem node/puppeteer).

const ROTULO_PARCEIRAS = 'Atendimento em clínicas parceiras'

const semAcento = (texto) =>
    String(texto ?? '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .trim()

const RE_CEP = /\d{5}-?\d{3}/
const RE_LOGRADOURO =
    /^(?:rua|r\.|avenida|av\.?|travessa|tv\.|estrada|rodovia|rod\.|alameda|praca|largo|servidao)(?=[\s.])[^,\d]*[,\d]/i
const RE_RESIDENCIAL = /(?<![\p{L}\d])(?:casa|apto|apartamento|ap|residencia|residencial)(?![\p{L}\d])/iu

export const pareceEndereco = (texto) => {
    const t = semAcento(texto)
    if (!t) return false
    return RE_CEP.test(t) || RE_LOGRADOURO.test(t)
}

export const pareceResidencial = (texto) => {
    const t = semAcento(texto)
    if (!t) return false
    return RE_RESIDENCIAL.test(t)
}

export const montarRotuloAtendimentoRc = (item = {}) => {
    if (item.temEspecialidadeDomiciliar) return 'Atendimento Domiciliar'

    const nomes = item.nomesClinicasVinculadas || []
    if (item.possuiVinculoClinica && nomes.length) {
        return `Atendimentos ${nomes.length === 1 ? `na ${nomes[0]}` : `em: ${nomes.join(', ')}`}`
    }

    if (item.temModalidadeVolante) return ROTULO_PARCEIRAS

    const modalidade = String(item.modalidadeEfetiva || '')
        .trim()
        .replace(/^atendimento[\s:-]*/i, '')
        .trim()
    if (modalidade && !pareceEndereco(modalidade)) return modalidade

    if (item.temEspecialidadeLocal) {
        const endereco = String((modalidade && pareceEndereco(modalidade) ? modalidade : item.endereco) || '').trim()
        if (endereco && !pareceResidencial(endereco)) return endereco
    }

    return ROTULO_PARCEIRAS
}
