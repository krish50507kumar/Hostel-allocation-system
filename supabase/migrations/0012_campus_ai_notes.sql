-- Flexible, admin-maintained campus knowledge for the AI assistant.
create table if not exists public.campus_ai_notes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null,
  category text not null default 'general',
  is_active boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (nullif(trim(title), '') is not null),
  check (nullif(trim(content), '') is not null)
);

create index if not exists campus_ai_notes_active_idx
  on public.campus_ai_notes (is_active, updated_at desc);

alter table public.campus_ai_notes enable row level security;
create policy campus_ai_notes_authenticated_read on public.campus_ai_notes
for select using (auth.uid() is not null and (is_active or public.is_admin()));

create or replace function public.admin_upsert_campus_ai_note(
  p_note_id uuid,
  p_title text,
  p_content text,
  p_category text default 'general'
)
returns public.campus_ai_notes
language plpgsql security definer set search_path = public as $$
declare
  v_row public.campus_ai_notes;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if nullif(trim(p_title), '') is null or nullif(trim(p_content), '') is null then
    raise exception 'INVALID_CAMPUS_NOTE' using errcode = '22023';
  end if;
  if p_note_id is null then
    insert into public.campus_ai_notes (title, content, category, created_by)
    values (trim(p_title), trim(p_content), coalesce(nullif(trim(p_category), ''), 'general'), auth.uid())
    returning * into v_row;
  else
    update public.campus_ai_notes
    set title = trim(p_title), content = trim(p_content),
        category = coalesce(nullif(trim(p_category), ''), 'general'), updated_at = now()
    where id = p_note_id
    returning * into v_row;
    if not found then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  end if;
  return v_row;
end $$;

create or replace function public.admin_delete_campus_ai_note(p_note_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  update public.campus_ai_notes set is_active = false, updated_at = now()
  where id = p_note_id;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
end $$;

revoke all on function public.admin_upsert_campus_ai_note(uuid, text, text, text) from public;
grant execute on function public.admin_upsert_campus_ai_note(uuid, text, text, text) to authenticated;
revoke all on function public.admin_delete_campus_ai_note(uuid) from public;
grant execute on function public.admin_delete_campus_ai_note(uuid) to authenticated;
