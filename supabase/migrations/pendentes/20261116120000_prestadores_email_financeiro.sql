-- E-mail financeiro alternativo do prestador (seção Financeiro do cadastro): vale para TODOS os meses.
-- Prioridade do destino dos e-mails de repasse/comprovante:
--   1) pagamentos_registros.email_financeiro (ajuste pontual de um mês, legado)
--   2) prestadores.email_financeiro (esta coluna)
--   3) prestadores.email
-- Aditiva: só cria a coluna e copia, quando vazia, o e-mail alternativo já usado nos registros de cada prestador.

alter table public.prestadores add column if not exists email_financeiro text;

update public.prestadores p
set email_financeiro = x.email
from (
    select distinct on (prestador_id) prestador_id, lower(trim(email_financeiro)) as email
    from public.pagamentos_registros
    where prestador_id is not null and nullif(trim(email_financeiro), '') is not null
    order by prestador_id, ano desc, mes desc
) x
where p.id = x.prestador_id and nullif(trim(p.email_financeiro), '') is null;
