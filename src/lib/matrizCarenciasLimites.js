/**
 * Modelo da matriz de carências e limites (Supertabela > Planos): uma linha por procedimento do catálogo,
 * 4 planos × (limite, carência). Do plano base para cima as células são editáveis; abaixo vale «<base> Acima».
 */
import { procedimentoIsentoLimiteGrupo, textoCelulaLimiteGrupo } from './categoriaLimitesGrupo.js'
import { CHAVE_PLANO_APENAS_LOJA, ORDEM_PLANOS, obterChavePlanoPorId } from './planosHierarquia.js'
import { indexarPlanosConfig, limiteGrupoAtivoNoPlano, textoAcima } from './procedimentoLimitesCarencias.js'

export const CHAVES_PLANOS_MATRIZ = ORDEM_PLANOS

const COLUNAS_ACHATADAS = CHAVES_PLANOS_MATRIZ.flatMap((chave) => [
    { chave, campo: 'limite' },
    { chave, campo: 'carencia' },
])

const emBranco = (valor) => !String(valor ?? '').trim()

export const montarLinhasMatriz = ({ procedimentos, configRows, planos, mapaPlanos, categorias, limitesGrupoRows }) => {
    const indice = indexarPlanosConfig(configRows)

    const linhas = (procedimentos || []).map((proc) => {
        const codigo = String(proc.codigo ?? '')
        const chaveBase = obterChavePlanoPorId(proc.plano_base_id, mapaPlanos)
        const apenasLoja = chaveBase === CHAVE_PLANO_APENAS_LOJA
        const indiceBase = apenasLoja ? 0 : Math.max(ORDEM_PLANOS.indexOf(chaveBase || 'basico'), 0)
        const nomeBase =
            (planos || []).find((plano) => Number(plano.id) === Number(proc.plano_base_id))?.nome ||
            mapaPlanos[ORDEM_PLANOS[indiceBase]]?.nome ||
            ''
        const isento = procedimentoIsentoLimiteGrupo({ procedimentoId: proc.id })
        const porPlano = indice.get(codigo.trim().toUpperCase())

        const celulas = {}
        CHAVES_PLANOS_MATRIZ.forEach((chave, posicao) => {
            const planoId = Number(mapaPlanos[chave]?.id) || 0
            if (!planoId) {
                celulas[chave] = null
                return
            }
            const config = porPlano?.get(planoId)
            if (posicao < indiceBase) {
                const texto = textoAcima(nomeBase)
                celulas[chave] = {
                    planoId,
                    configId: config?.id ?? null,
                    limite: texto,
                    carencia: texto,
                    modo: 'acima',
                    limiteGrupo: '',
                }
                return
            }
            celulas[chave] = {
                planoId,
                configId: config?.id ?? null,
                limite: config?.limite ?? '',
                carencia: config?.carencia ?? '',
                modo: 'editavel',
                limiteGrupo: isento ? '' : limiteGrupoAtivoNoPlano(categorias, limitesGrupoRows, proc.categoria_id, planoId),
            }
        })

        return {
            codigo,
            procedimento: String(proc.nome ?? codigo),
            categoriaId: proc.categoria_id != null ? Number(proc.categoria_id) : null,
            procedimentoId: proc.id != null ? Number(proc.id) : null,
            planoBaseId: proc.plano_base_id != null ? Number(proc.plano_base_id) : null,
            apenasLoja,
            celulas,
        }
    })

    linhas.sort((a, b) => {
        const ca = a.categoriaId ?? Number.MAX_SAFE_INTEGER
        const cb = b.categoriaId ?? Number.MAX_SAFE_INTEGER
        if (ca !== cb) return ca - cb
        return a.codigo.localeCompare(b.codigo, 'pt-BR', { sensitivity: 'base' })
    })
    return linhas
}

export const linhaTemPendencia = (linha) =>
    CHAVES_PLANOS_MATRIZ.some((chave) => {
        const celula = linha.celulas[chave]
        if (!celula || celula.modo !== 'editavel') return false
        if (emBranco(celula.carencia)) return true
        return emBranco(celula.limite) && !celula.limiteGrupo
    })

export const distribuirColagemMatriz = ({ linhas, linhaInicial, chaveInicial, campoInicial, texto }) => {
    const colunaInicial = COLUNAS_ACHATADAS.findIndex((c) => c.chave === chaveInicial && c.campo === campoInicial)
    if (colunaInicial < 0) return []

    const matriz = String(texto ?? '')
        .replace(/\r/g, '')
        .split('\n')
        .filter((linha) => linha.length > 0)
        .map((linha) => linha.split('\t'))

    const resultado = []
    matriz.forEach((colunas, deslocamentoLinha) => {
        const linhaIndex = linhaInicial + deslocamentoLinha
        const linha = linhas[linhaIndex]
        if (!linha) return
        colunas.forEach((bruto, deslocamentoColuna) => {
            const coluna = COLUNAS_ACHATADAS[colunaInicial + deslocamentoColuna]
            if (!coluna) return
            const valor = String(bruto ?? '')
            if (emBranco(valor)) return
            const celula = linha.celulas[coluna.chave]
            if (!celula || celula.modo !== 'editavel') return
            if (coluna.campo === 'limite' && celula.limiteGrupo) return
            resultado.push({ linhaIndex, chave: coluna.chave, campo: coluna.campo, valor })
        })
    })
    return resultado
}

export const valoresExportacaoLinha = (linha, categoriaNome) =>
    COLUNAS_ACHATADAS.map(({ chave, campo }) => {
        const celula = linha.celulas[chave]
        if (!celula) return ''
        if (campo === 'limite' && celula.limiteGrupo) return textoCelulaLimiteGrupo(celula.limiteGrupo, categoriaNome)
        return String(celula[campo] ?? '')
    })
