-- Preset "site" da tabela de planos pública: cada plano+cidade passa a ter um modo por finalidade
-- ('impressao' = PDF/ZIP, que já existia; 'site' = página pública /tabela-planos).
-- Linhas existentes ficam como 'impressao'. Seguro de reaplicar.

alter table public.impressao_planos_modos
  add column if not exists finalidade text not null default 'impressao';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'impressao_planos_modos_finalidade_ck'
      and conrelid = 'public.impressao_planos_modos'::regclass
  ) then
    alter table public.impressao_planos_modos
      add constraint impressao_planos_modos_finalidade_ck
      check (finalidade in ('impressao', 'site'));
  end if;
end $$;

-- A unicidade passa a incluir a finalidade.
alter table public.impressao_planos_modos
  drop constraint if exists impressao_planos_modos_plano_cidade_uq;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'impressao_planos_modos_plano_cidade_finalidade_uq'
      and conrelid = 'public.impressao_planos_modos'::regclass
  ) then
    alter table public.impressao_planos_modos
      add constraint impressao_planos_modos_plano_cidade_finalidade_uq
      unique (plano_id, cidade_id, finalidade);
  end if;
end $$;

comment on column public.impressao_planos_modos.finalidade is
  'Para que serve o modo: impressao (PDF/ZIP) ou site (tabela de planos pública).';
