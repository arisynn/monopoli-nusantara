-- Server-only batching. The original authorization, quota, lease and atomic
-- commit checks remain authoritative; no cached worker authorization.
begin;
create function public.mn_worker_access(p_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare w jsonb;requests integer;
begin
 w:=public.mn_worker_auth(p_hash);
 if w is null then return null;end if;
 requests:=public.mn_take_quota('worker:'||(w->>'id'),60);
 return jsonb_build_object('worker',w,'requests',requests);
end $$;
create function public.mn_termux_snapshot(p_worker uuid,p_code text,p_owner uuid,p_version bigint) returns jsonb
language sql stable security definer set search_path='' as $$
 select to_jsonb(r) from (select code,data,revision from public.mn_rooms
 where code=p_code and public.mn_termux_lease(p_worker,p_code,p_owner,p_version)) r
$$;
create function public.mn_termux_claim_profiled(p_worker uuid,p_owner uuid,p_manifest text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;ready timestamptz;
begin
 result:=public.mn_termux_claim(p_worker,p_owner,p_manifest);
 if result is null then return null;end if;
 select due_at into ready from public.mn_bot_jobs where code=result->>'code';
 return result||jsonb_build_object('queue_wait_ms',greatest(0,extract(epoch from (clock_timestamp()-ready))*1000));
end $$;
revoke all on function public.mn_worker_access(text), public.mn_termux_snapshot(uuid,text,uuid,bigint), public.mn_termux_claim_profiled(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.mn_worker_access(text), public.mn_termux_snapshot(uuid,text,uuid,bigint), public.mn_termux_claim_profiled(uuid,uuid,text) to service_role;
notify pgrst,'reload schema';
commit;
