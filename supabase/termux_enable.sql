-- Apply migration 007 and deploy the backend from this package first.
-- Keeps room data and existing leases; Termux takes over after old leases drain.
begin;
update public.mn_worker_settings set provider='termux',model_manifest='f398a9793efd23c3c74e3e46d89aab0117a4c23c5102036d7e8f77a51c94e46d';
do $$ declare j record;begin
 if to_regclass('cron.job') is not null then
  for j in execute 'select jobid from cron.job where jobname=''mn-bot-recovery''' loop
   perform cron.unschedule(j.jobid);
  end loop;
 end if;
end $$;
commit;
select public.mn_online_capabilities();
