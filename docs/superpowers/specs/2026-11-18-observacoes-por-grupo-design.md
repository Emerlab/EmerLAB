# Observações por grupo nos PDFs de Planos e Honorários

Data: 18/11/2026 · Tamanho: projeto (migração em 2 tabelas, 2 telas de cadastro, 2 bibliotecas de observações, 2 geradores de PDF, bloco compartilhado)

## Intenção
Hoje as observações vinculadas a procedimentos saem todas juntas nas páginas do fim do PDF. A equipe quer o mesmo comportamento do PDF de Descontos: **ao final de cada grupo**, dentro do cartão, um bloco "Informações" com as observações ligadas aos procedimentos daquele grupo; na **última página** ficam só as observações **gerais** (valem para o PDF todo). Para isso o cadastro precisa permitir marcar uma observação como **GERAL**.

## Objetivos
- Campo explícito `geral` no cadastro de observações de **Planos** e de **Honorários** (tabelas `planos_observacoes` e `honorarios_observacoes`).
- Telas de cadastro: caixa "Observação geral (vai na última página)"; marcada, o vínculo com procedimentos deixa de ser obrigatório/oculta o seletor; a lista mostra a etiqueta "Geral".
- PDF: bloco "Informações" no fim do cartão de cada grupo, com as observações ativas ligadas a procedimentos **marcados** daquele grupo; cada observação aparece só no **primeiro grupo** (na ordem do PDF) em que se aplica.
- Última página/páginas dinâmicas: apenas observações **gerais** ativas. Sem nenhuma geral → mantém as páginas fixas do modelo (comportamento de hoje quando não há observações).
- Observação vinculada a procedimentos não impressos continua não saindo (como hoje).

## Não objetivos / anti-objetivos
- Não mudar o PDF de Descontos (já tem o bloco).
- Não unificar as duas telas de cadastro em um componente (edição paralela, nenhuma reescrita).
- Observação geral **não** aparece dentro dos grupos; observação vinculada **não** aparece na última página.
- Não repetir o mesmo texto em dois grupos.

## Abordagens consideradas
- **A — coluna `geral` + bloco dentro do cartão (escolhida).**
- B — bloco fora do cartão (mais simples, diferente da imagem de referência).
- C — "geral" via código especial `*` no vínculo, sem coluna (sem migração, mas truque que confunde os dados).

## Design
**Banco** (migração, aplicada só com OK do usuário): `alter table … add column if not exists geral boolean not null default false` em `planos_observacoes` e `honorarios_observacoes`. Não há função de gravação no banco (o código cai no caminho manual), então nada mais muda lá. Arquivo em `supabase/migrations/` + rollback.

**Bibliotecas** (`src/lib/impressaoPlanos/planosObservacoes.js`, `src/lib/impressaoHonorarios/honorariosObservacoes.js`):
- `mapearObservacao` passa a ler `geral`; os selects incluem `geral` (com tolerância se a coluna ainda não existir: tratar como `false`, sem quebrar a tela antes da migração).
- `salvarPlanosObservacao`/`salvarHonorariosObservacao`: aceita `geral`; se `geral`, **não** exige vínculo e grava sem vínculos (apaga os existentes); se não geral, mantém "vincule ao menos um procedimento".
- Nova função de resolução por grupo (pura sobre a lista já carregada, com a parte de banco isolada): `resolverObservacoesPorGrupo(grupos, observacoes)` → `{ porGrupo: Array<Array<{titulo, mensagem}>>, gerais: Array<{titulo, mensagem}> }`, na ordem `ordem`/`id`; grupo = categoria (Planos) ou seção (Honorários) com os códigos dos procedimentos marcados; cada observação vai para o primeiro grupo que tiver algum dos códigos vinculados.

**PDF** (módulo compartilhado `src/lib/pdf/blocoInformacoesPdf.js`, extraído do que o Descontos já faz — `medirBlocoInformacoes`/`desenharInformacoes` — para uso nos três geradores, sem alterar a saída do Descontos): o bloco entra depois da última linha do grupo, dentro do cartão (separador azul-claro, título "Informações" em negrito centralizado, itens numerados "1- …", mesmas fontes/cores do estilo compartilhado). A paginação trata o bloco como parte do grupo: se não couber no resto da página, o cartão continua na página seguinte com o título do grupo repetido e o bloco lá. A cálculo de fim de cartão e o cursor `y` do grupo passam a incluir a altura do bloco.
- `gerarImpressaoPlanosPdf` recebe `observacoesPorGrupo` e `observacoesGerais`; `gerarImpressaoHonorariosPdf` idem. As páginas dinâmicas do fim (já existentes em `observacoesModeloPdf.js`) recebem só as gerais; sem gerais → páginas fixas do modelo.
- A tela de impressão e o orquestrador do zip passam a chamar a nova resolução (o zip usa a mesma função do download individual).

## Constraints
- Estilo e valores visuais: os do plano de estilo compartilhado (azul `#1E3148`, zebra `#FCFCFC`, raio 14, Montserrat).
- Bloco "Informações" fica **dentro** do cartão arredondado e respeita `CARD_PADDING_BOTTOM`.
- Migração só aplicada com aprovação explícita; as telas/PDF devem funcionar (com `geral=false`) antes dela.
- Branch: `feat/observacoes-por-grupo` na pasta principal do usuário. Sem commit/push além do necessário ao fluxo; depois de mexer em código: `graphify update .`.

## Deixado ao implementador
Textos exatos da caixa/etiqueta, estilo CSS dos controles novos, nomes internos, organização dos testes.

## Riscos a cobrir em teste
- Observação ligada a procedimentos de dois grupos → só no primeiro.
- Grupo sem observações → nenhum bloco, cartão idêntico ao atual.
- Observação geral inativa ou vinculada a procedimento desmarcado → não sai.
- Bloco que não cabe na página → continuação correta, sem texto cortado.
- Coluna `geral` ausente no banco → telas e PDF funcionam como hoje.
