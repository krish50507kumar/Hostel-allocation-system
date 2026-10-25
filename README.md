# Hostel Allocation System
1. Create a Supabase project; run `supabase/migrations/*.sql` in order.
2. `cd web && cp .env.example .env` (fill URL + anon key), `npm install && npm run dev`.
3. Promote an admin: `update profiles set role='admin' where student_number='<yours>';`
4. Engine tests: `pytest engine/allocator.py`
4. AI assistant: `supabase secrets set GEMINI_API_KEY=...` then `supabase functions deploy ai-chat` (run migrations 0003-0004 first).
5. Run 0005_admin_tools.sql, then optionally seed.sql for demo rooms.
6. Tests: copy web/.env.test.example to web/.env.test (TEST project only), then `cd web && npm install && npm test`; solver: `pytest engine/allocator.py`.
Not built yet: solver wired into the app, admin edit/deactivate screens, extra student screens.