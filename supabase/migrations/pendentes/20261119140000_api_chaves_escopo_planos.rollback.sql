-- Reverte o escopo planos:ler. Antes, revogue ou edite as chaves que usam planos:ler.
alter table public.api_chaves drop constraint api_chaves_escopos_validos;
alter table public.api_chaves add constraint api_chaves_escopos_validos check (
    escopos <@ array['rede:ler', 'pagamentos:ler', 'pagamentos:escrever']::text[]
);

alter table public.api_chaves drop constraint api_chaves_rede_exige_origem;
alter table public.api_chaves add constraint api_chaves_rede_exige_origem check (
    not ('rede:ler' = any (escopos)) or cardinality(origens_permitidas) > 0
);
