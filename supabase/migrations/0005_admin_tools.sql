-- Admin settings update + paginated booking search (admin-only; contact details never reach students).
create function public.admin_update_settings(p_start date, p_days integer, p_tz text)
returns public.app_settings language plpgsql security definer set search_path = public as $$
declare v_row public.app_settings;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if p_days < 0 then raise exception 'INVALID_INPUT' using errcode = '22023'; end if;
  perform now() at time zone p_tz;  -- raises if the timezone name is invalid
  update app_settings set college_start_date = p_start, cancellation_days_before_start = p_days,
    timezone = p_tz, updated_by = auth.uid(), updated_at = now() where id = 1 returning * into v_row;
  insert into audit_events (actor_id, event_type, entity_type, entity_id, details)
    values (auth.uid(), 'settings.updated', 'settings', '1', jsonb_build_object('start', p_start, 'days', p_days, 'tz', p_tz));
  return v_row;
end $$;

create function public.admin_list_bookings(p_status text default null, p_search text default null,
  p_page integer default 1, p_page_size integer default 25)
returns table (booking_reference text, status text, booked_at timestamptz, student_name text, student_number text,
  phone text, building_name text, room_number text, bed_number text, total_count bigint)
language plpgsql stable security definer set search_path = public as $$
declare v_size integer := least(greatest(p_page_size, 1), 100); v_q text := '%' || coalesce(trim(p_search), '') || '%';
begin
  if not public.is_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  return query
    select bk.booking_reference, bk.status::text, bk.booked_at, pr.full_name, pr.student_number, pr.phone,
           b.name, r.room_number, bd.bed_number, count(*) over ()
    from bookings bk join profiles pr on pr.id = bk.student_id join beds bd on bd.id = bk.bed_id
      join rooms r on r.id = bd.room_id join buildings b on b.id = r.building_id
    where (p_status is null or bk.status::text = p_status)
      and (bk.booking_reference ilike v_q or pr.full_name ilike v_q or coalesce(pr.student_number, '') ilike v_q or r.room_number ilike v_q)
    order by bk.booked_at desc limit v_size offset (greatest(p_page, 1) - 1) * v_size;
end $$;

revoke all on function public.admin_update_settings, public.admin_list_bookings from public;
grant execute on function public.admin_update_settings, public.admin_list_bookings to authenticated;
