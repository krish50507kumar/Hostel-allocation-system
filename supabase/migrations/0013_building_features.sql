-- Admin-managed amenities and characteristics for hostel buildings.
alter table public.buildings
  add column if not exists features text[] not null default '{}';

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
  group by b.id, b.name, b.synonyms, b.features, r.id, r.room_number, r.room_type, r.facilities
  having count(bed.id) filter (where bed.is_active and bk.id is null) > 0
$$;

drop function if exists public.admin_create_building_with_location(text, text, numeric, numeric);
drop function if exists public.admin_create_building_with_location(text, text, numeric, numeric, text[]);
drop function if exists public.admin_update_building(uuid, text, text, numeric, numeric);
drop function if exists public.admin_update_building(uuid, text, text, numeric, numeric, text[]);

create or replace function public.admin_create_building_with_location(
  p_name text,
  p_description text,
  p_latitude numeric default null,
  p_longitude numeric default null,
  p_synonyms text[] default '{}',
  p_features text[] default '{}'
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if nullif(trim(p_name), '') is null or nullif(trim(p_description), '') is null then
    raise exception 'INVALID_BUILDING' using errcode = '22023';
  end if;
  if p_latitude is not null and (p_latitude < -90 or p_latitude > 90) then
    raise exception 'INVALID_LATITUDE' using errcode = '22023';
  end if;
  if p_longitude is not null and (p_longitude < -180 or p_longitude > 180) then
    raise exception 'INVALID_LONGITUDE' using errcode = '22023';
  end if;
  insert into public.buildings (name, description, latitude, longitude, synonyms, features)
  values (
    trim(p_name), trim(p_description), p_latitude, p_longitude,
    array(select distinct lower(trim(value)) from unnest(coalesce(p_synonyms, '{}')) value
      where nullif(trim(value), '') is not null order by lower(trim(value))),
    array(select distinct trim(value) from unnest(coalesce(p_features, '{}')) value
      where nullif(trim(value), '') is not null order by lower(trim(value)))
  )
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.admin_update_building(
  p_id uuid,
  p_name text,
  p_description text,
  p_latitude numeric default null,
  p_longitude numeric default null,
  p_synonyms text[] default '{}',
  p_features text[] default '{}'
)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if nullif(trim(p_name), '') is null or nullif(trim(p_description), '') is null then
    raise exception 'INVALID_BUILDING' using errcode = '22023';
  end if;
  if p_latitude is not null and (p_latitude < -90 or p_latitude > 90) then
    raise exception 'INVALID_LATITUDE' using errcode = '22023';
  end if;
  if p_longitude is not null and (p_longitude < -180 or p_longitude > 180) then
    raise exception 'INVALID_LONGITUDE' using errcode = '22023';
  end if;
  update public.buildings
  set name = trim(p_name), description = trim(p_description),
      latitude = p_latitude, longitude = p_longitude,
      synonyms = array(select distinct lower(trim(value)) from unnest(coalesce(p_synonyms, '{}')) value
        where nullif(trim(value), '') is not null order by lower(trim(value))),
      features = array(select distinct trim(value) from unnest(coalesce(p_features, '{}')) value
        where nullif(trim(value), '') is not null order by lower(trim(value))),
      updated_at = now()
  where id = p_id;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
end $$;

revoke all on function public.get_availability from public;
grant execute on function public.get_availability to authenticated;
revoke all on function public.admin_create_building_with_location(text, text, numeric, numeric, text[], text[]) from public;
revoke all on function public.admin_update_building(uuid, text, text, numeric, numeric, text[], text[]) from public;
grant execute on function public.admin_create_building_with_location(text, text, numeric, numeric, text[], text[]) to authenticated;
grant execute on function public.admin_update_building(uuid, text, text, numeric, numeric, text[], text[]) to authenticated;
