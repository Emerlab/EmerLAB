-- Medição das chamadas à WATI e pausa de 429 compartilhada entre as instâncias da Vercel.
-- Opcional: sem estas tabelas o painel funciona igual (a medição só vai para o log e a pausa fica por instância).

-- Uma linha por instância, por minuto e por rota. O servidor apaga o que tem mais de 14 dias.
create table if not exists public.zap_wati_uso (
    id bigserial primary key,
    minuto timestamptz not null,
    rota text not null,
    chamadas integer not null,
    limites integer not null default 0 -- quantas voltaram 429
);
create index if not exists zap_wati_uso_minuto_idx on public.zap_wati_uso (minuto desc);
alter table public.zap_wati_uso enable row level security;

-- Uma linha só ('leitura'): até quando as leituras (GET) na WATI ficam em pausa depois de um 429.
create table if not exists public.zap_wati_pausa (
    id text primary key,
    ate timestamptz not null
);
alter table public.zap_wati_pausa enable row level security;

-- Consulta: chamadas por rota nos últimos 60 minutos (soma das instâncias)
--   select rota, sum(chamadas) as chamadas, sum(limites) as limites
--   from zap_wati_uso where minuto > now() - interval '60 minutes'
--   group by rota order by chamadas desc;
