-- Ao trocar o prestador de uma negociação (veterinarios.prestador_id),
-- propaga para negociacoes_vet.prestador_id. Complementa o gatilho de
-- 20261116200000, que só cobre insert/update de negociacoes_vet.veterinario_id.

create or replace function public.veterinarios_propaga_prestador_id()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.prestador_id is distinct from old.prestador_id then
    update public.negociacoes_vet
       set prestador_id = new.prestador_id
     where veterinario_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_veterinarios_propaga_prestador_id on public.veterinarios;
create trigger trg_veterinarios_propaga_prestador_id
  after update of prestador_id on public.veterinarios
  for each row execute function public.veterinarios_propaga_prestador_id();
