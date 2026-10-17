# Connectify — deployment verified (2026-10-17)

Project ref: `ymunfgclqfdqaczluqti`. Database migrations installed: `mn_persistent_online`, `mn_hybrid_bot_jobs`, `mn_nusa_mind_settings`, `mn_bot_worker_prerequisites_4101`, `mn_bot_worker_vault_authorization_4101`, and `mn_bot_worker_vault_scheduler_4101`. No old migration was rerun.

Supabase Edge Function `monopoli-bots` deployed as **version 2**, ACTIVE, verify_jwt false with a dedicated secret-header and Vault-backed service-role validation. Vault contains `mn_bot_worker_secret` (random 64-char token) and `mn_bot_worker_url`; cron `mn-bot-recovery` enabled every minute. Both pg_net and pg_cron installed.

One direct pg_net smoke test succeeded: valid worker token HTTP 200 `{"claimed":0,"committed":0,"discarded":0}`, deliberately invalid token HTTP 401. No game-room job was available; 2-human/1-bot end-to-end not yet validated.

Supabase auth/v1/settings verified through API: email provider enabled, anonymous users enabled, signup enabled, mailer_autoconfirm enabled. The 2026-10-17 Vercel production /api/online?config=1 endpoint returned `online:true` but `onlineBots:false`; build.json returned 4.10.0 (prior release). Vercel scope `karis-projects-9fbe4cf1` denies project settings access (403), so v4.10.1 was **not** deployed on Vercel, and bot UI was **not** enabled. The Vercel connection needs project scope authorization. After resolving access, deploy **this current source** (not old Git commit), set `MN_ONLINE_BOTS_ENABLED=true` and redeploy; verify build.json reports v4.10.1, then test live 2 humans + 1 bot including reconnect.

Security: no token should be copied into the frontend or Git; the Vault RPC has EXECUTE only for postgres/service_role. Avoid printing Vault decrypted secrets or private environment settings in support logs.
