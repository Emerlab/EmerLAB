-- Negociação ligada direto ao prestador (fase "expandir").
-- Aditiva e retrocompatível: veterinario_id continua existindo e funcionando.
-- Backup prévio: schema backup_negociacao_20261116.

alter table public.negociacoes_vet
  add column if not exists prestador_id bigint
  references public.prestadores(id) on delete set null;

-- Preenchimento sem disparar o log de auditoria linha a linha.
alter table public.negociacoes_vet disable trigger trg_audit_negociacoes_vet;

update public.negociacoes_vet n
   set prestador_id = v.prestador_id
  from public.veterinarios v
 where v.id = n.veterinario_id
   and v.prestador_id is not null
   and n.prestador_id is distinct from v.prestador_id;

alter table public.negociacoes_vet enable trigger trg_audit_negociacoes_vet;

-- O nome do perfil do prestador prevalece sobre a cópia na negociação.
update public.veterinarios v
   set nome = p.nome
  from public.prestadores p
 where p.id = v.prestador_id
   and v.nome is distinct from p.nome;

create index if not exists negociacoes_vet_prestador_id_idx
  on public.negociacoes_vet (prestador_id);

create unique index if not exists negociacoes_vet_prestador_proc_porte_uniq
  on public.negociacoes_vet (prestador_id, procedimento_id, porte_id)
  where prestador_id is not null;

-- Mantém prestador_id coerente enquanto o código antigo ainda grava por veterinario_id.
create or replace function public.negociacoes_vet_sync_prestador_id()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.veterinario_id is not null then
    select v.prestador_id into new.prestador_id
      from public.veterinarios v
     where v.id = new.veterinario_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_negociacoes_vet_sync_prestador_id on public.negociacoes_vet;
create trigger trg_negociacoes_vet_sync_prestador_id
  before insert or update of veterinario_id on public.negociacoes_vet
  for each row execute function public.negociacoes_vet_sync_prestador_id();

-- Leitura sem a armadilha dos IDs.
create or replace view public.negociacoes_por_prestador
with (security_invoker = true) as
select n.prestador_id,
       n.veterinario_id as negociacao_id,
       n.procedimento_id,
       n.porte_id,
       n.valor,
       n.nome_alternativo
  from public.negociacoes_vet n
 where n.prestador_id is not null;

comment on column public.negociacoes_vet.veterinario_id is
  'ATENÇÃO: é veterinarios.id (ID da NEGOCIAÇÃO), nunca prestadores.id. Para o prestador use prestador_id.';
comment on column public.negociacoes_vet.prestador_id is
  'prestadores.id dono do valor negociado. Preenchido a partir de veterinarios.prestador_id.';
