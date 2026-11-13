create type public.booking_invite_status as enum ('pending', 'accepted', 'declined', 'expired');

create table public.booking_invites (
  id uuid primary key default gen_random_uuid(),
  inviter_id uuid not null references public.profiles(id) on delete cascade,
  invitee_id uuid not null references public.profiles(id) on delete cascade,
  bed_id uuid not null references public.beds(id),
  status public.booking_invite_status not null default 'pending',
  expires_at timestamptz not null default now() + interval '30 minutes',
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (inviter_id <> invitee_id)
);

alter table public.booking_invites enable row level security;

create policy booking_invites_own_read on public.booking_invites
for select using (inviter_id = auth.uid() or invitee_id = auth.uid());

create index booking_invites_invitee_status_idx
  on public.booking_invites (invitee_id, status);
create index booking_invites_inviter_status_idx
  on public.booking_invites (inviter_id, status);

create function public.create_booking_invite(
  p_bed_id uuid,
  p_student_number text,
  p_email text
)
returns table (id uuid, expires_at timestamptz, invitee_name text, room_number text, bed_number text)
language plpgsql security definer set search_path = public, auth as $$
declare
  v_inviter uuid := auth.uid();
  v_invitee public.profiles;
  v_exp timestamptz := now() + interval '30 minutes';
  v_id uuid;
begin
  if v_inviter is null then raise exception 'UNAUTHENTICATED' using errcode = '28000'; end if;
  if nullif(trim(p_student_number), '') is null or nullif(trim(p_email), '') is null then
    raise exception 'INVITEE_DETAILS_REQUIRED' using errcode = '22023';
  end if;

  select p.* into v_invitee
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.student_number = trim(p_student_number)
    and lower(coalesce(u.email, '')) = lower(trim(p_email));
  if not found then raise exception 'INVITEE_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_invitee.id = v_inviter then raise exception 'CANNOT_INVITE_SELF' using errcode = 'P0001'; end if;
  if exists (select 1 from public.bookings where student_id = v_invitee.id and status = 'active') then
    raise exception 'INVITEE_ALREADY_BOOKED' using errcode = 'P0001';
  end if;
  if (
    select count(*) from public.booking_invites
    where inviter_id = v_inviter and status = 'pending' and expires_at > now()
  ) >= 5 then
    raise exception 'GROUP_INVITE_LIMIT' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.booking_invites
    where inviter_id = v_inviter and invitee_id = v_invitee.id and bed_id = p_bed_id
      and status = 'pending' and expires_at > now()
  ) then
    raise exception 'INVITE_ALREADY_SENT' using errcode = 'P0001';
  end if;
  perform 1
  from public.beds bd
  join public.rooms r on r.id = bd.room_id
  join public.buildings b on b.id = r.building_id
  where bd.id = p_bed_id and bd.is_active and r.is_active and b.is_active
    and not exists (select 1 from public.bookings bk where bk.bed_id = bd.id and bk.status = 'active');
  if not found then raise exception 'BED_UNAVAILABLE' using errcode = 'P0002'; end if;

  insert into public.booking_invites (inviter_id, invitee_id, bed_id, expires_at)
  values (v_inviter, v_invitee.id, p_bed_id, v_exp)
  returning booking_invites.id into v_id;

  return query
  select v_id, v_exp, v_invitee.full_name, r.room_number, bd.bed_number
  from public.beds bd
  join public.rooms r on r.id = bd.room_id
  where bd.id = p_bed_id;
end $$;

create function public.accept_booking_invite(p_invite_id uuid)
returns public.bookings
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_invite public.booking_invites;
  v_booking public.bookings;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED' using errcode = '28000'; end if;
  select * into v_invite
  from public.booking_invites
  where id = p_invite_id and invitee_id = v_uid
  for update;
  if not found then raise exception 'INVITE_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_invite.status <> 'pending' or v_invite.expires_at <= now() then
    update public.booking_invites
    set status = case when status = 'pending' then 'expired' else status end,
        responded_at = case when status = 'pending' then now() else responded_at end
    where id = v_invite.id;
    raise exception 'INVITE_EXPIRED' using errcode = 'P0001';
  end if;

  v_booking := public.create_booking(v_invite.bed_id, 'manual');
  update public.booking_invites
  set status = 'accepted', responded_at = now()
  where id = v_invite.id;
  return v_booking;
end $$;

create function public.decline_booking_invite(p_invite_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.booking_invites
  set status = 'declined', responded_at = now()
  where id = p_invite_id and invitee_id = auth.uid() and status = 'pending';
  if not found then raise exception 'INVITE_NOT_FOUND' using errcode = 'P0002'; end if;
end $$;

revoke all on function public.create_booking_invite(uuid, text, text) from public;
revoke all on function public.accept_booking_invite(uuid) from public;
revoke all on function public.decline_booking_invite(uuid) from public;
grant execute on function public.create_booking_invite(uuid, text, text) to authenticated;
grant execute on function public.accept_booking_invite(uuid) to authenticated;
grant execute on function public.decline_booking_invite(uuid) to authenticated;
