-- Escopo planos:ler (tabela de planos pública) nas chaves da API v1.
-- A constraint antiga só aceitava rede:ler e pagamentos:*; chave de navegador com planos:ler
-- também precisa de ao menos uma origem permitida, como a de rede.
alter table public.api_chaves drop constraint api_chaves_escopos_validos;
alter table public.api_chaves add constraint api_chaves_escopos_validos check (
    escopos <@ array['rede:ler', 'planos:ler', 'pagamentos:ler', 'pagamentos:escrever']::text[]
);

alter table public.api_chaves drop constraint api_chaves_rede_exige_origem;
alter table public.api_chaves add constraint api_chaves_rede_exige_origem check (
    not (escopos && array['rede:ler', 'planos:ler']::text[]) or cardinality(origens_permitidas) > 0
);
