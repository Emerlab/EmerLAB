-- Último modo gerado da impressão de honorários: categorias (ordem/ativas) e procedimentos marcados por cidade.

create table if not exists public.impressao_honorarios_modos (
  id bigint generated always as identity primary key,
  cidade_id integer not null unique references public.cidades (id) on delete cascade,
  selecao jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references public.profiles (id) on delete set null
);

comment on table public.impressao_honorarios_modos is
  'Último modo de impressão de honorários (ordem/ativas das categorias e procedimentos marcados) por cidade, compartilhado pela equipe.';

alter table public.impressao_honorarios_modos enable row level security;

drop policy if exists impressao_honorarios_modos_leitura_logado on public.impressao_honorarios_modos;
create policy impressao_honorarios_modos_leitura_logado
  on public.impressao_honorarios_modos
  for select
  to authenticated
  using (true);

drop policy if exists impressao_honorarios_modos_insert_permissao on public.impressao_honorarios_modos;
create policy impressao_honorarios_modos_insert_permissao
  on public.impressao_honorarios_modos
  for insert
  to authenticated
  with check (
    (select public.emer_pode_escrever_modulo(
      array['supertabela.']::text[],
      array['supertabela.edit']::text[]
    ))
  );

drop policy if exists impressao_honorarios_modos_update_permissao on public.impressao_honorarios_modos;
create policy impressao_honorarios_modos_update_permissao
  on public.impressao_honorarios_modos
  for update
  to authenticated
  using (
    (select public.emer_pode_escrever_modulo(
      array['supertabela.']::text[],
      array['supertabela.edit']::text[]
    ))
  )
  with check (
    (select public.emer_pode_escrever_modulo(
      array['supertabela.']::text[],
      array['supertabela.edit']::text[]
    ))
  );

grant select, insert, update on public.impressao_honorarios_modos to authenticated;
grant usage, select on sequence public.impressao_honorarios_modos_id_seq to authenticated;
