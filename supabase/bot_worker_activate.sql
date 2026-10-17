-- OPTIONAL activation, NOT part of automatic app migrations.
-- FIRST: deploy monopoli-bots Edge Function, configure MN_BOT_WORKER_SECRET
-- in Supabase Edge Function Secrets, and store the HTTPS worker URL + same
-- secret under Vault names mn_bot_worker_url and mn_bot_worker_secret.
-- Do NOT paste live secrets into source control or recorded SQL artifacts.
-- Check availability/permissions in Supabase Extensions before executing.
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

do $$
begin
 if not exists(select 1 from vault.decrypted_secrets where name='mn_bot_worker_url'
               and decrypted_secret like 'https://%')
    or not exists(select 1 from vault.decrypted_secrets where name='mn_bot_worker_secret'
               and length(decrypted_secret)>=32) then
  raise exception 'Worker URL/secret must be configured in Supabase Vault first';
 end if;
 if to_regprocedure('public.mn_wake_bot_worker()') is null then
  raise exception 'Prior bot migration is not installed';
 end if;
 if exists(select 1 from cron.job where jobname='mn-bot-recovery') then
  perform cron.unschedule('mn-bot-recovery');
 end if;
 perform cron.schedule('mn-bot-recovery','* * * * *','select public.mn_wake_bot_worker();');
end $$;
-- One manual recovery attempt; a null result means there are no due jobs
-- or the wakeup prerequisites are missing. It is not proof of execution.
select public.mn_wake_bot_worker() as wake_request_id;
