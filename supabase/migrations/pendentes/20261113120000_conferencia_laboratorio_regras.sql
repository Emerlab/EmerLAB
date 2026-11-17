-- Conferência Laboratório × Plano — regras que o usuário "ensina" passam a valer para todos os meses.
-- SOMENTE objetos novos: nenhuma tabela existente é alterada e nenhum dado existente é tocado.
--   * lab_exame_equivalencia : exame do plano = exame do laboratório (por laboratório)
--   * lab_pessoa_alias       : tutor alternativo conhecido (por laboratório)
--   * lab_exame_perfil(+item): pacotes/perfis de exames (por laboratório)
--   * lab_vinculo_base       : exame do plano -> código na Valores de Base (por laboratório)
--   * lab_valor_aceito      : diferença de valor já aceita (exame + valor do plano + valor do laboratório), por laboratório
--   * lab_importacao_memoria: colunas mapeadas por arquivo e a planilha Valores de Base guardada, por laboratório
--   * lab_conferencia_revisao: trilha de auditoria das decisões manuais
--
-- Compatível com o banco atual: os nomes abaixo NÃO colidem com lab_conferencia_sessao, lab_exame_mapeamento e
-- lab_pessoa_mapeamento (já existentes, não são tocadas). Tudo é "create ... if not exists".
-- Leitura: quem vê a Conferência. Escrita: quem edita a Conferência (mesmo padrão do RLS por permissão).
-- Aplicar manualmente (supabase db push / SQL editor) após revisão.
-- Reversão: supabase/migrations/pendentes/20261113120000_conferencia_laboratorio_regras.rollback.sql

create table if not exists public.lab_exame_equivalencia (
  id uuid primary key default gen_random_uuid(),
  laboratorio_id bigint not null references public.prestadores (id) on delete cascade,
  nome_a text not null,
  nome_a_normalizado text not null,
  nome_b text not null,
  nome_b_normalizado text not null,
  ativo boolean not null default true,
  criado_por uuid,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (laboratorio_id, nome_a_normalizado, nome_b_normalizado)
);

create table if not exists public.lab_pessoa_alias (
  id uuid primary key default gen_random_uuid(),
  laboratorio_id bigint not null references public.prestadores (id) on delete cascade,
  tipo text not null default 'tutor' check (tipo in ('tutor')),
  nome_plano text not null,
  nome_plano_normalizado text not null,
  nome_lab text not null,
  nome_lab_normalizado text not null,
  ativo boolean not null default true,
  criado_por uuid,
  criado_em timestamptz not null default now(),
  unique (laboratorio_id, tipo, nome_plano_normalizado, nome_lab_normalizado)
);

create table if not exists public.lab_exame_perfil (
  id uuid primary key default gen_random_uuid(),
  laboratorio_id bigint not null references public.prestadores (id) on delete cascade,
  nome text not null,
  descricao text,
  valor numeric(12, 2),
  vigencia_inicio date,
  vigencia_fim date,
  ativo boolean not null default true,
  criado_por uuid,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists public.lab_exame_perfil_item (
  id uuid primary key default gen_random_uuid(),
  perfil_id uuid not null references public.lab_exame_perfil (id) on delete cascade,
  nome_exame text not null,
  nome_exame_normalizado text not null
);

create table if not exists public.lab_vinculo_base (
  id uuid primary key default gen_random_uuid(),
  laboratorio_id bigint not null references public.prestadores (id) on delete cascade,
  exame_normalizado text not null,
  exame_plano text not null,
  codigo_base text not null,
  nome_base text,
  criado_por uuid,
  atualizado_em timestamptz not null default now(),
  unique (laboratorio_id, exame_normalizado)
);

create table if not exists public.lab_valor_aceito (
  id uuid primary key default gen_random_uuid(),
  laboratorio_id bigint not null references public.prestadores (id) on delete cascade,
  exame_normalizado text not null,
  exame text not null,
  valor_plano numeric(12, 2) not null,
  valor_lab numeric(12, 2) not null,
  justificativa text,
  criado_por uuid,
  criado_em timestamptz not null default now(),
  unique (laboratorio_id, exame_normalizado, valor_plano, valor_lab)
);

create table if not exists public.lab_importacao_memoria (
  id uuid primary key default gen_random_uuid(),
  laboratorio_id bigint not null references public.prestadores (id) on delete cascade,
  origem text not null check (origem in ('valores_base', 'honorarios', 'mellislab')),
  nome_arquivo text,
  mapa_colunas jsonb not null default '{}'::jsonb,
  linhas jsonb,
  atualizado_por uuid,
  atualizado_em timestamptz not null default now(),
  unique (laboratorio_id, origem)
);

create table if not exists public.lab_conferencia_revisao (
  id uuid primary key default gen_random_uuid(),
  laboratorio_id bigint not null references public.prestadores (id) on delete cascade,
  periodo_ym text check (periodo_ym is null or periodo_ym ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  sessao_id text,
  usuario_id uuid,
  usuario_nome text,
  acao text not null,
  resultado_id text,
  status_final text,
  justificativa text,
  dados jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now()
);

create index if not exists lab_exame_equivalencia_lab_idx on public.lab_exame_equivalencia (laboratorio_id) where ativo;
create index if not exists lab_pessoa_alias_lab_idx on public.lab_pessoa_alias (laboratorio_id) where ativo;
create index if not exists lab_exame_perfil_lab_idx on public.lab_exame_perfil (laboratorio_id) where ativo;
create index if not exists lab_exame_perfil_item_perfil_idx on public.lab_exame_perfil_item (perfil_id);
create index if not exists lab_vinculo_base_lab_idx on public.lab_vinculo_base (laboratorio_id);
create index if not exists lab_valor_aceito_lab_idx on public.lab_valor_aceito (laboratorio_id);
create index if not exists lab_importacao_memoria_lab_idx on public.lab_importacao_memoria (laboratorio_id);
create index if not exists lab_conferencia_revisao_lab_idx on public.lab_conferencia_revisao (laboratorio_id, criado_em desc);

do $$
declare
  t text;
begin
  foreach t in array array[
    'lab_exame_equivalencia', 'lab_pessoa_alias', 'lab_exame_perfil',
    'lab_exame_perfil_item', 'lab_vinculo_base', 'lab_valor_aceito', 'lab_importacao_memoria',
    'lab_conferencia_revisao'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_leitura', t);
    execute format('drop policy if exists %I on public.%I', t || '_escrita', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.emer_tem_permissao(array[%L, %L, %L, %L]))',
      t || '_leitura', t,
      'configuracoes.conferencia_laboratorio.read', 'credenciamento.view', 'credenciamento.edit', 'access.manage');
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.emer_tem_permissao(array[%L, %L, %L, %L])) with check (public.emer_tem_permissao(array[%L, %L, %L, %L]))',
      t || '_escrita', t,
      'configuracoes.conferencia_laboratorio.update', 'configuracoes.conferencia_laboratorio.create', 'credenciamento.edit', 'access.manage',
      'configuracoes.conferencia_laboratorio.update', 'configuracoes.conferencia_laboratorio.create', 'credenciamento.edit', 'access.manage');
  end loop;
end $$;

-- Salva um perfil e seus itens de uma vez (SECURITY INVOKER: respeita o RLS acima).
create or replace function public.salvar_lab_exame_perfil(
  p_laboratorio_id bigint,
  p_nome text,
  p_descricao text,
  p_valor numeric,
  p_vigencia_inicio date,
  p_vigencia_fim date,
  p_itens jsonb,
  p_criado_por uuid
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.lab_exame_perfil (
    laboratorio_id, nome, descricao, valor, vigencia_inicio, vigencia_fim, criado_por
  ) values (
    p_laboratorio_id, p_nome, p_descricao, p_valor, p_vigencia_inicio, p_vigencia_fim, p_criado_por
  ) returning id into v_id;

  insert into public.lab_exame_perfil_item (perfil_id, nome_exame, nome_exame_normalizado)
  select v_id, i->>'nome_exame', i->>'nome_exame_normalizado'
  from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) as i
  where coalesce(i->>'nome_exame', '') <> '';

  return v_id;
end;
$$;

revoke all on function public.salvar_lab_exame_perfil(bigint, text, text, numeric, date, date, jsonb, uuid) from public, anon;
grant execute on function public.salvar_lab_exame_perfil(bigint, text, text, numeric, date, date, jsonb, uuid) to authenticated;
