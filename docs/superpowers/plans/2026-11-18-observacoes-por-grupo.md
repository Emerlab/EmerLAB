# Observações por grupo nos PDFs de Planos e Honorários — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cadastrar observações como "geral" e imprimir, nos PDFs de Planos e Honorários, um bloco "Informações" no fim do cartão de cada grupo (observações ligadas aos procedimentos marcados daquele grupo), deixando na última página só as gerais.

**Architecture:** Coluna `geral` nas duas tabelas de observações; funções puras de distribuição (uma vez por grupo em que se aplica) e de medição/partição do bloco; um módulo de desenho compartilhado do bloco; os geradores recebem `observacoesPorGrupo` (por chave de grupo) além das `observacoes` gerais já existentes (páginas dinâmicas do fim).

**Tech Stack:** React, Supabase (migração SQL), pdf-lib, vitest.

**Spec:** `docs/superpowers/specs/2026-11-18-observacoes-por-grupo-design.md` (aprovado em 18/11/2026).

## Global Constraints

- Trabalhar no worktree `C:/Users/loopy/Documents/GitHub/Emerdog_SFSC_SUPERTOOL-obs` (branch `feat/observacoes-por-grupo`); `node_modules` é junção para a pasta principal — não reinstalar. Testes: `npx vitest run <arquivo>` (no worktree funciona; na pasta principal o vitest está quebrado por motivo ambiental).
- Coluna `geral boolean not null default false` em `planos_observacoes` e `honorarios_observacoes` (migração em `supabase/migrations/` + `.rollback.sql`). **Não aplicar a migração** nem tocar o Supabase ao vivo — só com aprovação do usuário (Task 7). Antes da migração, tudo deve funcionar com `geral = false`: se o `select` falhar por coluna ausente (código `42703` ou mensagem citando `geral`), refazer o `select` sem `geral` e tratar todas como `geral: false`.
- Chave de grupo: Planos = `String(categoria.id)`; Honorários = `String(secao.categoriaNome || secao.nome || 'Categoria')` (função `chaveGrupoHonorarios` exportada de `honorariosObservacoes.js` e usada pelo gerador).
- Cada observação vai para **cada grupo** que tenha algum procedimento **marcado** ligado a ela, uma vez por grupo (regra corrigida em 18/11/2026); observação `geral` nunca vai para um grupo; observação não-geral nunca vai para a última página; inativa não sai; ligada só a procedimentos não impressos não sai.
- Geral: salvar sem exigir procedimentos (e removendo vínculos existentes). Não geral: continua exigindo ao menos um procedimento.
- Bloco "Informações" dentro do cartão arredondado: separador azul-claro, título "Informações" em negrito centralizado, itens com o formato existente das observações (`N) Título: corpo`, com links), cores/fontes do estilo compartilhado (`src/lib/pdf/estiloTabelaPdf.js`: azul `#1E3148`, raio 14, `CARD_PADDING_BOTTOM`). Sem observações no grupo → cartão idêntico ao atual.
- Descontos não muda (já tem o próprio bloco). Não unificar as duas telas de cadastro.
- Geradores: `gerarImpressaoPlanosPdf`/`gerarImpressaoHonorariosPdf` ganham `opts.observacoesPorGrupo: Record<string, Array<{ titulo: string, mensagem: string }>>` (padrão `{}`); `opts.observacoes` continua sendo o array de observações para as páginas do fim e passa a receber **apenas as gerais**. Sem gerais → páginas fixas do modelo (como hoje).
- Não commitar sem necessidade do fluxo; mensagens de commit terminam com a linha `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Depois de mexer em código: `graphify update .`.

## Review Focus

- Observação ligada a procedimentos de dois grupos → aparece em cada um, uma vez por grupo (teste na Task 1).
- Grupo sem observações → nenhum bloco, altura 0, cartão como hoje (teste na Task 4; verificação manual nas Tasks 5/6).
- Observação geral inativa, ou ligada só a procedimentos desmarcados/não impressos → não sai (testes nas Tasks 1 e 2).
- Bloco maior que o espaço restante → quantos itens cabem e continuação na página seguinte sem cortar item (teste na Task 4).
- Coluna `geral` ainda inexistente no banco → listar/resolver funcionam como hoje (teste na Task 2 com `vi.mock` do cliente Supabase).

---

### Task 1: Migração e distribuição pura

**Files:**
- Create: `supabase/migrations/20261118120000_observacoes_geral.sql`, `supabase/migrations/20261118120000_observacoes_geral.rollback.sql`
- Create: `src/lib/pdf/distribuirObservacoes.js`, `src/lib/pdf/distribuirObservacoes.test.js`

**Interfaces:**
- Produces: `distribuirObservacoes({ grupos, observacoes }): { porGrupo: Record<string, Array<{titulo, mensagem}>>, gerais: Array<{titulo, mensagem}> }` onde `grupos: Array<{ chave: string, codigos: string[] }>` (na ordem do PDF; `codigos` = procedimentos marcados já normalizados em maiúsculas) e `observacoes: Array<{ titulo, mensagem, ativa, ordem, id, geral, codigosProcedimentos: string[] }>`. Regras no Global Constraints; ordem de saída = `ordem` e depois `id`; `mensagem` vazia é descartada; grupos sem observações ficam fora de `porGrupo` (chave ausente).

- [ ] **Step 1: Write the failing tests** (`distribuirObservacoes.test.js`): (a) obs ligada aos códigos `A1` (grupo g1) e `B1` (grupo g2) → só em `porGrupo.g1`; (b) geral ativa → só em `gerais`, mesmo com `codigosProcedimentos` preenchido; (c) inativa e geral inativa → em lugar nenhum; (d) ligada só a `Z9` que nenhum grupo tem → em lugar nenhum; (e) ordenação por `ordem` depois `id` dentro do grupo; (f) grupo sem observações → `porGrupo` não tem a chave; (g) `mensagem` vazia descartada; (h) comparação de códigos ignora caixa/espaços.
- [ ] **Step 2: Run** `npx vitest run src/lib/pdf/distribuirObservacoes.test.js` → FAIL.
- [ ] **Step 3: Implement** `distribuirObservacoes` e escrever as duas migrações (`add column if not exists geral boolean not null default false` nas duas tabelas, com `comment on column`; rollback com `drop column if exists`), no estilo das migrações existentes em `supabase/migrations/`.
- [ ] **Step 4: Run** os testes → PASS; `npx eslint src/lib/pdf`.

### Task 2: Bibliotecas de observações (Planos e Honorários)

**Files:**
- Modify: `src/lib/impressaoPlanos/planosObservacoes.js` (`mapearObservacao`, `listarPlanosObservacoes`, `salvarPlanosObservacao`, novo resolvedor)
- Modify: `src/lib/impressaoHonorarios/honorariosObservacoes.js` (idem + `chaveGrupoHonorarios`)
- Create: `src/lib/impressaoPlanos/planosObservacoes.geral.test.js`, `src/lib/impressaoHonorarios/honorariosObservacoes.geral.test.js`

**Interfaces:**
- Consumes: `distribuirObservacoes` (Task 1).
- Produces:
  - `listarPlanosObservacoes()` / `listarHonorariosObservacoes()` → itens com `geral: boolean` (select inclui `geral`; fallback sem `geral` conforme Global Constraints).
  - `salvarPlanosObservacao(payload)` / `salvarHonorariosObservacao(payload)` aceitam `payload.geral?: boolean` (`geral` não exige `codigosProcedimentos`, grava `geral = true` e remove vínculos; não-geral mantém a regra atual; o `update`/`insert` inclui a coluna `geral` só quando a coluna existe — se o erro for de coluna ausente e `geral === true`, retornar `{ ok: false, erro: 'Coluna geral ausente no banco. Aplique a migração de observações gerais.' }`).
  - `resolverObservacoesPlanosPorGrupo(categorias): Promise<{ porGrupo, gerais }>` e `resolverObservacoesHonorariosPorSecoes(secoes): Promise<{ porGrupo, gerais }>` — montam `grupos` a partir das categorias/seções (Planos: linhas `checked !== false`, `!apenasLoja`, `selecionavel !== false`, chave `String(cat.id)`; Honorários: linhas `checked !== false`, chave `chaveGrupoHonorarios(secao)`), chamam `listar…` e `distribuirObservacoes`; em falha de listagem devolvem `{ porGrupo: {}, gerais: [] }`.
  - `chaveGrupoHonorarios(secao): string`.
  - As funções antigas `resolverMensagensObservacoesPorCategorias`/`…PorSecoes` permanecem exportadas (usadas até as Tasks 5–6 trocarem os chamadores).

- [ ] **Step 1: Write the failing tests** (cada arquivo, com `vi.mock` do cliente Supabase usado pelo módulo): (a) `listar…` mapeia `geral: true/false` quando a coluna existe; (b) primeiro `select` falha com `{ code: '42703' }` → refaz sem `geral` e devolve `geral: false` em todos; (c) `salvar…({ geral: true, codigosProcedimentos: [] })` não retorna o erro "Vincule ao menos um procedimento", e não-geral com lista vazia continua retornando esse erro; (d) `resolverObservacoes…` devolve geral só em `gerais`, vinculada ao grupo dos seus procedimentos em `porGrupo`, e `{ porGrupo: {}, gerais: [] }` quando `listar…` falha.
- [ ] **Step 2: Run** os dois arquivos de teste → FAIL.
- [ ] **Step 3: Implement** as mudanças das duas bibliotecas (manter o padrão de erros/`isMissingTableError` existente; Honorários e Planos ficam paralelos).
- [ ] **Step 4: Run** os testes → PASS; `npx eslint src/lib/impressaoPlanos src/lib/impressaoHonorarios`.

### Task 3: Telas de cadastro (Planos e Honorários)

**Files:**
- Modify: `src/pages/Configuracoes/ObservacoesPlanos/ConfigObservacoesPlanos.jsx`, `src/pages/Configuracoes/ObservacoesHonorarios/ConfigObservacoesHonorarios.jsx` (e os CSS das duas, se necessário)

**Interfaces:**
- Consumes: `salvar…Observacao({ …, geral })` e `item.geral` (Task 2).

- [ ] **Step 1:** Em cada tela: `FORM_VAZIO` ganha `geral: false`; abrir para edição carrega `item.geral`; caixa "Observação geral (vai na última página, vale para o PDF todo)" no formulário, perto de "Ativa"; marcada → o seletor de procedimentos fica oculto (ou desabilitado com aviso "Observação geral não precisa de procedimentos") e `codigosSelecionados` é ignorado no salvar; `salvar…({ …, geral: form.geral, codigosProcedimentos: form.geral ? [] : form.codigosSelecionados })`.
- [ ] **Step 2:** Lista de cartões: etiqueta "Geral" (junto de "Ativa/Inativa", mesma classe de badge do arquivo) e, para geral, o texto "Aparece na última página" no lugar dos chips de procedimentos; a busca continua funcionando.
- [ ] **Step 3: Verificar** `npx eslint src/pages/Configuracoes`, `npx vite build`, `npx vitest run` (existentes). Verificação visual fica com o controlador.

### Task 4: Bloco "Informações" compartilhado

**Files:**
- Create: `src/lib/pdf/blocoInformacoesPdf.js`, `src/lib/pdf/blocoInformacoesPdf.test.js`
- Modify: `src/lib/pdf/observacoesModeloPdf.js` (exportar `medirItemObservacaoModelo` e `desenharItemObservacaoModelo` sem mudar o comportamento)

**Interfaces:**
- Consumes: constantes do `estiloTabelaPdf.js`.
- Produces:
  - `ALTURA_CABECALHO_BLOCO` (constante: separador + título, = `INFO_SEP_GAP + 1 + INFO_TITLE_GAP + FONT_SIZE_INFO + INFO_TITLE_GAP` do Descontos: 14 + 1 + 12 + 10 + 12) e `PADDING_FINAL_BLOCO = 12`.
  - `medirBlocoInformacoes({ itens, innerW, medirItem }): number` — 0 se `itens` vazio; senão `ALTURA_CABECALHO_BLOCO + Σ(medirItem(item_i, larguraTexto) + espaçamento entre itens) + PADDING_FINAL_BLOCO` (`larguraTexto = innerW − 2·12`; itens numerados `numero = i + 1` antes de medir).
  - `quantosItensCabem({ alturasItens: number[], alturaDisponivel: number }): number` — conta quantos itens (em ordem, sem cortar item) cabem depois do cabeçalho do bloco e do padding final; 0 se nem o primeiro cabe.
  - `desenharBlocoInformacoes(page, fonts, { x, yTop, innerW, itens, desenharItem, medirItem }): number` — desenha separador, "Informações" e os itens e devolve o `yBottom` (já com o padding final).
  - Os geradores injetam `medirItem(item, largura)`/`desenharItem(page, fonts, x, yTop, item, largura)` (os de `observacoesModeloPdf.js` para Planos; os locais de Honorários, que já existem no arquivo dele).

- [ ] **Step 1: Write the failing tests**: `medirBlocoInformacoes({ itens: [], … }) === 0`; com `medirItem` falso (altura fixa 30) e 2 itens → `ALTURA_CABECALHO_BLOCO + 2·30 + espaçamento + 12`; `quantosItensCabem` com alturas `[30, 30, 30]` e disponível exato para 2 → 2; disponível menor que cabeçalho+1º item → 0; disponível enorme → 3; `desenharBlocoInformacoes` com página/fonte falsas devolve `yTop − medirBlocoInformacoes(...)`.
- [ ] **Step 2: Run** `npx vitest run src/lib/pdf/blocoInformacoesPdf.test.js` → FAIL.
- [ ] **Step 3: Implement** o módulo (desenho copiado do que `gerarImpressaoDescontosPdf.js` já faz para separador/título: cor `COR_SEP` azul-claro, 1,2 pt, título 10 pt negrito centralizado) e exportar as duas funções de `observacoesModeloPdf.js`.
- [ ] **Step 4: Run** os testes → PASS; `npx eslint src/lib/pdf`.

### Task 5: Gerador de Planos + chamadores

**Files:**
- Modify: `src/lib/impressaoPlanos/gerarImpressaoPlanosPdf.js` (`renderizarUmaPagina` e o estado do cursor)
- Modify: `src/pages/Planos/ImpressaoPlanos/ImpressaoPlanos.jsx` (função `gerarPdf`, ~L542)
- Modify: `src/lib/impressaoPlanos/gerarZipPlanosCidade.js` (dependência `resolverObservacoes` e a chamada a `gerarPdf`) e `gerarZipPlanosCidade.test.js` (ajustar os falsos)

**Interfaces:**
- Consumes: `resolverObservacoesPlanosPorGrupo` (Task 2); `medirBlocoInformacoes`, `quantosItensCabem`, `desenharBlocoInformacoes` (Task 4); `medirItemObservacaoModelo`/`desenharItemObservacaoModelo` de `observacoesModeloPdf.js`.
- Produces: `gerarImpressaoPlanosPdf({ pdfUrl, categorias, observacoes, observacoesPorGrupo })`.

- [ ] **Step 1:** No gerador: para cada seção (categoria) com `observacoesPorGrupo[String(cat.id)]` não vazia, o bloco entra depois da última linha da seção **dentro do cartão**: (a) se couber na página (limite inferior = `MARGIN_BOTTOM + CARD_PADDING_BOTTOM`, mesma regra das linhas), o fundo do cartão da última página da seção passa a ir até o fim do bloco (o bloco já inclui o padding final; não somar `CARD_PADDING_BOTTOM`), e `y` seguinte = fim do cartão − `SECTION_GAP`; (b) se couber só parte dos itens (`quantosItensCabem`), desenha esses itens e continua o restante numa **página seguinte** com cartão arredondado novo: barra de título repetida + o restante do bloco (sem cabeçalho de tabela), como a "página só de Informações" do Descontos; (c) se não couber nenhum item, vai inteiro para a página seguinte do mesmo jeito. O estado do cursor ganha o necessário para retomar (ex.: `blocoPendente: { secaoIdx, proximoItem }`); o guard anti-loop existente continua valendo. Seção sem observações → código atual intacto.
- [ ] **Step 2:** Chamadores: `ImpressaoPlanos.jsx` e `gerarZipPlanosCidade.js` passam a usar `resolverObservacoesPlanosPorGrupo(categorias)` e chamam `gerarImpressaoPlanosPdf({ pdfUrl, categorias, observacoes: gerais, observacoesPorGrupo: porGrupo })`; ajustar os falsos do teste do orquestrador (nome da dependência `resolverObservacoes` mantido, retorno `{ porGrupo, gerais }`) e mantê-lo verde.
- [ ] **Step 3: Verificar** `npx eslint src/lib/impressaoPlanos src/pages/Planos`, `npx vite build`, `npx vitest run`. Verificação visual com observações (um grupo com e sem observações; bloco que não cabe; só gerais) fica com o controlador.

### Task 6: Gerador de Honorários + chamadores

**Files:**
- Modify: `src/lib/impressaoHonorarios/gerarImpressaoHonorariosPdf.js` (`renderizarUmaPagina`, cursor, `gerarImpressaoHonorariosPdf`)
- Modify: `src/components/Supertabela/ModalImpressaoHonorariosCidade.jsx` (~L192) e `src/pages/Credenciamento/Credenciamento_cadastro/PrestadorHonorariosContratos.jsx` (~L193)

**Interfaces:**
- Consumes: `resolverObservacoesHonorariosPorSecoes`, `chaveGrupoHonorarios` (Task 2); funções da Task 4 com os `medirItem`/`desenharItem` locais já existentes no gerador (`medirItemObservacaoModelo`, `desenharItemObservacaoModelo`).
- Produces: `gerarImpressaoHonorariosPdf({ …, observacoes, observacoesPorGrupo })`.

- [ ] **Step 1:** Mesma integração da Task 5 no gerador de Honorários (chave do grupo = `chaveGrupoHonorarios` aplicada à seção; o bloco dentro do cartão; continuação com título repetido). O bloco de "dúvidas" e as páginas dinâmicas do fim continuam recebendo só `observacoes` (gerais).
- [ ] **Step 2:** Atualizar os dois chamadores para `const { porGrupo, gerais } = await resolverObservacoesHonorariosPorSecoes(secoes)` e passar `observacoes: gerais, observacoesPorGrupo: porGrupo`.
- [ ] **Step 3: Verificar** `npx eslint src/lib/impressaoHonorarios src/components/Supertabela src/pages/Credenciamento`, `npx vite build`, `npx vitest run`.

### Task 7: Migração, verificação e entrega

- [ ] **Step 1:** **Perguntar ao usuário** antes de aplicar `20261118120000_observacoes_geral.sql` no Supabase Emerdog-SuperTool; aplicar via MCP só com o OK explícito. Conferir depois as colunas nas duas tabelas e que as 14 + 8 observações existentes ficaram com `geral = false`.
- [ ] **Step 2:** Verificação manual (controlador): cadastrar uma observação geral em cada tela; gerar PDF de Planos e de Honorários com observações em dois grupos, um grupo sem observações, uma geral; conferir bloco dentro do cartão, "em cada grupo aplicável", última página só com a geral e as páginas fixas do modelo quando não há geral.
- [ ] **Step 3:** `npx vitest run`, `npx eslint src`, `npx vite build`, `graphify update .`; aplicar os commits na pasta principal do usuário (cherry-pick para `feat/conferencia-lab-memoria`) quando ele aprovar.
