-- Run only AFTER auditing pg_net, Vault and pg_cron on STAGING and deploying the worker.
-- Configure Vault entries mn_bot_worker_url and mn_bot_worker_secret using official secret tooling.
-- Never paste real secret values into tracked SQL. Worker URL must be HTTPS.
-- This watchdog recovers lost HTTP wakeups and expired worker leases, independent of browsers.
select cron.schedule('mn-bot-recovery','* * * * *','select public.mn_wake_bot_worker();');
select public.mn_wake_bot_worker();
