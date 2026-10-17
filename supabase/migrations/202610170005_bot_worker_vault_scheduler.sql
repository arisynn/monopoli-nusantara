-- After deploying the matching Edge Function: create encrypted Vault values and
-- schedule a 1-minute recovery tick. This is safe for existing empty or live rooms.
do $$
begin
  if not exists(select 1 from vault.decrypted_secrets where name='mn_bot_worker_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),
      'mn_bot_worker_secret','Monopoli v4.10.1 database->Edge worker token');
  end if;
  if not exists(select 1 from vault.decrypted_secrets where name='mn_bot_worker_url') then
    perform vault.create_secret('https://ymunfgclqfdqaczluqti.supabase.co/functions/v1/monopoli-bots',
      'mn_bot_worker_url','Monopoli v4.10.1 worker endpoint');
  end if;
  if not exists(select 1 from cron.job where jobname='mn-bot-recovery') then
    perform cron.schedule('mn-bot-recovery','* * * * *','select public.mn_wake_bot_worker();');
  end if;
end $$;
