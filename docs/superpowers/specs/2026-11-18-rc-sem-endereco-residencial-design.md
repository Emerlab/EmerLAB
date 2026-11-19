# RC PDF — nunca imprimir endereço residencial de prestador

Data: 18/11/2026 · Prioridade: privacidade (o usuário exige que NUNCA aconteça) · Tamanho: pequeno

## Problema
No PDF da Rede Credenciada (`api/rc-pdf.js`), prestadores **individuais** (especialidade do tipo `Especialidade`: Anestesista, Fisioterapeuta, Medicina Felina…) saem com o **endereço cadastrado** — que pode ser residencial ("Rua …, 730 — Casa — …") — no lugar do rótulo "Atendimento em clínicas parceiras". Causa: no último ramo da escolha do rótulo (`api/rc-pdf.js` ~L236-245) o código usa `String(item.modalidadeEfetiva || item.endereco || '-')`; o rótulo "Atendimento em clínicas parceiras" só é usado quando a modalidade contém VOLANTE. Quem tem modalidade vazia, não é domiciliar e não tem vínculo com clínica cai em `item.endereco`. Dados reais (banco, 18/11): 28 prestadores individuais ativos nessa situação, 24 com modalidade vazia (ex.: ids 680, 712, 119, 697).

## Regra nova (decisão do usuário: "não pode acontecer em hipótese alguma")
Pura e testável, em `src/lib/rc/rotuloAtendimentoRc.js`:
`montarRotuloAtendimentoRc(item): string` com `item = { temEspecialidadeDomiciliar, possuiVinculoClinica, nomesClinicasVinculadas, temModalidadeVolante, modalidadeEfetiva, endereco, temEspecialidadeLocal }`, na ordem:
1. `temEspecialidadeDomiciliar` → `Atendimento Domiciliar`
2. `possuiVinculoClinica` e há nomes → `Atendimentos na <nome>` (1 clínica) ou `Atendimentos em: <a, b, …>` (mais de uma) — igual ao código atual
3. `temModalidadeVolante` → `Atendimento em clínicas parceiras`
4. `modalidadeEfetiva` (texto, com o prefixo "Atendimento…" removido como hoje) se não vazio **e não parecer endereço** → esse texto
5. se `temEspecialidadeLocal` **e** existe endereço (a `modalidadeEfetiva` que parecia endereço ou `endereco`) **e ele não parece residencial** → esse endereço
6. senão → `Atendimento em clínicas parceiras` (**nunca** o endereço cadastrado de um profissional individual)

`temEspecialidadeLocal` = o prestador tem alguma especialidade (principal **ou secundária**) cuja `especialidades.tipo` normalizado é `LOCAL` (tipos reais no banco: `Especialidade` e `Local`; Local = Adestramento, Banho e Tosa, Clinica, Clinica 24h, Comércio, Consultorio, Crematório, Farmácia, Hospital, Laboratorio, PetShop, Recreação). Mesma regra que a API pública da rede já usa para liberar endereço.

Detectores (puros, exportados e testados): `pareceEndereco(texto)` — contém CEP (`\d{5}-?\d{3}`) **ou** começa com logradouro (`Rua|R\.|Av|Avenida|Travessa|Tv\.|Estrada|Rodovia|Rod\.|Alameda|Praça|Largo|Servidão`) seguido de vírgula/número; `pareceResidencial(texto)` — contém complemento residencial: `Casa`, `Apto`/`Ap.`/`Apartamento`, `Residência`/`Residencial` como palavras isoladas (ex.: "— Casa —", ", casa", "apto 203").

## Integração
`api/rc-pdf.js`: em `montarCards`, calcular `temEspecialidadeLocal` (especialidades do prestador + principal, via `especialidadePorId`, `tipo` normalizado) e incluir no item; em `gerarHtmlCards`, substituir o bloco que decide `atendimentoLabel` por `montarRotuloAtendimentoRc(item)`. Nenhuma outra mudança no PDF.

## Testes obrigatórios (vitest, valores reais)
- os 4 casos do usuário: individual (`temEspecialidadeLocal: false`), `modalidadeEfetiva: ''`, sem vínculos, `endereco` residencial/qualquer → `Atendimento em clínicas parceiras` (e o endereço não aparece em lugar nenhum do retorno);
- Local com endereço comercial → mostra o endereço; Local com endereço "— Casa —" → clínicas parceiras;
- domiciliar, vínculo com 1 clínica / 2 clínicas, volante;
- modalidade textual comum ("Desconto em banho e tosa", "Pio X") continua aparecendo para qualquer tipo;
- modalidade que parece endereço em individual → clínicas parceiras; em Local comercial → mostrada;
- `pareceEndereco`/`pareceResidencial` com casos positivos e negativos (incluindo "Casa" dentro de outra palavra, ex.: "Casaca", não deve casar).
