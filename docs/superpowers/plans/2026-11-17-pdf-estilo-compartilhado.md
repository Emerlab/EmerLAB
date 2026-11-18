# Estilo compartilhado dos geradores de PDF — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aplicar nos PDFs de Honorários e Descontos (e nas páginas de observações) o mesmo visual de tabela já aplicado em Planos, extraindo o desenho para um módulo compartilhado.

**Architecture:** Novo módulo `src/lib/pdf/estiloTabelaPdf.js` com constantes visuais, helpers puros (geometria/centralização) e primitivas de desenho sobre `pdf-lib`. `gerarImpressaoPlanosPdf.js` é refatorado para usá-lo (sem mudar o resultado); Honorários e Descontos passam a usá-lo. Cada gerador mantém seu próprio layout de colunas, paginação e rótulos.

**Tech Stack:** pdf-lib (`drawSvgPath` para cantos arredondados), `@pdf-lib/fontkit` + Montserrat, vitest.

**Spec:** conversa de 17/11/2026 (sem doc de design). Referência visual: PDF do Canva "Plano Básico" + implementação atual em `src/lib/impressaoPlanos/gerarImpressaoPlanosPdf.js`.

## Global Constraints

- Azul escuro: `#1E3148`. Zebra: alterna `#FFFFFF` e `#FCFCFC`. Cantos do cartão e da barra: raio 14 pt, só `drawSvgPath` (o `pdf-lib` ignora `borderRadius` em `drawRectangle`).
- Barra de título: altura 44, texto 15 pt, prefixo em Montserrat Light + destaque em Bold, barrinha vertical fina antes do texto, só cantos de cima arredondados.
- Cabeçalho da tabela: altura 36, 11 pt Bold, centralizado na vertical; sem linha entre cabeçalho e primeira linha.
- Linhas: altura base 34, 10 pt Light; divisória no **topo** de cada linha (exceto a primeira do bloco), recuada 14 pt, `#DADCE1`, 0,8 pt; última linha do grupo sem borda inferior; folga de 12 pt no fim do cartão.
- Centralização vertical pelo meio das maiúsculas: baseline = meio − 0,36·corpo (cabeçalho); para linhas, `yBottom + (h + bloco)/2 − corpo + 0,14·corpo`.
- Não commitar sem o usuário pedir. Depois de mexer em código: `graphify update .`.
- Rótulos de cada PDF permanecem (Planos "Grupo de X"; Descontos "Grupo de Descontos"; Honorários "Procedimentos: X" → passa a "Grupo de X" **(decisão minha, marcar ao entregar)**).

## Review Focus

- Nome de categoria muito longo na barra de título → trunca/quebra sem sair do cartão.
- Cartão ou barra com altura menor que 2×raio (página com 1 linha) → raio limitado, sem path inválido.
- Textos vazios → "—" (comportamento atual preservado).
- Fonte Light ausente (fallback Helvetica) → `fonts.light || fonts.regular`.
- Grupo continuado em outra página → título repetido e cartão arredondado nas duas partes.

---

### Task 1: Módulo compartilhado + refatorar Planos

**Files:**
- Create: `src/lib/pdf/estiloTabelaPdf.js`
- Create: `src/lib/pdf/estiloTabelaPdf.test.js`
- Modify: `src/lib/impressaoPlanos/gerarImpressaoPlanosPdf.js` (remover constantes/funções duplicadas e importar do módulo)

**Interfaces:**
- Produces (exports de `estiloTabelaPdf.js`):
  - constantes: `COR_NAVY, COR_BRANCO, COR_ZEBRA, COR_BORDA, CARD_RADIUS, TITLE_BAR_HEIGHT, TABLE_HEADER_HEIGHT, ROW_BASE_HEIGHT, ROW_DIVIDER_INSET, CARD_PADDING_BOTTOM, FONT_SIZE_BODY, FONT_SIZE_HEADER, FONT_SIZE_TITLE` (valores dos Global Constraints)
  - `caminhoRetanguloArredondado({ width, height, raio, soTopo }: {…}): string` — path SVG com y para baixo, raio limitado a `min(raio, width/2, height/2)`
  - `desenharRetanguloArredondado(page, { x, yTop, width, height, raio, color, soTopo? }): void`
  - `yBaselineCentro(yMeio: number, fontSize: number): number` = `yMeio − 0.36·fontSize`
  - `yPrimeiraLinhaBloco(yTop, yBottom, numLinhas, fontSize, leading): number`
  - `desenharBarraTitulo(page, fonts, { x, yTop, innerW, prefixo, destaque }): void` (usa `fonts.light || fonts.regular`, `fonts.bold`; trunca `destaque` à largura disponível)
  - `desenharDivisoria(page, { x, innerW, y }): void`

- [ ] **Step 1: Write the failing tests** em `estiloTabelaPdf.test.js`:
  - `caminhoRetanguloArredondado({width:200,height:40,raio:14})` começa com `M 14 0` e contém `A 14 14 0 0 1`;
  - com `height:10, raio:14` o raio usado é 5 (`A 5 5`);
  - `soTopo:true` começa com `M 0 40` e termina com `Z` sem `A` nos cantos de baixo (exatamente 2 arcos);
  - `yBaselineCentro(100, 11)` ≈ `96.04`;
  - `yPrimeiraLinhaBloco(100, 66, 1, 10, 12)` ≈ `79.4`.
- [ ] **Step 2: Run** `npx vitest run src/lib/pdf/estiloTabelaPdf.test.js` → FAIL (módulo não existe).
- [ ] **Step 3: Implement** o módulo copiando as versões já validadas de `gerarImpressaoPlanosPdf.js` (`desenharRetanguloArredondado`, `desenharBarraTituloSecao` generalizada com `prefixo`/`destaque`, divisória, `yPrimeiraLinhaBloco`).
- [ ] **Step 4: Run** os testes → PASS.
- [ ] **Step 5: Refatorar** `gerarImpressaoPlanosPdf.js` para importar do módulo (`prefixo: 'Grupo de '`, `destaque: nome da categoria`). Nenhuma mudança visual.
- [ ] **Step 6: Verificar** `npx eslint src/lib/pdf src/lib/impressaoPlanos` limpo e `npx vite build` ok; gerar um PDF de plano pelo app e comparar com o anterior (visual idêntico).

### Task 2: Honorários

**Files:**
- Modify: `src/lib/impressaoHonorarios/gerarImpressaoHonorariosPdf.js` (barra de título linhas ~514–556; cabeçalho ~558–605; linha ~612–660; fundo do cartão ~1021; constantes no topo)

**Interfaces:**
- Consumes: exports da Task 1.

- [ ] **Step 1:** Trocar constantes visuais pelas do módulo (azul `#1E3148`, alturas, tamanhos) mantendo `COL_FRAC`, paginação e as partes de observações/dúvidas.
- [ ] **Step 2:** Barra de título → `desenharBarraTitulo({ prefixo: 'Grupo de ', destaque: categoria })`; cartão branco → `desenharRetanguloArredondado` com `CARD_RADIUS` e folga `CARD_PADDING_BOTTOM` (ajustar o cálculo de fim do cartão e do cursor `y`).
- [ ] **Step 3:** Cabeçalho: centralizar na vertical com `yBaselineCentro`, ícone alinhado ao texto, remover a linha inferior do cabeçalho; "Procedimento" + ícone centralizados na coluna 0; demais colunas já centralizadas.
- [ ] **Step 4:** Linhas: zebra `COR_ZEBRA`, divisória no topo (exceto 1ª do bloco, sem borda na última do grupo), nome do procedimento à esquerda, textos com `yPrimeiraLinhaBloco`.
- [ ] **Step 5: Verificar** lint/build e gerar o PDF de Honorários pelo app; conferir: cantos arredondados, zebra, divisórias, cabeçalho ao meio, fonte Montserrat, páginas de observações/dúvidas intactas.

### Task 3: Descontos

**Files:**
- Modify: `src/lib/impressaoDescontos/gerarImpressaoDescontosPdf.js` (`desenharBarraTituloGrupo` ~205, `desenharFundoCardBranco` ~248, `desenharCabecalho` ~311, `desenharLinha` ~347)

**Interfaces:**
- Consumes: exports da Task 1.

- [ ] **Step 1:** Mesmas trocas da Task 2, mantendo as 2 colunas (`COL_FRAC [0.72, 0.28]`), título "Grupo de **Descontos**", o subtítulo cinza sob o serviço (`FONT_SIZE_SUB`, `COR_TEXTO_SUB`) e o bloco "Informações".
- [ ] **Step 2:** Linhas com subtítulo: altura `ROW_BASE_HEIGHT` do Descontos (36) preservada; zebra/divisória conforme Global Constraints.
- [ ] **Step 3: Verificar** lint/build e gerar o PDF de Descontos pelo app; conferir visual e que o bloco "Informações" cabe no cartão arredondado.

### Task 4: Páginas de observações e carimbo

**Files:**
- Modify: `src/lib/pdf/observacoesModeloPdf.js:20` (`COR_NAVY` → importar de `estiloTabelaPdf.js`) e, se houver cartão/barra, trocar para as primitivas
- Modify: `src/lib/rc/rcPdfCarimbo.js` somente se usar cores/fonte do estilo (conferir; não alterar posição do carimbo)

- [ ] **Step 1:** Trocar a cor azul por `COR_NAVY` compartilhada nos arquivos acima.
- [ ] **Step 2: Verificar** gerando um PDF com observações dinâmicas (Planos) e o carimbo do RC; nada deslocado.
- [ ] **Step 3:** `npx eslint` e `npx vite build` limpos; `graphify update .`.
