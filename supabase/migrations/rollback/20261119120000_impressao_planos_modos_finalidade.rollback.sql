-- Desfaz o preset "site": remove as linhas do site, restaura a unicidade antiga e tira a coluna.
delete from public.impressao_planos_modos where finalidade = 'site';

alter table public.impressao_planos_modos
  drop constraint if exists impressao_planos_modos_plano_cidade_finalidade_uq;

alter table public.impressao_planos_modos
  drop constraint if exists impressao_planos_modos_finalidade_ck;

alter table public.impressao_planos_modos
  add constraint impressao_planos_modos_plano_cidade_uq unique (plano_id, cidade_id);

alter table public.impressao_planos_modos
  drop column if exists finalidade;
