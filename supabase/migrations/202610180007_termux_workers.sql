-- Additive Termux transport. Existing rooms/rules are not rewritten.
begin;
create table public.mn_worker_settings (
 singleton boolean primary key default true check(singleton),
 provider text not null default 'edge' check(provider in ('edge','termux')),
 model_manifest text
);
insert into public.mn_worker_settings(singleton) values(true);
create table public.mn_workers (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
 token_hash text not null unique check(length(token_hash)=64), label text not null,
 allowed_codes text[], max_slots integer not null default 1 check(max_slots between 1 and 4),
 slots integer not null default 1, manifest text not null,
 revoked boolean not null default false, heartbeat_at timestamptz,
 created_at timestamptz not null default now()
);
create table public.mn_worker_pairings (
 code_hash text primary key check(length(code_hash)=64), allowed_codes text[],
 max_slots integer not null check(max_slots between 1 and 4),
 expires_at timestamptz not null, consumed_at timestamptz
);
create table public.mn_worker_receipts (
 worker_id uuid not null references public.mn_workers(id), command_id text not null,
 code text not null, request_hash text not null, revision bigint not null,
 created_at timestamptz not null default now(), primary key(worker_id,command_id)
);
create table public.mn_worker_wake (
 id text primary key check(id='default'), revision bigint not null default 0,
 updated_at timestamptz not null default now()
);
insert into public.mn_worker_wake(id) values('default');
alter table public.mn_bot_jobs add column worker_id uuid references public.mn_workers(id);
create index mn_worker_lease on public.mn_bot_jobs(worker_id,lease_until) where lease_owner is not null;
alter table public.mn_worker_settings enable row level security;
alter table public.mn_workers enable row level security;
alter table public.mn_worker_pairings enable row level security;
alter table public.mn_worker_receipts enable row level security;
alter table public.mn_worker_wake enable row level security;
revoke all on public.mn_worker_settings,public.mn_workers,public.mn_worker_pairings,public.mn_worker_receipts,public.mn_worker_wake from public,anon,authenticated;
grant all on public.mn_worker_settings,public.mn_workers,public.mn_worker_pairings,public.mn_worker_receipts,public.mn_worker_wake to service_role;
create function public.mn_worker_hint_allowed() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.mn_workers where user_id=auth.uid() and not revoked)
$$;
revoke all on function public.mn_worker_hint_allowed() from public,anon;
grant execute on function public.mn_worker_hint_allowed() to authenticated,service_role;
grant select on public.mn_worker_wake to authenticated;
create policy mn_worker_hint_read on public.mn_worker_wake for select to authenticated using(public.mn_worker_hint_allowed());
alter publication supabase_realtime add table public.mn_worker_wake;

-- Operator-only enrollment code. Returned once; the database stores its hash.
create function public.mn_worker_create_pairing(p_codes text[] default null,p_slots integer default 1) returns text
language plpgsql security definer set search_path='' as $$
declare code text;
begin
 if p_slots not between 1 and 4 or p_codes is not null and (cardinality(p_codes)=0 or cardinality(p_codes)>100) then raise exception 'Invalid scope'; end if;
 code:=encode(extensions.gen_random_bytes(32),'hex');
 insert into public.mn_worker_pairings(code_hash,allowed_codes,max_slots,expires_at)
 values(encode(extensions.digest(code,'sha256'),'hex'),p_codes,p_slots,clock_timestamp()+interval '10 minutes');
 return code;
end $$;
create function public.mn_worker_pair(p_pair_hash text,p_user uuid,p_hash text,p_manifest text,p_label text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare pairing public.mn_worker_pairings%rowtype;worker uuid;
begin
 select * into pairing from public.mn_worker_pairings where code_hash=p_pair_hash for update;
 if not found or pairing.consumed_at is not null or pairing.expires_at<=clock_timestamp() then return null; end if;
 update public.mn_worker_pairings set consumed_at=clock_timestamp() where code_hash=p_pair_hash;
 insert into public.mn_workers(user_id,token_hash,label,allowed_codes,max_slots,manifest)
 values(p_user,p_hash,left(p_label,64),pairing.allowed_codes,pairing.max_slots,p_manifest) returning id into worker;
 return jsonb_build_object('id',worker);
end $$;
create function public.mn_worker_auth(p_hash text) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',id,'max_slots',max_slots) from public.mn_workers where token_hash=p_hash and not revoked
$$;
create function public.mn_worker_heartbeat(p_worker uuid,p_slots integer,p_manifest text) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 update public.mn_workers set heartbeat_at=clock_timestamp(),slots=p_slots,manifest=p_manifest
 where id=p_worker and not revoked and p_slots between 1 and max_slots;
 if not found then raise exception 'Worker unavailable'; end if;
 return public.mn_worker_status(p_worker)||jsonb_build_object('ok',true,'at',clock_timestamp());
end $$;

-- Scheduling only, mirroring botActor(); the JS engine remains rule authority.
create function public.mn_termux_actor(s jsonb) returns integer language plpgsql immutable set search_path='' as $$
declare phase text:=s->>'phase';a integer;item jsonb;
begin
 if s is null or phase='won' then return null; end if;
 if phase='auction' then
  for item in select value from jsonb_array_elements(s->'auction'->'participants') loop
   a:=item::integer;
   if s->'players'->a->>'controller'='bot' and not (s->'players'->a->>'out')::boolean
    and a is distinct from (s->'auction'->>'highest')::integer and not (s->'auction'->'passed' @> jsonb_build_array(a)) then return a; end if;
  end loop;return null;
 elsif phase='buildOffer' then
  for item in select value from jsonb_array_elements(s->'buildOffer'->'pending') loop
   a:=item::integer;if s->'players'->a->>'controller'='bot' and not (s->'players'->a->>'out')::boolean then return a;end if;
  end loop;return null;
 end if;
 if phase in ('roll','end','jail','buy','card') then
  for item in select value from jsonb_array_elements(coalesce(s->'rentClaims','[]'::jsonb)) loop
   a:=(item->>'to')::integer;
   if s->'players'->a->>'controller'='bot' and not (s->'players'->a->>'out')::boolean then return a;end if;
  end loop;
 end if;
 a:=case phase when 'starting' then (s->'starting'->'pending'->>0)::integer
  when 'mortgage' then (s->'mortgageDecision'->>'player')::integer when 'debt' then (s->'debt'->>'from')::integer
  when 'card' then (s->'card'->>'player')::integer when 'trade' then (s->'trade'->>'to')::integer else (s->>'turn')::integer end;
 if s->'players'->a->>'controller'='bot' and not (s->'players'->a->>'out')::boolean then return a;end if;
 return null;
end $$;
create function public.mn_termux_claim(p_worker uuid,p_owner uuid,p_manifest text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare w public.mn_workers%rowtype;j public.mn_bot_jobs%rowtype;r public.mn_rooms%rowtype;until_at timestamptz;
begin
 if not exists(select 1 from public.mn_worker_settings where provider='termux' and (model_manifest is null or model_manifest=p_manifest)) then return null;end if;
 select * into w from public.mn_workers where id=p_worker and not revoked and manifest=p_manifest for update;
 if not found or w.heartbeat_at is null or w.heartbeat_at<clock_timestamp()-interval '60 seconds' then return null;end if;
 if (select count(*) from public.mn_bot_jobs where worker_id=p_worker and lease_owner is not null and lease_until>clock_timestamp())>=least(w.slots,w.max_slots) then return null;end if;
 select job.* into j from public.mn_bot_jobs job join public.mn_rooms room using(code)
 where job.status='scheduled' and job.due_at<=clock_timestamp() and (job.lease_until is null or job.lease_until<=clock_timestamp())
 and (w.allowed_codes is null or job.code=any(w.allowed_codes)) and room.data->>'status'='playing'
 and (room.data->'state'->>'version')::bigint=job.state_version and public.mn_termux_actor(room.data->'state') is not null
 and not exists(select 1 from jsonb_array_elements(room.data->'seats') with ordinality seats(item,n)
  where item->>'controller'='human' and not coalesce((room.data->'state'->'players'->((n-1)::integer)->>'out')::boolean,false)
  and coalesce((select max(value::bigint) from jsonb_each_text(item->'connections')),0)<=extract(epoch from clock_timestamp())*1000-35000)
 order by job.due_at for update of job skip locked limit 1;
 if not found then return null;end if;
 select * into r from public.mn_rooms where code=j.code;
 until_at:=clock_timestamp()+interval '30 seconds';
 update public.mn_bot_jobs set worker_id=p_worker,lease_owner=p_owner,lease_until=until_at,attempts=attempts+1,updated_at=clock_timestamp() where code=j.code;
 return jsonb_build_object('code',j.code,'source_version',j.state_version,'match_id',r.data->'state'->>'matchId','actor',public.mn_termux_actor(r.data->'state'),'lease_until',until_at,'room',r.data);
end $$;
create function public.mn_termux_lease(p_worker uuid,p_code text,p_owner uuid,p_version bigint) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.mn_bot_jobs j join public.mn_workers w on w.id=j.worker_id
 where j.code=p_code and j.worker_id=p_worker and j.lease_owner=p_owner and j.lease_until>clock_timestamp() and j.state_version=p_version
 and not w.revoked and (w.allowed_codes is null or j.code=any(w.allowed_codes)))
$$;
create function public.mn_termux_release(p_worker uuid,p_code text,p_owner uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 update public.mn_bot_jobs set lease_owner=null,lease_until=null,worker_id=null,due_at=clock_timestamp()+make_interval(secs=>least(30,power(2,least(attempts,5)))::double precision)
 where code=p_code and worker_id=p_worker and lease_owner=p_owner;
 return found;
end $$;
create function public.mn_worker_receipt(p_worker uuid,p_command text) returns jsonb
language sql stable security definer set search_path='' as $$
 select to_jsonb(r)-'worker_id' from public.mn_worker_receipts r where worker_id=p_worker and command_id=p_command
$$;
create function public.mn_worker_status(p_worker uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('provider',(select provider from public.mn_worker_settings),'label',w.label,'slots',w.slots,'maxSlots',w.max_slots,
  'heartbeatAt',w.heartbeat_at,'rooms',coalesce((select jsonb_agg(jsonb_build_object('code',j.code,'sourceVersion',j.state_version,'leased',j.lease_until>clock_timestamp(),
  'phase',r.data->'state'->>'phase','actor',public.mn_termux_actor(r.data->'state'),'status',r.data->>'status'))
  from public.mn_bot_jobs j join public.mn_rooms r using(code) where (w.allowed_codes is null or j.code=any(w.allowed_codes)) and r.data->>'status'='playing'),'[]'::jsonb))
 from public.mn_workers w where id=p_worker and not revoked
$$;
create function public.mn_worker_room_status(p_code text) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('provider','termux','status',case when count(*)=0 then 'offline'
  when coalesce(sum(greatest(0,least(w.slots,w.max_slots)-(select count(*) from public.mn_bot_jobs j where j.worker_id=w.id and j.lease_owner is not null and j.lease_until>clock_timestamp()))),0)>0 then 'ready' else 'busy' end)
 from public.mn_workers w where not w.revoked and heartbeat_at>clock_timestamp()-interval '60 seconds'
  and manifest=coalesce((select model_manifest from public.mn_worker_settings),manifest)
  and (allowed_codes is null or p_code=any(allowed_codes))
$$;

-- Wrapper adds worker-scoped receipt and authorization within the SAME commit.
alter function public.mn_commit_room(text,bigint,jsonb,uuid,text,text,text,boolean) rename to mn_commit_room_v6;
create function public.mn_commit_room(p_code text,p_expected_revision bigint,p_data jsonb,p_actor uuid default null,
 p_request_id text default null,p_hash text default null,p_type text default null,p_notify boolean default true) returns jsonb
language plpgsql security definer set search_path='' as $$
declare work jsonb:=p_data->'_botWork';w public.mn_workers%rowtype;receipt public.mn_worker_receipts%rowtype;result jsonb;
begin
 if p_type='BOT_ACTION' and work ? 'workerId' then
  select * into w from public.mn_workers where id=(work->>'workerId')::uuid and not revoked for share;
  if not found or not exists(select 1 from public.mn_worker_settings where provider='termux' and (model_manifest is null or model_manifest=w.manifest))
   or w.allowed_codes is not null and not(p_code=any(w.allowed_codes)) then return jsonb_build_object('ok',false,'stale',true);end if;
  perform pg_advisory_xact_lock(hashtextextended(w.id::text||':'||(work->>'commandId'),0));
  select * into receipt from public.mn_worker_receipts where worker_id=w.id and command_id=work->>'commandId';
  if found then
   if receipt.request_hash is distinct from work->>'requestHash' then raise exception 'Duplicate command mismatch';end if;
   return jsonb_build_object('ok',true,'duplicate',true,'revision',receipt.revision);
  end if;
  if not public.mn_termux_lease(w.id,p_code,p_hash::uuid,(work->>'sourceVersion')::bigint) then return jsonb_build_object('ok',false,'stale',true);end if;
 elsif p_type='BOT_ACTION' and exists(select 1 from public.mn_worker_settings where provider='termux') then
  return jsonb_build_object('ok',false,'stale',true);
 elsif p_type='BOT_ACTION' and exists(select 1 from public.mn_worker_settings where model_manifest is not null and model_manifest is distinct from work->>'modelManifest') then
  return jsonb_build_object('ok',false,'stale',true);
 end if;
 result:=public.mn_commit_room_v6(p_code,p_expected_revision,p_data,p_actor,p_request_id,p_hash,p_type,p_notify);
 if (result->>'ok')::boolean and w.id is not null then
  insert into public.mn_worker_receipts(worker_id,command_id,code,request_hash,revision)
  values(w.id,work->>'commandId',p_code,work->>'requestHash',(result->>'revision')::bigint);
 end if;
 return result;
end $$;

alter function public.mn_wake_bot_worker() rename to mn_wake_bot_worker_edge;
create or replace function public.mn_wake_bot_worker_edge() returns bigint language plpgsql security definer set search_path='' as $$
declare endpoint text;secret text;request_id bigint;
begin
 if not exists(select 1 from public.mn_worker_settings where provider='edge') then return null;end if;
 if not exists(select 1 from public.mn_bot_jobs where status='scheduled' and due_at<=clock_timestamp() and (lease_until is null or lease_until<=clock_timestamp())) then return null;end if;
 if to_regclass('vault.decrypted_secrets') is null or to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null then return null;end if;
 select decrypted_secret into endpoint from vault.decrypted_secrets where name='mn_bot_worker_url' limit 1;
 select decrypted_secret into secret from vault.decrypted_secrets where name='mn_bot_worker_secret' limit 1;
 if endpoint is null or endpoint not like 'https://%' or secret is null or length(secret)<32 then return null;end if;
 select net.http_post(url:=endpoint,headers:=jsonb_build_object('Content-Type','application/json','X-MN-Worker-Secret',secret),body:='{}'::jsonb,timeout_milliseconds:=15000) into request_id;
 return request_id;
end $$;
create function public.mn_wake_bot_worker() returns bigint language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.mn_worker_settings where provider='edge') then return public.mn_wake_bot_worker_edge();end if;
 if exists(select 1 from public.mn_bot_jobs j join public.mn_rooms r using(code) where j.status='scheduled' and j.due_at<=clock_timestamp()
  and (j.lease_until is null or j.lease_until<=clock_timestamp()) and r.data->>'status'='playing' and public.mn_termux_actor(r.data->'state') is not null) then
  update public.mn_worker_wake set revision=revision+1,updated_at=clock_timestamp() where id='default';
 end if;
 return null;
end $$;
-- Fence even an old deployed Edge worker from claiming in Termux mode.
alter function public.mn_claim_bot_job(uuid) rename to mn_claim_bot_job_edge;
create or replace function public.mn_claim_bot_job_edge(p_owner uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.mn_bot_jobs%rowtype;
begin
 if not exists(select 1 from public.mn_worker_settings where provider='edge') then return null;end if;
 select * into j from public.mn_bot_jobs where status='scheduled' and due_at<=clock_timestamp()
  and (lease_until is null or lease_until<=clock_timestamp()) order by due_at for update skip locked limit 1;
 if not found then return null;end if;
 update public.mn_bot_jobs set lease_owner=p_owner,lease_until=clock_timestamp()+interval '30 seconds',attempts=attempts+1,updated_at=clock_timestamp() where code=j.code;
 return jsonb_build_object('code',j.code,'state_version',j.state_version);
end $$;
create function public.mn_claim_bot_job(p_owner uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.mn_worker_settings where provider='edge') then return public.mn_claim_bot_job_edge(p_owner);end if;
 return null;
end $$;
alter function public.mn_online_capabilities() rename to mn_online_capabilities_v6;
create function public.mn_online_capabilities() returns jsonb language plpgsql security definer set search_path='' as $$
declare base jsonb;alive integer;available integer;mode text;
begin
 base:=public.mn_online_capabilities_v6();select provider into mode from public.mn_worker_settings;
 select count(*),coalesce(sum(greatest(0,least(w.slots,w.max_slots)-(select count(*) from public.mn_bot_jobs j where j.worker_id=w.id and j.lease_owner is not null and j.lease_until>clock_timestamp()))),0)
 into alive,available from public.mn_workers w where not w.revoked and heartbeat_at>clock_timestamp()-interval '60 seconds'
 and manifest=coalesce((select model_manifest from public.mn_worker_settings),manifest);
 return base||jsonb_build_object('schemaVersion',7,'workerProvider',mode,'workerAlive',alive>0,'availableSlots',available,
  'workerConfigured',case when mode='termux' then exists(select 1 from public.mn_workers where not revoked) else (base->>'workerConfigured')::boolean end);
end $$;

-- Every privileged function in this migration is server-only. Hints are the
-- sole authenticated read surface; never grant device access to commit RPCs.
do $$ declare f record;begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and (p.proname like 'mn_worker_%' or p.proname like 'mn_termux_%'
   or p.proname in ('mn_commit_room','mn_commit_room_v6','mn_claim_bot_job','mn_claim_bot_job_edge','mn_wake_bot_worker','mn_wake_bot_worker_edge','mn_online_capabilities','mn_online_capabilities_v6'))
  and p.proname<>'mn_worker_hint_allowed' loop
   execute format('revoke all on function %s from public,anon,authenticated',f.signature);
   execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
