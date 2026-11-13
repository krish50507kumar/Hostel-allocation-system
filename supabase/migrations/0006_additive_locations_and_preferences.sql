-- Additive schema update.
-- Preserves the original profiles, buildings, rooms, beds, bookings, and settings tables.

do $$
begin
  create type public.place_type as enum (
    'academic',
    'campus',
    'class_building',
    'hostel_building',
    'library',
    'mess'
  );
exception
  when duplicate_object then null;
end $$;

alter type public.place_type add value if not exists 'class_building';
alter type public.place_type add value if not exists 'hostel_building';
alter type public.place_type add value if not exists 'library';
alter type public.place_type add value if not exists 'mess';

alter table public.buildings add column if not exists latitude numeric(9,6);
alter table public.buildings add column if not exists longitude numeric(9,6);

create table if not exists public.campus_places (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  place_type public.place_type not null default 'academic',
  description text,
  latitude numeric(9,6),
  longitude numeric(9,6),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists campus_places_name_unique_ci
  on public.campus_places (lower(trim(name)));

create table if not exists public.student_routines (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null unique references public.profiles(id) on delete cascade,
  updated_at timestamptz not null default now()
);

create table if not exists public.routine_visits (
  id uuid primary key default gen_random_uuid(),
  routine_id uuid not null references public.student_routines(id) on delete cascade,
  place_id uuid not null references public.campus_places(id),
  visits_per_week integer not null default 1 check (visits_per_week between 1 and 99),
  created_at timestamptz not null default now(),
  unique (routine_id, place_id)
);
create index if not exists routine_visits_routine_idx on public.routine_visits (routine_id);

create table if not exists public.room_preferences (
  student_id uuid primary key references public.profiles(id) on delete cascade,
  preferred_room_types text[] not null default '{}',
  required_facilities text[] not null default '{}',
  preferred_gender text,
  max_weekly_distance_km numeric(8,2),
  updated_at timestamptz not null default now()
);

create table if not exists public.commute_routes (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings(id) on delete cascade,
  place_id uuid not null references public.campus_places(id) on delete cascade,
  distance_meters integer not null check (distance_meters >= 0),
  walking_minutes integer not null check (walking_minutes >= 0),
  source text not null default 'manual',
  updated_at timestamptz not null default now(),
  unique (building_id, place_id)
);

alter table public.campus_places enable row level security;
alter table public.student_routines enable row level security;
alter table public.routine_visits enable row level security;
alter table public.room_preferences enable row level security;
alter table public.commute_routes enable row level security;

create policy places_authenticated_read on public.campus_places
for select using (auth.uid() is not null and (is_active or public.is_admin()));

create policy routine_self_access on public.student_routines
for all using (student_id = auth.uid() or public.is_admin())
with check (student_id = auth.uid() or public.is_admin());

create policy routine_visits_self_access on public.routine_visits
for all using (
  exists (
    select 1 from public.student_routines r
    where r.id = routine_id and (r.student_id = auth.uid() or public.is_admin())
  )
)
with check (
  exists (
    select 1 from public.student_routines r
    where r.id = routine_id and (r.student_id = auth.uid() or public.is_admin())
  )
);

create policy preferences_self_access on public.room_preferences
for all using (student_id = auth.uid() or public.is_admin())
with check (student_id = auth.uid() or public.is_admin());

create policy routes_authenticated_read on public.commute_routes
for select using (auth.uid() is not null);
