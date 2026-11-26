-- Fase 2 do histórico no banco: o chat (1ª página) sai de `zap_mensagens` enquanto a conversa foi conferida com a WATI
-- há poucos minutos. Precisa da migracao-mensagens.sql já aplicada. Sem estas colunas o painel segue lendo da WATI.
--
-- mensagens_ok_em     quando o painel leu a 1ª página da WATI e o banco ficou "em dia" (o webhook mantém dali em diante)
-- mensagens_tem_mais  se a WATI tinha mensagens mais antigas além da 1ª página (botão "Carregar anteriores")
alter table public.zap_conversas add column if not exists mensagens_ok_em timestamptz;
alter table public.zap_conversas add column if not exists mensagens_tem_mais boolean not null default false;

-- Desligar sem desfazer nada: variável de ambiente ZAP_MENSAGENS_BANCO=0 (o chat volta a ler da WATI).
