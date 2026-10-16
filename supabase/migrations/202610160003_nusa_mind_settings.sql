-- Additive validation only: no existing snapshots or economy are rewritten.
-- Existing missing botDifficulty means Medium, missing advisorEnabled means false.
begin;
create or replace function public.mn_guard_mind_settings() returns trigger
language plpgsql set search_path=public,pg_temp as $$
declare seat jsonb; old_seat jsonb; n integer := 0; level text;
begin
 if new.data ? 'advisorEnabled' and jsonb_typeof(new.data->'advisorEnabled') <> 'boolean' then
  raise exception 'Invalid advisor setting';
 end if;
 if tg_op='UPDATE' and old.data->>'status' <> 'waiting' then
  if coalesce(new.data->'advisorEnabled','false'::jsonb) is distinct from coalesce(old.data->'advisorEnabled','false'::jsonb) then
   raise exception 'Advisor setting is locked during match';
  end if;
 end if;
 for seat in select value from jsonb_array_elements(new.data->'seats') loop
  if seat->>'controller'='bot' then
   level := coalesce(seat->>'botDifficulty','medium');
   if level not in ('easy','medium','hard','hardcore') then raise exception 'Invalid bot difficulty'; end if;
   if tg_op='UPDATE' then
    old_seat := old.data->'seats'->n;
    if old.data->>'status'<>'waiting' and level is distinct from coalesce(old_seat->>'botDifficulty','medium') then
     raise exception 'Bot difficulty is locked during match';
    end if;
   end if;
   if new.data->>'status'<>'waiting' and level is distinct from coalesce(new.data->'state'->'players'->n->>'botDifficulty','medium') then
    raise exception 'Bot seat and state difficulty mismatch';
   end if;
  end if;
  n := n+1;
 end loop;
 if new.data->>'status'<>'waiting' and coalesce(new.data->'advisorEnabled','false'::jsonb) is distinct from coalesce(new.data->'state'->'advisorEnabled','false'::jsonb) then
  raise exception 'Advisor room and state mismatch';
 end if;
 return new;
end $$;
revoke all on function public.mn_guard_mind_settings() from public,anon,authenticated;
grant execute on function public.mn_guard_mind_settings() to service_role;
create trigger mn_guard_mind_settings before insert or update of data on public.mn_rooms
for each row execute function public.mn_guard_mind_settings();
commit;
