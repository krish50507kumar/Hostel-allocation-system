-- Normalize existing gender values and persist the required registration value.
update public.room_preferences
set preferred_gender = case lower(trim(preferred_gender))
  when 'male' then 'boy'
  when 'man' then 'boy'
  when 'boys' then 'boy'
  when 'female' then 'girl'
  when 'woman' then 'girl'
  when 'girls' then 'girl'
  else preferred_gender
end
where preferred_gender is not null;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_gender text := case lower(trim(coalesce(new.raw_user_meta_data->>'gender', '')))
    when 'male' then 'boy'
    when 'man' then 'boy'
    when 'boys' then 'boy'
    when 'female' then 'girl'
    when 'woman' then 'girl'
    when 'girls' then 'girl'
    when 'boy' then 'boy'
    when 'girl' then 'girl'
    else null
  end;
begin
  insert into public.profiles (id, full_name, student_number)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', 'Student'),
          new.raw_user_meta_data->>'student_number')
  on conflict (id) do update set
    full_name = excluded.full_name,
    student_number = coalesce(excluded.student_number, profiles.student_number);
  if v_gender is not null then
    insert into public.room_preferences (student_id, preferred_gender)
    values (new.id, v_gender)
    on conflict (student_id) do update set preferred_gender = excluded.preferred_gender;
  end if;
  return new;
end $$;
