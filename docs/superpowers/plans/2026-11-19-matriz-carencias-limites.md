# Matriz de carências e limites — Plano de implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: superpowers:executing-plans (execução nativa escolhida pelo usuário). Os passos usam checkbox (`- [ ]`).

**Goal:** Uma tela única (Planos > "Ver carências e limites") em matriz de 4 planos × (limite, carência), com linhas vindas do catálogo, "Acima" automático abaixo do plano base e correção dos dados existentes.

**Architecture:** Regras puras em `src/lib` (testadas com banco falso em memória, `src/lib/bancoFalsoMemoria.testutil.js`), a página Planos passa a renderizar/gravar a matriz, e a página Procedimentos deixa de ter a grade da branch anterior e passa a chamar a sincronização "Acima" ao cadastrar e ao trocar o plano base.

**Tech Stack:** React (JSX), Supabase JS, Vitest (`npx vitest run`), ExcelJS (já usado).

**Spec:** `docs/superpowers/specs/2026-11-19-matriz-carencias-limites-design.md`

## Global Constraints

- Planos: Básico=`basico`, Clássico=`classico`, Avançado=`avancado`, Ultra=`ultra` (ordem de `ORDEM_PLANOS` em `src/lib/planosHierarquia.js`; ids por `mapearPlanos`). "Apenas loja" nunca vira coluna.
- Texto "Acima": exatamente `` `${nome do plano base} Acima` `` (ex.: `Avançado Acima`), nos dois campos, para cada plano abaixo do plano base.
- Procedimento com plano base "Apenas loja": as 4 colunas são editáveis, sem "Acima", com a etiqueta "Loja" (já existente: `supertabelaplanos_flag_loja`).
- Do plano base para cima: editável. Abaixo: somente leitura, derivado (o valor exibido é calculado, não lido do banco).
- Limite de grupo: o texto vem de `textoCelulaLimiteGrupo(limite, categoriaNome)` (`categoriaLimitesGrupo.js`); procedimento isento (`procedimentoIsentoLimiteGrupo`, id 23) usa limite individual. Limite de grupo por plano = linha de `categoria_limites_grupo` com `limite` não vazio, categoria com `usa_limite_grupo`.
- Edição só com `edicaoAtiva` e fora de somente leitura; todo salvar respeita `somenteLeitura`/`bloquearSeSomenteLeitura`.
- A matriz nunca apaga linhas de `planos_config` (nem "Limpar": só grava `''`).
- Gravar sempre pelo `gravarPlanoConfig` (`src/lib/planosConfigCompat.js`), que aceita campo parcial (campo `undefined` não é alterado).
- Comparação de códigos sem distinguir caixa; gravar em maiúsculas.
- Textos de interface em português; 4 espaços, sem ponto e vírgula. Commits terminam com `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Trabalhar no worktree `../Emerdog_SFSC_SUPERTOOL-matriz` (branch `feat/matriz-carencias-limites`). Adicionar arquivos por caminho (nunca `git add -A`; `graphify-out/` fica de fora).
- Aplicar a migração de dados no banco real SÓ com confirmação explícita do usuário (Task 6).

## Review Focus

1. Procedimento com plano base Básico: nenhuma célula "Acima" e nenhuma linha "Acima" escrita. (Task 1)
2. Troca de plano base para mais baixo (Avançado→Clássico): células do Clássico que ainda dizem "Avançado Acima" são zeradas; para mais alto, o plano que ficou abaixo recebe o novo "Acima". (Task 1)
3. Valor que parece "Acima" digitado de propósito num plano editável e só num dos campos: NÃO é zerado (só o par limite+carência "Acima" é considerado velho). (Task 1)
4. Colar mais colunas/linhas que a matriz tem, ou colar em célula "Acima"/de grupo: ignora o excedente e as células não editáveis, sem erro. (Task 2)
5. Falha ao gravar uma célula: o valor digitado volta ao último gravado e aparece aviso; as outras células seguem funcionando. (Task 4)
6. Busca/filtro "Só vazios" com categoria de limite de grupo: limite vazio coberto por grupo não conta como vazio. (Tasks 2 e 4)

---

### Task 1: Regras "Acima" e sincronização por procedimento

**Files:**
- Modify: `src/lib/procedimentoLimitesCarencias.js`
- Modify: `src/lib/procedimentoLimitesCarencias.test.js`

**Interfaces:**
- Consumes: `gravarPlanoConfig` (`planosConfigCompat.js`); `obterChavePlanoPorId`, `ORDEM_PLANOS`, `CHAVE_PLANO_APENAS_LOJA` (`planosHierarquia.js`).
- Produces (todas exportadas):
  - `planoIdsAplicaveis(planoBaseId, mapaPlanos) => number[]` — **muda**: "Apenas loja" devolve os 4 ids da hierarquia (antes `[]`); demais casos como hoje.
  - `textoAcima(nomePlanoBase: string) => string`
  - `ehParAcima(limite, carencia) => boolean` — verdadeiro só se os dois (após trim, sem caixa) terminam em `" acima"`.
  - `planoIdsAbaixoDaBase(planoBaseId, mapaPlanos) => number[]` — ids da hierarquia antes do plano base; `[]` para Básico, "Apenas loja" ou desconhecido.
  - `diagnosticarAcima(proc: { codigo, planoBaseId }, ctx: { mapaPlanos, planos: Array<{id, nome}>, indiceConfigs }) => Array<{ planoId: number, tipo: 'faltando' | 'divergente' | 'acima-velho', limite: string, carencia: string }>` — `limite`/`carencia` = valores a gravar (o texto "Acima" para faltando/divergente; `''` para acima-velho).
  - `sincronizarAcimaProcedimento(supabase, { codigo, planoBaseId, mapaPlanos, planos }) => Promise<{ erros: Array<{ planoId: number, mensagem: string }> }>`
- Remove (após Task 4 não usadas): ver Task 3.

- [ ] **Step 1: Testes** (mapa e planos como no teste existente; banco falso de `bancoFalsoMemoria.testutil.js`):
  - `planoIdsAplicaveis: Apenas loja → [1,2,3,4]` (substitui o teste antigo que esperava `[]`; ajustar também `calcularPendencias: Apenas loja como plano base`, que passa a esperar as pendências dos 4 planos sem linhas).
  - `textoAcima('Avançado') === 'Avançado Acima'`.
  - `ehParAcima('Avançado Acima','avançado acima')` true; `ehParAcima('Avançado Acima','45 Dias')` false (Review Focus 3); `ehParAcima('', '')` false.
  - `planoIdsAbaixoDaBase`: base 3 → `[1,2]`; base 1 → `[]`; base 5 (loja) → `[]` (Review Focus 1).
  - `diagnosticarAcima`: base Avançado sem linhas → `faltando` nos planos 1 e 2 com `limite`/`carencia` = `'Avançado Acima'`; linha do plano 2 com `'Clássico Acima'` → `divergente`; linha do plano 3 com `'Clássico Acima'/'Clássico Acima'` → `acima-velho` com `''`; linha do plano 3 só com carência "Clássico Acima" → nada (Review Focus 3); procedimento tudo certo → `[]`.
  - `sincronizarAcimaProcedimento`: base Avançado, banco vazio → cria 2 linhas (planos 1 e 2) com `Avançado Acima`; troca de base Avançado→Clássico (banco tem planos 1,2 "Avançado Acima", chamada com `planoBaseId` do Clássico) → plano 1 vira `Clássico Acima`, plano 2 fica `''/''` (Review Focus 2); base Básico → nenhuma chamada de escrita (`db.chamadas` sem `insert`/`update`); falha simulada (`falhar`) no plano 1 não impede o plano 2 e vem em `erros`.
- [ ] **Step 2:** `npx vitest run src/lib/procedimentoLimitesCarencias.test.js` — esperado: FALHA nos testes novos/alterados.
- [ ] **Step 3: Implementar** as funções acima em `procedimentoLimitesCarencias.js`. `sincronizarAcimaProcedimento` busca as linhas do código (`select('id, plano_id, procedimento, limite, carencia')` com `in('procedimento', variantes)`), indexa com `indexarPlanosConfig`, chama `diagnosticarAcima` e grava cada item com `gravarPlanoConfig({ planoId, procedimento: codigo, limite, carencia })`, coletando erros como em `salvarLimitesCarenciasProcedimento`.
- [ ] **Step 4:** rodar o teste — esperado: PASSA.
- [ ] **Step 5: Commit** — `feat(carencias): regras e sincronização do "Acima" abaixo do plano base`.

### Task 2: Modelo da matriz e colagem (puro)

**Files:**
- Create: `src/lib/matrizCarenciasLimites.js`
- Create: `src/lib/matrizCarenciasLimites.test.js`

**Interfaces:**
- Consumes: `indexarPlanosConfig`, `limiteGrupoAtivoNoPlano`, `planoIdsAplicaveis`, `planoIdsAbaixoDaBase`, `textoAcima` (Task 1); `procedimentoIsentoLimiteGrupo`, `textoCelulaLimiteGrupo` (`categoriaLimitesGrupo.js`); `obterChavePlanoPorId`, `CHAVE_PLANO_APENAS_LOJA` (`planosHierarquia.js`).
- Produces:
  - `CHAVES_PLANOS_MATRIZ = ['basico','classico','avancado','ultra']`
  - tipo `Celula = { planoId: number, configId: number | null, limite: string, carencia: string, modo: 'editavel' | 'acima', limiteGrupo: string }`
  - tipo `LinhaMatriz = { codigo, procedimento, categoriaId, procedimentoId, planoBaseId, apenasLoja: boolean, celulas: Record<'basico'|'classico'|'avancado'|'ultra', Celula | null> }` (`null` se o plano não existe no mapa)
  - `montarLinhasMatriz({ procedimentos, configRows, planos, mapaPlanos, categorias, limitesGrupoRows }) => LinhaMatriz[]` — `procedimentos` = linhas de `procedimentos` (`id, codigo, nome, categoria_id, plano_base_id`); ordenadas por categoria e código. Célula abaixo do base: `modo: 'acima'`, `limite = carencia = textoAcima(nome do base)`, `configId` da linha real (se houver). Célula editável: valores de `configRows` (`''` se não há linha, `configId` null), `limiteGrupo` = texto do limite de grupo ativo se não isento, senão `''`.
  - `linhaTemPendencia(linha: LinhaMatriz) => boolean` — alguma célula `editavel` com carência em branco, ou limite em branco sem `limiteGrupo` (texto só com espaços = em branco).
  - `distribuirColagemMatriz({ linhas, linhaInicial, chaveInicial, campoInicial, texto }) => Array<{ linhaIndex: number, chave: string, campo: 'limite' | 'carencia', valor: string }>` — colunas achatadas `[basico.limite, basico.carencia, classico.limite, …, ultra.carencia]`; divide `texto` por linhas (`\r` removido, linhas vazias descartadas) e tabs; descarta valores vazios (`trim`), células fora da matriz, células `modo !== 'editavel'`, células nulas e limite com `limiteGrupo`.
  - `valoresExportacaoLinha(linha: LinhaMatriz, categoriaNome: string) => string[]` — 8 textos na ordem das colunas achatadas; célula nula → `''`; limite de grupo → `textoCelulaLimiteGrupo`; demais → valor da célula.
- [ ] **Step 1: Testes** com o mapa de 5 planos: base Avançado → Básico/Clássico `acima` com `'Avançado Acima'`, Avançado/Ultra `editavel`; base Básico → 4 `editavel`; loja → 4 `editavel` e `apenasLoja` true; linha de `planos_config` em caixa diferente (`out2-005`) preenche a célula; célula com grupo ativo (categoria com `usa_limite_grupo` e limite `'10'` no plano) tem `limiteGrupo '10'`, e `procedimentoId 23` tem `''`; `linhaTemPendencia`: carência vazia → true, limite vazio coberto por grupo → false (Review Focus 6), tudo preenchido → false, células só `acima` → false; `distribuirColagemMatriz`: colar `'5\t60 Dias\n8\t45 Dias'` a partir de Clássico.limite em 2 linhas gera 4 itens (Clássico e Avançado) e ignora o que cai em célula `acima` (Review Focus 4); excedente além do Ultra é ignorado; linhas vazias e `\r` tratados; `valoresExportacaoLinha` devolve 8 strings com grupo e "Acima".
- [ ] **Step 2:** `npx vitest run src/lib/matrizCarenciasLimites.test.js` — esperado: FALHA (módulo inexistente).
- [ ] **Step 3: Implementar** o módulo.
- [ ] **Step 4:** rodar — esperado: PASSA.
- [ ] **Step 5: Commit** — `feat(carencias): modelo puro da matriz de carências e limites`.

### Task 3: Procedimentos — sincronizar "Acima" e remover a grade anterior

**Files:**
- Modify: `src/pages/Supertabela/Supertabela_procedimentos/Supertabelaprocedimentos.jsx` (cadastro em `inserirNovoProcedimento`; troca de plano base em `atualizarPlanoBaseProcedimento`)
- Modify: `src/pages/Supertabela/Supertabela_procedimentos/Supertabelaprocedimentos.css` (remover as classes `supertabelaprocedimentos_grade*`, `_modal*`, `_pendente`, `_filtro_pendentes`, `_acao_limites`)
- Delete: `GradeLimitesCarencias.jsx`, `EditorLimitesCarenciasModal.jsx` (mesma pasta)
- Modify: `src/lib/procedimentoLimitesCarencias.js` e `.test.js` (remover `calcularPendencias`, `calcularPendenciasDasLinhas`, `salvarLimitesCarenciasProcedimento` e os testes delas; o que sobra: `planoIdsAplicaveis`, `indexarPlanosConfig`, `limiteGrupoAtivoNoPlano`, as funções "Acima")

**Interfaces:**
- Consumes: `sincronizarAcimaProcedimento` (Task 1).

- [ ] **Step 1:** Remover da página tudo que a branch anterior acrescentou: imports dos dois componentes e de `calcularPendencias…`/`salvarLimites…`, estados `planosConfigRows`, `filtrarPendentes`, `editorLimites`, `salvandoLimites`, `novoLimitesCarencias`, o fetch de `planos_config` em `carregarBase` (e `errPlanosConfig`), `procedimentoId` em `linhas` (mantido apenas se algo mais usar; senão remover e voltar o `select` ao original), memos `contextoPendencias`/`pendenciasPorCodigo`, filtro em `linhasFiltradas`, helpers (`nomePlanoLimites`, `planosAplicaveisDaLinha`, `limiteGrupoPorPlano`, `textoPendencias`, `recarregarPlanosConfig`, `abrirEditorLimites`, `salvarEditorLimites`), a grade no formulário, o chip "Pendentes", o selo, o botão "Limites", o modal e as larguras de coluna (voltar a `['11%', '32%', '14%', '16%', '14%', '8%']`). Referência do estado original: `git show 8594b56:src/pages/Supertabela/Supertabela_procedimentos/Supertabelaprocedimentos.jsx`.
- [ ] **Step 2:** Em `inserirNovoProcedimento`, depois do insert em `procedimentos` e antes de `carregarBase()`, chamar `sincronizarAcimaProcedimento(supabase, { codigo, planoBaseId, mapaPlanos, planos })`; se `erros.length`, após `carregarBase()` mostrar `Procedimento criado, mas não foi possível gravar "Acima" em: <planos>. Corrija na matriz de carências e limites.`
- [ ] **Step 3:** Em `atualizarPlanoBaseProcedimento`, depois de gravar o novo `plano_base_id` com sucesso e antes do fim, chamar a mesma sincronização com o novo `planoBaseId`; erros viram `mostrarErroToast` (sem reverter a troca de base).
- [ ] **Step 4:** Rodar `npx vitest run` (suíte inteira, verde) e `npx vite build` — esperado: sem erros.
- [ ] **Step 5: Commit** — `refactor(procedimentos): sincroniza "Acima" no cadastro e na troca de plano base; remove a grade anterior`.

### Task 4: Planos — visão de carências e limites em matriz

**Files:**
- Modify: `src/pages/Supertabela/Supertabela_planos/Supertabelaplanos.jsx` (visão `modoLimitacoes`: `buscarLinhasLimitacoes` ~522, `inserirPlanoConfigParaCodigo` ~697, `preencherProcedimentosMassaPlanos` ~910, `salvarLimiteCarencia`/`processarColagemLimCarencia`/`excluirPlanoConfigRow` ~1460-1575, `baixarExcelTelaPlanos` ~1285, toolbar ~2116-2250, tabela de limites ~2730-2900)
- Modify: `src/pages/Supertabela/Supertabela_planos/Supertabelaplanos.css` (cabeçalho em dois níveis, células "Acima"/grupo, aviso de divergência)

**Interfaces:**
- Consumes: `montarLinhasMatriz`, `linhaTemPendencia`, `distribuirColagemMatriz`, `CHAVES_PLANOS_MATRIZ` (Task 2); `diagnosticarAcima`, `indexarPlanosConfig`, `sincronizarAcimaProcedimento` (Task 1); `gravarPlanoConfig`.
- Estado: `linhasLimitacoes` passa a conter `LinhaMatriz[]`; sai `planoDetalheId` da visão de carências (mantido só se outra parte da página usar; remover o seletor "Plano" e `planoDetalheNome` dos textos).

- [ ] **Step 1: Dados.** `buscarLinhasLimitacoes()` carrega (em paralelo): todos os `procedimentos` (`id, codigo, nome, categoria_id, plano_base_id`, paginado), todos os `planos_config` (`id, plano_id, procedimento, limite, carencia`, paginado) e `buscarCategoriaLimitesGrupo(supabase)` sem filtro de plano; monta com `montarLinhasMatriz` usando `planosTodos`/`mapaPlanosCompleto`; guarda também `configRowsMatriz` (para `diagnosticarAcima`). Não depende de cidade nem de plano selecionado; roda ao entrar na visão.
- [ ] **Step 2: Tabela.** Para cada seção de categoria, cabeçalho em 2 níveis: `Código | Nome | Básico (Limite, Carência) | Clássico (…) | Avançado (…) | Ultra (…) | Ação`. Linha: nome com a etiqueta "Loja" quando `apenasLoja`. Célula `editavel`: input (com `edicaoAtiva`) que salva no `onBlur` só o campo editado via `gravarPlanoConfig({ planoId, procedimento: codigo, <campo> })`; sem edição, texto. Célula `acima`: texto cinza, sem input. Limite com `limiteGrupo`: texto `textoCelulaLimiteGrupo(...)` sem input (carência segue editável). Erro de gravação: `mostrarErroToast`, e o input volta ao último valor gravado (Review Focus 5); sucesso: atualiza a célula em `linhasLimitacoes` (e o `configId` se foi criada). Larguras: código 9%, nome 22%, 8 colunas de 7,5%, ação 5% (ajustar ao CSS). Ordenação por clique nas colunas Código e Nome (mantida); remover ordenação por limite/carência.
- [ ] **Step 3: Colagem.** `onPaste` nos inputs chama `distribuirColagemMatriz({ linhas: secao.linhas, linhaInicial, chaveInicial, campoInicial, texto })` e grava cada item sequencialmente com a mesma rotina de gravação do Step 2.
- [ ] **Step 4: Ação "Limpar".** Substitui o 🗑️ da visão de carências: botão (fora de somente leitura) com confirmação (`abrirConfirmacaoExclusao`, SHIFT = sem confirmação) que grava `limite: ''` e `carencia: ''` nas células `editavel` da linha que tenham linha no banco (`configId`); nada é apagado.
- [ ] **Step 5: Barra e filtros.** Na visão de carências: remover o seletor de cidade, o seletor "Plano", o toggle "Adição em massa" e as linhas "＋ Adicionar procedimento nesta categoria"; adicionar o chip "Só vazios (N)" (N = linhas com `linhaTemPendencia`) que filtra; a busca (`linhasFiltradas`) passa a incluir limite/carência de todas as células e o texto de grupo; `definirModoLimitacoes` deixa de escolher plano. Remover `inserirPlanoConfigParaCodigo` e os ramos `modoLimitacoes` de `preencherProcedimentosMassaPlanos`, `obterSugestoesProcedimentos`, `confirmarNovoProcedimentoCategoria` e `abrirExclusaoListaModal` que ficarem sem uso.
- [ ] **Step 6: Divergência "Acima".** Com `diagnosticarAcima` sobre todos os procedimentos (índice de `configRowsMatriz`), se houver itens, aviso no topo da matriz: `N procedimento(s) com "Acima" desatualizado` + botão "Corrigir" (só fora de somente leitura) que chama `sincronizarAcimaProcedimento` para cada um (sequencial, com progresso simples no texto do botão), depois recarrega a matriz e mostra erros por procedimento, se houver.
- [ ] **Step 7: Exportar.** O botão "Exportar Excel" na visão de carências não exige cidade; o nome do arquivo vira `planos-carencias-limites`; usa a Task 5.
- [ ] **Step 8: Verificar.** `npx vitest run` (verde), `npx vite build` (sem erro). Sem login não há teste de tela: registrar no ledger que a tela não foi exercitada.
- [ ] **Step 9: Commit** — `feat(planos): matriz única de carências e limites (4 planos, Acima automático)`.

### Task 5: Exportação Excel com 8 colunas

**Files:**
- Modify: `src/lib/exportSupertabelaExcel.js` (`exportarTabelaPlanosLimitesParaExcel`, linha ~171)

**Interfaces:**
- Consumes: `valoresExportacaoLinha` (Task 2). A função continua `exportarTabelaPlanosLimitesParaExcel(secoes, nomeArquivoBase)`; cada `secao` = `{ categoriaId, categoriaNome, linhas: LinhaMatriz[] }`.

- [ ] **Step 1:** Cabeçalho em 2 linhas (nome do plano mesclado sobre Limite/Carência) com colunas `Código`, `Procedimento` + 8; larguras 14, 48 e 8×16; células vindas de `valoresExportacaoLinha(linha, secao.categoriaNome)`; título da categoria mesclado em toda a largura (10 colunas). Manter `baixarWorkbook`.
- [ ] **Step 2:** `npx vite build` — esperado: sem erro. (Sem teste automatizado do arquivo gerado; a montagem dos valores está coberta na Task 2.)
- [ ] **Step 3: Commit** — `feat(carencias): exportação Excel da matriz com 8 colunas`.

### Task 6: Migração dos dados existentes (aplicar só com confirmação)

**Files:**
- Create: `supabase/migrations/20261119140000_sincronizar_acima_planos_config.sql`

- [ ] **Step 1:** Escrever a migração SQL idempotente que, para cada procedimento com `plano_base_id` entre 2 e 4, e cada plano de id menor (>=1): insere a linha em `planos_config` se não existir (`procedimento` em maiúsculas, `limite` e `carencia` = `<nome do plano base> || ' Acima'`) e atualiza as existentes cujo `limite` ou `carencia` diferem desse texto; e, para cada plano do base até o Ultra, zera (`''`) as linhas cujo `limite` E `carencia` terminam em `' Acima'` (par "Acima" velho). Procedimentos com base Básico, "Apenas loja" ou nulo não são tocados. Comentário no topo explicando a regra e os números esperados de 19/11/2026 (9 procedimentos sem linhas, 13 linhas fora do padrão).
- [ ] **Step 2:** Rodar a mesma lógica como `SELECT` (consulta só de leitura via MCP do Supabase) e registrar as contagens e a lista dos 13+ códigos afetados.
- [ ] **Step 3:** **Parar e pedir confirmação ao usuário** mostrando a lista antes de aplicar com `apply_migration`. Sem confirmação, o arquivo fica só no repositório.
- [ ] **Step 4: Commit** — `chore(carencias): migração que sincroniza o "Acima" dos dados existentes`.

### Task 7: Fechamento

- [ ] **Step 1:** `npx vitest run` e `npx vite build` verdes.
- [ ] **Step 2:** Revisão final da branch (revisor independente, modelo mais capaz), Review Focus acima verbatim; corrigir Critical/Important com teste que falha antes.
- [ ] **Step 3:** Levar os commits para `feat/api-tabela-planos` (PR 56) com `git cherry-pick`, sem push; reportar ao usuário.
