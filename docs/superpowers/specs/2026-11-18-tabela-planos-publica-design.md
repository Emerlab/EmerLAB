# Tabela de planos pública (site + API) — desenho

Data: 2026-11-18 · Estado: **aprovado em 18/11/2026** · Autor: Pedro Bossle (EmerLAB) com Claude

## 1. Intenção

Quem quer contratar um plano da Emerdog precisa ver, no site, **o que cada plano cobre na sua cidade**: procedimentos, carência, limite, diferença a pagar, as observações que se aplicam e **quem realiza cada procedimento ali**. Hoje isso só existe em PDF, gerado pela equipe.

Entrega:

1. **API pública** `/v1/planos/*` no padrão da `/v1/rede/*`, alimentada pelo EmerLAB.
2. **Página de referência** `/tabela-planos` (hoje um protótipo do Cursor com dados fictícios) refeita como experiência moderna e interativa, consumindo essa API. A equipe do site novo pode portá-la; a API é o contrato.

O visitante quer decidir com segurança e, quando decidir, falar com alguém: o **WhatsApp fica sempre à mão**.

## 2. Objetivos, não objetivos e antiobjetivos

**Objetivos**
- Escolher cidade e plano e ver a tabela sem fricção, no celular primeiro.
- Achar rápido o que as pessoas procuram ("raio x", "castração", "vacina") sem saber o nome técnico.
- Ao clicar num procedimento, ver de 4 a 5 prestadores que o realizam na cidade, **sorteados** (distribui a visibilidade entre os credenciados), com opção de sortear outros.
- Mostrar observações ligadas ao procedimento e as gerais, sem poluir a tabela.
- API estável, cacheável, versionada, documentada (OpenAPI + guia), com chave pública presa à origem.

**Não objetivos**
- Comparar planos lado a lado, checkout, cadastro de lead, login do visitante.
- Alterar a lógica de PDF, o cadastro de observações ou a rede credenciada.
- Escrita por esta API (somente leitura).

**Antiobjetivos** (falha mesmo que "funcione")
- Vazar dado interno: CPF/CNPJ, PIX, e-mail interno, situação cadastral, observações internas do prestador.
- Mostrar na web um procedimento ou valor diferente do que o PDF da mesma cidade/plano mostra, sem que isso seja decisão consciente.
- Sorteio que repete sempre os mesmos prestadores ou que quebra o cache da tabela.

## 3. Abordagem escolhida (decidida com o Pedro)

Três rotas pequenas; sorteio no navegador.

| Rota | Conteúdo | Cache |
| --- | --- | --- |
| `GET /v1/planos/filtros` | cidades com cobertura e, por cidade, os planos disponíveis; termos populares de busca | 5 min |
| `GET /v1/planos/tabela?cidade={id}&plano={id}` | grupos → procedimentos (código, nome, carência, limite, diferença, nº de realizadores), observações | 5 min |
| `GET /v1/planos/prestadores?cidade={id}&procedimento={codigo}` | prestadores que realizam o procedimento na cidade | 5 min |

Descartadas: uma rota única com tudo (resposta enorme, quase toda nunca aberta) e sorteio no servidor (cada clique sem cache, pesa no banco, sem ganho real).

## 4. Regras de negócio da API

### 4.1 Escopo e chave
- Novo escopo `planos:ler`, somente leitura. Entra em `ESCOPOS` (`src/lib/apiV1/chaves.js`) e em `ESCOPOS_POR_TIPO.rede` (`src/lib/apiV1/chavesAdminRegras.js`): a mesma chave pública do site (`emer_rede_…`, presa a origem) pode carregar `rede:ler` e `planos:ler`. Chaves existentes **não** ganham o escopo sozinhas; o administrador edita a chave na tela Administrativo > API.
- Rotas registradas em um módulo novo `api/_lib/apiV1/planosRotas.js`, acrescentado a `indiceRotas.js`. Regras puras em `src/lib/apiV1/planosRegras.js` (testáveis sem banco); carga de dados em `api/_lib/apiV1/planosDados.js`.

### 4.2 "Cidade alternativa" (confirmado pelo Pedro)
Um prestador conta como realizador numa cidade quando o atende pelo **endereço principal ou pela lista paralela** do perfil ("incluir cidades paralelas", ligado por padrão na impressão dos planos). A API usa sempre esse modo; não há parâmetro para desligá-lo. A regra é a mesma de `prestadorAtendeAlgumaCidadeAlvo` (`src/lib/buscarQuemRealizaPrestadores.js`), a mesma do PDF.

### 4.3 Quais procedimentos aparecem
Os mesmos que o PDF daquela cidade e plano:
- Elegibilidade e valores como em `carregarLinhasImpressaoPlanos` (diferença de `planos_cidade`, limite e carência de `planos_config`, procedimentos do plano ou "apenas loja" tratados como no PDF, limite de grupo da categoria quando houver).
- Seleção, nesta ordem: (1) o **preset `site`** da cidade/plano (`impressao_planos_modos` com `finalidade = 'site'`, ver 4.8); (2) o modo salvo do PDF (`finalidade = 'impressao'`); (3) a regra padrão do PDF (procedimento com **3 ou mais realizadores** na cidade, `MIN_REALIZADORES_PRE_MARCAR`). Procedimento sem nenhum realizador nunca aparece. Antes da migração (coluna ausente), vale só (2) e (3).
- Um item por **código**. Os nomes alternativos cadastrados pelos prestadores não geram linhas extras: entram como termos de busca (ver 4.5).

> O loader da impressão (`carregarLinhasImpressaoPlanos.js`) usa o cliente Supabase do navegador. O servidor **não o importa**: extrai a parte pura (elegibilidade, montagem de linhas) para `src/lib/` compartilhado e escreve o carregamento com o cliente `admin`, como `redeDados.js`.

### 4.4 Observações
- Fonte: `planos_observacoes` e `planos_observacoes_procedimentos`. Só ativas, só com mensagem.
- Resposta: dicionário `observacoes` (`id`, `titulo`, `mensagem`, `geral`) e, em cada procedimento, `observacoes: [id]`. Assim uma observação ligada a vários procedimentos viaja uma vez.
- Observação **vinculada** aparece nos procedimentos exibidos aos quais está ligada; se nenhum procedimento exibido a referencia, ela não sai. Observação **geral** vai em `observacoes_gerais: [id]`.
- A coluna `geral` vem do plano `2026-11-18-observacoes-por-grupo` e **ainda não está no banco**. A leitura segue o mesmo fallback do plano (erro `42703` ou mensagem citando `geral` → refaz o select sem a coluna e trata tudo como não geral). Antes da migração a API funciona, sem bloco geral.

### 4.5 Busca e termos populares
- A busca roda no navegador, sobre a tabela já carregada, ignorando acento e caixa, em código, nome e **termos extras do procedimento**.
- `termos` de cada procedimento = nomes alternativos distintos dos prestadores da cidade + sinônimos curados. Os sinônimos curados ficam num arquivo versionado (`src/lib/apiV1/planosSinonimos.js`), ex.: radiografia ↔ "raio x", "rx"; castração ↔ "castrar", "esterilização"; ultrassonografia ↔ "ultrassom", "eco". A lista inicial é curta e cresce por pull request.
- `filtros.termos_populares` (ex.: "Raio X", "Castração", "Vacina", "Consulta") alimenta os atalhos clicáveis da página. Cada atalho é um texto de busca, não um filtro novo.

### 4.6 Prestadores de um procedimento
- Credenciados ativos com situação "Credenciado" (mesma definição da `/rede`), que atendem a cidade (4.2) e têm o procedimento vinculado.
- Campos por prestador, **iguais aos já públicos na `/rede`**: `id`, `nome`, `especialidade_principal`, `cidade_principal`, `contatos` (`telefone`, `celular`, `whatsapp_url`), `endereco.texto` (somente tipo Local, senão `null`), `nome_alternativo` (como esse prestador chama este procedimento, ou `null`). Nada além disso.
- Devolve **todos** os elegíveis (teto de 100) mais `total`, em ordem estável por nome. O embaralhamento é do cliente. Cidade ou procedimento inexistente → 404; procedimento sem realizador → lista vazia com `total: 0`.

### 4.7 Formato, erros, cache
- Mesmo envelope e erros da `/rede` (`{ erro: { codigo, mensagem } }`), valores em reais como número, `Cache-Control: public, s-maxage=300, stale-while-revalidate=3600`, cache em memória de 5 min por instância como `carregarBaseRede` (junta chamadas simultâneas, nunca guarda falha, serve a última base boa se o banco cair).
- Parâmetros inválidos → 400 (`cidade_invalida`, `plano_invalido`, `procedimento_invalido`); combinação cidade/plano sem cobertura → 404 `plano_indisponivel_na_cidade`.

### 4.8 Preset "site" (fase 2, decidido com o Pedro)
- Migração: `impressao_planos_modos` ganha `finalidade text not null default 'impressao' check (finalidade in ('impressao','site'))`; a unicidade passa de `(plano_id, cidade_id)` para `(plano_id, cidade_id, finalidade)`. Linhas existentes ficam `impressao`. Com `.rollback.sql`. **Não aplicar sem aprovação.** O `upsert` atual (`onConflict: 'plano_id,cidade_id'`) precisa mudar junto com a migração; antes dela, a tela segue como hoje.
- Tela de impressão (`ImpressaoPlanos.jsx`): seletor "Editando: PDF | Site". Em "Site" as mesmas caixas gravam o preset `site` com o mesmo salvamento automático, e o PDF gerado continua usando sempre o modo `impressao`. Botão "Copiar do PDF". O indicador de modo diz qual preset está sendo editado.
- `buscarModoImpressaoPlanos` e `salvarModoImpressaoPlanos` ganham o parâmetro `finalidade` (padrão `impressao`).
- Entrega em duas fases: **fase 1** (API + página) funciona sem a migração; **fase 2** (migração + seletor) acrescenta o preset `site` e a API passa a lê-lo, com o fallback acima.

## 5. A página `/tabela-planos`

Rota pública sem login (já registrada em `App.jsx`). Reaproveita o kit de UI e o CSS do protótipo; o visual segue o padrão `ek-*` / `tp_*` existente.

**Fluxo**
1. **Cidade** (seleção com busca) → **plano** (chips) → tabela. Estado na URL (`?cidade=&plano=&q=`), para compartilhar o link e voltar do WhatsApp sem perder a escolha. Última cidade lembrada em `localStorage` (com try/catch).
2. **Busca sempre visível** no topo da tabela (não escondida atrás de botão), com atalhos dos termos populares. Digitar busca em **todos os grupos de uma vez**: os resultados aparecem agrupados, com o trecho que casou destacado; sem resultado, mensagem útil e sugestão de falar no WhatsApp.
3. **Grupos** como cartões recolhíveis (acordeão) em vez de paginação "Anterior/Próximo"; a barra de chips dos grupos permite pular.
4. **Procedimento** como linha clicável. Ao clicar abre um **painel** (folha inferior no celular, lateral no desktop) com: detalhes (carência, limite, diferença), observações ligadas, e **"Quem realiza em {cidade}"** com 4 ou 5 prestadores sorteados (5 se houver; todos se houver menos de 4; sem realizador mostra o convite ao WhatsApp). Botão **"Sortear outros"** evita repetir os já mostrados até esgotar a lista; cada prestador tem WhatsApp e telefone.
5. **Observações gerais** em um bloco no fim da tabela; as ligadas ao procedimento aparecem na linha como marcador discreto (ícone com contagem) e no painel.
6. **WhatsApp**: botão flutuante sempre visível (incluindo estado desabilitado com dica antes de escolher cidade e plano). A mensagem leva plano e cidade e, com o painel aberto, o procedimento ("Quero saber sobre {procedimento}…"). Número em constante no front, como no protótipo.
7. **Estados**: esqueleto de carregamento, erro com "Tentar de novo", vazio por cidade sem plano. Respeita `prefers-reduced-motion`; teclado e leitor de tela (painel com foco preso e `Esc` fecha).

**Dados no front**
- Um cliente único `src/lib/apiV1/planosPublicosApi.js` (base e chave via env `VITE_API_PLANOS_URL`, `VITE_API_PLANOS_KEY`) com as 3 chamadas e cache de sessão por cidade/plano.
- Sem a env configurada, a página usa o mock atual como **modo demonstração** (faixa visível "dados de exemplo"), para o desenvolvimento seguir sem chave. O formato do mock é ajustado para ser idêntico ao da API (inclusive observações e prestadores de exemplo).

## 6. Documentação e testes

- `docs/api/planos.md` (guia para quem não conhece o EmerLAB, com exemplos curl/fetch/React e o fluxo de sorteio), linha nova na tabela do `docs/api/README.md`, rotas e esquemas em `docs/api/openapi.json`, e `src/lib/apiV1/openapi.test.js` cobrindo as rotas novas.
- Testes (vitest) das regras puras: elegibilidade e seleção igual ao PDF, observações (vinculada, geral, inativa, sem procedimento exibido, fallback sem coluna `geral`), prestadores (cidade principal e paralela, situação, campos permitidos, teto), sinônimos e termos, validação de parâmetros, escopo `planos:ler`. Teste de contrato: a resposta de cada rota não contém campo fora da lista permitida.
- Páginas: testes de componente para busca multi-grupo, painel e sorteio sem repetição (embaralhamento injetável para teste determinístico).
- Depois de mexer em código: `graphify update .`.

## 7. Restrições

- Somente `SELECT`, via cliente `admin` no servidor; colunas listadas uma a uma (padrão de `redeDados.js`).
- Não aplicar migração nem tocar o Supabase ao vivo sem aprovação. A fase 1 **não exige migração** (a coluna `geral` é do outro plano e opcional aqui); a fase 2 traz a migração de `finalidade` (4.8).
- Não aumentar a contagem de funções Vercel: as rotas entram no roteador `/v1` existente.
- O trabalho começa a partir de uma branch limpa; o protótipo `src/pages/Publico/` e o ajuste em `src/App.jsx` ainda não estão commitados e vão junto.

## 8. Fica a cargo de quem constrói

Nomes internos dos módulos, formato exato do esqueleto e das animações, lista inicial de sinônimos além dos exemplos, rótulos dos textos de apoio, e o desenho exato do painel dentro do kit `ek-*`.

## 9. Decisões fechadas com o Pedro

1. **Conjunto de procedimentos:** preset de impressão com finalidade `site` (4.8), com fallback para o modo do PDF e depois para a regra de 3 ou mais realizadores. Entra na fase 2.
2. **"Cidade alternativa"** = "incluir cidades paralelas" (4.2), confirmado.
