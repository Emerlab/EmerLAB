-- Histórico das mensagens no banco (fase 1: gravação em paralelo, sem mudar o que o painel mostra).
-- Guarda o item da WATI como veio (raw), tanto o que chega pelo webhook quanto o que o painel já lê do getMessages.
-- Objetivo: servir o chat daqui e parar de consultar a WATI a cada abertura (limite de 10 req/10 s).
-- Sem esta tabela o painel funciona igual (as gravações falham em silêncio).
create table if not exists public.zap_mensagens (
    id text primary key,           -- "<origem>:<id da WATI>": webhook e getMessages podem ter ids diferentes; a fase 2 decide a junção
    wa_id text not null,
    em timestamptz not null,       -- horário da mensagem (da WATI)
    evento text not null default 'message',
    minha boolean not null default false,
    wamid text,                    -- id do WhatsApp, quando vem
    status text,                   -- sent / delivered / read…
    origem text not null check (origem in ('webhook', 'wati')),
    raw jsonb not null,
    gravada_em timestamptz not null default now()
);
create index if not exists zap_mensagens_conversa_idx on public.zap_mensagens (wa_id, em desc);
create index if not exists zap_mensagens_wamid_idx on public.zap_mensagens (wamid) where wamid is not null;
alter table public.zap_mensagens enable row level security;

-- Conferência da fase 1 (rode depois de 1–2 dias):
--   1) volume por origem
--      select origem, count(*), min(em), max(em) from zap_mensagens group by origem;
--   2) mensagens do getMessages que NÃO têm par vindo do webhook (mesma conversa, mesmo texto, ±5 s)
--      select w.wa_id, w.em, left(w.raw->>'text', 40) as texto
--      from zap_mensagens w
--      where w.origem = 'wati' and w.evento = 'message' and w.em > now() - interval '2 days'
--        and not exists (select 1 from zap_mensagens k
--                        where k.origem = 'webhook' and k.wa_id = w.wa_id
--                          and abs(extract(epoch from (k.em - w.em))) <= 5
--                          and coalesce(k.raw->>'text', '') = coalesce(w.raw->>'text', ''))
--      order by w.em desc limit 50;
--   Se (2) vier quase vazio, o webhook cobre tudo e o chat pode sair do banco.
