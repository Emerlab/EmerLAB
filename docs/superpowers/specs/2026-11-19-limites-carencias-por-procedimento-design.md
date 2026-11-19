# Limites e carências por procedimento (grade + pendências)

## Intenção
Hoje limite e carência vivem em `planos_config` (uma linha por plano e procedimento, sem cidade) e só são editados na tela de detalhe de cada plano (Supertabelaplanos). Cadastrar o procedimento (página Procedimentos) e configurar limite/carência são passos separados, então é fácil esquecer. Exemplo real: OUT2-005 existe com preço e sem nenhuma linha em `planos_config`; hoje há 5 procedimentos nessa situação.

Objetivo: configurar limite e carência de todos os planos de um procedimento num lugar só, e ver o que está faltando.

## Metas
1. Grade de limite/carência por plano no cadastro de procedimento e na edição de procedimento existente.
2. Filtro/contador "Pendentes" na página Procedimentos.

## Não-metas
- Padrões por grupo/categoria com pré-preenchimento (descartado pelo usuário; os valores variam por plano e por grupo, sem regra confirmada).
- Matriz na página de Planos e página nova de pendências (descartadas).
- Mudar o modelo de dados de `planos_config` ou a tela por plano (continua para colagem em massa).
- Separar por cidade: já não existe, os valores são universais.

## Anti-metas
- Gravar valores que o usuário não digitou.
- Marcar como pendente o que não é: limite individual quando a categoria usa limite de grupo; plano "Apenas Loja".

## Abordagem escolhida (A)
Tudo na página de Procedimentos (`Supertabelaprocedimentos.jsx`), com a lógica num componente e num módulo puro novos. Alternativas descartadas: matriz na página de Planos (não evita o esquecimento no cadastro) e página nova de pendências (mais um lugar para lembrar de visitar).

## Design
- **Planos aplicáveis** a um procedimento: ids de `plano_base_id` até o Ultra (id 4), usando `obterPlanoIdsPermitidosDesdeBase` de `src/lib/planosHierarquia.js`; "Apenas Loja" fica de fora.
- **Regra de pendência** (função pura em `src/lib/`, com teste): para cada plano aplicável, é pendente se não há linha em `planos_config` ou a carência está em branco; o limite em branco só conta se a categoria não usa limite de grupo (`categoriaLimitesGrupo.js`; procedimentos isentos de limite de grupo seguem exigindo limite individual).
- **Componente de grade**: uma linha por plano aplicável, com campos limite e carência. Reutilizado no formulário de adicionar e num editor aberto por botão "Limites e carências" em cada linha da lista.
- **Cadastro**: ao adicionar procedimento, grava `procedimentos` e depois as linhas de `planos_config` dos planos aplicáveis (via `inserirPlanoConfigSeNaoExiste`), com os valores digitados ou em branco. Valores em branco entram como pendentes.
- **Edição**: salva por plano; cria a linha se não existir, atualiza se existir. Respeita somente leitura (`bloquearSeSomenteLeitura`).
- **Pendentes**: contador no topo e filtro que restringe a lista; busca em lote de `planos_config` paginada (`buscarTodosPaginado`) para calcular de uma vez.
- Mudança de plano base de um procedimento hoje mexe em `planos_cidade`; os efeitos sobre `planos_config` (linhas de planos que deixam de ser aplicáveis) ficam fora deste escopo e são só sinalizados como pendência/sobra, sem apagar nada.

## Escolhas minhas (o usuário pode corrigir)
- O que conta como pendente (acima).
- Falha ao gravar as linhas de `planos_config` depois de inserir o procedimento: o procedimento fica criado e aparece como pendente, com aviso na tela.

## Fica para quem implementar
Layout exato da grade, textos, nomes de arquivos e testes. Rodar `graphify update .` após a mudança.
