-- v4.10.1 connectify deployment: privileged Vault-only worker token validation.
-- This endpoint is available only to service_role. Never return/store plaintext tokens in logs.
create or replace function public.mn_bot_worker_authorized(p_secret text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select length(p_secret) between 32 and 256
      and extensions.digest(convert_to(p_secret, 'UTF8'),'sha256')
          = extensions.digest(convert_to(decrypted_secret,'UTF8'),'sha256')
    from vault.decrypted_secrets
    where name = 'mn_bot_worker_secret'
    limit 1
  ), false);
$$;
revoke all on function public.mn_bot_worker_authorized(text) from public, anon, authenticated;
grant execute on function public.mn_bot_worker_authorized(text) to service_role;
