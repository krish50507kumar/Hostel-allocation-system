-- Campus-wide editable information and alternate names for every campus place.
alter table public.campus_places
  add column if not exists synonyms text[] not null default '{}';

create table if not exists public.campus_details (
  id integer primary key default 1 check (id = 1),
  campus_name text not null default 'Campus',
  overview text not null default '',
  address text not null default '',
  contact_email text not null default '',
  contact_phone text not null default '',
  website text not null default '',
  transport_info text not null default '',
  facilities_info text not null default '',
  rules_info text not null default '',
  emergency_info text not null default '',
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

insert into public.campus_details (id) values (1)
on conflict (id) do nothing;

alter table public.campus_details enable row level security;
create policy campus_details_authenticated_read on public.campus_details
for select using (auth.uid() is not null);

drop function if exists public.admin_upsert_campus_place(uuid, text, text, public.place_type, numeric, numeric);

create or replace function public.admin_upsert_campus_place(
  p_place_id uuid,
  p_name text,
  p_description text,
  p_place_type public.place_type,
  p_latitude numeric default null,
  p_longitude numeric default null,
  p_synonyms text[] default '{}'
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
    insert into public.campus_places (name, description, place_type, latitude, longitude, synonyms)
    values (
      trim(p_name), nullif(trim(p_description), ''), p_place_type, p_latitude, p_longitude,
      array(select distinct lower(trim(value)) from unnest(coalesce(p_synonyms, '{}')) value
        where nullif(trim(value), '') is not null order by lower(trim(value)))
    )
    returning id into v_id;
  else
    update public.campus_places
    set name = trim(p_name), description = nullif(trim(p_description), ''),
        place_type = p_place_type, latitude = p_latitude, longitude = p_longitude,
        synonyms = array(select distinct lower(trim(value)) from unnest(coalesce(p_synonyms, '{}')) value
          where nullif(trim(value), '') is not null order by lower(trim(value))),
        updated_at = now()
    where id = v_id;
    if not found then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  end if;
  return v_id;
end $$;

create or replace function public.admin_update_campus_details(
  p_campus_name text,
  p_overview text,
  p_address text,
  p_contact_email text,
  p_contact_phone text,
  p_website text,
  p_transport_info text,
  p_facilities_info text,
  p_rules_info text,
  p_emergency_info text
)
returns public.campus_details
language plpgsql security definer set search_path = public as $$
declare
  v_row public.campus_details;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if nullif(trim(p_campus_name), '') is null then raise exception 'INVALID_CAMPUS_NAME' using errcode = '22023'; end if;
  update public.campus_details
  set campus_name = trim(p_campus_name), overview = trim(coalesce(p_overview, '')),
      address = trim(coalesce(p_address, '')), contact_email = trim(coalesce(p_contact_email, '')),
      contact_phone = trim(coalesce(p_contact_phone, '')), website = trim(coalesce(p_website, '')),
      transport_info = trim(coalesce(p_transport_info, '')),
      facilities_info = trim(coalesce(p_facilities_info, '')),
      rules_info = trim(coalesce(p_rules_info, '')), emergency_info = trim(coalesce(p_emergency_info, '')),
      updated_by = auth.uid(), updated_at = now()
  where id = 1
  returning * into v_row;
  return v_row;
end $$;

revoke all on function public.admin_upsert_campus_place(uuid, text, text, public.place_type, numeric, numeric, text[]) from public;
grant execute on function public.admin_upsert_campus_place(uuid, text, text, public.place_type, numeric, numeric, text[]) to authenticated;
revoke all on function public.admin_update_campus_details(text, text, text, text, text, text, text, text, text, text) from public;
grant execute on function public.admin_update_campus_details(text, text, text, text, text, text, text, text, text, text) to authenticated;
