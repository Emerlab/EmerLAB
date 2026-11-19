# API da Tabela de Planos

Guia para a equipe que monta a página pública de planos da Emerdog. Você não precisa conhecer o EmerLAB: basta saber que ele é o cadastro oficial dos **planos** (Básico, Clássico, Avançado, Ultra), dos **procedimentos** que cada plano cobre em cada **cidade** e dos **prestadores** que realizam esses procedimentos. Esta API entrega isso, só leitura, no formato certo para a página.

Leia antes o [README](README.md) (autenticação, erros, limites). Referência completa de cada rota: [openapi.json](openapi.json) ou https://api.emerlab.com.br/docs.

## Resumo

| Rota                           | O que devolve                                                          |
| ------------------------------ | ---------------------------------------------------------------------- |
| `GET /v1/planos/filtros`       | Cidades com tabela, os planos de cada uma e os termos de busca populares |
| `GET /v1/planos/tabela`        | A tabela de um plano em uma cidade, agrupada por categoria             |
| `GET /v1/planos/prestadores`   | Prestadores que realizam um procedimento na cidade                     |

- URL base: `https://api.emerlab.com.br` (sem `/api`).
- Chave: **chave da rede** (`emer_rede_…`) com o escopo **`planos:ler`**. Chaves da rede já existentes **não** ganham esse escopo sozinhas: peça ao administrador do EmerLAB para criar uma chave nova ou ajustar a atual (Administrativo > API).
- Como na API da rede, a chave da rede SEMPRE exige o cabeçalho `Origin`, igual a uma das origens cadastradas. O navegador o envia sozinho.

## Fluxo recomendado

1. Ao abrir a página, chame `GET /v1/planos/filtros` e monte os seletores de cidade e plano.
2. Quando a pessoa escolher cidade e plano, chame `GET /v1/planos/tabela?cidade=<id>&plano=<chave>` e desenhe os grupos.
3. Quando a pessoa clicar em um procedimento, chame `GET /v1/planos/prestadores?cidade=<id>&procedimento=<codigo>`.

## `GET /v1/planos/filtros`

```bash
curl "https://api.emerlab.com.br/v1/planos/filtros" \
  -H "Authorization: Bearer emer_rede_EXEMPLO_NAO_E_UMA_CHAVE" \
  -H "Origin: https://www.exemplo.com.br"
```

```json
{
  "cidades": [
    { "id": 1, "nome": "Porto Alegre", "uf": "RS", "planos": [
      { "id": 1, "chave": "basico", "nome": "Básico" },
      { "id": 2, "chave": "classico", "nome": "Clássico" }
    ] }
  ],
  "termos_populares": ["Consulta", "Vacina", "Raio X"]
}
```

`termos_populares` são atalhos para a busca da página.

## `GET /v1/planos/tabela`

Parâmetros: `cidade` (id numérico) e `plano` (id ou chave: `basico`, `classico`, `avancado`, `ultra`).

```js
const r = await fetch('https://api.emerlab.com.br/v1/planos/tabela?cidade=1&plano=basico', {
  headers: { 'X-Api-Key': 'emer_rede_EXEMPLO_NAO_E_UMA_CHAVE' },
})
const tabela = await r.json()
```

Resposta (resumida):

```json
{
  "cidade": { "id": 1, "nome": "Porto Alegre", "uf": "RS" },
  "plano": { "id": 1, "chave": "basico", "nome": "Básico" },
  "origem_selecao": "impressao",
  "grupos": [
    { "id": 1, "nome": "Consultas", "limite_grupo": null, "procedimentos": [
      { "codigo": "CONS-001", "nome": "Consulta", "carencia": "30 dias", "limite": "2 por ano",
        "diferenca": 50, "realizadores": 12, "termos": ["consulta"], "observacoes": [1] }
    ] }
  ],
  "observacoes": { "1": { "id": 1, "titulo": "Aviso", "mensagem": "Texto de exemplo.", "geral": false } },
  "observacoes_gerais": []
}
```

- `diferenca` é o valor em reais (número).
- `termos` ajudam a busca: já vêm sem acento e em minúsculas, com sinônimos (por exemplo "raio x" para radiografia).
- `observacoes` é um dicionário; cada procedimento aponta os ids que se aplicam a ele. `observacoes_gerais` são os ids que valem para a tabela inteira (mostre em bloco no fim).
- `origem_selecao` diz de onde veio a lista de procedimentos exibidos (`site`, `impressao` ou `padrao`). Só aparecem procedimentos que têm prestadores na região.
- Cidade com plano mas sem nenhum procedimento exibível devolve `grupos: []` (não é erro): mostre a mensagem de vazio com um convite ao WhatsApp.

Erros: `400 cidade_invalida`, `400 plano_invalido`, `404 plano_indisponivel_na_cidade`.

## `GET /v1/planos/prestadores`

Parâmetros: `cidade` e `procedimento` (código, ex.: `CONS-001`; maiúsculas e espaços são ignorados).

```json
{
  "total": 12,
  "prestadores": [
    { "id": 123, "nome": "Clínica Veterinária Exemplo", "especialidade_principal": "Clínica",
      "cidade_principal": { "nome": "Porto Alegre", "uf": "RS" },
      "contatos": { "telefone": "(51) 3000-0000", "celular": null, "whatsapp_url": null },
      "endereco": { "texto": "Rua das Flores, 100 - Centro" }, "nome_alternativo": null }
  ]
}
```

- A lista vem ordenada por nome, com no máximo 100; `total` diz quantos existem.
- `endereco` só vem para estabelecimentos (clínicas, hospitais, laboratórios); para profissionais individuais é `null`.
- `nome_alternativo` é como aquele prestador chama o procedimento.
- Nenhum dado interno sai desta API (sem CPF/CNPJ, chave PIX, e-mail interno ou observações internas).

Erros: `400 cidade_invalida`, `400 procedimento_invalido`, `404 procedimento_nao_encontrado`. Procedimento válido sem prestadores devolve `total: 0` e lista vazia: mostre o convite ao WhatsApp.

## Receita do sorteio no navegador

A página mostra poucos prestadores por vez (4 ou 5), sorteados, para dar chance a todos:

1. Guarde a lista de `GET /v1/planos/prestadores`.
2. Embaralhe (Fisher–Yates) e pegue os 5 primeiros (todos, se houver menos de 5).
3. Em "Buscar mais", exclua os já mostrados e sorteie de novo; quando os não vistos acabarem, recomece do conjunto completo.

## Cache

As respostas ficam em cache por 5 minutos na borda e no servidor. Uma alteração no EmerLAB pode levar até 5 minutos para aparecer na página.
