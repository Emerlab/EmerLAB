import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer'
import { PDFDocument } from 'pdf-lib'
import { createClient } from '@supabase/supabase-js'
import { config as dotenvConfig } from 'dotenv'
import { aguardarImagensIcones, ajustarFontesTextosRc, carregarIconesRcParaHtml } from '../../src/lib/rc/rcPdfIcones.js'
import { aplicarCarimboRcDocumento } from '../../src/lib/rc/rcPdfCarimbo.js'
import { montarNomeArquivoRc } from '../../src/lib/rc/rcPdfNomeArquivo.js'
import { chunk, gerarHtmlCards, montarCards, ptParaIn } from '../../src/lib/rc/rcCards.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const workspaceRoot = path.resolve(__dirname, '..', '..')
dotenvConfig({ path: path.resolve(workspaceRoot, '.env.local') })
dotenvConfig()

const TEMPLATE_PDF_PATH = path.resolve(workspaceRoot, 'src', 'assets', 'rc', 'template_rc.pdf')
const TMP_OVERLAY_PATH = path.resolve(workspaceRoot, 'tmp', 'rc_overlay.tmp.pdf')

const parseArgs = () => {
    const args = process.argv.slice(2)
    const getFlagValue = (flag) => {
        const idx = args.indexOf(flag)
        if (idx === -1) return ''
        return args[idx + 1] || ''
    }
    const cidadesRaw = getFlagValue('--cities')
    const outputRaw = getFlagValue('--out')
    const cidades = cidadesRaw
        .split(',')
        .map((cidade) => cidade.trim())
        .filter(Boolean)

    if (!cidades.length) {
        throw new Error('Uso: npm run rc:pdf -- --cities "Cidade A, Cidade B" [--out "./RC_saida.pdf"]')
    }

    const outputPath = outputRaw
        ? path.resolve(workspaceRoot, outputRaw)
        : path.resolve(workspaceRoot, montarNomeArquivoRc(cidades))

    return { cidades, outputPath }
}

const carregarBase = async () => {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const supabaseKey =
        serviceRoleKey ||
        process.env.SUPABASE_ANON_KEY ||
        process.env.VITE_SUPABASE_ANON_KEY ||
        process.env.VITE_SUPABASE_PUBLISHABLE_KEY
    if (!supabaseUrl || !supabaseKey) {
        throw new Error(
            'Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (ou SUPABASE_ANON_KEY) no ambiente. Como fallback local, também aceitamos VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY/PUBLISHABLE_KEY.'
        )
    }
    const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } })

    const [
        { data: prestadores, error: ePrestadores },
        { data: cidades, error: eCidades },
        { data: situacoes, error: eSituacoes },
        { data: especialidades, error: eEspecialidades },
        { data: prestadorCidades, error: ePrestadorCidades },
        { data: prestadorEspecialidades, error: ePrestadorEspecialidades },
        { data: prestadorEstabelecimentos, error: ePrestadorEstabelecimentos },
    ] = await Promise.all([
        supabase
            .from('prestadores')
            .select('id,nome,telefone,cidade_id,endereco,modalidade,especialidade_id,situacao_id,ativo')
            .eq('ativo', true),
        supabase.from('cidades_credenciamento').select('id,nome'),
        supabase.from('situacoes').select('id,descricao,ativo').eq('ativo', true),
        supabase.from('especialidades').select('id,nome,tipo,ordem_rc'),
        supabase.from('prestador_cidades').select('prestador_id,cidade_id,principal'),
        supabase.from('prestador_especialidades').select('prestador_id,especialidade_id,principal'),
        supabase.from('prestador_estabelecimentos').select('veterinario_id,estabelecimento_id,principal'),
    ])

    const erros = [ePrestadores, eCidades, eSituacoes, eEspecialidades, ePrestadorCidades, ePrestadorEspecialidades, ePrestadorEstabelecimentos]
        .filter(Boolean)
        .map((e) => e.message)
    if (erros.length) throw new Error(`Erro ao carregar base: ${erros.join(' | ')}`)
    if (!prestadores?.length && !serviceRoleKey) {
        throw new Error('A chave atual não tem permissão para ler dados de RC (RLS). Use SUPABASE_SERVICE_ROLE_KEY no .env.local.')
    }

    return {
        prestadores: prestadores || [],
        cidades: cidades || [],
        situacoes: situacoes || [],
        especialidades: especialidades || [],
        prestadorCidades: prestadorCidades || [],
        prestadorEspecialidades: prestadorEspecialidades || [],
        prestadorEstabelecimentos: prestadorEstabelecimentos || [],
    }
}

const gerarOverlayComPuppeteer = async (cards, pageWidthPt, pageHeightPt) => {
    await fs.mkdir(path.dirname(TMP_OVERLAY_PATH), { recursive: true })
    const browser = await puppeteer.launch({ headless: true })
    try {
        const icones = await carregarIconesRcParaHtml(browser)
        const page = await browser.newPage()
        const html = gerarHtmlCards(chunk(cards, 10), pageWidthPt, pageHeightPt, icones)
        await page.setContent(html, { waitUntil: 'domcontentloaded' })
        await aguardarImagensIcones(page)
        await ajustarFontesTextosRc(page)
        await page.pdf({
            path: TMP_OVERLAY_PATH,
            printBackground: true,
            width: ptParaIn(pageWidthPt),
            height: ptParaIn(pageHeightPt),
            margin: { top: '0', right: '0', bottom: '0', left: '0' },
        })
    } finally {
        await browser.close()
    }
}

const comporPdfFinal = async (outputPath, cidadesSelecionadas) => {
    const [templateBytes, overlayBytes] = await Promise.all([fs.readFile(TEMPLATE_PDF_PATH), fs.readFile(TMP_OVERLAY_PATH)])
    const templateDoc = await PDFDocument.load(templateBytes)
    const overlayDoc = await PDFDocument.load(overlayBytes)
    const finalDoc = await PDFDocument.create()
    const totalTemplate = templateDoc.getPageCount()
    const paginaCardsTemplateIndex = totalTemplate > 1 ? 1 : 0

    if (totalTemplate >= 1) {
        const [capa] = await finalDoc.copyPages(templateDoc, [0])
        finalDoc.addPage(capa)
    }

    for (let i = 0; i < overlayDoc.getPageCount(); i += 1) {
        const [base] = await finalDoc.copyPages(templateDoc, [paginaCardsTemplateIndex])
        const page = finalDoc.addPage(base)
        const embedded = await finalDoc.embedPage(overlayDoc.getPage(i))
        const { width, height } = page.getSize()
        page.drawPage(embedded, { x: 0, y: 0, width, height })
    }

    await aplicarCarimboRcDocumento(finalDoc, { cidades: cidadesSelecionadas })

    await fs.mkdir(path.dirname(outputPath), { recursive: true })
    await fs.writeFile(outputPath, await finalDoc.save())
}

const main = async () => {
    const { cidades, outputPath } = parseArgs()
    const base = await carregarBase()
    const cards = montarCards(base, cidades)
    if (!cards.length) throw new Error('Nenhum prestador credenciado encontrado para as cidades informadas.')

    const templateDoc = await PDFDocument.load(await fs.readFile(TEMPLATE_PDF_PATH))
    const pageRef = templateDoc.getPage(templateDoc.getPageCount() > 1 ? 1 : 0)
    const { width, height } = pageRef.getSize()

    await gerarOverlayComPuppeteer(cards, width, height)
    await comporPdfFinal(outputPath, cidades)
    await fs.rm(TMP_OVERLAY_PATH, { force: true })
    console.log(`RC gerada com sucesso em: ${outputPath}`)
}

main().catch((error) => {
    console.error(`Falha ao gerar RC: ${error.message}`)
    process.exitCode = 1
})
