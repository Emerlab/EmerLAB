# Impressão de planos — download rápido de todos os planos (.zip)

Data: 17/11/2026 · Tamanho: pequeno/médio (1 tabela nova, 1 painel, 1 função de geração em lote)

## Intenção
Na tela **Planos → Impressão**, depois de escolher UF e cidade e **antes de listar os procedimentos**, permitir baixar de uma vez, em um `.zip`, o PDF de cada plano da cidade, cada um com o **último preset (modo da equipe) salvo** para aquele plano+cidade. Mostrar quando cada preset foi atualizado e quando o zip foi gerado pela última vez.

## Objetivos
- Um clique gera e baixa o zip com todos os planos disponíveis na cidade.
- Cada PDF usa o preset salvo (`impressao_planos_modos`) e os dados **atuais** da Supertabela (preços, carências, observações).
- Painel mostra, por plano: preset atualizado em/por; último zip gerado em/por; aviso quando o preset é mais novo que o último zip.
- Cada geração fica registrada (histórico).

## Não objetivos / anti-objetivos
- **Não gerar sem preset.** O zip fica bloqueado enquanto algum plano disponível na cidade não tiver preset salvo; um humano precisa revisar e criar o preset inicial. Nunca usar a pré-marcação automática para gerar em lote.
- Não guardar o zip pronto (sem Storage/cache): o PDF sempre reflete a Supertabela de hoje.
- Não comprimir PDFs (a compressão é manual, em outro sistema).
- O download rápido não altera presets.
- Não mexer nos outros PDFs (Honorários, Descontos, RC).

## Abordagens consideradas
- **A — gerar na hora no navegador (escolhida):** reaproveita o gerador atual; sempre atualizado; custo é alguns segundos por plano.
- B — guardar o zip no Storage: download imediato, mas mais peças e risco de PDF desatualizado quando a Supertabela muda sem mexer no preset.
- C — gerar no servidor: reescrita grande sem ganho claro.

## Design (A)
**Painel** (novo componente em `src/pages/Planos/ImpressaoPlanos/`), visível quando há cidade escolhida, acima da listagem; independente do plano selecionado no filtro.
- Planos disponíveis = os que a tela já oferece para a cidade (mesmo filtro de `buscarCidadeIdsFiltroPlanoCredenciados` por plano).
- Uma linha por plano: nome · "Preset atualizado em DD/MM HH:mm por Fulano" **ou** "Sem preset — revisar" · botão "Revisar" (seleciona o plano e carrega a lista, como o fluxo atual).
- Rodapé: "Último zip: DD/MM HH:mm por Fulano" (ou "nunca gerado"); aviso "Preset(s) alterado(s) depois do último zip" quando aplicável; botão **Baixar todos (.zip)**, desativado com o motivo ao lado enquanto faltar preset; barra de progresso "Plano 2 de 4…".
- Usa a opção "incluir cidades paralelas" que já está na tela.

**Geração em lote** (`src/lib/impressaoPlanos/gerarZipPlanosCidade.js`): para cada plano disponível, em sequência: `carregarLinhasImpressaoPlanos` → `aplicarSelecaoModo` com o preset salvo → `resolverMensagensObservacoesPorCategorias` → `gerarImpressaoPlanosPdf`. Nome do arquivo igual ao do download individual (`<Plano> <Cidade>.pdf`); zip `Planos <Cidade>.zip` via `jszip` (já instalado). Falha em um plano interrompe e informa qual; nada é registrado no histórico se o zip não for entregue.

**Histórico**: tabela nova `impressao_planos_geracoes` — `id`, `cidade_id`, `plano_ids int[]`, `gerado_em`, `gerado_por (profiles.id)`. Índice `(cidade_id, gerado_em desc)`. RLS no padrão de `impressao_planos_modos`: leitura para logados; insert por `emer_pode_escrever_modulo(['planos.'], ['planos.view'])` com `gerado_por = auth.uid()`. Migração em `supabase/migrations/`. O painel mostra a geração mais recente; a tabela guarda todas.

## Restrições
- Sem `useObjectStreams`/compressão extra; PDFs como o gerador entrega hoje.
- Fontes Montserrat vêm do CDN (comportamento atual).
- Permissão: quem pode salvar preset (planos.*) pode registrar geração.

## Decisões minhas (marcar se discordar)
- Preset "atualizado depois do zip" = `modo.atualizado_em > geracao.gerado_em` da cidade.
- Se só alguns planos existem na cidade, o zip contém só esses.
- Aplicar a migração só quando você pedir.

## Deixado ao implementador
Layout/CSS do painel, textos exatos, ordem dos planos (usar `listarPlanosImpressaoOrdenados`), tratamento de cancelamento.
