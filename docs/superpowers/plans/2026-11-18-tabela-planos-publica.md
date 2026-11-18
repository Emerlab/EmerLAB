# Tabela de planos pública (site + API) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar a API pública `/v1/planos/*` (filtros, tabela por cidade+plano, prestadores por procedimento) e a página interativa `/tabela-planos` que a consome, com preset de impressão "site" na fase 2.

**Architecture:** Regras puras em `src/lib/apiV1/` (testáveis sem banco), carga de dados com cliente `admin` e cache de 5 min em `api/_lib/apiV1/`, rotas registradas no roteador `/v1` existente sob o novo escopo `planos:ler`. A página usa um cliente único da API e sorteia os prestadores no navegador.

**Tech Stack:** React, Vite, Supabase (service role no servidor), vitest, Testing Library, OpenAPI 3.1.

**Spec:** `docs/superpowers/specs/2026-11-18-tabela-planos-publica-design.md` (aprovado em 18/11/2026).

## Global Constraints

- Somente `SELECT` no servidor, via `admin`; colunas listadas uma a uma (padrão de `api/_lib/apiV1/redeDados.js`). **Não aplicar migração** nem tocar o Supabase ao vivo sem aprovação do usuário (Task 9).
- Código servidor **não importa** módulos que importam `src/lib/supabase.js` (cliente do navegador): `buscarQuemRealizaPrestadores.js`, `carregarLinhasImpressaoPlanos.js`, `mapaRealizadoresRegiao.js`, `contagemRealizadoresPlanosDev.js`. Podem ser importados os puros: `planosHierarquia.js`, `categoriaLimitesGrupo.js` (sem imports), `formatarCamposPlano.js`, `redeRegras.js`.
- Escopo novo `planos:ler`; cabe na chave do tipo `rede` junto de `rede:ler`. Chaves existentes não ganham o escopo sozinhas.
- Mesmo envelope de erro da `/rede` (`ErroApi(status, codigo, mensagem)`), `Cache-Control: public, s-maxage=300, stale-while-revalidate=3600`, valores em reais como número, JSON UTF-8. Códigos: `cidade_invalida`, `plano_invalido`, `procedimento_invalido` (400); `plano_indisponivel_na_cidade`, `procedimento_nao_encontrado` (404).
- "Cidade alternativa" = incluir cidades paralelas, sempre ligado: o prestador conta na cidade pelo endereço principal ou pela lista `cidades_atende` (regra de `montarCredenciados` + `cidadeCasa` em `redeRegras.js`).
- Seleção de procedimentos, nesta ordem: preset `site` → modo `impressao` → regra de **3 ou mais realizadores** (`MIN_REALIZADORES_PRE_MARCAR = 3`). Procedimento sem realizador nunca aparece; "apenas loja" nunca aparece.
- Prestador na resposta: somente `id`, `nome`, `especialidade_principal`, `cidade_principal`, `contatos` (`telefone`, `celular`, `whatsapp_url`), `endereco` (`{ texto }` só para tipo Local, senão `null`), `nome_alternativo`. Nada além. Teto de 100 por procedimento, ordem por nome.
- Antes das migrações (`geral`, `finalidade`) a API funciona: leitura refaz o `select` sem a coluna ausente (erro `42703` ou mensagem citando a coluna) e trata o valor como padrão (`geral=false`, só `impressao`).
- Mensagens de commit terminam com `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Depois de mexer em código: `graphify update .`. Testes: `npx vitest run <arquivo>` (no vitest da pasta principal pode falhar por motivo ambiental; usar worktree com `node_modules` ligado, como no plano de observações).
- O protótipo `src/pages/Publico/TabelaPlanosPublico/` e a rota em `src/App.jsx` ainda não estão commitados: entram no commit da Task 7.

## Review Focus

- Cidade com planos mas nenhum procedimento selecionável → `GET /tabela` devolve `grupos: []` (não 500) e a página mostra o vazio com convite ao WhatsApp (Tasks 3 e 8).
- Procedimento com menos de 4 prestadores → todos aparecem, sem repetir nem pedir mais (Task 7); com 0 → lista vazia e convite ao WhatsApp (Tasks 4 e 8).
- Observação ligada só a procedimentos não exibidos, inativa ou sem mensagem → não sai (Task 3).
- Busca digitada com acento, caixa diferente ou termo popular ("RAIO X", "castracao") acha o procedimento (Tasks 2 e 8).
- Nenhum campo fora da lista permitida nas três respostas, mesmo que o banco devolva CPF/PIX/e-mail (Task 5).

---

### Task 1: Escopo `planos:ler`

**Files:**
- Modify: `src/lib/apiV1/chaves.js` (`ESCOPOS`), `src/lib/apiV1/chavesAdminRegras.js` (`ESCOPOS_POR_TIPO.rede`)
- Test: `src/lib/apiV1/chaves.test.js`, `src/lib/apiV1/chavesAdminRegras.test.js`

**Interfaces:**
- Produces: `ESCOPOS` inclui `'planos:ler'`; `ESCOPOS_POR_TIPO.rede` é `['rede:ler', 'planos:ler']`. O escopo padrão de chave nova do tipo `rede` continua `['rede:ler']` (primeiro item).

- [ ] **Step 1: Write the failing tests:** (a) `autorizarChave` com `escopos: ['rede:ler','planos:ler']` e origem permitida autoriza `{ escopo: 'planos:ler' }`; (b) chave só com `rede:ler` pedindo `planos:ler` → `403 escopo_insuficiente`; (c) validação de criação aceita `escopos: ['rede:ler','planos:ler']` no tipo `rede` e rejeita `planos:ler` no tipo `pag`; (d) `tipoDosEscopos(['planos:ler'])` é `'rede'`.
- [ ] **Step 2: Run** `npx vitest run src/lib/apiV1/chaves.test.js src/lib/apiV1/chavesAdminRegras.test.js` → FAIL.
- [ ] **Step 3: Implement** as duas listas. Conferir se a tela de chaves (`chavesAdminApi.js` e a página em Administrativo > API) lista escopos de uma fonte própria; se sim, incluir o rótulo "Tabela de planos (leitura)".
- [ ] **Step 4: Run** os testes → PASS. Commit.

### Task 2: Sinônimos e termos de busca

**Files:**
- Create: `src/lib/apiV1/planosSinonimos.js`, `src/lib/apiV1/planosSinonimos.test.js`

**Interfaces:**
- Produces:
  - `TERMOS_POPULARES: string[]` — inicial: `['Consulta','Vacina','Raio X','Ultrassom','Castração','Exame de sangue','Cirurgia']`.
  - `sinonimosDoProcedimento(nome: string, codigo: string): string[]` — sinônimos curados cujo gatilho aparece (sem acento, caixa ignorada) no nome do procedimento.
  - `montarTermosProcedimento({ nome, codigo, nomesAlternativos }): string[]` — união sem repetição de sinônimos e nomes alternativos distintos do nome base, já normalizados (minúsculas, sem acento).
  - `normalizarBusca(texto: string): string` — minúsculas, sem acento, espaços colapsados.
- Tabela curada inicial (gatilho → termos): `radiografia` → `raio x`, `rx`, `radiografico`; `castracao` → `castrar`, `esterilizacao`; `ultrassonografia` → `ultrassom`, `eco`, `ultra som`; `hemograma` → `exame de sangue`, `sangue`; `vacina` → `imunizacao`.

- [ ] **Step 1: Write the failing tests:** `sinonimosDoProcedimento('Radiografia simples','IMG001')` contém `'raio x'`; `'Castração macho'` contém `'esterilizacao'`; nome sem gatilho → `[]`; `montarTermosProcedimento` descarta nome alternativo igual ao nome base (ignorando acento/caixa) e não repete; `normalizarBusca('  RAIO   X ')` é `'raio x'`.
- [ ] **Step 2: Run** `npx vitest run src/lib/apiV1/planosSinonimos.test.js` → FAIL.
- [ ] **Step 3: Implement** o módulo (sem dependências do navegador).
- [ ] **Step 4: Run** → PASS. Commit.

### Task 3: Regras da tabela pública

**Files:**
- Create: `src/lib/impressaoPlanos/limiteExibicaoPlanos.js` (extrai `resolverLimiteExibicao`, hoje local em `carregarLinhasImpressaoPlanos.js:32`, para um módulo puro; o loader passa a importá-lo)
- Create: `src/lib/apiV1/planosRegras.js`, `src/lib/apiV1/planosRegras.test.js`
- Test: rodar também `src/lib/impressaoPlanos/gerarImpressaoPlanosPdf.test.js` e `baselineSemObservacoes.test.js` (não podem quebrar)

**Interfaces:**
- Consumes: `montarTermosProcedimento` (Task 2); `mapearPlanos`, `obterChavePlanoPorId`, `procedimentoPertenceAoPlanoSelecionado`, `procedimentoPlanoBaseApenasLoja` (`planosHierarquia.js`); `montarMapaLimiteGrupoPorCategoria`, `resolverLimiteGrupoExibicao`, `textoCelulaLimiteGrupo` (`categoriaLimitesGrupo.js`); `formatarTextoCampoPlano`.
- Produces:
  - `codigosMarcados(selecao: Record<string, boolean> | null): Set<string> | null` — `null` se `selecao` nula/vazia; senão códigos (maiúsculos) de chaves `COD|…` com valor `true`.
  - `escolherSelecao({ modoSite, modoImpressao }): { origem: 'site'|'impressao'|'padrao', codigos: Set<string>|null }`.
  - `montarTabelaPublica(entrada): TabelaPublica` com `entrada = { cidade: {id,nome,uf}, planoId: number, planos: Array<{id,nome}>, categorias: Array<{id,nome,usa_limite_grupo}>, procedimentos: Array<{id,codigo,nome,categoria_id,plano_base_id}>, diferencaPorCodigo: Map<string, number>, configPorCodigo: Map<string,{limite:string,carencia:string}>, limitesGrupo: object[], realizadoresPorCodigo: Map<string, number[]>, nomesAlternativosPorCodigo: Map<string,string[]>, modoSite, modoImpressao, observacoes: Array<{id,titulo,mensagem,ativa,geral,ordem,codigosProcedimentos}> }`.
  - `TabelaPublica = { cidade, plano: {id,chave,nome}, origem_selecao, grupos: Array<{ id: number, nome: string, limite_grupo: string|null, procedimentos: Array<{ codigo, nome, carencia: string|null, limite: string|null, diferenca: number, realizadores: number, termos: string[], observacoes: number[] }> }>, observacoes: Record<string, {id,titulo,mensagem,geral}>, observacoes_gerais: number[] }`.
- Regras: grupo vazio some; procedimento "apenas loja" ou sem realizador some; sem seleção salva vale `realizadores >= MIN_REALIZADORES_PRE_MARCAR` (constante local `3`); ordem de procedimentos por código; ordem de grupos pela de `categorias`; `limite` do procedimento via `resolverLimiteExibicao` (respeita limite de grupo e a exceção do procedimento 23); observação não-geral entra só se algum procedimento exibido a referencia; geral ativa sempre vai em `observacoes_gerais`; inativa ou sem mensagem nunca sai; `diferenca` é número em reais.

- [ ] **Step 1: Write the failing tests** (`planosRegras.test.js`): (a) `escolherSelecao` prefere site, depois impressão, depois `padrao`; (b) com modo salvo marcando `A1|base`, só `A1` aparece mesmo com outros ≥3 realizadores; (c) sem modo, aparece quem tem ≥3 realizadores e não quem tem 2; (d) procedimento marcado mas com 0 realizadores não aparece; (e) "apenas loja" não aparece; (f) categoria sem procedimento exibido some; (g) limite de grupo da categoria substitui o individual e o procedimento 23 usa o individual; (h) observação ligada a `A1` e `B1` com só `A1` exibido: sai uma vez, em `A1`; ligada só a não exibidos: não sai; geral ativa vai em `observacoes_gerais` mesmo com vínculos; inativa e mensagem vazia não saem; (i) nome alternativo "Raio-X" vira termo em `termos`; (j) cidade sem nenhum procedimento selecionável → `grupos: []`.
- [ ] **Step 2: Run** `npx vitest run src/lib/apiV1/planosRegras.test.js` → FAIL.
- [ ] **Step 3: Implement** `limiteExibicaoPlanos.js` (mover a função sem mudar comportamento; `carregarLinhasImpressaoPlanos.js` importa dela) e depois `planosRegras.js`.
- [ ] **Step 4: Run** `npx vitest run src/lib/apiV1/planosRegras.test.js src/lib/impressaoPlanos` → PASS; `npx eslint src/lib/apiV1 src/lib/impressaoPlanos`. Commit.

### Task 4: Regras de filtros e de prestadores

**Files:**
- Modify: `src/lib/apiV1/redeRegras.js` (exportar `cidadeCasa` e acrescentar `atendeMunicipios`)
- Create: `src/lib/apiV1/planosFiltrosRegras.js`, `src/lib/apiV1/planosFiltrosRegras.test.js`

**Interfaces:**
- Consumes: `montarCredenciados(base)`, `resolverPlanoId`, `normalizarMunicipio`, `paraPublico`-style campos (`redeRegras.js`); `TERMOS_POPULARES` (Task 2).
- Produces:
  - `atendeMunicipios(credenciado, municipios: Array<{nome,uf}>): boolean` em `redeRegras.js` (principal ou `cidadesAtende` casando por `cidadeCasa`).
  - `municipiosDaCidadeTabela(base, cidadeId: number): Array<{nome,uf}>` — a cidade da tabela de valores mais os `municipiosVinculo` dela (mesma montagem interna de `montarCredenciados`).
  - `montarFiltrosPublicos(base): { cidades: Array<{ id, nome, uf, planos: Array<{ id, chave, nome }> }>, termos_populares: string[] }` — só cidades com ao menos um plano em `planosCidade`; planos pela hierarquia (sem "apenas loja"), ordem `ORDEM_PLANOS`; cidades por nome.
  - `realizadoresPorCodigo(credenciados, municipios): Map<string, number[]>` — ids de credenciados que atendem os municípios, por código de procedimento.
  - `prestadoresDoProcedimento(credenciados, municipios, codigo): { total: number, prestadores: PrestadorPublico[] }` — `PrestadorPublico` conforme Global Constraints; corte em 100, `total` é a contagem sem corte.

- [ ] **Step 1: Write the failing tests:** (a) `atendeMunicipios` casa por cidade principal e por `cidades_atende`, e não por cidade de outra UF; (b) cidade vinculada (ex.: "Porto Alegre e Região") entra nos municípios; (c) `montarFiltrosPublicos` omite cidade sem plano e nunca lista plano "apenas loja"; (d) `prestadoresDoProcedimento` devolve só credenciados ativos com o código vinculado, ordenados por nome, com `endereco: null` para tipo não Local; (e) o objeto de saída tem **exatamente** as chaves permitidas (teste de lista fechada, usando prestador com `cpf_cnpj`, `chave_pix`, `email` no cadastro); (f) com 120 elegíveis, `prestadores.length === 100` e `total === 120`; (g) `nome_alternativo` vem do vínculo do próprio prestador com o código.
- [ ] **Step 2: Run** `npx vitest run src/lib/apiV1/planosFiltrosRegras.test.js` → FAIL.
- [ ] **Step 3: Implement.** Reaproveitar o que `montarCredenciados` já calcula (`cidadePrincipal`, `cidadesAtende`, `procedimentos`, contatos, `temLocal`, `endereco`); não reimplementar a regra de cidade.
- [ ] **Step 4: Run** a nova suíte e `npx vitest run src/lib/apiV1/redeRegras.test.js src/lib/apiV1/redeRotas.test.js` (não podem quebrar) → PASS. Commit.

### Task 5: Carga de dados, cache e rotas

**Files:**
- Create: `api/_lib/apiV1/planosDados.js`, `api/_lib/apiV1/planosRotas.js`, `src/lib/apiV1/planosRotas.test.js`
- Modify: `api/_lib/apiV1/indiceRotas.js` (acrescentar `() => import('./planosRotas.js')`)

**Interfaces:**
- Consumes: `carregarBaseRede(admin)` (reutiliza prestadores/cidades/planos/procedimentos/categorias), regras das Tasks 3 e 4, `registrarRota`, `ErroApi`.
- Produces: `carregarBasePlanos(admin): Promise<{ planosCidade: Array<{plano_id,cidade_id,procedimento_cod,diferenca}>, planosConfig: Array<{plano_id,procedimento,limite,carencia}>, limitesGrupo: object[], modos: Array<{plano_id,cidade_id,finalidade,selecao}>, observacoes: Array<{id,titulo,mensagem,ativa,geral,ordem,codigosProcedimentos}> }>` com cache de 5 min e a mesma política de `redeDados.js` (junta chamadas em voo, não guarda falha, serve a última base boa); `limparCachePlanos()` para testes. Rotas (escopo `planos:ler`): `GET /planos/filtros`, `GET /planos/tabela`, `GET /planos/prestadores`.
- Parâmetros: `cidade` (id numérico), `plano` (id ou chave, via `resolverPlanoId`), `procedimento` (código; maiúsculas e espaços ignorados).

- [ ] **Step 1: Write the failing tests** (`planosRotas.test.js`, seguindo a estrutura de `redeRotas.test.js`: `api_chaves` falsa com `escopos: ['planos:ler']` e origem permitida, tabelas em memória): (a) sem escopo `planos:ler` → 403 `escopo_insuficiente`; (b) `/planos/filtros` 200 com `Cache-Control` e `termos_populares`; (c) `/planos/tabela?cidade=1&plano=basico` devolve grupos conforme a seleção; `plano` inexistente → 400 `plano_invalido`; cidade sem o plano → 404 `plano_indisponivel_na_cidade`; `cidade=abc` → 400 `cidade_invalida`; (d) `/planos/prestadores?cidade=1&procedimento=CON-001` devolve `total` e lista; código desconhecido → 404 `procedimento_nao_encontrado`; código válido sem realizadores → 200 `total: 0`; (e) **contrato**: percorrer recursivamente as três respostas e falhar se aparecer qualquer chave fora da lista permitida ou qualquer valor `000.000.000-00`, `segredo-pix` ou `interno@emerlab.com`; (f) leitura de `planos_observacoes` com erro `42703` na coluna `geral` repete sem a coluna e a API responde normalmente; (g) leitura de `impressao_planos_modos` sem a coluna `finalidade` repete sem ela, trata tudo como `impressao`; (h) duas chamadas seguidas fazem uma única leitura de cada tabela.
- [ ] **Step 2: Run** `npx vitest run src/lib/apiV1/planosRotas.test.js` → FAIL.
- [ ] **Step 3: Implement** o loader (colunas listadas; `todas()` paginado como em `redeDados.js`; observações com `planos_observacoes_procedimentos(procedimento_codigo)`) e as rotas (handlers finos: validar parâmetros, montar entradas, chamar as regras). `modoSite` vem da linha `finalidade='site'` e `modoImpressao` da `impressao` (ou da linha sem coluna `finalidade`).
- [ ] **Step 4: Run** `npx vitest run src/lib/apiV1` → PASS (incluindo `roteador.test.js`; `openapi.test.js` vai falhar até a Task 6, que é esperado e fecha lá). Commit.

### Task 6: Documentação e OpenAPI

**Files:**
- Create: `docs/api/planos.md`
- Modify: `docs/api/README.md` (linha na tabela de APIs e menção ao escopo), `docs/api/openapi.json` (3 rotas, esquemas, escopo), página `/docs` se `scripts/api-docs-gerar.mjs` exigir regenerar
- Test: `src/lib/apiV1/openapi.test.js`

**Interfaces:**
- Consumes: formatos das Tasks 3 e 4.

- [ ] **Step 1: Run** `npx vitest run src/lib/apiV1/openapi.test.js` → FAIL (rotas novas sem documentação).
- [ ] **Step 2: Escrever** o guia para quem não conhece o EmerLAB: visão geral, autenticação (chave da rede com `planos:ler`), as 3 rotas com parâmetros e erros, exemplo curl e fetch, fluxo recomendado (carregar filtros → tabela ao escolher cidade/plano → prestadores ao clicar), receita do sorteio no navegador (embaralhar e fatiar 4–5; "sortear outros" sem repetir) e a nota sobre cache de 5 min. Exemplos só com dados fictícios e chave `emer_rede_EXEMPLO_NAO_E_UMA_CHAVE`.
- [ ] **Step 3: Atualizar** `openapi.json` e o README.
- [ ] **Step 4: Run** `npx vitest run src/lib/apiV1` → PASS. Commit.

### Task 7: Cliente da API, mock alinhado e sorteio

**Files:**
- Create: `src/lib/apiV1/planosPublicosApi.js`, `src/lib/apiV1/planosPublicosApi.test.js`, `src/lib/apiV1/sortearPrestadores.js`, `src/lib/apiV1/sortearPrestadores.test.js`
- Modify: `src/pages/Publico/TabelaPlanosPublico/mockTabelaPlanos.js` (formato idêntico ao da API, com observações e prestadores de exemplo)
- Commit também: protótipo `src/pages/Publico/` e a rota em `src/App.jsx`

**Interfaces:**
- Produces:
  - `criarClientePlanos({ baseUrl, chave, fetchImpl }): { filtros(), tabela({cidade, plano}), prestadores({cidade, procedimento}) }` — Promises com o JSON; erro de rede/HTTP vira `Error` com `.codigo` e `.status`; cache de sessão em `Map` por parâmetros; `clientePlanosPadrao()` lê `import.meta.env.VITE_API_PLANOS_URL` e `VITE_API_PLANOS_KEY` e devolve `null` se faltarem (modo demonstração) e o mock é servido por `criarClientePlanosMock()` com a mesma interface.
  - `sortearPrestadores(lista, { quantidade = 5, excluirIds = [], aleatorio = Math.random }): { sorteados: PrestadorPublico[], restantes: number }` — Fisher–Yates; `quantidade` entre 4 e 5 (usa 5 se houver ≥5 disponíveis, senão todos); ignora `excluirIds`; quando os não vistos acabam, recomeça do conjunto completo sem repetir dentro do mesmo sorteio.

- [ ] **Step 1: Write the failing tests:** cliente envia `X-Api-Key`, monta a query certa, reaproveita o cache na segunda chamada e propaga `codigo` do erro; `sortearPrestadores`: 10 elegíveis → 5 distintos; 3 elegíveis → 3; 0 → `[]`; com `excluirIds` não repete; esgotados os não vistos recomeça; com `aleatorio` injetado o resultado é determinístico.
- [ ] **Step 2: Run** `npx vitest run src/lib/apiV1/planosPublicosApi.test.js src/lib/apiV1/sortearPrestadores.test.js` → FAIL.
- [ ] **Step 3: Implement** os dois módulos e ajustar o mock ao formato da Task 3/4.
- [ ] **Step 4: Run** → PASS. Commit.

### Task 8: Página `/tabela-planos`

**Files:**
- Modify: `src/pages/Publico/TabelaPlanosPublico/TabelaPlanosPublico.jsx` e `.css`
- Create: `src/pages/Publico/TabelaPlanosPublico/PainelProcedimento.jsx`, `BuscaProcedimentos.jsx`, `TabelaPlanosPublico.test.jsx`

**Interfaces:**
- Consumes: `clientePlanosPadrao`/`criarClientePlanosMock` e `sortearPrestadores` (Task 7); `normalizarBusca` (Task 2); `linkWhatsapp` (`repasseCore.js`); kit `ek-*` / `tp_*`.
- Produces: rota pública já registrada em `src/App.jsx`; estado na URL (`?cidade=&plano=&q=`).

- [ ] **Step 1: Write the failing tests** (Testing Library, cliente mock injetável por prop `cliente`): (a) carrega filtros, escolher cidade e plano mostra a tabela e grava `?cidade=&plano=` na URL; (b) digitar "raio x" mostra a Radiografia (via `termos`) agrupada, sem paginação por grupo; "CASTRACAO" acha "Castração macho"; sem resultado mostra o vazio com botão de WhatsApp; (c) clicar num atalho de termo popular preenche a busca; (d) clicar numa linha abre o painel com carência/limite/diferença, as observações ligadas e 5 prestadores sorteados (aleatório injetado); "Sortear outros" mostra outros e não repete; com 3 elegíveis mostra 3 e esconde o botão; com 0 mostra o convite ao WhatsApp; (e) o WhatsApp flutuante está sempre no documento, desabilitado com dica antes de cidade+plano, e com o painel aberto o `href` contém o nome do procedimento; (f) `Esc` fecha o painel e devolve o foco à linha; (g) erro da API mostra "Tentar de novo" que repete a chamada; (h) observações gerais aparecem em bloco no fim da tabela; (i) sem env/cliente a página mostra a faixa "dados de exemplo".
- [ ] **Step 2: Run** `npx vitest run src/pages/Publico` → FAIL.
- [ ] **Step 3: Implement** conforme seção 5 do spec: busca sempre visível com atalhos, resultados multi-grupo com trecho destacado, grupos em acordeão com barra de chips, linhas clicáveis, painel (folha inferior no celular, lateral no desktop, foco preso, `aria-modal`), marcador de observação por linha, esqueleto de carregamento, última cidade em `localStorage` dentro de try/catch, `prefers-reduced-motion`. Ao terminar, abrir a página no navegador (modo demonstração, largura de celular e de desktop) e conferir a olho; registrar o que viu.
- [ ] **Step 4: Run** `npx vitest run src/pages/Publico` → PASS; `npx eslint src/pages/Publico`. Commit. **Fim da fase 1** (funciona sem nenhuma migração).

### Task 9: Preset `site` — migração e bibliotecas

**Files:**
- Create: `supabase/migrations/20261118140000_impressao_planos_modos_finalidade.sql` e `.rollback.sql` (mesmo local e estilo de `20261118120000_observacoes_geral.sql`)
- Modify: `src/lib/impressaoPlanos/modoImpressaoPlanos.js`
- Test: `src/lib/impressaoPlanos/modoImpressaoPlanos.finalidade.test.js` (cliente Supabase com `vi.mock`)

**Interfaces:**
- Produces: `buscarModoImpressaoPlanos(planoId, cidadeId, finalidade = 'impressao')`, `listarModosDaCidade(cidadeId, finalidade = 'impressao')`, `salvarModoImpressaoPlanos(planoId, cidadeId, categorias, finalidade = 'impressao')` (`upsert` com `onConflict: 'plano_id,cidade_id,finalidade'`), `copiarModoParaFinalidade(planoId, cidadeId, de, para)`.
- Migração: `finalidade text not null default 'impressao' check (finalidade in ('impressao','site'))`; troca a constraint `impressao_planos_modos_plano_cidade_uq` por `unique (plano_id, cidade_id, finalidade)`; `comment on column`. Rollback remove as linhas `site`, restaura a constraint antiga e remove a coluna.
- Compatibilidade antes da migração: se o erro for de coluna `finalidade` ausente, `buscar`/`listar` com `finalidade='impressao'` refazem sem o filtro; `salvar` com `'impressao'` refaz o `upsert` antigo (`onConflict: 'plano_id,cidade_id'`); com `'site'` retorna erro `'Coluna finalidade ausente no banco. Aplique a migração do preset do site.'`.

- [ ] **Step 1: Write the failing tests:** parâmetro `finalidade` chega ao filtro e ao `upsert`; padrão continua `impressao`; fallback sem a coluna nos três casos acima; `copiarModoParaFinalidade` grava em `para` a seleção lida de `de`.
- [ ] **Step 2: Run** `npx vitest run src/lib/impressaoPlanos/modoImpressaoPlanos.finalidade.test.js` → FAIL.
- [ ] **Step 3: Implement** as funções e escrever as duas migrações. **Não aplicar** (pedir aprovação ao usuário antes de qualquer `apply_migration`).
- [ ] **Step 4: Run** a suíte nova e `npx vitest run src/lib/impressaoPlanos` → PASS. Commit.

### Task 10: Seletor "PDF | Site" na impressão

**Files:**
- Modify: `src/pages/Planos/ImpressaoPlanos/ImpressaoPlanos.jsx` (estado `finalidadeEdicao`, salvamento automático por finalidade), `src/lib/impressaoPlanos/modoImpressaoPlanos.js` (`rotuloModoImpressao` aceita a finalidade)
- Test: `src/pages/Planos/ImpressaoPlanos/ImpressaoPlanos.finalidade.test.jsx`

**Interfaces:**
- Consumes: funções da Task 9.
- Produces: controle segmentado "Editando: PDF | Site" no topo da seleção; botão "Copiar do PDF" (visível em "Site"); indicador de modo diz qual preset está sendo editado. **A geração do PDF e do ZIP continua usando sempre o modo `impressao`**, independente do seletor.

- [ ] **Step 1: Write the failing tests:** em "Site", marcar uma linha chama `salvarModoImpressaoPlanos(..., 'site')` (após o debounce) e nunca `'impressao'`; trocar para "PDF" recarrega a seleção do modo `impressao`; "Copiar do PDF" substitui as marcações pelas do PDF e salva como `site`; gerar PDF em "Site" usa as linhas do modo `impressao` (asserção sobre o que `gerarImpressaoPlanosPdf` recebe); sem a coluna no banco o seletor "Site" mostra o aviso da migração e fica sem salvar.
- [ ] **Step 2: Run** `npx vitest run src/pages/Planos/ImpressaoPlanos` → FAIL.
- [ ] **Step 3: Implement** preservando o salvamento automático existente (`agendarSalvarModo`/`persistirModo`/`ignorarProximoSaveModo`); cancelar o salvamento pendente ao trocar de finalidade.
- [ ] **Step 4: Run** `npx vitest run src/pages/Planos src/lib/impressaoPlanos` → PASS. Abrir a tela e conferir a troca PDF/Site e a geração do PDF. Commit.

### Task 11: API lê o preset `site`

**Files:**
- Modify: `api/_lib/apiV1/planosRotas.js` (já recebe `modoSite`; confirmar o filtro por `finalidade`), `docs/api/planos.md` (frase sobre a origem da seleção), `src/lib/apiV1/planosRotas.test.js`

**Interfaces:**
- Consumes: `escolherSelecao` (Task 3), `carregarBasePlanos` (Task 5). Resposta de `/planos/tabela` já traz `origem_selecao` (`'site' | 'impressao' | 'padrao'`).

- [ ] **Step 1: Write the failing tests:** com linhas `site` e `impressao` para a mesma cidade/plano a tabela segue o `site` e `origem_selecao === 'site'`; só `impressao` → `'impressao'`; nenhuma → `'padrao'`; preset `site` vazio (`{}`) é tratado como inexistente e cai no PDF.
- [ ] **Step 2: Run** `npx vitest run src/lib/apiV1/planosRotas.test.js` → FAIL (se algum já passar da Task 5, manter e registrar).
- [ ] **Step 3: Implement** o que faltar, atualizar o guia e o OpenAPI (`origem_selecao`).
- [ ] **Step 4: Run** `npx vitest run src/lib/apiV1` → PASS; `graphify update .`. Commit. Pedir ao usuário a aprovação para aplicar as migrações `geral` e `finalidade` no Supabase e a configuração de `VITE_API_PLANOS_URL`/`VITE_API_PLANOS_KEY` (chave criada na tela Administrativo > API com `rede:ler` e `planos:ler`).
