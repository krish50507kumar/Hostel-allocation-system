-- Hostel allocation: schema, RLS, and trusted RPCs (per database.md / api.md)
create extension if not exists pgcrypto;

create type public.app_role as enum ('student', 'admin');
create type public.booking_status as enum ('active', 'cancelled');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  student_number text unique,
  phone text,
  role public.app_role not null default 'student',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.buildings (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index buildings_name_unique_ci on public.buildings (lower(trim(name)));

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings(id),
  room_number text not null,
  room_type text,
  facilities jsonb not null default '[]'::jsonb,
  capacity integer not null check (capacity > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (building_id, room_number)
);

create table public.beds (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id),
  bed_number text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (room_id, bed_number)
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  booking_reference text not null unique,
  student_id uuid not null references public.profiles(id),
  bed_id uuid not null references public.beds(id),
  status public.booking_status not null default 'active',
  source text not null default 'manual' check (source in ('manual','ai_assisted','admin')),
  booked_at timestamptz not null default now(),
  cancelled_at timestamptz,
  cancellation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index one_active_booking_per_bed on public.bookings (bed_id) where status = 'active';
create unique index one_active_booking_per_student on public.bookings (student_id) where status = 'active';
create index on public.bookings (student_id, status);
create index on public.beds (room_id, is_active);
create index on public.rooms (building_id, is_active);

create table public.app_settings (
  id integer primary key default 1 check (id = 1),
  college_start_date date not null,
  cancellation_days_before_start integer not null default 10 check (cancellation_days_before_start >= 0),
  timezone text not null default 'Asia/Kolkata',
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);
insert into public.app_settings (college_start_date) values ('2027-08-01');

create table public.audit_events (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id),
  event_type text not null, entity_type text, entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.ai_evaluations (
  id uuid primary key default gen_random_uuid(),
  provider text not null, scenario_name text not null, latency_ms integer,
  tool_calls jsonb not null default '[]'::jsonb,
  valid_recommendation boolean, grounded_explanation boolean, error_category text,
  created_at timestamptz not null default now()
);

-- Auto-create profile on signup (role is always 'student'; promote admins manually)
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, student_number)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', 'Student'),
          new.raw_user_meta_data->>'student_number');
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin')
$$;

-- ===== RLS =====
alter table public.profiles enable row level security;
alter table public.buildings enable row level security;
alter table public.rooms enable row level security;
alter table public.beds enable row level security;
alter table public.bookings enable row level security;
alter table public.app_settings enable row level security;
alter table public.audit_events enable row level security;
alter table public.ai_evaluations enable row level security;

create policy profiles_self_read on public.profiles for select using (id = auth.uid() or public.is_admin());
create policy profiles_self_update on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid() and role = 'student');
create policy inv_buildings_read on public.buildings for select using (is_active or public.is_admin());
create policy inv_rooms_read on public.rooms for select using (is_active or public.is_admin());
create policy inv_beds_read on public.beds for select using (is_active or public.is_admin());
create policy bookings_own_read on public.bookings for select using (student_id = auth.uid() or public.is_admin());
create policy settings_read on public.app_settings for select using (auth.uid() is not null);
create policy audit_admin on public.audit_events for select using (public.is_admin());
create policy evals_admin on public.ai_evaluations for select using (public.is_admin());
-- No client insert/update/delete policies on inventory or bookings: writes go through RPCs below.

-- ===== Trusted RPCs =====
create function public.create_booking(p_bed_id uuid, p_source text default 'manual')
returns public.bookings language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_row public.bookings;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED' using errcode = '28000'; end if;
  if p_source not in ('manual','ai_assisted') then raise exception 'INVALID_SOURCE' using errcode = '22023'; end if;
  perform 1 from beds bd join rooms r on r.id = bd.room_id join buildings b on b.id = r.building_id
    where bd.id = p_bed_id and bd.is_active and r.is_active and b.is_active;
  if not found then raise exception 'BED_UNAVAILABLE' using errcode = 'P0002'; end if;
  begin
    insert into bookings (booking_reference, student_id, bed_id, source)
    values ('HST-' || upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 6)), v_uid, p_bed_id, p_source)
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

create function public.cancel_booking(p_booking_id uuid, p_reason text default null)
returns public.bookings language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_row public.bookings; s public.app_settings; v_cutoff date; v_today date;
begin
  select * into v_row from bookings where id = p_booking_id and student_id = v_uid for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  if v_row.status <> 'active' then raise exception 'NOT_ACTIVE' using errcode = 'P0001'; end if;
  select * into s from app_settings where id = 1;
  v_cutoff := s.college_start_date - s.cancellation_days_before_start;
  v_today := (now() at time zone s.timezone)::date;
  if v_today >= v_cutoff then raise exception 'CANCELLATION_CUTOFF_PASSED' using errcode = 'P0001'; end if;
  update bookings set status = 'cancelled', cancelled_at = now(), cancellation_reason = p_reason, updated_at = now()
    where id = p_booking_id returning * into v_row;
  insert into audit_events (actor_id, event_type, entity_type, entity_id)
    values (v_uid, 'booking.cancelled', 'booking', p_booking_id::text);
  return v_row;
end $$;

create function public.admin_upsert_room(
  p_room_id uuid, p_building_id uuid, p_room_number text, p_room_type text,
  p_capacity integer, p_facilities jsonb default '[]'::jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid := p_room_id; v_cur integer; v_occupied integer;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if p_capacity <= 0 then raise exception 'INVALID_CAPACITY' using errcode = '22023'; end if;
  if v_id is null then
    insert into rooms (building_id, room_number, room_type, capacity, facilities)
      values (p_building_id, p_room_number, p_room_type, p_capacity, p_facilities) returning id into v_id;
    insert into beds (room_id, bed_number) select v_id, g::text from generate_series(1, p_capacity) g;
  else
    select count(*) into v_cur from beds where room_id = v_id;
    select count(*) into v_occupied from beds bd join bookings bk on bk.bed_id = bd.id and bk.status = 'active'
      where bd.room_id = v_id;
    if p_capacity < v_occupied then raise exception 'CAPACITY_BELOW_OCCUPIED' using errcode = 'P0001'; end if;
    update rooms set room_number = p_room_number, room_type = p_room_type, capacity = p_capacity,
      facilities = p_facilities, updated_at = now() where id = v_id;
    if p_capacity > v_cur then
      insert into beds (room_id, bed_number) select v_id, g::text from generate_series(v_cur + 1, p_capacity) g;
    elsif p_capacity < v_cur then
      -- deactivate highest-numbered free beds (history is preserved)
      update beds set is_active = false where id in (
        select bd.id from beds bd where bd.room_id = v_id and bd.is_active
          and not exists (select 1 from bookings bk where bk.bed_id = bd.id and bk.status = 'active')
        order by bd.bed_number::int desc limit (select count(*) from beds where room_id = v_id and is_active) - p_capacity);
    end if;
  end if;
  return v_id;
end $$;

create view public.room_availability with (security_invoker = true) as
select b.id building_id, b.name building_name, r.id room_id, r.room_number, r.room_type, r.facilities,
  count(bed.id) filter (where bed.is_active and bk.id is null) available_beds,
  count(bed.id) filter (where bed.is_active) active_beds
from buildings b join rooms r on r.building_id = b.id join beds bed on bed.room_id = r.id
left join bookings bk on bk.bed_id = bed.id and bk.status = 'active'
where b.is_active and r.is_active
group by b.id, b.name, r.id, r.room_number, r.room_type, r.facilities;

-- Students must not see other students' bookings via the view: bk is joined under caller RLS,
-- so availability for students should be read via this definer function instead.
create function public.get_availability() returns table (
  building_id uuid, building_name text, room_id uuid, room_number text, room_type text,
  facilities jsonb, available_beds bigint, active_beds bigint)
language sql stable security definer set search_path = public as $$
  select b.id, b.name, r.id, r.room_number, r.room_type, r.facilities,
    count(bed.id) filter (where bed.is_active and bk.id is null),
    count(bed.id) filter (where bed.is_active)
  from buildings b join rooms r on r.building_id = b.id join beds bed on bed.room_id = r.id
  left join bookings bk on bk.bed_id = bed.id and bk.status = 'active'
  where b.is_active and r.is_active and auth.uid() is not null
  group by b.id, b.name, r.id, r.room_number, r.room_type, r.facilities
  having count(bed.id) filter (where bed.is_active and bk.id is null) > 0
$$;

revoke all on function public.create_booking, public.cancel_booking, public.admin_upsert_room, public.get_availability from public;
grant execute on function public.create_booking, public.cancel_booking, public.admin_upsert_room, public.get_availability to authenticated;
