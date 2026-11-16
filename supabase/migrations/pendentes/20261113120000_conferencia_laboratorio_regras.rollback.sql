-- Reversão de 20261113120000_conferencia_laboratorio_regras.sql
-- ATENÇÃO: apaga as regras e a trilha de revisão da Conferência Laboratório.
drop function if exists public.salvar_lab_exame_perfil(bigint, text, text, numeric, date, date, jsonb, uuid);
drop table if exists public.lab_exame_perfil_item;
drop table if exists public.lab_exame_perfil;
drop table if exists public.lab_conferencia_revisao;
drop table if exists public.lab_vinculo_base;
drop table if exists public.lab_pessoa_alias;
drop table if exists public.lab_exame_equivalencia;
