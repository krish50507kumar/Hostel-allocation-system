-- Fix: create_booking used gen_random_bytes(), which lives in Supabase's "extensions" schema and is not
-- visible under search_path = public, so every booking failed. gen_random_uuid() is built in.
create or replace function public.create_booking(p_bed_id uuid, p_source text default 'manual')
returns public.bookings language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_row public.bookings;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED' using errcode = '28000'; end if;
  if p_source not in ('manual','ai_assisted') then raise exception 'INVALID_SOURCE' using errcode = '22023'; end if;
  -- A student without a profile row would fail the foreign key; create it if missing.
  insert into profiles (id, full_name)
    select u.id, coalesce(u.raw_user_meta_data->>'full_name', 'Student') from auth.users u where u.id = v_uid
    on conflict (id) do nothing;
  perform 1 from beds bd join rooms r on r.id = bd.room_id join buildings b on b.id = r.building_id
    where bd.id = p_bed_id and bd.is_active and r.is_active and b.is_active;
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
