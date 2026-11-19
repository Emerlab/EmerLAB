# Último modo gerado — honorários por cidade — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Salvar, ao baixar o PDF de honorários de uma cidade, o modo usado (ordem/ativação dos grupos e marcações) e restaurá-lo na próxima abertura do modal daquela cidade.

**Architecture:** Tabela `impressao_honorarios_modos` (um registro por cidade, compartilhado), biblioteca com funções puras de snapshot/aplicação + acesso ao Supabase no padrão do Planos, integração no modal da Supertabela → Cidades.

**Tech Stack:** React, Supabase, vitest.

**Spec:** `docs/superpowers/specs/2026-11-18-honorarios-modo-cidade-design.md` (decisão do usuário: salvar ao baixar o PDF).

## Global Constraints

- Worktree `C:/Users/loopy/Documents/GitHub/Emerdog_SFSC_SUPERTOOL-obs`, branch `feat/honorarios-modo-cidade`; `node_modules` é junção; `npx vitest run <arquivo>` funciona aí.
- Tabela `impressao_honorarios_modos`: `id bigint generated always as identity primary key`, `cidade_id integer not null unique references public.cidades(id) on delete cascade`, `selecao jsonb not null default '{}'::jsonb`, `atualizado_em timestamptz not null default now()`, `atualizado_por uuid references public.profiles(id) on delete set null`. RLS: select para `authenticated` (`using (true)`); insert e update com `(select public.emer_pode_escrever_modulo(array['supertabela.']::text[], array['supertabela.edit']::text[]))` (update também em `with check`); sem policy de delete; `grant select, insert, update on … to authenticated` e `grant usage, select on sequence …_id_seq to authenticated`. Migração em `supabase/migrations/20261118140000_impressao_honorarios_modos.sql` (mesmo estilo de `20261029120000_impressao_planos_modos.sql`, idempotente) e rollback em `supabase/migrations/rollback/20261118140000_impressao_honorarios_modos.rollback.sql`. **Não aplicar a migração nem tocar o Supabase ao vivo** (o usuário/Cursor aplica).
- Formato de `selecao`: `{ "v": 1, "ordemCategorias": [catId, …], "categorias": { "<catId>": { "ativa": boolean, "linhas": { "<codigo>": boolean } } } }` (codigos como `String`).
- Regras de aplicação: reordenar pela `ordemCategorias`; categorias ausentes do modo → fim da ordem atual, ativas; `ativa`/`checked` ausentes → `true`; códigos/categorias salvos que não existem mais → ignorados; `selecao` vazia/inválida → categorias inalteradas.
- Salvar **somente** depois de gerar e baixar o PDF com sucesso; falha ao salvar (sem permissão, tabela ausente) não impede nada e mostra aviso discreto; tabela ausente ao buscar → sem modo, sem erro.
- A ordenação de colunas da tela não entra no modo. O PDF de Honorários não muda.
- Commits terminam com `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; depois de mexer em código: `graphify update .`.

## Review Focus

- Procedimento/categoria novo depois do modo → entra marcado/ativo, categoria nova ao fim (teste na Task 1).
- Procedimento/categoria removido → ignorado sem erro (teste na Task 1).
- `selecao` `{}`/inválida → tudo como hoje (teste na Task 1).
- Tabela inexistente (código `42P01`/mensagem "does not exist") → buscar devolve `null`; salvar devolve erro tratável sem lançar para fora do download (teste na Task 1 com `vi.mock` do cliente).
- Trocar de cidade com o modal já usado → aplica o modo da cidade nova e não o da anterior; resultado tardio de busca não sobrescreve edição do usuário (cuidado na Task 2).

---

### Task 1: Migração e biblioteca

**Files:**
- Create: `supabase/migrations/20261118140000_impressao_honorarios_modos.sql`, `supabase/migrations/rollback/20261118140000_impressao_honorarios_modos.rollback.sql`
- Create: `src/lib/impressaoHonorarios/modoImpressaoHonorarios.js`, `src/lib/impressaoHonorarios/modoImpressaoHonorarios.test.js`

**Interfaces:**
- Produces (exports de `modoImpressaoHonorarios.js`), com `categorias` no formato do modal (`[{ id, nome, ativa, linhas: [{ codigo, checked, … }] }]`):
  - `montarSelecaoDeCategorias(categorias): { v: 1, ordemCategorias, categorias }`
  - `aplicarSelecaoModo(categorias, selecao): categorias` (nova lista; não muta a entrada)
  - `buscarModoImpressaoHonorarios(cidadeId): Promise<null | { selecao, atualizadoEm, atualizadoPor, atualizadoPorNome }>` — `null` se não há registro **ou** a tabela não existe; outros erros lançam
  - `salvarModoImpressaoHonorarios(cidadeId, categorias): Promise<{ selecao, atualizadoEm, atualizadoPor, atualizadoPorNome }>` — upsert por `cidade_id` com `atualizado_por` = usuário da sessão; lança em erro
  - `rotuloModoImpressaoHonorarios(modo): string` — "Último PDF: salvo <quando> · por <nome>" ou "Ainda sem modo salvo para esta cidade." (quando = "agora", "há N min", "há N h" ou data/hora pt-BR, como `rotuloModoImpressao` do Planos)

- [ ] **Step 1: Write the failing tests** (`modoImpressaoHonorarios.test.js`): (a) `montarSelecaoDeCategorias` produz `v`, `ordemCategorias` na ordem recebida, `ativa` e `linhas` por código; (b) `aplicarSelecaoModo` reordena, aplica `ativa`/`checked`; (c) categoria nova (não está no modo) vai para o fim e ativa; procedimento novo entra `checked: true`; (d) categoria/código removido é ignorado; (e) `selecao` `{}`, `null` e inválida devolvem as categorias iguais; (f) não muta a entrada; (g) `buscarModoImpressaoHonorarios` devolve `null` quando o cliente (mock via `vi.mock` do módulo supabase, como em `src/lib/impressaoPlanos/planosObservacoes.geral.test.js`) retorna erro `{ code: '42P01' }`, devolve o objeto mapeado quando há linha e **lança** para erro de permissão; (h) `salvarModoImpressaoHonorarios` faz `upsert` com `onConflict: 'cidade_id'`, grava `atualizado_por` da sessão e `selecao` montada; lança em erro; (i) `rotuloModoImpressaoHonorarios(null)` e com data.
- [ ] **Step 2: Run** `npx vitest run src/lib/impressaoHonorarios/modoImpressaoHonorarios.test.js` → FAIL.
- [ ] **Step 3: Implement** a biblioteca (padrão de `src/lib/impressaoPlanos/modoImpressaoPlanos.js`) e as duas migrações.
- [ ] **Step 4: Run** os testes → PASS; `npx eslint src/lib/impressaoHonorarios`.

### Task 2: Modal e tela

**Files:**
- Modify: `src/components/Supertabela/ModalImpressaoHonorariosCidade.jsx` (props, efeito de abertura, `baixarPdf`, linha de indicação), `src/pages/Supertabela/Supertabela_cidades/Supertabelacidades.jsx` (~L2189: passar `cidadeId`) e o CSS do modal se necessário (`Supertabelacidades.css` ou o CSS que o modal já usa)

**Interfaces:**
- Consumes: Task 1.
- Produces: prop `cidadeId` no `ModalImpressaoHonorariosCidade` (number | string | '').

- [ ] **Step 1:** Efeito de abertura: ao abrir com `cidadeId`, buscar o modo (cancelável; ignorar resposta se o modal fechou, a cidade mudou ou o usuário já alterou categorias desde a abertura), aplicar `aplicarSelecaoModo` sobre `montarCategoriasIniciais(secoes)` e guardar `modoInfo` para a indicação; falha na busca → seguir sem modo e sem erro visível. Resetar `modoInfo` ao fechar/trocar de cidade.
- [ ] **Step 2:** `baixarPdf`: depois de `downloadImpressaoHonorariosPdf(...)` com sucesso (antes de `onClose`), chamar `salvarModoImpressaoHonorarios(cidadeId, <todas as categorias, ativas e inativas, na ordem atual>)` dentro de try/catch isolado; em erro, `onErro?.('PDF gerado, mas o modo da cidade não foi salvo.')` sem abortar nem reabrir o fluxo. Não salvar sem `cidadeId`.
- [ ] **Step 3:** Linha de indicação no modal (perto do título/contagem) com `rotuloModoImpressaoHonorarios(modoInfo)`; `Supertabelacidades.jsx` passa `cidadeId={cidadeId}`.
- [ ] **Step 4: Verificar** `npx eslint src/components/Supertabela src/pages/Supertabela`, `npx vite build`, `npx vitest run`; revisão por leitura dos pontos de corrida (cidade trocada, edição durante a busca, salvar só depois do download).

### Task 3: Migração e verificação (usuário)

- [ ] **Step 1:** O usuário/Cursor aplica `20261118140000_impressao_honorarios_modos.sql`; o controlador só confirma por consultas de leitura (colunas, policies, grants) e simulando insert/select numa transação com rollback.
- [ ] **Step 2:** Verificação manual: abrir o modal de uma cidade, desmarcar procedimentos, desativar um grupo, reordenar, baixar o PDF; fechar e reabrir: o modo volta; abrir outra cidade: começa limpo; usuário somente leitura baixa o PDF sem erro.
