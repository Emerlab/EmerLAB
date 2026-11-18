-- Histórico de gerações do zip de planos por cidade (impressão rápida).

create table if not exists public.impressao_planos_geracoes (
  id bigint generated always as identity primary key,
  cidade_id integer not null references public.cidades (id) on delete cascade,
  plano_ids integer[] not null check (cardinality(plano_ids) > 0),
  gerado_em timestamptz not null default now(),
  gerado_por uuid references public.profiles (id) on delete set null
);

comment on table public.impressao_planos_geracoes is
  'Histórico das gerações do zip de planos por cidade (quem gerou, quando e quais planos).';

create index if not exists impressao_planos_geracoes_cidade_gerado_em_idx
  on public.impressao_planos_geracoes (cidade_id, gerado_em desc);

alter table public.impressao_planos_geracoes enable row level security;

-- Leitura: qualquer logado (a tela já exige planos.impressao).
drop policy if exists impressao_planos_geracoes_leitura_logado on public.impressao_planos_geracoes;
create policy impressao_planos_geracoes_leitura_logado
  on public.impressao_planos_geracoes
  for select
  to authenticated
  using (true);

-- Escrita: permissão de planos e o registro precisa ser do próprio usuário.
drop policy if exists impressao_planos_geracoes_insert_permissao on public.impressao_planos_geracoes;
create policy impressao_planos_geracoes_insert_permissao
  on public.impressao_planos_geracoes
  for insert
  to authenticated
  with check (
    (select public.emer_pode_escrever_modulo(
      array['planos.']::text[],
      array['planos.view']::text[]
    ))
    and gerado_por = (select auth.uid())
  );

grant select, insert on public.impressao_planos_geracoes to authenticated;
grant usage, select on sequence public.impressao_planos_geracoes_id_seq to authenticated;
