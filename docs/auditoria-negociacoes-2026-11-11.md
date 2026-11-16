# Auditoria de negociações × perfil do prestador

Data: 11/11/2026. Fonte: Supabase `Emerdog-SuperTool`. **Somente leitura: nenhum dado foi alterado.**

Regra definida: o catálogo da negociação deve refletir o do perfil do prestador (`prestador_procedimentos`).
Negociação de Belo Horizonte (cidade 23) fica em **standby**.

## Resumo

| Item                                                                    | Qtde                                                             |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Negociações ativas (após exclusão da nº 23)                             | 91                                                               |
| Procedimentos com valor na negociação, **fora do perfil** (a desmarcar) | 84 procedimentos / 252 valores (seção 1)                         |
| Procedimentos **no perfil, sem valor** na negociação (a negociar)       | 170 (seção 2)                                                    |
| Valores zerados                                                         | 96 linhas = 32 procedimentos × 3 portes; nenhum é nulo (seção 3) |
| Standby (BH)                                                            | Negociação 86 – DIA (seção 4)                                    |

Nomes: o nome do **perfil do prestador prevalece**. Nº 14 (Suelin Korbes) = VerPet; nº 101 (Liliane da Silva) = Liliane Silva.

---

## 1. Valor negociado que NÃO está no perfil (a desmarcar da negociação)

Aguardando autorização. Valores P/M/G entre parênteses. Antes de remover, fazer backup (os valores são recuperáveis a partir desta lista).

**Atenção:** a negociação 68 (Axys) concentra 40 dos 84. Vale conferir se o perfil dela está incompleto antes de remover.

### 4 – São João (prestador 62)

- CESP-007 Consulta com Oftalmologista (160/160/160)-- Marcar no perfil
- CESP-009 Consulta com Ortopedista (160/160/160) -- Marcar no perfil

### 5 – Fauna Sound (73)

- DIG1-010 Correção de atresia anal (G1) (205,20/221/232) -- Remover

### 13 – Vetvida (134)

- SEN1-001 Otohematoma (G1) (210/210/250) -- Marcar no perfil

### 15 – Luciana Marchioro (104)

- DERM-004 Wood (0/0/0) -- Remover

### 17 – Vitta de Bicho (67)

- CESP-001 Consulta com Dermatologista (150/150/150) -- Marcar no perfil
- CLIN-017 Corte de Unha (15/15/15) -- Remover
- RAIX-002 Raio X Plantão (60/60/60) -- Remover
- SERV-005 Taxa de Plantão Simples (60/60/60) -- Remover

### 18 – Salute (68)

- CESP-008 Consulta com Oncologista (150/150/150) -- Marcar no perfil

### 19 – Mellislab (118)

- EESP-017 Citologia Diagnóstica - Local Adicional (42,30/42,30/42,30) -- Remover
- EESP-106 Cortisol 3 dose RIE (152/152/152) -- Remover

### 20 – Stephanie Schneider (126)

- VACS-003 Vacina Quádrupla (52/52/52) -- Remover
- VACS-005 Vacina Quíntupla Felina (90/90/90) -- Remover

### 21 – Rio Branco (101)

- TEST-001 Fiv e Felv - Teste Rápido (130/130/130) -- Remover
- INTR-002 Internação Básica (12 horas) (45,90/45,90/45,90) -- Remover
- INTR-001 Internação de 24 horas (68/68/68) -- Remover
- TEST-002 Teste de Lactato - Fita (15/15/15) -- Remover
- TEST-004 Teste Rápido - Cinomose (65/65/65) -- Remover
- TEST-005 Teste Rápido - Giárdia (65/65/65) -- Remover
- TEST-008 Teste Rápido - Leishmaniose (135/135/135) -- Remover
- TEST-006 Teste Rápido - Panleucopenia Felina (115/115/115) -- Remover
- TEST-003 Teste Rápido - Parvovirose (65/65/65) -- Remover
- TEST-007 Teste Rápido - PIF (95/95/95) -- Remover

### 27 – Petmed (72)

- CESP-001 Consulta com Dermatologista (150/150/150)

### 28 – Pio X (61)

- CESP-010 Consulta (Medicina de Felinos) (155/155/155)

### 46 – Bluts (319)

- COLT-001 Coleta de Material para Exames (18/18/18) -- Remover

### 57 – Lord Golden (259)

- APLI-003 Aplicação de Vacinas (10/10/10) -- Remover

### 59 – Soundvet (461)

- SERV-001 Aluguel de Sala (Atendimento Volantes) (20/20/20) -- Remover

### 60 – Dudu (272)

- ANST-006 Anestesia para endoscopias (258/258/258) -- Remover
- ANST-008 Anestesia Para Profilaxias (244/244/244) -- Remover

### 64 – Liane Plentz (455)

- DIG1-010 Correção de atresia anal (G1) (350/400/400) -- Remover

### 67 – Ariadne Andrade (436)

- USSA-004 Ultrassonografia Cervical (180/180/180) -- Remover
- USSA-008 Ultrassonografia de Joelho (180/180/180) -- Remover
- USSA-006 Ultrassonografia Perineal (100/100/100) -- Remover

### 68 – Axys (320) — 40 procedimentos

Valores iguais nos três portes (P=M=G):

- EESP-114 17-Hidroxiprogesterona (1 Amostra) 115 -- Segurar
- EESP-115 17-Hidroxiprogesterona (2 Amostras) 215 -- Segurar
- EESP-120 4DX - Anaplasma (Ab), Ehrilichia (Ab), Lyme (Ab), Dirofilaria (Ag) 133 -- Segurar
- EESP-069 Ácido Fólico 74 -- Segurar
- EESP-166 Adenovirus Canino 1 Quali 155 -- Segurar
- EESP-047 Análise De Líquido Cístico (Pele) 85 -- Segurar
- EESP-174 Anaplasma spp. Ac Canino (ELISA) 105 -- Segurar
- EESP-223 Babesia spp. IgG (Sorologia) 65 -- Segurar
- EESP-224 Babesia spp. IgM (Sorologia) 89 -- Segurar
- EESP-178 Bartonella spp Quali 155 -- Segurar
- EESP-182 Bordetella bronchiseptica Quali 155 -- Segurar
- EESP-220 Brucella Canis - Brucelose (Imunocromatografia) 55 -- Segurar
- EESP-221 Brucella Canis - Brucelose (RIFI) 55 -- Segurar
- EESP-190 Calicivírus Felino Quali 155 -- Segurar
- EESP-202 Cinomose Quanti 215 -- Segurar
- EESP-102 Cortisol 1 dose RIE 90 -- Segurar
- EESP-104 Cortisol 2 dose RIE 180 -- Segurar
- EESP-106 Cortisol 3 dose RIE 260 -- Segurar
- EESP-108 Cortisol Pós-ACTH (Basal+Pós) - RIE 170 -- Segurar
- EESP-122 Dirofilaria Immitis (Dirofilariose) - ELISA 135 -- Segurar
- EESP-121 Dirofilaria Immitis qPCR 155 -- Segurar
- EESP-225 Ehrlichia Canis - Erliquiose - IgG Semiquantitativo 230 -- Segurar
- EESP-227 Ehrlichia Canis - Erliquiose - Sorologia IgM 115 -- Segurar
- EESP-216 Herpesvírus Felino-1 (FHV-1) Quantitativo 155 -- Segurar
- EESP-081 IGF1 (Somatomedina C) 140 -- Segurar
- EESP-153 Leishmania spp. (Quantitativo) 215 -- Segurar
- EESP-146 Leishmaniose - Tr Igg Elisa - Idexx 130 -- Segurar
- EESP-148 Leishmaniose Canina - Rifi (Diluição Adicional) 50 -- Segurar
- EESP-158 Neospora Caninum - RIFI 85 -- Segurar
- EESP-135 Parvovirose (Ag) + Coronavirose (Ag) 65 -- Segurar
- EESP-131 Parvovírus Felino - Panleucopenia Felina - qpcr 155 -- Segurar
- EESP-116 Raiva - Imunofluorescência 175 -- Segurar
- EESP-084 Relaxina - Diagnóstico Sorológico De Gestação 175 -- Segurar
- EESP-228 Sporothrix sp. (Esporotricose Felina) IgG ELISA C/ Titulação 195 -- Segurar
- EESP-100 T3 Total - Radioimunoensaio (RIE) 90 -- Segurar
- EESP-097 T4 Livre - Radioimunoensaio (RIE) 95 -- Segurar
- EESP-094 T4 Total Pós-Levotiroxina - Radioimunoensaio (RIE) 100 -- Segurar
- EESP-086 Teste De Coombs Canino 230 -- Segurar
- EESP-119 VacciCheck 120 -- Segurar
- EESP-051 Zinco 10 -- Segurar

### 71 – Vet Schnauzer (164)

- SERV-005 Taxa de Plantão Simples (60/60/60) -- Remover
- USSA-000 Ultrassonografia Abdominal Plantão (150/150/150) -- Remover

### 74 – Love & Care (167)

- CLIN-020 Eutanásia (136,96/136,96/136,96) -- Remover

### 78 – Kimberlly Cruz (219)

- ANST-008 Anestesia Para Profilaxias (244/265/265) -- Remover
- ORA1-002 Correção de fístula oro-nasal (G1) (230/230/230) -- Remover

### 79 – Ana Thais (220)

- APLI-002 Aplicação de Medicamentos (Com med) (32/32/32) -- Remover

### 89 – Sutilvet (604)

- ORA1-001 Correção de fenda palatina (G1) (192,20/205,20/256) -- Remover
- ORA1-002 Correção de fístula oro-nasal (G1) (192,20/205,20/256) -- Remover

### 101 – Liliane Silva (785)

- EXP2-002 Toracotomia exploratória (G2) (460/460/460) -- Remover

---

## 2. No perfil, mas SEM valor na negociação (a negociar)

Nenhuma ação automática: ficam como "pendente de negociar".

**Padrão a notar:** `CESP-000 Consulta com Especialista` está no perfil e sem valor em ~35 negociações de especialistas/clínicas. Provavelmente é um item genérico; vale decidir se entra na negociação ou sai do perfil.

- **2 Michele Roos:** CESP-000 Consulta com Especialista -- Copia o valor de CESP-NNN que não reconsulta com especialista
- **4 São João:** CESP-000 Consulta com Especialista -- Copia o valor de CESP-NNN que não reconsulta com especialista
- **9 Weslei Santana:** CESP-000 -- Copia o valor de CESP-NNN que não reconsulta com especialista
- **10 Amanda Von Gilsa:** CESP-000 -- Copia o valor de CESP-NNN que não reconsulta com especialista
- **11 Marina Polesso:** CESP-000 -- Copia o valor de CESP-NNN que não reconsulta com especialista
- **18 Salute:** CESP-000 -- Copia o valor de CESP-NNN que não reconsulta com especialista
- **20 Stephanie Schneider:** CESP-000 -- Copia o valor de CESP-NNN que não reconsulta com especialista
- **24 Suelen Santos:** CESP-000 -- Copia o valor de CESP-NNN que não reconsulta com especialista
- **26 Silviane Hessler:** CESP-000 -- Copia o valor de CESP-NNN que não reconsulta com especialista
- **30 Gabriela Mantovani:** CESP-000 -- Copia o valor de CESP-NNN que não reconsulta com especialista
- **32 Duah Bakri:** CESP-000 -- Copia o valor de CESP-NNN que não reconsulta com especialista
- **33 Taiana Santana:** CESP-000 -- Copia o valor de CESP-NNN que não reconsulta com especialista
- **36 Marcela Torikachvili:** CESP-000 -- Copia o valor de CESP-NNN que não reconsulta com especialista
- **37 Tatiane Linden:** CESP-000 -- Copia o valor de CESP-NNN que não reconsulta com especialista
- **38 Fábio Brandão:** CESP-000 -- Copia o valor de CESP-NNN que não reconsulta com especialista
- **39 Pulsati:** CESP-000 -- Copia o valor de CESP-NNN que não reconsulta com especialista
- **40 Ana Mallmann:** CESP-000 -- Copia o valor de CESP-NNN que não reconsulta com especialista
- **42 Kátia Brombatti:** CESP-000 -- Copia o valor de CESP-NNN que não reconsulta com especialista
- **43 Júlia Pahim:** CESP-000 -- Copia o valor de CESP-NNN que não reconsulta com especialista
- **45 Roberto Moraes:** CESP-000 -- Copia o valor de CESP-NNN que não reconsulta com especialista
- **49 Açores:** CESP-000 -- Copia o valor de CESP-NNN que não reconsulta com especialista
- **50 Calvin Gnoatto:** CESP-000 -- Copia o valor de CESP-NNN que não reconsulta com especialista
- **55 Leticia Machado:** CESP-000 -- Copia o valor de CESP-NNN que não reconsulta com especialista
- **56 Bruna Zanotto:** CESP-000 -- Copia o valor de CESP-NNN que não reconsulta com especialista
- **64 Liane Plentz:** CESP-000 -- Copia o valor de CESP-NNN que não reconsulta com especialista
- **65 Imaginar:** CESP-000 -- Copia o valor de CESP-NNN que não reconsulta com especialista
- **69 Lilian Althaus:** CESP-000 -- Copia o valor de CESP-NNN que não reconsulta com especialista
- **70 Vet Center Champagnat:** CESP-000 -- Copia o valor de CESP-NNN que não reconsulta com especialista
- **74 Love & Care:** CESP-000 -- Copia o valor de CESP-NNN que não reconsulta com especialista
- **76 Adriane Dallabona:** CESP-000 -- Copia o valor de CESP-NNN que não reconsulta com especialista
- **78 Kimberlly Cruz:** CESP-000 -- Copia o valor de CESP-NNN que não reconsulta com especialista
- **81 Cardio Pet Care:** CESP-000 -- Copia o valor de CESP-NNN que não reconsulta com especialista

- **5 Fauna Sound:** CARD-003 Mensuração de Pressão Arterial -- Resolvido

- **17 Vitta de Bicho:** OUT2-004 Colecistectomia (G2); CESP-000; HER1-002 Hernia Perianal (G1); TEG2-001 Mastectomia unilateral parcial (G2); TEG2-002 Mastectomia unilateral total (G2); CARD-003 Mensuração de Pressão Arterial-- Resolvido

- **19 Mellislab:** PATO-019 Topografia/Fragmento Adicional -- Remover

- **21 Rio Branco:** SERV-002 Bloco Cirúrgico -- Resolvido

- **27 Petmed:** SERV-003 Aluguel de sala para exames; CESP-000

- **28 Pio X:** ANST-006 Anestesia para endoscopias; CESP-002 Consulta com Cardiologista; CESP-001 Consulta com Dermatologista; CESP-000; CESP-008 Consulta com Oncologista

- **31 PetLandia (14):** ELAB-005 Albumina; ELAB-025 ALT; ELAB-019 Bilirrubina Total; ELAB-018 Bilirrubinas; ELAB-006 Colesterol total; CESP-001 Consulta com Dermatologista; ELAB-011 Creatinina; ELAB-028 FA; ELAB-029 GGT; ELAB-013 Glicose; ELAB-036 Hemograma Completo; ELAB-059 Proteína Total; ELAB-009 Triglicerídios; ELAB-024 Uréia

- **46 Bluts:** EESP-013 Citologia - Vaginal - Ciclo Estral

- **47 AnimalHub (17):** ELAB-005, 025, 026, 003, 006, 011, 046, 028, 010, 029, 013, 035, 061, 055, 015, 009, 024 (Albumina, ALT, AST, Cálcio total, Colesterol total, Creatinina, E.Q.U, FA, Fósforo, GGT, Glicose, Hemograma + Plaquetas, Proteínas Totais e Frações, Relação Proteína:Creatinina Urinária, Sódio, Triglicerídios, Uréia)

- **52 Petlab (40):** ELAB-005 Albumina; 025 ALT; 021 Amilase; 026 AST; 019 Bilirrubina Total; 018 Bilirrubinas; 003 Cálcio total; 086 Chlamydia; 085 Cinomose; 006 Colesterol total; 037 Contagem de Plaquetas; 011 Creatinina; 046 E.Q.U; 088 EPF Simples; 079 EPF Parasitológico de fezes; 028 FA; 044 Fibrinogênio; 010 Fósforo; 029 GGT; 013 Glicose; 040 Hematócrito; 036 Hemograma Completo; 067 Micológico Direto; 084 Parasitológico de Pele; 076 Pesquisa Hemoparasitas; 072 Pesquisa Malassezia; 078 Pesquisa Microfilárias; 073 Pesquisa Sangue Oculto Fecal; 087 Pesquisa Tripsina Fecal; 016 Potássio; 031 PPT; 059 Proteína Total; 057 Relação Albumina:Globulina; 055 Relação Proteína:Creatinina Urinária; 041 Reticulócitos; 015 Sódio; 032 TP; 009 Triglicerídios; 033 TTPA; 024 Uréia

- **54 Cosmos:** CONS-004 Consulta Domiciliar; CONS-005 Reconsulta Domiciliar

- **57 Lord Golden (14):** ELAB-005 Albumina; 025 ALT; 065 Bacterioscopia de Pele; 006 Colesterol total; CESP-000; ELAB-011 Creatinina; 028 FA; 013 Glicose; 035 Hemograma + Plaquetas; 084 Parasitológico de Pele; 072 Pesquisa Malassezia; 061 Proteínas Totais e Frações; 009 Triglicerídios; 024 Uréia

- **59 Soundvet:** SERV-003 Aluguel de sala para exames

- **60 Dudu:** CESP-009 Consulta com Ortopedista; ELAB-027 CPK; ELAB-030 LDH

- **66 Danielli Herbst Ely:** RAIX-001 Raio X (Por Projeção); USSA-009 Ultrassonografia de Revisão (30 dias)

- **73 Intensiva (24):** ELAB-005 Albumina; 025 ALT; 006 Colesterol total; 037 Contagem de Plaquetas; 080 Coproparasitológico; 011 Creatinina; 052 Exame Físico da urina; 053 Exame Químico da Urina; 054 Exame Sedimentoscópico da Urina; 028 FA; 044 Fibrinogênio; 013 Glicose; 039 Hematócrito e Proteína Plasmática; 036 Hemograma Completo; 038 Leucograma; 070 Pesquisa Ácaros; 076 Pesquisa Hemoparasitas; 078 Pesquisa Microfilárias; 059 Proteína Total; 061 Proteínas Totais e Frações; 009 Triglicerídios; 024 Uréia; 050 Urinálise; 051 Urinálise Avançada

- **79 Ana Thais:** CESP-000; OFCL-009 Fluoresceina; OFCL-010 Schirmer

- **87 PróVita:** EESP-146 Leishmaniose - Tr Igg Elisa - Idexx

---

## 3. Valores zerados (0,00) — para sua decisão

Nenhum valor nulo; todos são `0,00`. Total de 96 linhas (P, M e G de cada procedimento).

Procedimentos zerados:

- **CONS-002 Reconsulta Simples (Clínica Geral) = 0,00** (P/M/G) na grande maioria, possivelmente intencional (reconsulta sem custo): negociações 3, 4, 5, 6, 12, 17, 18, 20, 21, 27, 29, 31, 33, 43, 49, 51, 57, 60, 70, 71, 72, 73, 74, 82, 85, 89, 94, 97, 101. -- Resolvido
- **DERM-004 Wood = 0,00** — negociação 15 (Luciana Marchioro). Também é um procedimento fora do perfil (seção 1). -- Tirar da tabela.
- **USSA-009 Ultrassonografia de Revisão (30 dias) = 0,00** — negociação 89 (Sutilvet). -- Resolvido

Perguntas: o zero em Reconsulta é intencional (sem cobrança)? Se sim, mantém-se como "gratuito". Se não, precisa de valor. -- Sim, é zerado por padrão

---

## 4. Standby – Belo Horizonte

- **Negociação 86 – DIA** (prestador 17, "Dia. Prevenção Animal"): negociação na cidade 23 (Belo Horizonte); o prestador está **sem cidade/UF no endereço**, então o vínculo com a tabela de preços não se resolve. Os 5 procedimentos dela batem com o perfil. **Nenhuma ação até o ajuste de BH.**
