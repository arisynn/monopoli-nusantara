-- Six online personas and atomic pre-game room membership removal.
-- Apply after migrations 001–005; does not enable the worker or alter active seats.
begin;
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
 lobby_edit boolean := false;
 closing boolean := false;
 old_item jsonb;
 previous_index integer := -1;
 current_index integer;
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
 closing := coalesce((p_data->>'closed')::boolean,false);
 if (p_data->>'capacity')::integer not between 2 and 6 or jsonb_array_length(p_data->'seats') not between (case when closing then 0 else 1 end) and (p_data->>'capacity')::integer then
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
  if p_type in ('LEAVE','KICK') then
   if p_actor is null or r.data->>'status'<>'waiting' or r.data->'state' is distinct from 'null'::jsonb
    or p_data->'state' is distinct from 'null'::jsonb then raise exception 'Lobby edit requires an unstarted room'; end if;
   if p_type='KICK' and r.data->'seats'->((r.data->>'host')::integer)->>'userId' is distinct from p_actor::text then
    raise exception 'Only host may kick'; end if;
   if closing then
    if p_type<>'LEAVE' or p_data->>'status'<>'finished' or jsonb_array_length(p_data->'seats')<>0
     or (select count(*) from jsonb_array_elements(r.data->'seats') s where s->>'controller'='human')<>1 then
     raise exception 'Invalid room closure'; end if;
   elsif p_data->>'status'<>'waiting' or jsonb_array_length(p_data->'seats')<>jsonb_array_length(r.data->'seats')-1 then
    raise exception 'Lobby edit must remove exactly one seat';
   end if;
   -- Remaining identities keep their relative order; user IDs and persona IDs
   -- cannot be changed while a removed seat is compacted out of the lobby.
   for item in select value from jsonb_array_elements(p_data->'seats') loop
    select value,(ordinality-1)::integer into old_item,current_index
     from jsonb_array_elements(r.data->'seats') with ordinality
     where value->>'memberId'=item->>'memberId' or (value->>'memberId' is null and (value->>'userId'=item->>'userId' or value->>'botPersona'=item->>'botPersona'));
    if old_item is null or current_index<=previous_index
     or old_item->>'controller' is distinct from item->>'controller'
     or old_item->>'userId' is distinct from item->>'userId'
     or old_item->>'botPersona' is distinct from item->>'botPersona' then
     raise exception 'Lobby identity changed'; end if;
    previous_index:=current_index;
   end loop;
   if p_type='LEAVE' and exists(select 1 from jsonb_array_elements(p_data->'seats') s where s->>'userId'=p_actor::text) then
    raise exception 'Leaving actor still seated'; end if;
   if p_type='KICK' and not exists(select 1 from jsonb_array_elements(p_data->'seats') s where s->>'userId'=p_actor::text) then
    raise exception 'Host cannot kick self'; end if;
   lobby_edit:=true;
  elsif closing then raise exception 'Room closure requires LEAVE'; end if;
  select count(*) into existing_seats from public.mn_members where code = p_code;
  if not lobby_edit and jsonb_array_length(p_data->'seats') < existing_seats then raise exception 'Seats cannot be removed'; end if;
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
 -- Rebuild membership only for a validated pre-game removal, under this row lock.
 if lobby_edit then delete from public.mn_members where code=p_code; end if;
 for item in select value from jsonb_array_elements(p_data->'seats') loop
  if item->>'controller' = 'bot' then
   if item->>'userId' is not null or coalesce(item->>'botPersona','') not in ('raka','bima','sari','nusa','apex','kresna') or item->>'botPersona' = any(identities)
    or upper(coalesce(item->>'name','')) <> (case item->>'botPersona' when 'raka' then 'RAKA' when 'bima' then 'BIMA' when 'sari' then 'SARI' when 'nusa' then 'NUSA' when 'apex' then 'ARKA' else 'KRESNA' end)
    or exists(select 1 from public.mn_members where code=p_code and seat=seat_index) then raise exception 'Invalid bot identity'; end if;
   identities := array_append(identities,item->>'botPersona');
   if not lobby_edit and p_expected_revision >= 0 and seat_index < jsonb_array_length(r.data->'seats')
    and r.data->'seats'->seat_index->>'botPersona' is distinct from item->>'botPersona' then raise exception 'Bot persona is immutable'; end if;
  elsif item->>'controller' = 'human' then
   human_count := human_count + 1;
   if not lobby_edit and p_expected_revision >= 0 and seat_index < jsonb_array_length(r.data->'seats') and r.data->'seats'->seat_index->>'controller' = 'bot' then raise exception 'Bot seat cannot replace a human or vice versa'; end if;
   if exists(select 1 from public.mn_members where code=p_code and seat=seat_index and user_id<>(item->>'userId')::uuid) then raise exception 'Seat ownership is immutable'; end if;
   insert into public.mn_members(code,user_id,seat) values(p_code,(item->>'userId')::uuid,seat_index) on conflict(code,user_id) do nothing;
   if not exists(select 1 from public.mn_members where code=p_code and seat=seat_index and user_id=(item->>'userId')::uuid) then raise exception 'Duplicate seat identity'; end if;
  else raise exception 'Invalid controller'; end if;
  seat_index := seat_index + 1;
 end loop;
 if not closing and (cardinality(identities)>3 or human_count<1 or (p_data->>'status'<>'waiting' and human_count<2)
  or p_data->'seats'->((p_data->>'host')::integer)->>'controller' is distinct from 'human') then raise exception 'Invalid participant composition'; end if;
 if p_expected_revision >= 0 and jsonb_array_length(p_data->'seats') <> jsonb_array_length(r.data->'seats') and r.data->>'status' <> 'waiting' then raise exception 'Playing seats are immutable'; end if;
 if p_type='BOT_ACTION' then
  insert into public.mn_bot_actions(code,match_id,source_version,actor,action_type,revision) values(p_code,work->>'matchId',(work->>'sourceVersion')::bigint,(work->>'actor')::smallint,work->>'actionType',new_revision);
 end if;
 if p_actor is not null and not (lobby_edit and p_type='LEAVE') and not exists(select 1 from public.mn_members where code = p_code and user_id = p_actor) then
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

-- Safe service-only diagnostics: booleans, never secret values.
create or replace function public.mn_online_capabilities() returns jsonb
language plpgsql security definer set search_path='' as $$
declare worker_ready boolean:=false; scheduler_ready boolean:=false;
begin
 if to_regclass('vault.decrypted_secrets') is not null
  and to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is not null then
  execute $q$select exists(select 1 from vault.decrypted_secrets where name='mn_bot_worker_url' and decrypted_secret like 'https://%')
   and exists(select 1 from vault.decrypted_secrets where name='mn_bot_worker_secret' and length(decrypted_secret)>=32)$q$ into worker_ready;
 end if;
 if to_regclass('cron.job') is not null then
  execute $q$select exists(select 1 from cron.job where jobname='mn-bot-recovery' and active)$q$ into scheduler_ready;
 end if;
 return jsonb_build_object('schemaVersion',6,'lobbyManagement',true,'botPersonas',jsonb_build_array('raka','bima','sari','nusa','apex','kresna'),
  'workerConfigured',worker_ready,'schedulerConfigured',scheduler_ready);
end $$;
revoke all on function public.mn_online_capabilities() from public,anon,authenticated;
grant execute on function public.mn_online_capabilities() to service_role;
commit;
