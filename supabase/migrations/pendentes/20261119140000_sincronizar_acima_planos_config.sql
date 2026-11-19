-- Sincroniza o texto «<plano base> Acima» em planos_config (matriz de carências e limites).
-- Regra: para cada procedimento com plano base Clássico/Avançado/Ultra, os planos ABAIXO do base ficam com
-- limite = carencia = '<nome do plano base> Acima'; do base para cima não pode sobrar par «… Acima» (vira '').
-- Procedimentos com algum valor real (não vazio e não «Acima») abaixo do base NÃO são tocados (conflito):
-- em 19/11/2026 só o GAST-013 (plano 3 com limite '3' e carência '150 Dias' e plano base Ultra) — decidir manualmente.
-- Números esperados em 19/11/2026: 23 linhas criadas (9 procedimentos), 10 corrigidas, 4 zeradas.
-- Idempotente. Guarda o estado anterior em public.planos_config_backup_acima_20261119 (ver .rollback.sql).
-- Pressupõe a hierarquia por id: 1 Básico, 2 Clássico, 3 Avançado, 4 Ultra.

create table if not exists public.planos_config_backup_acima_20261119 (
  config_id integer primary key,
  acao text not null check (acao in ('atualizada', 'criada')),
  plano_id integer,
  procedimento text,
  limite_anterior text,
  carencia_anterior text,
  copiado_em timestamptz not null default now()
);

do $$
begin
  create temp table _esperado on commit drop as
    select upper(p.codigo) as codigo, pl.id as plano_id, pb.nome || ' Acima' as texto
    from public.procedimentos p
    join public.planos pb on pb.id = p.plano_base_id
    join public.planos pl on pl.id >= 1 and pl.id < p.plano_base_id
    where p.plano_base_id between 2 and 4;

  create temp table _conflitos on commit drop as
    select distinct e.codigo
    from _esperado e
    join public.planos_config c on c.plano_id = e.plano_id and upper(c.procedimento) = e.codigo
    where (trim(coalesce(c.limite, '')) <> '' and trim(c.limite) !~* '\sacima$')
       or (trim(coalesce(c.carencia, '')) <> '' and trim(c.carencia) !~* '\sacima$');

  -- 1) corrige linhas abaixo do base com texto diferente do esperado
  with alvo as (
    select c.id, e.texto
    from _esperado e
    join public.planos_config c on c.plano_id = e.plano_id and upper(c.procedimento) = e.codigo
    where e.codigo not in (select codigo from _conflitos)
      and (trim(coalesce(c.limite, '')) <> e.texto or trim(coalesce(c.carencia, '')) <> e.texto)
  ), salvo as (
    insert into public.planos_config_backup_acima_20261119
      (config_id, acao, plano_id, procedimento, limite_anterior, carencia_anterior)
    select c.id, 'atualizada', c.plano_id, c.procedimento, c.limite, c.carencia
    from public.planos_config c join alvo a on a.id = c.id
    on conflict (config_id) do nothing
  )
  update public.planos_config c
     set limite = a.texto, carencia = a.texto
    from alvo a
   where c.id = a.id;

  -- 2) cria as linhas que faltam abaixo do base
  with novas as (
    insert into public.planos_config (plano_id, procedimento, limite, carencia)
    select e.plano_id, e.codigo, e.texto, e.texto
    from _esperado e
    where e.codigo not in (select codigo from _conflitos)
      and not exists (
        select 1 from public.planos_config c
        where c.plano_id = e.plano_id and upper(c.procedimento) = e.codigo
      )
    returning id, plano_id, procedimento
  )
  insert into public.planos_config_backup_acima_20261119 (config_id, acao, plano_id, procedimento)
  select id, 'criada', plano_id, procedimento from novas
  on conflict (config_id) do nothing;

  -- 3) do base para cima, zera o par «… Acima» que sobrou de um plano base anterior
  with alvo as (
    select c.id
    from public.procedimentos p
    join public.planos_config c on upper(c.procedimento) = upper(p.codigo)
    where p.plano_base_id between 1 and 5
      and c.plano_id between 1 and 4
      and (p.plano_base_id = 5 or c.plano_id >= p.plano_base_id)
      and trim(coalesce(c.limite, '')) ~* '\sacima$'
      and trim(coalesce(c.carencia, '')) ~* '\sacima$'
  ), salvo as (
    insert into public.planos_config_backup_acima_20261119
      (config_id, acao, plano_id, procedimento, limite_anterior, carencia_anterior)
    select c.id, 'atualizada', c.plano_id, c.procedimento, c.limite, c.carencia
    from public.planos_config c join alvo a on a.id = c.id
    on conflict (config_id) do nothing
  )
  update public.planos_config c
     set limite = '', carencia = ''
    from alvo a
   where c.id = a.id;
end $$;
