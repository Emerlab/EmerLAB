# Impressão de planos — zip rápido por cidade — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Na tela Planos → Impressão, baixar em um `.zip` os PDFs de todos os planos da cidade com o último preset salvo, com histórico de gerações; bloqueado enquanto faltar preset.

**Architecture:** Funções puras (status dos presets, nomes) + orquestrador `gerarZipPlanosCidade` com dependências injetáveis (testável sem navegador), uma tabela de histórico no Supabase e um painel React acima da listagem. Gera no navegador, plano a plano, reaproveitando `gerarImpressaoPlanosPdf`.

**Tech Stack:** React, Supabase (RLS), `jszip`, `pdf-lib`, vitest.

**Spec:** `docs/superpowers/specs/2026-11-17-impressao-planos-zip-rapido-design.md` (aprovado em 17/11/2026).

## Global Constraints

- **Não gerar sem preset:** o zip só libera quando todo plano disponível na cidade tem linha em `impressao_planos_modos`; nunca usar a pré-marcação automática em lote.
- Planos disponíveis = os de `listarPlanosImpressaoOrdenados` cuja `buscarCidadeIdsFiltroPlanoCredenciados(supabase, plano.id, buscarTodosPaginado)` contém a cidade.
- Nomes: PDF `<Plano> <Cidade>.pdf` (mesma sanitização de `downloadImpressaoPlanosPdf`); zip `Planos <Cidade>.zip`.
- O download rápido **não altera presets**.
- Tabela `impressao_planos_geracoes`: `id bigint identity pk`, `cidade_id integer not null → cidades(id) on delete cascade`, `plano_ids integer[] not null`, `gerado_em timestamptz not null default now()`, `gerado_por uuid → profiles(id) on delete set null`; índice `(cidade_id, gerado_em desc)`; RLS: select para `authenticated`; insert com `emer_pode_escrever_modulo(array['planos.']::text[], array['planos.view']::text[])` e `gerado_por = auth.uid()`; `grant select, insert … to authenticated` e uso da sequence.
- Preset "mais novo que o zip" = `modo.atualizado_em > geracao.gerado_em` (última da cidade).
- Só registrar a geração depois de entregar o zip. **Aplicar a migração no Supabase só quando o usuário pedir.** Não commitar sem pedido. Depois de mexer em código: `graphify update .`.

## Review Focus

- Cidade sem nenhum plano disponível → painel informa e botão fica desativado (zip vazio nunca).
- Preset salvo com `selecao` vazia (`{}`) → conta como preset existente, mas avisar "preset vazio" é fora do escopo; teste garante que não quebra.
- Falha no 3º de 4 planos → para, informa qual plano falhou, não baixa zip parcial e não registra histórico.
- Duplo clique em "Baixar todos" → botão desativado durante a geração; só uma execução.
- Registro do histórico falha (sem permissão de gravação) → o zip já foi entregue; mostrar aviso, sem erro fatal.
- Nome de cidade/plano com `/ \ : * ? " < > |` → arquivo com nome sanitizado.

---

### Task 1: Migração e acesso ao histórico

**Files:**
- Create: `supabase/migrations/20261117120000_impressao_planos_geracoes.sql`
- Create: `src/lib/impressaoPlanos/geracoesZipPlanos.js`
- Modify: `src/lib/impressaoPlanos/modoImpressaoPlanos.js` (nova função)

**Interfaces:**
- Produces:
  - `listarModosDaCidade(cidadeId: number): Promise<Array<{ planoId: number, selecao: object, atualizadoEm: string, atualizadoPor: string|null, atualizadoPorNome: string|null }>>`
  - `buscarUltimaGeracaoZip(cidadeId: number): Promise<{ geradoEm: string, geradoPor: string|null, geradoPorNome: string|null, planoIds: number[] } | null>`
  - `registrarGeracaoZip(cidadeId: number, planoIds: number[]): Promise<void>` (usa `auth.getSession()` para `gerado_por`)

- [ ] **Step 1:** Escrever a migração conforme Global Constraints, no estilo de `20261029120000_impressao_planos_modos.sql` (create if not exists, RLS, policies `…_leitura_logado` e `…_insert_permissao`, grants).
- [ ] **Step 2:** Implementar as três funções com o cliente `supabase` de `src/lib/supabase.js`; nome do autor via `profiles.name` como `buscarModoImpressaoPlanos` faz.
- [ ] **Step 3:** `npx eslint` nos arquivos. (Sem teste automatizado: dependem do banco; coberto pela verificação manual da Task 5.)

### Task 2: Funções puras (status e nomes)

**Files:**
- Create: `src/lib/impressaoPlanos/statusZipPlanos.js`
- Create: `src/lib/impressaoPlanos/statusZipPlanos.test.js`
- Modify: `src/lib/impressaoPlanos/gerarImpressaoPlanosPdf.js` (extrair `nomeArquivoImpressaoPlanosPdf`; `downloadImpressaoPlanosPdf` passa a usá-la)

**Interfaces:**
- Produces:
  - `nomeArquivoImpressaoPlanosPdf(planoNome: string, cidadeNome: string): string` → `"<Plano> <Cidade>.pdf"` sanitizado (mesma regra atual; fallback `Plano Cidade.pdf`)
  - `nomeArquivoZipPlanos(cidadeNome: string): string` → `"Planos <Cidade>.zip"` sanitizado
  - `calcularStatusZipPlanos({ planosDisponiveis, modos, ultimaGeracao }): { linhas: Array<{ planoId, planoNome, modo: object|null, semPreset: boolean, maisNovoQueZip: boolean }>, podeGerar: boolean, motivoBloqueio: string|null }`

- [ ] **Step 1: Write the failing tests** (`statusZipPlanos.test.js`):
  - `nomeArquivoImpressaoPlanosPdf('Básico', 'São/Paulo: SP')` → `'Básico São Paulo SP.pdf'`;
  - `nomeArquivoZipPlanos('Caxias do Sul')` → `'Planos Caxias do Sul.zip'`;
  - 4 planos, 4 modos → `podeGerar: true`, `motivoBloqueio: null`;
  - 4 planos, 3 modos → `podeGerar: false`, `motivoBloqueio` cita o plano sem preset, essa linha com `semPreset: true`;
  - 0 planos disponíveis → `podeGerar: false`, motivo "Nenhum plano disponível nesta cidade";
  - `modo.atualizadoEm` posterior a `ultimaGeracao.geradoEm` → `maisNovoQueZip: true`; sem `ultimaGeracao` → `false` em todas.
- [ ] **Step 2: Run** `npx vitest run src/lib/impressaoPlanos/statusZipPlanos.test.js` → FAIL.
- [ ] **Step 3: Implement** as três funções; `gerarImpressaoPlanosPdf.js` importa `nomeArquivoImpressaoPlanosPdf` e o download individual mantém o mesmo nome de arquivo de hoje.
- [ ] **Step 4: Run** os testes → PASS; `npx eslint` limpo.

### Task 3: Orquestrador do zip

**Files:**
- Create: `src/lib/impressaoPlanos/gerarZipPlanosCidade.js`
- Create: `src/lib/impressaoPlanos/gerarZipPlanosCidade.test.js`

**Interfaces:**
- Consumes: `nomeArquivoImpressaoPlanosPdf`, `nomeArquivoZipPlanos` (Task 2); `aplicarSelecaoModo` (`modoImpressaoPlanos.js`).
- Produces: `gerarZipPlanosCidade(params, deps?): Promise<{ blob: Blob, nomeZip: string, planoIds: number[] }>` com
  - `params: { cidadeTabelaId, municipioNome, incluirCidadesParalelas, planosLista, planosDisponiveis: Array<{id, nome, chave}>, modos: Array<{planoId, selecao}>, onProgresso?: (atual: number, total: number, planoNome: string) => void }`
  - `deps` (padrão = implementações reais): `carregarLinhas`, `resolverObservacoes`, `gerarPdf` (assinaturas das funções reais usadas hoje em `ImpressaoPlanos.jsx`), `criarZip` (`() => new JSZip()`).
  - Lança `Error` com mensagem `"Plano <nome> sem preset salvo"` se algum disponível não tiver modo; lança `Error("Falha ao gerar <plano>: <mensagem>")` na falha de um plano (sem zip parcial).

- [ ] **Step 1: Write the failing tests** com `deps` falsas:
  - 2 planos com modo → zip com 2 arquivos `<Plano> <Cidade>.pdf`, `onProgresso` chamado `(1,2,…)` e `(2,2,…)`, planos processados na ordem recebida;
  - cada `gerarPdf` recebe `categorias` já com a seleção do preset aplicada (`checked` conforme `selecao`);
  - plano sem modo → rejeita com a mensagem de preset, `gerarPdf` nunca chamado;
  - `gerarPdf` falha no 2º → rejeita com `"Falha ao gerar <2º plano>: …"`.
- [ ] **Step 2: Run** `npx vitest run src/lib/impressaoPlanos/gerarZipPlanosCidade.test.js` → FAIL.
- [ ] **Step 3: Implement** sequencialmente (um plano por vez; fluxo por plano = `carregarLinhas` → `aplicarSelecaoModo` → `resolverObservacoes` → `gerarPdf` com `comprimir` inexistente), `zip.generateAsync({ type: 'blob' })`.
- [ ] **Step 4: Run** os testes → PASS; `npx eslint` limpo.

### Task 4: Painel na tela

**Files:**
- Create: `src/pages/Planos/ImpressaoPlanos/PainelZipPlanos.jsx`
- Modify: `src/pages/Planos/ImpressaoPlanos/ImpressaoPlanos.jsx` (renderizar o painel quando `cidadeTabelaId` existe, acima da listagem; calcular `planosDisponiveis`)
- Modify: `src/pages/Planos/ImpressaoPlanos/ImpressaoPlanos.css` (estilos do painel)

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces: `<PainelZipPlanos cidadeTabelaId municipioNome cidadeNome incluirCidadesParalelas planosLista planosDisponiveis onRevisar={(planoId) => void} />`.

- [ ] **Step 1:** Em `ImpressaoPlanos.jsx`, calcular `planosDisponiveis` (Global Constraints) quando `cidadeTabelaId` muda, usando `planosImpressao` já existente.
- [ ] **Step 2:** Implementar o painel: carrega `listarModosDaCidade` e `buscarUltimaGeracaoZip`; mostra uma linha por plano (preset "atualizado em DD/MM HH:mm por X" ou "Sem preset — revisar" + botão "Revisar"; selo "preset novo depois do zip" quando `maisNovoQueZip`); rodapé com "Último zip: …" ou "nunca gerado"; botão "Baixar todos (.zip)" desativado com `motivoBloqueio` visível; barra "Plano N de M — <nome>" via `onProgresso`; erros em mensagem inline.
- [ ] **Step 3:** "Revisar" chama `onRevisar(planoId)` → a tela define `planoId` e dispara `carregarLista` (fluxo atual); depois de salvar preset, o painel recarrega os status (nova prop de "versão" ou callback `aoSalvarModo`).
- [ ] **Step 4:** Ao concluir: baixar o blob (`<a download>`), então `registrarGeracaoZip`; se o registro falhar, aviso "zip baixado, mas o histórico não foi gravado".
- [ ] **Step 5: Verificar** `npx eslint`, `npx vite build`; tela mobile (≤ 1023 px) sem quebrar.

### Task 5: Aplicar migração e verificação ponta a ponta

- [ ] **Step 1:** **Perguntar ao usuário** antes de aplicar `20261117120000_impressao_planos_geracoes.sql` no projeto Emerdog-SuperTool (Supabase); aplicar via MCP só com o OK.
- [ ] **Step 2:** Com a migração aplicada, simular insert/select como o usuário (transação com `rollback`) para confirmar a RLS.
- [ ] **Step 3:** Rodar o app: (a) cidade sem preset em algum plano → botão bloqueado com motivo; (b) criar o preset faltante → botão libera; (c) baixar o zip → conferir arquivos, nomes e conteúdo (presets respeitados); (d) painel mostra "Último zip" e, após editar um preset, o selo "preset novo depois do zip".
- [ ] **Step 4:** `npx vitest run`, `npx eslint src`, `npx vite build`, `graphify update .`.
