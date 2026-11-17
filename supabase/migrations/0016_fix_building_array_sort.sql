-- Fix PostgreSQL DISTINCT/ORDER BY incompatibility when normalizing building arrays.
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
    array(
      select normalized from (
        select distinct lower(trim(value)) as normalized
        from unnest(coalesce(p_synonyms, '{}')) value
        where nullif(trim(value), '') is not null
      ) values_list
      order by normalized
    ),
    array(
      select normalized from (
        select distinct trim(value) as normalized
        from unnest(coalesce(p_features, '{}')) value
        where nullif(trim(value), '') is not null
      ) values_list
      order by lower(normalized)
    )
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
      synonyms = array(
        select normalized from (
          select distinct lower(trim(value)) as normalized
          from unnest(coalesce(p_synonyms, '{}')) value
          where nullif(trim(value), '') is not null
        ) values_list
        order by normalized
      ),
      features = array(
        select normalized from (
          select distinct trim(value) as normalized
          from unnest(coalesce(p_features, '{}')) value
          where nullif(trim(value), '') is not null
        ) values_list
        order by lower(normalized)
      ),
      updated_at = now()
  where id = p_id;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
end $$;

revoke all on function public.admin_create_building_with_location(text, text, numeric, numeric, text[], text[]) from public;
revoke all on function public.admin_update_building(uuid, text, text, numeric, numeric, text[], text[]) from public;
grant execute on function public.admin_create_building_with_location(text, text, numeric, numeric, text[], text[]) to authenticated;
grant execute on function public.admin_update_building(uuid, text, text, numeric, numeric, text[], text[]) to authenticated;
