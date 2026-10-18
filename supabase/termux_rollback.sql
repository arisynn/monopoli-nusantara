-- Deploy the updated Edge source from the SAME package first and configure its
-- Vault endpoint/token. Old Edge model manifests cannot commit after activation.
-- No room, job, receipt or save is deleted by this switch.
begin;
update public.mn_worker_settings set provider='edge';
do $$ begin
 if to_regclass('cron.job') is not null and not exists(select 1 from cron.job where jobname='mn-bot-recovery' and active) then
  perform cron.schedule('mn-bot-recovery','* * * * *','select public.mn_wake_bot_worker();');
 end if;
end $$;
commit;
select public.mn_wake_bot_worker();
