-- Restrict student hostel visibility and booking by the saved gender preference.
create or replace function public.can_access_building(p_building_name text)
returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  v_gender text;
  v_name text := lower(trim(coalesce(p_building_name, '')));
begin
  if public.is_admin() then return true; end if;
  select lower(trim(preferred_gender)) into v_gender
  from public.room_preferences
  where student_id = auth.uid();
  return case v_gender
    when 'boy' then v_name like 'boy%'
    when 'girl' then v_name like 'girl%'
    else false
  end;
end $$;

drop policy if exists inv_buildings_read on public.buildings;
create policy inv_buildings_read on public.buildings for select
using (is_active and public.can_access_building(name));

drop policy if exists inv_rooms_read on public.rooms;
create policy inv_rooms_read on public.rooms for select
using (
  is_active and exists (
    select 1 from public.buildings b
    where b.id = building_id and public.can_access_building(b.name)
  )
);

drop policy if exists inv_beds_read on public.beds;
create policy inv_beds_read on public.beds for select
using (
  is_active and exists (
    select 1 from public.rooms r
    join public.buildings b on b.id = r.building_id
    where r.id = room_id and public.can_access_building(b.name)
  )
);

drop function if exists public.get_availability();
create function public.get_availability() returns table (
  building_id uuid, building_name text, building_synonyms text[], building_features text[],
  room_id uuid, room_number text, room_type text, facilities jsonb,
  available_beds bigint, active_beds bigint)
language sql stable security definer set search_path = public as $$
  select b.id, b.name, b.synonyms, b.features, r.id, r.room_number, r.room_type, r.facilities,
    count(bed.id) filter (where bed.is_active and bk.id is null),
    count(bed.id) filter (where bed.is_active)
  from buildings b join rooms r on r.building_id = b.id join beds bed on bed.room_id = r.id
  left join bookings bk on bk.bed_id = bed.id and bk.status = 'active'
  where b.is_active and r.is_active and auth.uid() is not null
    and public.can_access_building(b.name)
  group by b.id, b.name, b.synonyms, b.features, r.id, r.room_number, r.room_type, r.facilities
  having count(bed.id) filter (where bed.is_active and bk.id is null) > 0
$$;

create or replace function public.create_booking(p_bed_id uuid, p_source text default 'manual')
returns public.bookings language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_row public.bookings;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED' using errcode = '28000'; end if;
  if p_source not in ('manual','ai_assisted') then raise exception 'INVALID_SOURCE' using errcode = '22023'; end if;
  insert into profiles (id, full_name)
    select u.id, coalesce(u.raw_user_meta_data->>'full_name', 'Student') from auth.users u where u.id = v_uid
    on conflict (id) do nothing;
  perform 1 from beds bd join rooms r on r.id = bd.room_id join buildings b on b.id = r.building_id
    where bd.id = p_bed_id and bd.is_active and r.is_active and b.is_active
      and public.can_access_building(b.name);
  if not found then raise exception 'BED_UNAVAILABLE' using errcode = 'P0002'; end if;
  begin
    insert into bookings (booking_reference, student_id, bed_id, source)
    values ('HST-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)), v_uid, p_bed_id, p_source)
    returning * into v_row;
  exception when unique_violation then
    if exists (select 1 from bookings where student_id = v_uid and status = 'active') then
      raise exception 'ALREADY_HAS_ACTIVE_BOOKING' using errcode = 'P0001';
    end if;
    raise exception 'BED_UNAVAILABLE' using errcode = 'P0002';
  end;
  insert into audit_events (actor_id, event_type, entity_type, entity_id)
    values (v_uid, 'booking.created', 'booking', v_row.id::text);
  return v_row;
end $$;

revoke all on function public.can_access_building(text) from public;
grant execute on function public.can_access_building(text) to authenticated;
revoke all on function public.get_availability from public;
grant execute on function public.get_availability to authenticated;
revoke all on function public.create_booking(uuid, text) from public;
grant execute on function public.create_booking(uuid, text) to authenticated;
