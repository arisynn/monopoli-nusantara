-- Hybrid Intelligence 4.0: additive bot jobs + fenced worker execution.
-- Review against live schema; not applied by this task. Original migration remains unchanged.
begin;
create table public.mn_bot_jobs(
 code text primary key references public.mn_rooms(code), state_version bigint not null,
 status text not null check(status in ('scheduled','waiting','blocked','failed')), due_at timestamptz not null default now(),
 lease_owner uuid, lease_until timestamptz, attempts integer not null default 0,
 last_error text, updated_at timestamptz not null default now()
);
create index mn_bot_jobs_due on public.mn_bot_jobs(due_at) where status='scheduled';
create table public.mn_bot_actions(
 code text not null references public.mn_rooms(code),match_id text not null,source_version bigint not null,
 actor smallint not null check(actor between 0 and 5),action_type text not null,revision bigint not null,
 created_at timestamptz not null default now(),primary key(code,match_id,source_version)
);
alter table public.mn_bot_jobs enable row level security;
alter table public.mn_bot_actions enable row level security;
revoke all on public.mn_bot_jobs,public.mn_bot_actions from public,anon,authenticated;
grant all on public.mn_bot_jobs,public.mn_bot_actions to service_role;
create or replace function public.mn_commit_room(
 p_code text, p_expected_revision bigint, p_data jsonb, p_actor uuid default null,
 p_request_id text default null, p_hash text default null, p_type text default null,
 p_notify boolean default true
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
 r public.mn_rooms%rowtype;
 receipt public.mn_commands%rowtype;
 new_revision bigint;
 item jsonb;
 seat_index integer := 0;
 existing_seats integer;
 bot_job public.mn_bot_jobs%rowtype;
 work jsonb;
 identities text[] := array[]::text[];
 human_count integer := 0;
 most_recent bigint;
 db_now bigint := floor(extract(epoch from clock_timestamp()) * 1000);
begin
 work := p_data->'_botWork';
 p_data := p_data - '_botWork';
 if p_request_id is not null then
  if p_actor is null or p_hash is null then raise exception 'Missing receipt identity'; end if;
  -- Serializes duplicate creates too, whose randomly generated room codes may differ.
  perform pg_advisory_xact_lock(hashtextextended(p_actor::text || ':' || p_request_id, 0));
  select * into receipt from public.mn_commands where user_id = p_actor and request_id = p_request_id;
  if found then
   return jsonb_build_object('duplicate', true, 'code', receipt.code, 'hash', receipt.request_hash);
  end if;
 end if;
 if not (p_data @> '{"schemaVersion":1,"mode":"online"}'::jsonb) or p_data->>'code' is distinct from p_code
  or coalesce(p_data->>'status','') not in ('waiting','playing','paused','finished')
  or jsonb_typeof(p_data->'seats') is distinct from 'array'
  or jsonb_typeof(p_data->'capacity') is distinct from 'number' then
  raise exception 'Invalid room envelope';
 end if;
 if (p_data->>'capacity')::integer not between 2 and 6 or jsonb_array_length(p_data->'seats') not between 1 and (p_data->>'capacity')::integer then
  raise exception 'Invalid room capacity';
 end if;
 if p_expected_revision = -1 then
  if p_type is distinct from 'CREATE' or p_actor is null or p_data->'seats'->0->>'userId' is distinct from p_actor::text then
   raise exception 'Invalid room creator';
  end if;
  insert into public.mn_rooms(code, revision, data) values (p_code, 0, p_data) on conflict do nothing;
  if not found then return jsonb_build_object('ok', false); end if;
  new_revision := 0;
 else
  select * into r from public.mn_rooms where code = p_code for update;
  if not found or r.revision <> p_expected_revision then return jsonb_build_object('ok', false); end if;
  if p_actor is not null and p_type <> 'JOIN' and not exists (select 1 from public.mn_members where code = p_code and user_id = p_actor) then
   raise exception 'Not a member';
  end if;
  select count(*) into existing_seats from public.mn_members where code = p_code;
  if jsonb_array_length(p_data->'seats') < existing_seats then raise exception 'Seats cannot be removed'; end if;
  if p_type = 'BOT_ACTION' then
   select * into bot_job from public.mn_bot_jobs where code = p_code for update;
   if not found or p_hash is null or bot_job.lease_owner::text is distinct from p_hash
    or bot_job.lease_until is null or bot_job.lease_until <= clock_timestamp() or bot_job.state_version <> (r.data->'state'->>'version')::bigint
    or r.data->>'status' <> 'playing' then return jsonb_build_object('ok',false,'stale',true); end if;
   if p_actor is not null or p_request_id is not null or work is null
    or work->>'matchId' is distinct from r.data->'state'->>'matchId'
    or (work->>'sourceVersion')::bigint <> bot_job.state_version
    or (p_data->'state'->>'version')::bigint <> bot_job.state_version + 1
    or p_data->'state'->>'matchId' is distinct from r.data->'state'->>'matchId'
    or r.data->'seats'->((work->>'actor')::integer)->>'controller' is distinct from 'bot'
    then raise exception 'Invalid fenced bot action'; end if;
  end if;
  new_revision := r.revision + 1;
  update public.mn_rooms set data = p_data, revision = new_revision, updated_at = now() where code = p_code;
 end if;
 -- Freshness is rechecked under the room row lock, at the database clock.
 -- Heartbeat-only commits may leave Playing temporarily held while a lease is absent.
 if p_type in ('ACTION','START','BOT_ACTION') or (r.data->>'status' = 'paused' and p_data->>'status' = 'playing') then
  for item in select value from jsonb_array_elements(p_data->'seats') loop
   if item->>'controller' = 'human' and not coalesce((p_data->'state'->'players'->seat_index->>'out')::boolean, false) then
    select max(value::bigint) into most_recent from jsonb_each_text(item->'connections');
    if most_recent is null or most_recent <= db_now - 35000 or most_recent > db_now + 10000 then
     raise exception 'Player lease expired before commit';
    end if;
   end if;
   seat_index := seat_index + 1;
  end loop;
  seat_index := 0;
 end if;
 for item in select value from jsonb_array_elements(p_data->'seats') loop
  if item->>'controller' = 'bot' then
   if item->>'userId' is not null or coalesce(item->>'botPersona','') not in ('raka','bima','sari') or item->>'botPersona' = any(identities)
    or coalesce(item->>'name','') <> case item->>'botPersona' when 'raka' then 'Raka' when 'bima' then 'Bima' else 'Sari' end
    or exists(select 1 from public.mn_members where code=p_code and seat=seat_index) then raise exception 'Invalid bot identity'; end if;
   identities := array_append(identities,item->>'botPersona');
   if p_expected_revision >= 0 and seat_index < jsonb_array_length(r.data->'seats')
    and r.data->'seats'->seat_index->>'botPersona' is distinct from item->>'botPersona' then raise exception 'Bot persona is immutable'; end if;
  elsif item->>'controller' = 'human' then
   human_count := human_count + 1;
   if p_expected_revision >= 0 and seat_index < jsonb_array_length(r.data->'seats') and r.data->'seats'->seat_index->>'controller' = 'bot' then raise exception 'Bot seat cannot replace a human or vice versa'; end if;
   if exists(select 1 from public.mn_members where code=p_code and seat=seat_index and user_id<>(item->>'userId')::uuid) then raise exception 'Seat ownership is immutable'; end if;
   insert into public.mn_members(code,user_id,seat) values(p_code,(item->>'userId')::uuid,seat_index) on conflict(code,user_id) do nothing;
   if not exists(select 1 from public.mn_members where code=p_code and seat=seat_index and user_id=(item->>'userId')::uuid) then raise exception 'Duplicate seat identity'; end if;
  else raise exception 'Invalid controller'; end if;
  seat_index := seat_index + 1;
 end loop;
 if cardinality(identities)>3 or human_count<1 or (p_data->>'status'<>'waiting' and human_count<2)
  or p_data->'seats'->((p_data->>'host')::integer)->>'controller' is distinct from 'human' then raise exception 'Invalid participant composition'; end if;
 if p_expected_revision >= 0 and jsonb_array_length(p_data->'seats') <> jsonb_array_length(r.data->'seats') and r.data->>'status' <> 'waiting' then raise exception 'Playing seats are immutable'; end if;
 if p_type='BOT_ACTION' then
  insert into public.mn_bot_actions(code,match_id,source_version,actor,action_type,revision) values(p_code,work->>'matchId',(work->>'sourceVersion')::bigint,(work->>'actor')::smallint,work->>'actionType',new_revision);
 end if;
 if p_actor is not null and not exists(select 1 from public.mn_members where code = p_code and user_id = p_actor) then
  raise exception 'Actor must own a seat';
 end if;
 if p_request_id is not null then
  insert into public.mn_commands(user_id, request_id, code, request_hash, event_type, revision)
   values (p_actor, p_request_id, p_code, p_hash, p_type, new_revision);
 end if;
 if p_notify then
  insert into public.mn_room_updates(code, revision) values(p_code, new_revision)
   on conflict (code) do update set revision = excluded.revision, updated_at = now();
 end if;
 return jsonb_build_object('ok', true, 'revision', new_revision);
end $$;
revoke all on function public.mn_commit_room(text,bigint,jsonb,uuid,text,text,text,boolean) from public, anon, authenticated;
grant execute on function public.mn_commit_room(text,bigint,jsonb,uuid,text,text,text,boolean) to service_role;


-- A single committed room transition queues durable work. Heartbeat-only writes do not fan out jobs.
create function public.mn_queue_bot_job() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.data->>'status'='playing' and exists(select 1 from jsonb_array_elements(new.data->'state'->'players') p where p->>'controller'='bot' and not (p->>'out')::boolean) then
  if tg_op='INSERT' or old.data->'state'->>'version' is distinct from new.data->'state'->>'version' or old.data->>'status' is distinct from new.data->>'status'
   or (exists(select 1 from public.mn_bot_jobs where code=new.code and status='blocked') and not exists(
    select 1 from jsonb_array_elements(new.data->'seats') with ordinality as seats(item,n)
    where item->>'controller'='human' and not coalesce((new.data->'state'->'players'->((n-1)::integer)->>'out')::boolean,false)
     and coalesce((select max(value::bigint) from jsonb_each_text(item->'connections')),0)<=floor(extract(epoch from clock_timestamp())*1000)-35000
   )) then
   insert into public.mn_bot_jobs(code,state_version,status) values(new.code,(new.data->'state'->>'version')::bigint,'scheduled')
    on conflict(code) do update set state_version=excluded.state_version,status='scheduled',due_at=now(),lease_owner=null,lease_until=null,attempts=0,last_error=null,updated_at=now();
  end if;
 elsif exists(select 1 from public.mn_bot_jobs where code=new.code) then
  update public.mn_bot_jobs set status='waiting',lease_owner=null,lease_until=null,updated_at=now() where code=new.code;
 end if;
 return new;
end $$;
revoke all on function public.mn_queue_bot_job() from public,anon,authenticated;
create trigger mn_queue_bot after insert or update on public.mn_rooms for each row execute function public.mn_queue_bot_job();

create function public.mn_claim_bot_job(p_owner uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.mn_bot_jobs%rowtype;
begin
 select * into j from public.mn_bot_jobs where status='scheduled' and due_at<=clock_timestamp()
  and (lease_until is null or lease_until<=clock_timestamp()) order by due_at for update skip locked limit 1;
 if not found then return null; end if;
 update public.mn_bot_jobs set lease_owner=p_owner,lease_until=clock_timestamp()+interval '30 seconds',attempts=attempts+1,updated_at=now() where code=j.code;
 return jsonb_build_object('code',j.code,'state_version',j.state_version);
end $$;
revoke all on function public.mn_claim_bot_job(uuid) from public,anon,authenticated;
grant execute on function public.mn_claim_bot_job(uuid) to service_role;

create function public.mn_release_bot_job(p_code text,p_owner uuid,p_status text,p_error text default null) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if p_status not in ('waiting','blocked','scheduled') or p_error is not null and p_error<>'decision_failed' then raise exception 'Invalid job result'; end if;
 update public.mn_bot_jobs set status=case when p_error is not null and attempts>=5 then 'failed' else p_status end,
  last_error=p_error,lease_owner=null,lease_until=null,due_at=clock_timestamp()+case when p_error is null then interval '0 seconds' else interval '5 seconds' end,updated_at=now()
  where code=p_code and lease_owner=p_owner;
 return found;
end $$;
revoke all on function public.mn_release_bot_job(text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.mn_release_bot_job(text,uuid,text,text) to service_role;

-- Optional pg_net + Vault wakeup; durable jobs remain queued if runtime is not configured.
create function public.mn_wake_bot_worker() returns bigint language plpgsql security definer set search_path='' as $$
declare endpoint text;secret text;request_id bigint;
begin
 if not exists(select 1 from public.mn_bot_jobs where status='scheduled' and due_at<=clock_timestamp() and (lease_until is null or lease_until<=clock_timestamp())) then return null; end if;
 if to_regclass('vault.decrypted_secrets') is null or to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null then return null; end if;
 select decrypted_secret into endpoint from vault.decrypted_secrets where name='mn_bot_worker_url' limit 1;
 select decrypted_secret into secret from vault.decrypted_secrets where name='mn_bot_worker_secret' limit 1;
 if endpoint is null or endpoint not like 'https://%' or secret is null or length(secret)<32 then return null; end if;
 select net.http_post(url:=endpoint,headers:=jsonb_build_object('Content-Type','application/json','X-MN-Worker-Secret',secret),body:='{}'::jsonb,timeout_milliseconds:=15000) into request_id;
 return request_id;
end $$;
revoke all on function public.mn_wake_bot_worker() from public,anon,authenticated;
grant execute on function public.mn_wake_bot_worker() to service_role;
create function public.mn_notify_bot_job() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status='scheduled' and new.lease_owner is null then perform public.mn_wake_bot_worker(); end if;
 return new;
end $$;
revoke all on function public.mn_notify_bot_job() from public,anon,authenticated;
create trigger mn_notify_bot after insert or update on public.mn_bot_jobs for each row execute function public.mn_notify_bot_job();
commit;
