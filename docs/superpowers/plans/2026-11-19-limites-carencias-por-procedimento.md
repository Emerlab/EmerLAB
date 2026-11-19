# Limites e carências por procedimento — Plano de implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: usar superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para executar tarefa a tarefa. Os passos usam checkbox (`- [ ]`).

**Goal:** Configurar limite e carência de todos os planos de um procedimento numa grade única (no cadastro e na edição) e listar os procedimentos com configuração faltando.

**Architecture:** O modelo de dados não muda (`planos_config`: uma linha por `plano_id` + `procedimento`). Um módulo puro calcula pendências; uma função de gravação cria ou atualiza a linha de cada plano; dois componentes (grade e modal) são ligados à página `Supertabelaprocedimentos.jsx`, que ganha contador/filtro "Pendentes".

**Tech Stack:** React (JSX), Supabase JS, Vitest (`npx vitest run`). Sem Testing Library: testes só em módulos `src/lib`, com banco falso em memória (padrão de `src/lib/prestadorProcedimentos.sync.test.js`). A UI é verificada rodando o app.

**Spec:** `docs/superpowers/specs/2026-11-19-limites-carencias-por-procedimento-design.md`

## Global Constraints

- Não migrar dados: as 2.706 linhas de `planos_config` continuam como estão.
- Planos aplicáveis a um procedimento = do plano base até o Ultra (usar `obterPlanoIdsPermitidosDesdeBase` de `src/lib/planosHierarquia.js`); procedimento com plano base "Apenas loja" não tem planos aplicáveis e nunca é pendente.
- Pendente (por plano aplicável) = não existe linha em `planos_config`, ou carência em branco, ou limite em branco quando não há limite de grupo ativo para (categoria, plano). Procedimento isento (`procedimentoIsentoLimiteGrupo`, id 23) sempre exige limite individual. Texto só com espaços conta como em branco.
- Não gravar valores que o usuário não digitou: na edição, enviar só os planos cujo valor mudou; no cadastro, gravar uma linha por plano aplicável (em branco se nada foi digitado).
- Respeitar somente leitura (`somenteLeitura` / `bloquearSeSomenteLeitura`): botões de edição não aparecem; o indicador de pendência aparece para todos.
- Nunca apagar linhas de `planos_config` nesta funcionalidade.
- Comparar códigos de procedimento sem diferenciar maiúsculas/minúsculas; gravar em maiúsculas (como `inserirPlanoConfigSeNaoExiste`).
- Textos de interface em português; código segue o estilo do projeto (4 espaços, sem ponto e vírgula).
- Commits terminam com `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Trabalhar numa branch nova (`feat/limites-carencias-por-procedimento`) e **não** incluir nos commits os arquivos modificados sem relação (`graphify-out/*`, `src/lib/apiV1/*`); adicionar arquivos pelo caminho, nunca `git add -A`.

## Review Focus

1. Procedimento com `plano_base_id` nulo ou desconhecido: `obterPlanoIdsPermitidosDesdeBase` trata como Básico (4 planos); esperado: 4 planos aplicáveis, sem erro. (Task 2)
2. `planos_config.procedimento` gravado em caixa diferente (`out2-005` vs `OUT2-005`): deve contar como a mesma linha, sem duplicar nem acusar pendência falsa. (Tasks 1 e 2)
3. Limite/carência só com espaços ou `null`: conta como em branco, não como preenchido. (Task 2)
4. Gravação em lote com falha em um plano: os outros planos são gravados e o resultado lista o plano que falhou. (Task 3)
5. Procedimento criado mas gravação das configs falha: o procedimento permanece, a tela avisa e ele aparece em Pendentes. (Task 5, verificação manual)
6. Filtro "Pendentes" combinado com a busca por texto e com seções virtualizadas por categoria: a contagem de cada seção e o total continuam coerentes. (Task 5, verificação manual)

---

### Task 1: Gravar (criar ou atualizar) a configuração de um plano

**Files:**
- Modify: `src/lib/planosConfigCompat.js`
- Create: `src/lib/planosConfigCompat.test.js`

**Interfaces:**
- Produces: `gravarPlanoConfig(supabase, { planoId, procedimento, limite, carencia }) => Promise<{ status: 'criado' | 'atualizado' | 'erro', error: Error | null }>`

- [ ] **Step 1: Escrever os testes** em `planosConfigCompat.test.js`, com banco falso em memória (copiar o helper `consulta`/`db` do teste citado em Tech Stack). Testes:
  - `cria a linha em maiúsculas quando não existe` → chamada com `procedimento: 'out2-005'`, `limite: '5'`, `carencia: '30 Dias'` resulta em `status 'criado'` e uma linha `{ plano_id: 4, procedimento: 'OUT2-005', limite: '5', carencia: '30 Dias' }`.
  - `atualiza a linha existente, mesmo gravada em caixa diferente` → existente `{ plano_id: 4, procedimento: 'out2-005' }`; após a chamada, `status 'atualizado'`, continua 1 linha, com os novos valores.
  - `não mexe em outro plano` → linha do plano 3 permanece intacta.
  - `devolve erro quando o código é vazio` → `status 'erro'`, nenhuma chamada ao banco.
- [ ] **Step 2: Rodar** `npx vitest run src/lib/planosConfigCompat.test.js` — esperado: FALHA (função inexistente).
- [ ] **Step 3: Implementar `gravarPlanoConfig`** em `planosConfigCompat.js`. Reaproveitar `variantesProcedimento`; buscar `id` por `plano_id` + `in('procedimento', variantes)` com `limit(1)`; se achou, `update({ limite, carencia }).eq('id', id)`; senão `insert` com o código em maiúsculas. Se o insert falhar por duplicidade (`isDuplicateConfigError`), refazer a busca e atualizar uma vez.
- [ ] **Step 4: Rodar o teste** — esperado: PASSA. Rodar também `npx vitest run src/lib/` para garantir que nada quebrou.
- [ ] **Step 5: Commit** — `feat(planos): gravar limite e carência de um plano (criar ou atualizar)`.

### Task 2: Regras puras de pendência

**Files:**
- Create: `src/lib/procedimentoLimitesCarencias.js`
- Create: `src/lib/procedimentoLimitesCarencias.test.js`

**Interfaces:**
- Consumes: `obterPlanoIdsPermitidosDesdeBase`, `planoIdEhApenasLoja` (`planosHierarquia.js`); `categoriaUsaLimiteGrupo`, `procedimentoIsentoLimiteGrupo` (`categoriaLimitesGrupo.js`).
- Produces:
  - `planoIdsAplicaveis(planoBaseId: number | null, mapaPlanos: object) => number[]` (vazio para "Apenas loja")
  - `indexarPlanosConfig(rows: Array<{ id, plano_id, procedimento, limite, carencia }>) => Map<string, Map<number, { id: number, limite: string, carencia: string }>>` (chave = código em maiúsculas; `null` vira `''`)
  - `limiteGrupoAtivoNoPlano(categorias, limitesGrupoRows, categoriaId, planoId) => string` (texto do limite do grupo, `''` se não houver; exige `usa_limite_grupo` na categoria e linha em `limitesGrupoRows` com `limite` não vazio)
  - `calcularPendencias(proc: { codigo, categoriaId, planoBaseId, procedimentoId }, contexto: { mapaPlanos, indiceConfigs, categorias, limitesGrupoRows }) => Array<{ planoId: number, faltaLinha: boolean, faltaLimite: boolean, faltaCarencia: boolean }>` (só planos com alguma falta; ordem do plano base ao Ultra)

- [ ] **Step 1: Escrever os testes** (mapa de planos montado com `mapearPlanos` e ids 1–5 = Básico, Clássico, Avançado, Ultra, Apenas Loja):
  - `base Clássico sem nenhuma linha → pendências nos planos 2, 3 e 4, todas com faltaLinha true`
  - `tudo preenchido → []`
  - `carência em branco só no Ultra → uma pendência (plano 4) com faltaCarencia true e faltaLimite false`
  - `limite em branco sem limite de grupo → faltaLimite true`
  - `limite em branco com limite de grupo ativo no plano → faltaLimite false`
  - `procedimentoId 23 com limite de grupo ativo e limite em branco → faltaLimite true`
  - `Apenas loja como plano base → []`
  - `plano_base_id nulo → avalia os 4 planos` (Review Focus 1)
  - `código da linha em minúsculas casa com o código maiúsculo` (Review Focus 2)
  - `valor só com espaços ou null conta como em branco` (Review Focus 3)
- [ ] **Step 2: Rodar** `npx vitest run src/lib/procedimentoLimitesCarencias.test.js` — esperado: FALHA.
- [ ] **Step 3: Implementar** as quatro funções com as assinaturas acima. `planoIdsAplicaveis` remove o resultado quando `planoIdEhApenasLoja` do plano base.
- [ ] **Step 4: Rodar o teste** — esperado: PASSA.
- [ ] **Step 5: Commit** — `feat(procedimentos): regras de pendência de limite e carência`.

### Task 3: Gravação em lote por procedimento

**Files:**
- Modify: `src/lib/procedimentoLimitesCarencias.js`
- Modify: `src/lib/procedimentoLimitesCarencias.test.js`

**Interfaces:**
- Consumes: `gravarPlanoConfig` (Task 1).
- Produces: `salvarLimitesCarenciasProcedimento(supabase, { codigo: string, itens: Array<{ planoId: number, limite: string, carencia: string }> }) => Promise<{ erros: Array<{ planoId: number, mensagem: string }> }>`

- [ ] **Step 1: Escrever os testes** (banco falso, como na Task 1):
  - `grava todos os planos informados` → 3 itens, 3 linhas criadas, `erros` vazio.
  - `falha em um plano não impede os demais` → fazer `gravarPlanoConfig` falhar para o plano 3 (banco falso que retorna erro no insert desse plano); planos 2 e 4 gravados; `erros` tem exatamente `{ planoId: 3, mensagem }` (Review Focus 4).
  - `itens vazio → nenhuma chamada ao banco e erros vazio`.
- [ ] **Step 2: Rodar** — esperado: FALHA.
- [ ] **Step 3: Implementar** chamando `gravarPlanoConfig` em sequência por item, coletando erros (usar `error.message`).
- [ ] **Step 4: Rodar** — esperado: PASSA.
- [ ] **Step 5: Commit** — `feat(procedimentos): gravação em lote de limites e carências`.

### Task 4: Componentes da grade e do editor

**Files:**
- Create: `src/pages/Supertabela/Supertabela_procedimentos/GradeLimitesCarencias.jsx`
- Create: `src/pages/Supertabela/Supertabela_procedimentos/EditorLimitesCarenciasModal.jsx`
- Modify: `src/pages/Supertabela/Supertabela_procedimentos/Supertabelaprocedimentos.css` (classes com prefixo `supertabelaprocedimentos_grade_`)

**Interfaces:**
- Produces:
  - `GradeLimitesCarencias({ planos: Array<{ id: number, nome: string }>, valores: Record<number, { limite: string, carencia: string }>, onChange: (planoId: number, campo: 'limite' | 'carencia', valor: string) => void, limiteGrupoPorPlanoId: Record<number, string>, desabilitado?: boolean })` — uma linha por plano com dois inputs; o input de limite fica desabilitado com placeholder `Grupo: <valor>` quando `limiteGrupoPorPlanoId[planoId]` é não vazio (o chamador passa `{}` para procedimento isento).
  - `EditorLimitesCarenciasModal({ titulo: string, planos, valoresIniciais, limiteGrupoPorPlanoId, salvando: boolean, onSalvar: (valores: Record<number, { limite: string, carencia: string }>) => void, onFechar: () => void })` — mantém o estado local dos valores, mostra a grade e botões Salvar/Cancelar; fecha com Esc.

- [ ] **Step 1: Implementar os dois componentes** no estilo visual existente da página (inputs e botões das tabelas da própria página; olhar `Supertabelaprocedimentos.css` e o bloco de adicionar procedimento). Sem lógica de banco dentro deles.
- [ ] **Step 2: Verificar** `npx vite build` compila sem erros (os componentes ainda não estão ligados).
- [ ] **Step 3: Commit** — `feat(procedimentos): componentes da grade de limites e carências`.

### Task 5: Integração na página de Procedimentos

**Files:**
- Modify: `src/pages/Supertabela/Supertabela_procedimentos/Supertabelaprocedimentos.jsx` (carregarBase ~131; formulário de adicionar ~850-901; linha `renderLinha` e célula Ação ~1490; toolbar/filtro de busca)

**Interfaces:**
- Consumes: Tasks 2, 3 e 4 (assinaturas acima).

- [ ] **Step 1: Carregar os dados.** Em `carregarBase`, incluir `id` no select de `procedimentos` e buscar `planos_config` (`id, plano_id, procedimento, limite, carencia`) com `buscarTodosPaginado`; guardar em estado (`planosConfigRows`). Cada linha de `linhas` passa a ter `planoBaseId` (de `plano_base_id`) e `procedimentoId` (de `id`). Criar `recarregarPlanosConfig()` que refaz só a busca de `planos_config`.
- [ ] **Step 2: Calcular pendências.** `useMemo` com `indexarPlanosConfig` + `calcularPendencias` por linha → `pendenciasPorCodigo` (Map) e `totalPendentes`.
- [ ] **Step 3: Indicador e filtro.** Selo "Pendente" ao lado do nome do procedimento quando houver pendências (visível também em somente leitura, com `title` listando planos e o que falta). Botão/chip "Pendentes (N)" na barra de ferramentas alterna `filtrarPendentes`; aplicar o filtro no mesmo ponto em que `termoBusca` filtra as linhas, antes de agrupar por categoria.
- [ ] **Step 4: Editor por linha.** Na célula Ação (só quando `!somenteLeitura`), botão "Limites e carências" abre `EditorLimitesCarenciasModal` com os planos aplicáveis (`planoIdsAplicaveis`, nomes via `nomePlanoPorId`), `valoresIniciais` do índice e `limiteGrupoPorPlanoId` via `limiteGrupoAtivoNoPlano` (vazio se `procedimentoIsentoLimiteGrupo`). Ao salvar, enviar a `salvarLimitesCarenciasProcedimento` só os planos cujo valor mudou; mostrar erros por plano via `mostrarErroToast`; depois `recarregarPlanosConfig()`.
- [ ] **Step 5: Grade no cadastro.** No formulário de adicionar, mostrar `GradeLimitesCarencias` para os planos aplicáveis ao `novoProcedimento.planoBaseChave` (estado `novoLimitesCarencias`, reiniciado ao trocar o plano base ou após salvar). Depois do insert em `procedimentos`, chamar `salvarLimitesCarenciasProcedimento` com um item por plano aplicável. Se houver erros: manter o procedimento criado e avisar `Procedimento criado, mas não foi possível gravar limites e carências em: <planos>. Ele aparece em Pendentes.` Chamar `carregarBase()` como hoje.
- [ ] **Step 6: Verificar no app** (skill `run`; app em modo editor). Conferir:
  1. Contador "Pendentes" inclui OUT2-005 e os demais casos hoje incompletos (consulta de referência: procedimentos com `plano_base_id` 1–4 sem linha em algum plano aplicável; eram 5 em 19/11/2026, mais linhas com carência em branco).
  2. Abrir o editor de OUT2-005, preencher Clássico/Avançado/Ultra, salvar: o selo some e a tela por plano (Supertabelaplanos) mostra os valores.
  3. Adicionar um procedimento de teste com grade preenchida e outro com grade em branco (este entra em Pendentes); apagar os de teste depois.
  4. Em somente leitura: selo visível, sem botão de edição.
  5. Filtro Pendentes + busca por texto + categorias com muitas linhas (virtualização): contagens coerentes.
  6. Simular falha de gravação (ex.: derrubar a rede após o insert) e confirmar o aviso do Review Focus 5.
- [ ] **Step 7: Commit** — `feat(procedimentos): grade de limites e carências e filtro de pendentes`.

### Task 6: Fechamento

- [ ] **Step 1:** `npx vitest run` (suíte inteira) e `npx vite build` — esperado: tudo passa.
- [ ] **Step 2:** `graphify update .` e commitar só `graphify-out` se a convenção do repositório for versionar o grafo (conferir com `git log -- graphify-out | head`); caso contrário, não commitar.
- [ ] **Step 3:** Revisar o diff completo contra o spec (`git diff main...HEAD -- src docs`) e conferir que nenhum arquivo sem relação entrou.
