# Último modo gerado — impressão de honorários por cidade

Data: 18/11/2026 · Tamanho: pequeno (1 tabela, 1 biblioteca, 1 modal)

## Intenção
No modal "Imprimir honorários" da **Supertabela → Cidades**, hoje tudo começa zerado a cada abertura (todos os procedimentos marcados, todos os grupos ativos, ordem original). A equipe quer que o modal reabra **como foi gerado da última vez** para aquela cidade, como já existe no Planos (`impressao_planos_modos`).

## Decisões do usuário (18/11/2026)
- **Quando salvar:** ao **baixar o PDF** com sucesso (é o "último modo gerado"). Abrir/fechar o modal ou marcar/desmarcar não grava nada.
- Compartilhado pela equipe, um registro por cidade.

## O que é o "modo"
Para a cidade: (a) ordem dos grupos (categorias), (b) grupo ativo/inativo, (c) por procedimento, marcado ou não. A ordenação de colunas da tela (`ordenColuna/ordenDir`) **não** faz parte (é só visual, não altera o PDF).

## Design
**Tabela** `impressao_honorarios_modos` (migração, aplicada pelo usuário/Cursor): `id bigint identity pk`, `cidade_id integer not null unique → cidades(id) on delete cascade`, `selecao jsonb not null default '{}'`, `atualizado_em timestamptz not null default now()`, `atualizado_por uuid → profiles(id) on delete set null`. RLS no padrão de `impressao_planos_modos`: leitura para `authenticated`; insert/update exigem `emer_pode_escrever_modulo(array['supertabela.']::text[], array['supertabela.edit']::text[])` (a tela é da Supertabela); sem delete. Grants e sequence como no Planos. Rollback em `supabase/migrations/rollback/`.

**Formato de `selecao`:** `{ "v": 1, "ordemCategorias": [catId…], "categorias": { "<catId>": { "ativa": true, "linhas": { "<codigo>": true|false } } } }`.

**Biblioteca** `src/lib/impressaoHonorarios/modoImpressaoHonorarios.js`: funções puras `montarSelecaoDeCategorias(categorias)` e `aplicarSelecaoModo(categorias, selecao)`; acesso `buscarModoImpressaoHonorarios(cidadeId)` e `salvarModoImpressaoHonorarios(cidadeId, categorias)` (upsert por `cidade_id`, autor = usuário da sessão, nome do autor via `profiles.name` como no Planos).
- `aplicarSelecaoModo`: reordena as categorias pela `ordemCategorias`; categorias ausentes do modo (novas) vão para o fim na ordem atual e entram **ativas**; `ativa`/`checked` ausentes → `true` (procedimento novo entra marcado, como no Planos); códigos/categorias salvos que não existem mais são ignorados.
- Se a tabela ainda não existe (migração não aplicada): buscar devolve `null` e salvar falha **sem quebrar o PDF**.

**Modal** (`ModalImpressaoHonorariosCidade.jsx`): nova prop `cidadeId`; ao abrir busca o modo da cidade e aplica sobre as categorias iniciais (antes de o usuário mexer; se o usuário já mexeu durante o carregamento, o modo não sobrescreve); linha de indicação "Último PDF: salvo <quando> · por <nome>" (ou "Ainda sem modo salvo para esta cidade."); em `baixarPdf`, **depois** de gerar e baixar o PDF com sucesso, salva o modo atual (grupos ativos e inativos, ordem e marcações) — se o salvamento falhar (sem permissão, tabela ausente) mostra um aviso discreto via `onErro`/mensagem "PDF gerado, mas o modo não foi salvo" e não impede nada. `Supertabelacidades.jsx` passa `cidadeId`.

## Não objetivos
Sem salvamento automático ao marcar; sem alterar o PDF de Honorários; sem tela de histórico; Descontos e o Honorários por prestador não mudam.

## Riscos a cobrir em teste
- Procedimento/categoria novo depois do modo salvo → entra marcado/ativo, ao fim da ordem.
- Procedimento/categoria removido da tabela → ignorado sem erro.
- Modo salvo inválido/vazio (`{}`) → comportamento de hoje (tudo marcado).
- Tabela inexistente → buscar `null`; salvar não quebra o download.
- Abrir o modal de outra cidade → aplica o modo daquela cidade (sem vazar o da anterior).
