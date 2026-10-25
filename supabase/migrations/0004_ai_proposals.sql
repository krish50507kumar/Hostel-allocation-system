-- AI booking proposals: short-lived, bound to one student and one bed. A proposal is NOT a booking.
create table public.ai_proposals (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id),
  bed_id uuid not null references public.beds(id),
  expires_at timestamptz not null,
  used boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.ai_proposals enable row level security;
create policy proposals_own_read on public.ai_proposals for select using (student_id = auth.uid());

create function public.create_proposal(p_bed_id uuid)
returns table (id uuid, expires_at timestamptz, building_name text, room_number text, bed_number text)
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_id uuid; v_exp timestamptz := now() + interval '5 minutes';
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED' using errcode = '28000'; end if;
  if exists (select 1 from bookings where student_id = v_uid and status = 'active') then
    raise exception 'ALREADY_HAS_ACTIVE_BOOKING' using errcode = 'P0001'; end if;
  perform 1 from beds bd join rooms r on r.id = bd.room_id join buildings b on b.id = r.building_id
    where bd.id = p_bed_id and bd.is_active and r.is_active and b.is_active
      and not exists (select 1 from bookings bk where bk.bed_id = bd.id and bk.status = 'active');
  if not found then raise exception 'BED_UNAVAILABLE' using errcode = 'P0002'; end if;
  insert into ai_proposals (student_id, bed_id, expires_at) values (v_uid, p_bed_id, v_exp) returning ai_proposals.id into v_id;
  return query select v_id, v_exp, b.name, r.room_number, bd.bed_number
    from beds bd join rooms r on r.id = bd.room_id join buildings b on b.id = r.building_id where bd.id = p_bed_id;
end $$;

-- Student confirms in the UI; the SAME validated booking function is used, so availability is rechecked now.
create function public.confirm_proposal(p_proposal_id uuid)
returns public.bookings language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); p public.ai_proposals; v_row public.bookings;
begin
  select * into p from ai_proposals where id = p_proposal_id and student_id = v_uid for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  if p.used or p.expires_at < now() then raise exception 'PROPOSAL_EXPIRED' using errcode = 'P0001'; end if;
  select * into v_row from public.create_booking(p.bed_id, 'ai_assisted');
  update ai_proposals set used = true where id = p.id;
  return v_row;
end $$;

revoke all on function public.create_proposal, public.confirm_proposal from public;
grant execute on function public.create_proposal, public.confirm_proposal to authenticated;
