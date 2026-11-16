-- Reversão de 20261116120000_prestadores_email_financeiro.sql (apaga o e-mail financeiro alternativo dos prestadores)
alter table public.prestadores drop column if exists email_financeiro;
