-- Additive schema for the Supabase path. Existing D1/Redis rooms are NOT migrated/deleted.
-- Review target schema and backup first; this file has not been applied to a live project.
begin;
create table public.mn_rooms (
 code text primary key check (code ~ '^[A-HJ-NP-Z2-9]{8}$'),
 revision bigint not null check (revision >= 0),
 data jsonb not null check (jsonb_typeof(data) = 'object' and data @> '{"schemaVersion":1,"mode":"online"}'::jsonb and coalesce(data->>'code','') = code and coalesce(data->>'status','') in ('waiting','playing','paused','finished')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table public.mn_members (
 code text not null references public.mn_rooms(code),
 user_id uuid not null references auth.users(id),
 seat smallint not null check (seat between 0 and 5),
 primary key (code, user_id), unique (code, seat)
);
create index mn_members_user_rooms on public.mn_members(user_id, code);
create table public.mn_commands (
 user_id uuid not null references auth.users(id), request_id text not null,
 code text not null references public.mn_rooms(code), request_hash text not null,
 event_type text not null, revision bigint not null, created_at timestamptz not null default now(),
 primary key (user_id, request_id),
 check (length(request_id) between 8 and 80 and length(request_hash) = 64)
);
create index mn_commands_room_revision on public.mn_commands(code, revision);
-- Only a revision hint is delivered through Realtime. Never publish deck/snapshot/receipts.
create table public.mn_room_updates (
 code text primary key references public.mn_rooms(code), revision bigint not null,
 updated_at timestamptz not null default now()
);
create table public.mn_rate_limits (
 key text primary key, count integer not null, expires_at timestamptz not null
);
alter table public.mn_rooms enable row level security;
alter table public.mn_members enable row level security;
alter table public.mn_commands enable row level security;
alter table public.mn_room_updates enable row level security;
alter table public.mn_rate_limits enable row level security;
revoke all on public.mn_rooms, public.mn_members, public.mn_commands, public.mn_room_updates, public.mn_rate_limits from public, anon, authenticated;
grant all on public.mn_rooms, public.mn_members, public.mn_commands, public.mn_room_updates, public.mn_rate_limits to service_role;
grant select on public.mn_members, public.mn_room_updates to authenticated;
create policy mn_own_membership on public.mn_members for select to authenticated using (user_id = (select auth.uid()));
create policy mn_member_updates on public.mn_room_updates for select to authenticated using (
 exists (select 1 from public.mn_members m where m.code = mn_room_updates.code and m.user_id = (select auth.uid()))
);

-- Backend-only atomic compare-and-swap + durable idempotency + seat membership + notification.
-- Client JWTs cannot execute this function. Backend validates Auth and engine rules first.
create function public.mn_commit_room(
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
 most_recent bigint;
 db_now bigint := floor(extract(epoch from clock_timestamp()) * 1000);
begin
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
  new_revision := r.revision + 1;
  update public.mn_rooms set data = p_data, revision = new_revision, updated_at = now() where code = p_code;
 end if;
 -- Freshness is rechecked under the room row lock, at the database clock.
 -- Heartbeat-only commits may leave Playing temporarily held while a lease is absent.
 if p_type in ('ACTION','START') or (r.data->>'status' = 'paused' and p_data->>'status' = 'playing') then
  for item in select value from jsonb_array_elements(p_data->'seats') loop
   if not coalesce((p_data->'state'->'players'->seat_index->>'out')::boolean, false) then
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
  if item->>'controller' is distinct from 'human' then raise exception 'Online humans only'; end if;
  if exists(select 1 from public.mn_members where code = p_code and seat = seat_index and user_id <> (item->>'userId')::uuid) then
   raise exception 'Seat ownership is immutable';
  end if;
  insert into public.mn_members(code, user_id, seat) values (p_code, (item->>'userId')::uuid, seat_index)
   on conflict (code, user_id) do nothing;
  if not exists(select 1 from public.mn_members where code = p_code and seat = seat_index and user_id = (item->>'userId')::uuid) then
   raise exception 'Duplicate seat identity';
  end if;
  seat_index := seat_index + 1;
 end loop;
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

create function public.mn_take_quota(p_key text, p_seconds integer) returns integer
 language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
 if p_seconds not between 1 and 86400 or length(p_key) > 240 then raise exception 'Invalid quota'; end if;
 insert into public.mn_rate_limits(key,count,expires_at) values(p_key,1,now()+make_interval(secs=>p_seconds))
 on conflict (key) do update set
  count = case when public.mn_rate_limits.expires_at <= now() then 1 else public.mn_rate_limits.count+1 end,
  expires_at = case when public.mn_rate_limits.expires_at <= now() then now()+make_interval(secs=>p_seconds) else public.mn_rate_limits.expires_at end
 returning count into n;
 return n;
end $$;
revoke all on function public.mn_take_quota(text,integer) from public, anon, authenticated;
grant execute on function public.mn_take_quota(text,integer) to service_role;

-- PostgreSQL Changes applies the SELECT RLS policy for each subscribed identity.
-- Supabase normally supplies this publication; fail transactionally if target differs.
alter publication supabase_realtime add table public.mn_room_updates;
commit;
