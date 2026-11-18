-- Observações "gerais": saem nas páginas finais do PDF em vez de no grupo do procedimento.

alter table public.planos_observacoes
  add column if not exists geral boolean not null default false;

comment on column public.planos_observacoes.geral is
  'Quando true, a observação sai nas páginas finais do PDF e não exige procedimentos vinculados.';

alter table public.honorarios_observacoes
  add column if not exists geral boolean not null default false;

comment on column public.honorarios_observacoes.geral is
  'Quando true, a observação sai nas páginas finais do PDF e não exige procedimentos vinculados.';
