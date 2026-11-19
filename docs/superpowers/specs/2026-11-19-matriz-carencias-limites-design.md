# Matriz de carências e limites (tela única)

Substitui a abordagem de `2026-11-19-limites-carencias-por-procedimento-design.md` (grade/modal/pendentes na página Procedimentos), a pedido do usuário: uma tela só para monitorar tudo.

## Intenção
Carência e limite viviam em duas telas (Planos > "Ver carências e limites", um plano por vez; e a grade nova em Procedimentos). Ao cadastrar um procedimento ou trocar o plano base é fácil esquecer de configurar algum plano. Dados de 19/11/2026: 686 procedimentos, 5 sem nenhuma configuração, 2 com carência vazia, 9 sem as linhas "Acima", 13 linhas "Acima" fora do padrão.

## Metas
1. Em Supertabela > Planos, a visão "Ver carências e limites" vira uma matriz: Código, Nome, 4 planos (Básico, Clássico, Avançado, Ultra) × (Limite, Carência), Ação. Sem seletor de plano e sem cidade (valores universais).
2. As linhas da matriz vêm do catálogo `procedimentos` (todos aparecem; célula vazia = pendente), não de `planos_config`. Linha em `planos_config` é criada ao digitar.
3. Do plano base para cima as células são editáveis (como na tela de valores). Procedimento "Apenas loja" tem as 4 colunas editáveis, com a etiqueta "Loja".
4. Abaixo do plano base é automático e somente leitura: `limite = carencia = "<nome do plano base> Acima"` (ex.: "Avançado Acima"). O sistema grava essas linhas (o PDF e a API leem `planos_config`): ao cadastrar procedimento, ao trocar o plano base (Procedimentos) e por um botão de correção na matriz quando houver divergência. Uma migração única corrige os dados existentes (9 faltantes e 13 fora do padrão), aplicada só com confirmação do usuário.
5. Categoria com limite de grupo: a célula de limite do plano mostra o texto do grupo ("Limite N no grupo de X"), sem edição; a carência continua editável. Procedimento isento (id 23) mantém limite individual.
6. Filtro "Só vazios" e busca por limite/carência de qualquer plano; colagem do Excel pelas 8 colunas; exportação Excel com as 8 colunas; ação "Limpar" por linha (zera as células editáveis, não apaga linhas).

## Não-metas
- Padrões por grupo com pré-preenchimento.
- Mudar o modelo de `planos_config`, a impressão de planos ou a API.
- Nada muda na visão "Ver diferenças" (valores).

## Anti-metas
- Gravar valor que o usuário não digitou nas colunas editáveis (exceto a regra "Acima" abaixo da base e o reset de "Acima" velho, descritos abaixo).
- Apagar linhas de `planos_config` pela matriz.

## Decisões
- Abordagem B (automático) escolhida pelo usuário entre: somente leitura + botão de preencher (A), automático (B), editável como hoje (C).
- Ao trocar o plano base: abaixo do novo base grava "Acima"; células do novo base para cima que ainda contêm "… Acima" nos dois campos são zeradas (viram pendentes).
- Células de grupo: texto por linha, sem mesclar (a mescla do modo antigo não funciona quando os procedimentos da categoria têm planos base diferentes). É uma escolha minha.
- "Limpar" substitui o botão 🗑️ antigo (que apagava a linha do plano); minha escolha.
- "Adição em massa", "＋ Adicionar procedimento nesta categoria" e o seletor de plano saem da visão de carências (não fazem sentido com linhas vindas do catálogo).

## Fica para quem implementar
Layout/CSS da tabela de 2 níveis de cabeçalho, textos de aviso, nomes de funções auxiliares não listados no plano.
