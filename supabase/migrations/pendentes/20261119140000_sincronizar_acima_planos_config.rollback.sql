-- Desfaz 20261119140000_sincronizar_acima_planos_config.sql usando a tabela de backup.
-- Remove as linhas criadas pela migração e restaura limite/carência das atualizadas.
-- A tabela de backup é mantida; apague-a manualmente quando não precisar mais:
--   drop table public.planos_config_backup_acima_20261119;

delete from public.planos_config c
using public.planos_config_backup_acima_20261119 b
where b.config_id = c.id and b.acao = 'criada';

update public.planos_config c
   set limite = b.limite_anterior, carencia = b.carencia_anterior
  from public.planos_config_backup_acima_20261119 b
 where b.config_id = c.id and b.acao = 'atualizada';
