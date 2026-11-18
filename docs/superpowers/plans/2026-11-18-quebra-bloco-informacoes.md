# Quebra de página do bloco "Informações" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduzir os casos em que o bloco "Informações" de um grupo cai isolado na página seguinte, deixando vazio embaixo da tabela: compactar o bloco, usar a mesma margem inferior das linhas e, quando ainda não couber, levá-lo junto das 2 últimas linhas do grupo.

**Architecture:** Mudança nas constantes do módulo do bloco e nas duas regras de paginação dos geradores de Planos e Honorários (já existentes na branch `feat/observacoes-por-grupo`).

**Tech Stack:** pdf-lib, vitest.

**Spec:** pedido do usuário em 18/11/2026 (print de um grupo cujo bloco ficou sozinho na página seguinte) + `docs/superpowers/specs/2026-11-18-observacoes-por-grupo-design.md`. Combinação aprovada: 1 (compactar) + 2 (manter junto das últimas linhas) + 3 (usar a mesma margem das linhas).

## Global Constraints

- Trabalhar no worktree `C:/Users/loopy/Documents/GitHub/Emerdog_SFSC_SUPERTOOL-obs` (branch `feat/observacoes-por-grupo`); `node_modules` é junção; testes com `npx vitest run <arquivo>` funcionam aí.
- **Compactar (item 1):** em `src/lib/pdf/blocoInformacoesPdf.js`: `INFO_SEP_GAP` 14 → 8, `INFO_TITLE_GAP` 12 → 8 (`ALTURA_CABECALHO_BLOCO` = 8 + 1 + 8 + 10 + 8 = 35), `PADDING_FINAL_BLOCO` = 4 (desacoplar de `OBS_PADDING`, que continua 12 e é o recuo lateral dos itens). O bloco do Descontos não muda.
- **Margem (item 3):** o espaço disponível para o bloco passa a ser `yProbe − MARGIN_BOTTOM` (antes `yProbe − LIMITE_LINHAS`, com `LIMITE_LINHAS = MARGIN_BOTTOM + CARD_PADDING_BOTTOM`), em todos os pontos onde o bloco é planejado (cartão da seção e página de continuação), nos dois geradores. O limite das **linhas** continua `LIMITE_LINHAS`.
- **Manter junto (item 2):** constante `LINHAS_QUE_ACOMPANHAM_BLOCO = 2` em cada gerador. Quando todas as linhas restantes da seção cabem na página mas **nenhum item** do bloco cabe (a fatia planejada fica vazia), as últimas `min(2, linhasDaSeçãoNestaPágina − 1)` linhas saem desta página e vão para a seguinte junto com o bloco (a seção continua normalmente: título repetido, cabeçalho da tabela, essas linhas, depois o bloco). Sempre fica ≥ 1 linha da seção na página atual; se só há 1 linha da seção nesta página, nada é levado (o bloco vai sozinho como hoje). Se **algum** item cabe, nada muda (o bloco divide por itens como hoje).
- Seções **sem** observações: saída idêntica à de antes — os testes de linha de base sem observações dos dois geradores (`baselineSemObservacoes.test.js` do Planos, `baseline-sem-observacoes.json` do Honorários) devem continuar passando **sem regenerar o JSON**.
- Regras existentes preservadas: bloco sempre dentro do cartão arredondado, numeração contínua, anti-laço (`assinaturaCursor`/`maxPaginas`), células de limite mesclado do Planos fechadas corretamente quando a seção é partida pelas linhas levadas.
- Não aplicar migração nem tocar o Supabase ao vivo. Commits terminam com a linha `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Depois de mexer em código: `graphify update .`.

## Review Focus

- Bloco cujo único item cabe só depois da compactação/margem → fica na página atual (teste na Task 2/3).
- Seção com exatamente 1 ou 2 linhas na página atual e bloco que não cabe → nada (ou só `n−1`) é levado; nunca fica página sem linha da seção (teste).
- Seção com célula de limite mesclado (Planos) cujas últimas linhas são levadas → célula fechada na página atual e reaberta na seguinte, sem linha perdida/duplicada (teste).
- Bloco que não cabe nem na página seguinte (item maior que a página) → `forcarAoMenosUm` continua garantindo progresso (teste existente passa).
- Linhas levadas + bloco longo na página seguinte → divide por itens normalmente, numeração contínua (teste).

---

### Task 1: Compactar o bloco

**Files:**
- Modify: `src/lib/pdf/blocoInformacoesPdf.js`, `src/lib/pdf/blocoInformacoesPdf.test.js`
- Modify (apenas valores esperados que dependam das constantes): testes dos geradores (`src/lib/impressaoPlanos/gerarImpressaoPlanosPdf.test.js`, `src/lib/impressaoHonorarios/gerarImpressaoHonorariosPdf.test.js`)

**Interfaces:**
- Produces: `ALTURA_CABECALHO_BLOCO === 35`, `PADDING_FINAL_BLOCO === 4` (mesmos nomes exportados).

- [ ] **Step 1: Write the failing tests:** em `blocoInformacoesPdf.test.js` atualizar as asserções das constantes (`ALTURA_CABECALHO_BLOCO` = `8+1+8+10+8`, `PADDING_FINAL_BLOCO` = 4) e os valores de `medirBlocoInformacoes`/`quantosItensCabem`/`desenharBlocoInformacoes` que derivam delas.
- [ ] **Step 2: Run** `npx vitest run src/lib/pdf/blocoInformacoesPdf.test.js` → FAIL.
- [ ] **Step 3: Implement** as constantes novas em `blocoInformacoesPdf.js` (o recuo lateral dos itens segue `OBS_PADDING = 12`).
- [ ] **Step 4:** `npx vitest run` completo; ajustar nos testes dos geradores **somente** os valores esperados que dependam de `ALTURA_CABECALHO_BLOCO`/`PADDING_FINAL_BLOCO` (sem mudar a intenção das asserções); `npx eslint src/lib/pdf src/lib/impressaoPlanos src/lib/impressaoHonorarios`; os testes de linha de base sem observações passam sem tocar o JSON.

### Task 2: Planos — margem e manter junto

**Files:**
- Modify: `src/lib/impressaoPlanos/gerarImpressaoPlanosPdf.js` (`renderizarUmaPagina`: planejamento da fatia da seção ~L574-585 e da página de continuação ~L455-460; contagem de linhas da página)
- Modify: `src/lib/impressaoPlanos/gerarImpressaoPlanosPdf.test.js`

**Interfaces:**
- Consumes: Task 1.
- Produces: constante `LINHAS_QUE_ACOMPANHAM_BLOCO = 2`; função pura exportada `linhasALevarComBloco({ linhasNestaPagina, fatiaVazia, max = LINHAS_QUE_ACOMPANHAM_BLOCO }): number` — retorna `0` se a fatia não é vazia ou se `linhasNestaPagina <= 1`; senão `min(max, linhasNestaPagina − 1)`.

- [ ] **Step 1: Write the failing tests:** (a) `linhasALevarComBloco`: fatia não vazia → 0; `linhasNestaPagina` 1 → 0; 2 → 1; 3 → 2; 10 → 2; (b) com página falsa gravando chamadas (padrão dos testes existentes): seção cujo bloco não cabia antes mas cabe agora com a margem `MARGIN_BOTTOM` → bloco na mesma página dentro do cartão; (c) seção cujo bloco não cabe mesmo assim → as 2 últimas linhas e o bloco aparecem na página seguinte (título repetido + cabeçalho da tabela + 2 linhas + bloco), e a página atual não tem bloco nem as 2 linhas; (d) seção com 1 linha na página → nada levado; (e) seção com limite mesclado cujas últimas linhas são levadas → texto de limite do grupo aparece nas duas páginas e todas as linhas aparecem exatamente uma vez; (f) varredura de 1 a 40 linhas (como a existente): numeração dos itens `[1..n]` sem perda/duplicação e nenhuma linha duplicada.
- [ ] **Step 2: Run** `npx vitest run src/lib/impressaoPlanos` → FAIL nos novos.
- [ ] **Step 3: Implement** `linhasALevarComBloco` e a regra: no planejamento da fatia da seção usar `alturaDisponivel: yProbe − MARGIN_BOTTOM`; se a fatia sai vazia, recuar o sonda `iProbe` em `linhasALevarComBloco(...)` linhas (ajustando `yProbe`/fim do cartão que passa a terminar com `CARD_PADDING_BOTTOM` e sem bloco) e deixar o cursor retomar na primeira linha levada (a seção continua na página seguinte pelo caminho normal de continuação); na página de continuação, `alturaDisponivel: corpoTop − MARGIN_BOTTOM`.
- [ ] **Step 4: Run** os testes do Planos e a suíte completa → PASS; `npx eslint src/lib/impressaoPlanos`; linha de base sem observações intacta (sem regenerar).

### Task 3: Honorários — margem e manter junto

**Files:**
- Modify: `src/lib/impressaoHonorarios/gerarImpressaoHonorariosPdf.js` (`renderizarUmaPagina`/`paginarSecoesHonorarios`, mesma regra), `src/lib/impressaoHonorarios/gerarImpressaoHonorariosPdf.test.js`

**Interfaces:**
- Consumes: Task 1; mesma função pura e constante da Task 2 (reimplementadas no arquivo do Honorários, ou compartilhadas num módulo se já houver um lugar natural — decisão do implementador, sem duplicar a função de forma divergente: mesma semântica).

- [ ] **Step 1: Write the failing tests:** os casos (a)–(d) e (f) da Task 2 para o Honorários (não há célula mesclada).
- [ ] **Step 2: Run** `npx vitest run src/lib/impressaoHonorarios` → FAIL nos novos.
- [ ] **Step 3: Implement** a mesma regra da Task 2.
- [ ] **Step 4: Run** testes do Honorários e a suíte completa → PASS; `npx eslint src/lib/impressaoHonorarios`; `baseline-sem-observacoes.json` intacto (sem regenerar); `npx vite build`; `graphify update .`.
