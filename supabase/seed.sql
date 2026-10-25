-- Synthetic demo inventory. Safe to re-run. Run in the SQL Editor (service role), not from the app.
insert into buildings (name, description) values
  ('Building A', 'North campus hostel'), ('Building B', 'South campus hostel')
on conflict do nothing;

insert into rooms (building_id, room_number, room_type, capacity, facilities)
select b.id, v.num, v.typ, v.cap, v.fac::jsonb
from (values
  ('Building A','101','single',1,'["study_desk","attached_bathroom"]'),
  ('Building A','102','double',2,'["study_desk"]'),
  ('Building A','103','double',2,'["study_desk","attached_bathroom"]'),
  ('Building A','104','triple',3,'[]'),
  ('Building B','201','double',2,'["attached_bathroom"]'),
  ('Building B','202','single',1,'["study_desk"]'),
  ('Building B','203','triple',3,'["study_desk","attached_bathroom"]')
) as v(bname, num, typ, cap, fac)
join buildings b on b.name = v.bname
on conflict (building_id, room_number) do nothing;

insert into beds (room_id, bed_number)
select r.id, g::text from rooms r cross join lateral generate_series(1, r.capacity) g
on conflict (room_id, bed_number) do nothing;
