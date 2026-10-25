// Edge Function: POST /functions/v1/ai-chat  { message, history? }
// The LLM only calls allowlisted tools. Every tool runs with the CALLER's JWT, so RLS/RPC checks apply.
// Secrets: supabase secrets set GEMINI_API_KEY=...   (optional GEMINI_MODEL)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const MODEL = Deno.env.get("GEMINI_MODEL") ?? "gemini-2.0-flash";
const MAX_TOOL_ROUNDS = 4, MAX_MSG = 500, UUID = /^[0-9a-f-]{36}$/i;
const hits = new Map<string, number[]>(); // per-instance rate limit (use a DB/Redis limiter in production)
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const err = (s: number, code: string, message: string) => json({ error: { code, message } }, s);

const SYSTEM = `You help students find a hostel bed. Rules:
- Use tools to check CURRENT availability. Never invent buildings, rooms, beds, facilities or policies.
- Explain recommendations only with fields the tools returned. If a detail is missing, say you cannot verify it.
- Ask a clarifying question if the request is ambiguous.
- You can only PROPOSE a booking (propose_booking). Never say a booking exists; the student must confirm in the UI.
- If a tool fails, say availability could not be verified. Never reveal other students' data.`;

const tools = [{ functionDeclarations: [
  { name: "search_rooms", description: "Search rooms that currently have free beds.",
    parameters: { type: "OBJECT", properties: { building_name: { type: "STRING" }, room_type: { type: "STRING" },
      required_facilities: { type: "ARRAY", items: { type: "STRING" } } } } },
  { name: "get_room_details", description: "Get a room's free beds (ids and numbers).",
    parameters: { type: "OBJECT", properties: { room_id: { type: "STRING" } }, required: ["room_id"] } },
  { name: "propose_booking", description: "Create a short-lived proposal for one free bed. Not a booking.",
    parameters: { type: "OBJECT", properties: { bed_id: { type: "STRING" } }, required: ["bed_id"] } },
] }];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return err(405, "METHOD_NOT_ALLOWED", "Use POST.");
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return err(401, "UNAUTHENTICATED", "Please sign in again.");

  const now = Date.now(), recent = (hits.get(user.id) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= 10) return err(429, "RATE_LIMITED", "Too many requests. Wait a minute and try again.");
  hits.set(user.id, [...recent, now]);

  let body: { message?: unknown; history?: unknown };
  try { body = await req.json(); } catch { return err(400, "BAD_REQUEST", "Invalid JSON."); }
  if (typeof body.message !== "string" || !body.message.trim() || body.message.length > MAX_MSG)
    return err(400, "BAD_REQUEST", `Message must be 1-${MAX_MSG} characters.`);
  const history = (Array.isArray(body.history) ? body.history : []).slice(-8)
    .filter((h: any) => (h?.role === "user" || h?.role === "model") && typeof h.text === "string")
    .map((h: any) => ({ role: h.role, parts: [{ text: String(h.text).slice(0, MAX_MSG) }] }));
  const contents: any[] = [...history, { role: "user", parts: [{ text: body.message.trim() }] }];

  const rooms: any[] = []; let pending: any = null; const checkedAt = new Date().toISOString();

  async function runTool(name: string, a: any): Promise<unknown> {
    if (name === "search_rooms") {
      const { data, error } = await sb.rpc("get_availability"); if (error) throw error;
      const f = (Array.isArray(a?.required_facilities) ? a.required_facilities : []).slice(0, 5).map((x: any) => String(x).toLowerCase());
      const out = (data ?? []).filter((r: any) =>
        (!a?.building_name || r.building_name.toLowerCase().includes(String(a.building_name).toLowerCase())) &&
        (!a?.room_type || (r.room_type ?? "").toLowerCase() === String(a.room_type).toLowerCase()) &&
        f.every((x: string) => (r.facilities as string[]).map((y) => y.toLowerCase()).includes(x))
      ).slice(0, 10).map((r: any) => ({ room_id: r.room_id, building_name: r.building_name, room_number: r.room_number,
        room_type: r.room_type, facilities: r.facilities, available_beds: Number(r.available_beds), active_beds: Number(r.active_beds), checked_at: checkedAt,
        evidence: ["room_active", "bed_available"] }));
      out.forEach((r: any) => { if (!rooms.some((x) => x.room_id === r.room_id)) rooms.push(r); });
      return { rooms: out };
    }
    if (name === "get_room_details") {
      if (!UUID.test(a?.room_id ?? "")) return { error: "invalid room_id" };
      const [{ data: beds }, { data: taken }] = await Promise.all([
        sb.from("beds").select("id, bed_number").eq("room_id", a.room_id).eq("is_active", true).order("bed_number"),
        sb.rpc("get_taken_bed_ids", { p_room_id: a.room_id })]);
      const t = new Set((taken ?? []) as string[]);
      return { free_beds: (beds ?? []).filter((b: any) => !t.has(b.id)).map((b: any) => ({ bed_id: b.id, bed_number: b.bed_number })), checked_at: checkedAt };
    }
    if (name === "propose_booking") {
      if (!UUID.test(a?.bed_id ?? "")) return { error: "invalid bed_id" };
      const { data, error } = await sb.rpc("create_proposal", { p_bed_id: a.bed_id });
      if (error) return { error: error.message.includes("ALREADY_HAS") ? "student already has an active booking" : "bed not available" };
      pending = { proposal_id: data[0].id, expires_at: data[0].expires_at, building_name: data[0].building_name,
        room_number: data[0].room_number, bed_number: data[0].bed_number };
      return { proposal_created: true, ...pending, note: "Not a booking until the student confirms." };
    }
    return { error: "unknown tool" }; // anything outside the allowlist is rejected
  }

  try {
    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
        method: "POST", signal: AbortSignal.timeout(15_000),
        headers: { "Content-Type": "application/json", "x-goog-api-key": Deno.env.get("GEMINI_API_KEY")! },
        body: JSON.stringify({ systemInstruction: { parts: [{ text: SYSTEM }] }, contents, tools, generationConfig: { temperature: 0.2 } }),
      });
      if (!res.ok) throw new Error(`provider ${res.status}`);
      const parts = (await res.json()).candidates?.[0]?.content?.parts ?? [];
      const calls = parts.filter((p: any) => p.functionCall);
      if (!calls.length || round === MAX_TOOL_ROUNDS) {
        const reply = parts.map((p: any) => p.text ?? "").join("").trim() || "I could not complete that. Please try rephrasing.";
        return json({ reply, rooms, pending_action: pending });
      }
      contents.push({ role: "model", parts });
      const responses = [];
      for (const c of calls) {
        let response: unknown;
        try { response = await runTool(c.functionCall.name, c.functionCall.args); }
        catch { response = { error: "availability could not be verified" }; }
        responses.push({ functionResponse: { name: c.functionCall.name, response: { result: response } } });
      }
      contents.push({ role: "user", parts: responses });
    }
  } catch (e) {
    console.error("ai-chat failed:", e); // log outcome only: no keys, no student data
    return err(503, "AI_UNAVAILABLE", "The assistant is unavailable right now. You can still browse and book rooms manually.");
  }
});