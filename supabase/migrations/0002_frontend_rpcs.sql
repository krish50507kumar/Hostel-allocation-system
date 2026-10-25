-- Helpers the web app calls. Both are trusted server-side functions.

-- Bed IDs in a room that already have an active booking (IDs only: no student identity leaks).
create function public.get_taken_bed_ids(p_room_id uuid) returns setof uuid
language sql stable security definer set search_path = public as $$
  select bk.bed_id from bookings bk join beds bd on bd.id = bk.bed_id
  where bd.room_id = p_room_id and bk.status = 'active' and auth.uid() is not null
$$;

create function public.admin_create_building(p_name text, p_description text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  insert into buildings (name, description) values (trim(p_name), p_description) returning id into v_id;
  insert into audit_events (actor_id, event_type, entity_type, entity_id)
    values (auth.uid(), 'building.created', 'building', v_id::text);
  return v_id;
end $$;

revoke all on function public.get_taken_bed_ids, public.admin_create_building from public;
grant execute on function public.get_taken_bed_ids, public.admin_create_building to authenticated;
