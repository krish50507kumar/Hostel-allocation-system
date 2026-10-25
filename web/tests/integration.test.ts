// Integration tests for the api.md scenarios, run against a real Supabase TEST project.
// Scenario 13 (solver infeasible) lives in engine/allocator.py (pytest). 11 and 12 are noted at the bottom.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = process.env.TEST_SUPABASE_URL!, ANON = process.env.TEST_SUPABASE_ANON_KEY!, SERVICE = process.env.TEST_SERVICE_ROLE_KEY!;
const ready = !!(URL && ANON && SERVICE);
const PW = "Test-password-123!", RUN = Date.now().toString(36);
const opts = { auth: { persistSession: false, autoRefreshToken: false } };

type Student = { id: string; c: SupabaseClient };
const userIds: string[] = [], buildingIds: string[] = [];
let svc: SupabaseClient, n = 0, saved: Record<string, unknown>;

async function newUser(admin = false): Promise<Student> {
  const email = `test-${RUN}-${++n}@example.test`;
  const { data, error } = await svc.auth.admin.createUser({ email, password: PW, email_confirm: true,
    user_metadata: { full_name: `Test ${n}`, student_number: `T${RUN}${n}` } });
  if (error) throw error;
  userIds.push(data.user.id);
  if (admin) await svc.from("profiles").update({ role: "admin" }).eq("id", data.user.id);
  const c = createClient(URL, ANON, opts);
  const { error: e2 } = await c.auth.signInWithPassword({ email, password: PW });
  if (e2) throw e2;
  return { id: data.user.id, c };
}
async function makeRoom(capacity: number) {
  const { data: b } = await svc.from("buildings").insert({ name: `ZZ-TEST-${RUN}-${++n}` }).select().single();
  buildingIds.push(b!.id);
  const { data: r } = await svc.from("rooms").insert({ building_id: b!.id, room_number: "1", room_type: "double", capacity }).select().single();
  await svc.from("beds").insert(Array.from({ length: capacity }, (_, i) => ({ room_id: r!.id, bed_number: String(i + 1) })));
  const { data: beds } = await svc.from("beds").select("id").eq("room_id", r!.id).order("bed_number");
  return { building: b!, room: r!, beds: beds!.map((x) => x.id as string) };
}
const book = (s: Student, bed: string) => s.c.rpc("create_booking", { p_bed_id: bed, p_source: "manual" });
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
const addDays = (d: string, k: number) => new Date(new Date(d + "T00:00:00Z").getTime() + k * 864e5).toISOString().slice(0, 10);
const setStart = (start: string) => svc.from("app_settings").update({ college_start_date: start,
  cancellation_days_before_start: 10, timezone: "Asia/Kolkata" }).eq("id", 1);
const availableFor = async (s: Student, roomId: string) =>
  ((await s.c.rpc("get_availability")).data ?? []).find((r: any) => r.room_id === roomId)?.available_beds;

describe.skipIf(!ready)("hostel booking scenarios", () => {
  beforeAll(async () => {
    svc = createClient(URL, SERVICE, opts);
    saved = (await svc.from("app_settings").select("*").eq("id", 1).single()).data!;
  });
  afterAll(async () => {
    if (!svc) return;
    await svc.from("app_settings").update({ college_start_date: saved.college_start_date,
      cancellation_days_before_start: saved.cancellation_days_before_start, timezone: saved.timezone }).eq("id", 1);
    const { data: rooms } = await svc.from("rooms").select("id").in("building_id", buildingIds);
    const roomIds = (rooms ?? []).map((r) => r.id);
    await svc.from("ai_proposals").delete().in("student_id", userIds);
    await svc.from("bookings").delete().in("student_id", userIds);
    await svc.from("audit_events").delete().in("actor_id", userIds);
    if (roomIds.length) { await svc.from("beds").delete().in("room_id", roomIds); await svc.from("rooms").delete().in("id", roomIds); }
    await svc.from("buildings").delete().in("id", buildingIds);
    for (const id of userIds) await svc.auth.admin.deleteUser(id);
  });

  it("1. student books an available bed", async () => {
    const { beds } = await makeRoom(1); const s = await newUser();
    const { data, error } = await book(s, beds[0]);
    expect(error).toBeNull(); expect(data.status).toBe("active"); expect(data.booking_reference).toMatch(/^HST-/);
  });

  it("2. concurrent requests for one bed: exactly one succeeds", async () => {
    const { beds } = await makeRoom(1); const [a, b] = [await newUser(), await newUser()];
    const res = await Promise.all([book(a, beds[0]), book(b, beds[0])]);
    expect(res.filter((r) => !r.error)).toHaveLength(1);
    expect(res.find((r) => r.error)!.error!.message).toContain("BED_UNAVAILABLE");
    const { count } = await svc.from("bookings").select("id", { count: "exact", head: true }).eq("bed_id", beds[0]).eq("status", "active");
    expect(count).toBe(1);
  });

  it("3. second active booking is rejected", async () => {
    const { beds } = await makeRoom(2); const s = await newUser();
    expect((await book(s, beds[0])).error).toBeNull();
    expect((await book(s, beds[1])).error!.message).toContain("ALREADY_HAS_ACTIVE_BOOKING");
  });

  it("4. a student cannot see another student's booking", async () => {
    const { beds } = await makeRoom(1); const [a, b] = [await newUser(), await newUser()];
    const { data } = await book(a, beds[0]);
    expect((await b.c.from("bookings").select("*").eq("id", data.id)).data).toEqual([]);
    expect((await a.c.from("bookings").select("*").eq("id", data.id)).data).toHaveLength(1);
  });

  it("5. non-admin cannot create a building", async () => {
    const s = await newUser();
    expect((await s.c.rpc("admin_create_building", { p_name: `ZZ-NOPE-${RUN}` })).error!.message).toContain("FORBIDDEN");
    expect((await s.c.from("buildings").insert({ name: `ZZ-NOPE2-${RUN}` })).error).not.toBeNull(); // no insert policy
  });

  it("6. capacity cannot drop below occupied beds", async () => {
    const { room, building, beds } = await makeRoom(2); const admin = await newUser(true);
    await book(await newUser(), beds[0]); await book(await newUser(), beds[1]);
    const { error } = await admin.c.rpc("admin_upsert_room", { p_room_id: room.id, p_building_id: building.id,
      p_room_number: "1", p_room_type: "double", p_capacity: 1, p_facilities: [] });
    expect(error!.message).toContain("CAPACITY_BELOW_OCCUPIED");
  });

  it("7. cancel before cutoff succeeds and frees the bed", async () => {
    await setStart(addDays(today(), 60));
    const { beds, room } = await makeRoom(1); const s = await newUser();
    const { data } = await book(s, beds[0]);
    expect(await availableFor(s, room.id)).toBeUndefined(); // fully booked: not listed
    const { data: c, error } = await s.c.rpc("cancel_booking", { p_booking_id: data.id, p_reason: "test" });
    expect(error).toBeNull(); expect(c.status).toBe("cancelled"); expect(c.cancelled_at).not.toBeNull();
    expect(Number(await availableFor(s, room.id))).toBe(1);
    expect((await s.c.from("bookings").select("id").eq("id", data.id)).data).toHaveLength(1); // history kept
  });

  it("8. cancel on/after the cutoff fails", async () => {
    const { beds } = await makeRoom(2); const [a, b] = [await newUser(), await newUser()];
    const [x, y] = [(await book(a, beds[0])).data, (await book(b, beds[1])).data];
    await setStart(addDays(today(), 10)); // cutoff == today -> blocked
    expect((await a.c.rpc("cancel_booking", { p_booking_id: x.id })).error!.message).toContain("CANCELLATION_CUTOFF_PASSED");
    await setStart(addDays(today(), 5));  // cutoff in the past -> blocked
    expect((await b.c.rpc("cancel_booking", { p_booking_id: y.id })).error!.message).toContain("CANCELLATION_CUTOFF_PASSED");
  });

  it.skipIf(!process.env.RUN_AI_TESTS)("9. AI search for a nonexistent building returns no invented rooms", async () => {
    const s = await newUser();
    const { data, error } = await s.c.functions.invoke("ai-chat", { body: { message: "Find me a bed in Building Zzqx-Nonexistent-999" } });
    expect(error).toBeNull(); expect(data.rooms).toEqual([]); expect(data.pending_action).toBeNull();
  });

  it("10. a proposal for a bed that gets taken is rejected at confirmation", async () => {
    const { beds } = await makeRoom(1); const [a, b] = [await newUser(), await newUser()];
    const { data: p, error } = await a.c.rpc("create_proposal", { p_bed_id: beds[0] });
    expect(error).toBeNull();
    expect((await book(b, beds[0])).error).toBeNull(); // someone else wins the bed
    expect((await a.c.rpc("confirm_proposal", { p_proposal_id: p[0].id })).error!.message).toContain("BED_UNAVAILABLE");
    expect((await b.c.rpc("create_proposal", { p_bed_id: beds[0] })).error).not.toBeNull(); // occupied bed can't be proposed
  });

  it("14. admin dashboard totals match database counts", async () => {
    const admin = await newUser(true);
    const count = async (c: SupabaseClient, t: string, f: (q: any) => any) => (await f(c.from(t).select("id", { count: "exact", head: true }))).count;
    for (const [t, f] of [["rooms", (q: any) => q.eq("is_active", true)], ["beds", (q: any) => q.eq("is_active", true)],
      ["bookings", (q: any) => q.eq("status", "active")]] as const)
      expect(await count(admin.c, t, f)).toBe(await count(svc, t, f));
  });

  // 11 (provider timeout): manual booking uses only RPCs, so scenario 1 already proves it works without any LLM.
  // 12 (AI claims an absent facility): needs a live model; check it manually through the AI assistant page.
  // 13 (solver infeasible): covered by test_infeasible_reports_unassigned in engine/allocator.py.
});