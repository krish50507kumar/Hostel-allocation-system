create or replace function public.create_booking_invite(
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
  v_room_id uuid;
  v_available_beds integer;
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
  if exists (
    select 1 from public.booking_invites
    where inviter_id = v_inviter and invitee_id = v_invitee.id and bed_id = p_bed_id
      and status = 'pending' and expires_at > now()
  ) then
    raise exception 'INVITE_ALREADY_SENT' using errcode = 'P0001';
  end if;

  select bd.room_id into v_room_id
  from public.beds bd
  join public.rooms r on r.id = bd.room_id
  join public.buildings b on b.id = r.building_id
  where bd.id = p_bed_id and bd.is_active and r.is_active and b.is_active
    and not exists (select 1 from public.bookings bk where bk.bed_id = bd.id and bk.status = 'active')
    and not exists (
      select 1 from public.booking_invites bi
      where bi.bed_id = bd.id and bi.status = 'pending' and bi.expires_at > now()
    );
  if not found then raise exception 'BED_UNAVAILABLE' using errcode = 'P0002'; end if;

  select count(*) into v_available_beds
  from public.beds bd
  where bd.room_id = v_room_id and bd.is_active
    and not exists (select 1 from public.bookings bk where bk.bed_id = bd.id and bk.status = 'active')
    and not exists (
      select 1 from public.booking_invites bi
      where bi.bed_id = bd.id and bi.status = 'pending' and bi.expires_at > now()
    );
  if v_available_beds <= 0 then raise exception 'GROUP_INVITE_LIMIT' using errcode = 'P0001'; end if;

  insert into public.booking_invites (inviter_id, invitee_id, bed_id, expires_at)
  values (v_inviter, v_invitee.id, p_bed_id, v_exp)
  returning booking_invites.id into v_id;

  return query
  select v_id, v_exp, v_invitee.full_name, r.room_number, bd.bed_number
  from public.beds bd
  join public.rooms r on r.id = bd.room_id
  where bd.id = p_bed_id;
end $$;
