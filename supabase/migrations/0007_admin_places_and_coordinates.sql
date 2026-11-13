-- Admin management for campus destinations and building coordinates.

alter type public.place_type add value if not exists 'class_building';
alter type public.place_type add value if not exists 'hostel_building';
alter type public.place_type add value if not exists 'library';
alter type public.place_type add value if not exists 'mess';

create or replace function public.admin_create_building_with_location(
  p_name text,
  p_description text,
  p_latitude numeric default null,
  p_longitude numeric default null
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
  insert into public.buildings (name, description, latitude, longitude)
  values (trim(p_name), trim(p_description), p_latitude, p_longitude)
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.admin_update_building(
  p_id uuid,
  p_name text,
  p_description text,
  p_latitude numeric default null,
  p_longitude numeric default null
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
      latitude = p_latitude, longitude = p_longitude, updated_at = now()
  where id = p_id;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
end $$;

create or replace function public.admin_upsert_campus_place(
  p_place_id uuid,
  p_name text,
  p_description text,
  p_place_type public.place_type,
  p_latitude numeric default null,
  p_longitude numeric default null
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := p_place_id;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if nullif(trim(p_name), '') is null then raise exception 'INVALID_NAME' using errcode = '22023'; end if;
  if p_latitude is not null and (p_latitude < -90 or p_latitude > 90) then
    raise exception 'INVALID_LATITUDE' using errcode = '22023';
  end if;
  if p_longitude is not null and (p_longitude < -180 or p_longitude > 180) then
    raise exception 'INVALID_LONGITUDE' using errcode = '22023';
  end if;
  if v_id is null then
    insert into public.campus_places (name, description, place_type, latitude, longitude)
    values (trim(p_name), nullif(trim(p_description), ''), p_place_type, p_latitude, p_longitude)
    returning id into v_id;
  else
    update public.campus_places
    set name = trim(p_name), description = nullif(trim(p_description), ''),
        place_type = p_place_type, latitude = p_latitude, longitude = p_longitude, updated_at = now()
    where id = v_id;
    if not found then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  end if;
  return v_id;
end $$;

revoke all on function public.admin_create_building_with_location(text, text, numeric, numeric) from public;
revoke all on function public.admin_update_building(uuid, text, text, numeric, numeric) from public;
revoke all on function public.admin_upsert_campus_place(uuid, text, text, public.place_type, numeric, numeric) from public;
grant execute on function public.admin_create_building_with_location(text, text, numeric, numeric) to authenticated;
grant execute on function public.admin_update_building(uuid, text, text, numeric, numeric) to authenticated;
grant execute on function public.admin_upsert_campus_place(uuid, text, text, public.place_type, numeric, numeric) to authenticated;
