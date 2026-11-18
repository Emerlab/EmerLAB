import fs from 'node:fs/promises'
import path from 'node:path'
import chromium from '@sparticuz/chromium'
import puppeteerCore from 'puppeteer-core'
import { PDFDocument } from 'pdf-lib'
import { bytesDePdfLib } from '../src/lib/pdf/serializarPdf.js'
import { createClient } from '@supabase/supabase-js'
import { config as dotenvConfig } from 'dotenv'
import { aguardarImagensIcones, ajustarFontesTextosRc, carregarIconesRcParaHtml } from '../src/lib/rc/rcPdfIcones.js'
import { aplicarCarimboRcDocumento } from '../src/lib/rc/rcPdfCarimbo.js'
import { montarNomeArquivoRc } from '../src/lib/rc/rcPdfNomeArquivo.js'
import { chunk, gerarHtmlCards, montarCards, ptParaIn } from '../src/lib/rc/rcCards.js'

dotenvConfig({ path: path.resolve(process.cwd(), '.env.local') })
dotenvConfig()

const TEMPLATE_PDF_PATH = path.resolve(process.cwd(), 'src', 'assets', 'rc', 'template_rc.pdf')

const isServerless = !!(
    process.env.VERCEL ||
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
    process.env.LAMBDA_TASK_ROOT
)

const launchBrowser = async () => {
    if (isServerless) {
        // Imports estáticos no topo do arquivo: o empacotamento da Vercel rastreia
        // @sparticuz/chromium e puppeteer-core; import() dinâmico costuma omitir binários.
        return puppeteerCore.launch({
            args: chromium.args,
            defaultViewport: chromium.defaultViewport,
            executablePath: await chromium.executablePath(),
            headless: chromium.headless,
        })
    }
    const { default: puppeteer } = await import('puppeteer')
    return puppeteer.launch({ headless: true })
}

const getSupabase = () => {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const supabaseKey = serviceRoleKey || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY
    if (!supabaseUrl || !supabaseKey) {
        throw new Error(
            'Variáveis do Supabase ausentes. Defina SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (ou SUPABASE_ANON_KEY). Como fallback local, também aceitamos VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY/PUBLISHABLE_KEY.'
        )
    }
    return {
        client: createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } }),
        usandoServiceRole: !!serviceRoleKey,
    }
}

const carregarBase = async () => {
    const { client: supabase, usandoServiceRole } = getSupabase()
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

    if (!prestadores?.length && !usandoServiceRole) {
        throw new Error(
            'A chave atual não tem permissão para ler os dados de RC (RLS). Use SUPABASE_SERVICE_ROLE_KEY no .env.local para gerar o PDF.'
        )
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

const gerarPdfBuffer = async (cidadesSelecionadas) => {
    const base = await carregarBase()
    const cards = montarCards(base, cidadesSelecionadas)
    if (!cards.length) throw new Error('Nenhum prestador credenciado encontrado para as cidades selecionadas.')

    const templateBytes = await fs.readFile(TEMPLATE_PDF_PATH)
    const templateDoc = await PDFDocument.load(templateBytes)
    const pageRef = templateDoc.getPage(templateDoc.getPageCount() > 1 ? 1 : 0)
    const { width, height } = pageRef.getSize()

    const browser = await launchBrowser()
    let overlayBytes
    try {
        const icones = await carregarIconesRcParaHtml(browser)
        const page = await browser.newPage()
        await page.setContent(
            gerarHtmlCards(chunk(cards, 10), width, height, icones),
            { waitUntil: 'domcontentloaded' }
        )
        await aguardarImagensIcones(page)
        await ajustarFontesTextosRc(page)
        overlayBytes = await page.pdf({
            printBackground: true,
            width: ptParaIn(width),
            height: ptParaIn(height),
            margin: { top: '0', right: '0', bottom: '0', left: '0' },
        })
    } finally {
        await browser.close()
    }

    const overlayDoc = await PDFDocument.load(overlayBytes)
    const finalDoc = await PDFDocument.create()
    const templateCardsIndex = templateDoc.getPageCount() > 1 ? 1 : 0

    if (templateDoc.getPageCount() >= 1) {
        const [capa] = await finalDoc.copyPages(templateDoc, [0])
        finalDoc.addPage(capa)
    }

    for (let i = 0; i < overlayDoc.getPageCount(); i += 1) {
        const [basePage] = await finalDoc.copyPages(templateDoc, [templateCardsIndex])
        const page = finalDoc.addPage(basePage)
        const overlayPage = await finalDoc.embedPage(overlayDoc.getPage(i))
        const { width: pw, height: ph } = page.getSize()
        page.drawPage(overlayPage, { x: 0, y: 0, width: pw, height: ph })
    }

    await aplicarCarimboRcDocumento(finalDoc, { cidades: cidadesSelecionadas })

    return Buffer.from(await bytesDePdfLib(finalDoc))
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Método não permitido.' })
        return
    }
    try {
        const { PERMISSION_KEYS } = await import('../src/lib/accessControl.js')
        const { getClientIp, validarJwtComPermissao } = await import('../src/lib/api/serverAuth.js')
        const { aplicarRateLimit, RATE_LIMITS } = await import('../src/lib/api/rateLimit.js')

        const ip = getClientIp(req)
        if (!aplicarRateLimit(res, `rc-pdf:${ip}`, RATE_LIMITS.rcPdf)) return

        const auth = await validarJwtComPermissao(req, [
            PERMISSION_KEYS.CREDENCIAMENTO_VIEW,
            PERMISSION_KEYS.CREDENCIAMENTO_CADASTRO_VIEW,
        ])
        if (auth.error) {
            res.status(auth.status || 401).json({ error: auth.error })
            return
        }

        const cidades = Array.isArray(req.body?.cidades)
            ? req.body.cidades.map((c) => String(c || '').trim()).filter(Boolean)
            : []
        if (!cidades.length) {
            res.status(400).json({ error: 'Selecione ao menos uma cidade.' })
            return
        }
        const pdfBuffer = await gerarPdfBuffer(cidades)
        const nomeArquivo = montarNomeArquivoRc(cidades)
        res.setHeader('Content-Type', 'application/pdf')
        res.setHeader('Content-Disposition', `attachment; filename="${nomeArquivo}"`)
        res.status(200).send(pdfBuffer)
    } catch (error) {
        res.status(500).json({ error: error?.message || 'Falha ao gerar RC.' })
    }
}
