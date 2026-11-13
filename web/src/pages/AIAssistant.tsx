import { useState } from "react";
import { supabase, friendly } from "../lib";
import { BedMeter, Facilities, FormattedMessage } from "../components";

type Room = {
  room_id: string; building_name: string; room_number: string;
  room_type: string | null; facilities: string[];
  available_beds: number; active_beds?: number;
  checked_at: string; evidence: string[];
};
type Bed = { id: string; bed_number: string };
type Pending = {
  proposal_id: string; building_name: string; room_number: string;
  bed_number: string; expires_at: string;
};
type Msg = { role: "user" | "model"; text: string };

const PROMPTS = [
  "Find an available bed in Boys hostel 1",
  "Show rooms with an attached bathroom",
  "Compare the available room options",
];

export default function AIAssistant() {
  const [msgs, setMsgs]       = useState<Msg[]>([]);
  const [input, setInput]     = useState("");
  const [busy, setBusy]       = useState(false);
  const [rooms, setRooms]     = useState<Room[]>([]);
  const [pending, setPending] = useState<Pending | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [beds, setBeds] = useState<Bed[]>([]);
  const [bedsBusy, setBedsBusy] = useState(false);
  const [err, setErr]         = useState("");
  const [ok, setOk]           = useState("");

  async function send(text: string) {
    if (!text.trim() || busy) return;
    setBusy(true); setErr(""); setOk(""); setPending(null);
    setSelectedRoom(null);
    setMsgs((m) => [...m, { role: "user", text }]);
    setInput("");
    const { data, error } = await supabase.functions.invoke("ai-chat", {
      body: { message: text, history: msgs.slice(-8) },
    });
    setBusy(false);
    if (error || data?.error) {
      let m = "The assistant is unavailable right now. You can still browse and book rooms manually.";
      try { const b = await (error as any)?.context?.json?.(); if (b?.error?.message) m = b.error.message; } catch { /* keep default */ }
      return setErr(m);
    }
    setMsgs((m) => [...m, { role: "model", text: data.reply }]);
    setRooms(data.rooms ?? []);
    setPending(data.pending_action ?? null);
  }

  async function confirmProposal() {
    if (!pending) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("confirm_proposal", { p_proposal_id: pending.proposal_id });
    setBusy(false);
    if (error) {
      setErr(error.message.includes("PROPOSAL_EXPIRED")
        ? "This proposal expired. Ask the assistant again."
        : friendly(error));
      return setPending(null);
    }
    setOk(`Booked! Your reference is ${(data as { booking_reference: string }).booking_reference}.`);
    setPending(null); setRooms([]);
  }

  async function pickRoom(room: Room) {
    setSelectedRoom(room);
    setBeds([]);
    setErr("");
    setBedsBusy(true);
    const [allResult, takenResult] = await Promise.all([
      supabase.from("beds").select("id, bed_number").eq("room_id", room.room_id).eq("is_active", true).order("bed_number"),
      supabase.rpc("get_taken_bed_ids", { p_room_id: room.room_id }),
    ]);
    setBedsBusy(false);
    if (allResult.error || takenResult.error) {
      setSelectedRoom(null);
      return setErr(friendly(allResult.error ?? takenResult.error));
    }
    const taken = new Set((takenResult.data ?? []) as string[]);
    setBeds(((allResult.data ?? []) as Bed[]).filter((bed) => !taken.has(bed.id)));
  }

  async function bookBed(bed: Bed) {
    if (!selectedRoom) return;
    if (!window.confirm(`Book bed ${bed.bed_number} in ${selectedRoom.building_name} room ${selectedRoom.room_number}?`)) return;
    setBusy(true);
    setErr("");
    const { data, error } = await supabase.rpc("create_booking", { p_bed_id: bed.id, p_source: "manual" });
    setBusy(false);
    if (error) {
      setSelectedRoom(null);
      setErr(friendly(error));
      return;
    }
    setOk(`Booked! Your reference is ${(data as { booking_reference: string }).booking_reference}.`);
    setSelectedRoom(null);
    setRooms((current) => current.filter((room) => room.room_id !== selectedRoom.room_id));
  }

  return (
    <section>
      <div className="page-hero">
        <div className="page-hero__pattern" /><div className="page-hero__pattern2" />
        <div className="page-hero__text">
          <div className="page-hero__eyebrow">Smart Search</div>
          <h1>AI Assistant</h1>
          <p>Search live availability using natural language. Propose and confirm bed bookings instantly.</p>
        </div>
      </div>

      <div className="chat-wrap">
        <div className="chat-layout">
          <div className="chat-panel">
        {/* Quick prompt chips */}
        {msgs.length === 0 && (
          <div>
            <p className="section-label" style={{ marginBottom: 12 }}>Suggested queries</p>
            <div className="chat-prompts">
              {PROMPTS.map((p) => (
                <button key={p} className="chat-prompt-btn" onClick={() => send(p)}>
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Conversation stream */}
        {(msgs.length > 0 || busy) && (
          <div className="chat-messages" aria-live="polite">
            {msgs.map((m, i) => (
              <div key={i} className={`chat-msg chat-msg--${m.role}`}>
                <div className="chat-msg__avatar">
                  {m.role === "user" ? "You" : "AI"}
                </div>
                <div className="chat-msg__bubble">
                  <FormattedMessage text={m.text} />
                </div>
              </div>
            ))}
            {busy && (
              <div className="chat-msg chat-msg--model">
                <div className="chat-msg__avatar">AI</div>
                <div className="chat-msg__bubble" style={{ color: "var(--muted)" }}>
                  Checking live availability…
                </div>
              </div>
            )}
          </div>
        )}

        {err && <div className="alert alert-error" role="alert">{err}</div>}
        {ok  && <div className="alert alert-success" role="status">{ok}</div>}

            {/* Query input */}
            <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="chat-form">
              <input
                value={input}
                maxLength={500}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask anything, e.g. 'A double room with attached bathroom'…"
                aria-label="Your request"
              />
              <button type="submit" disabled={busy || !input.trim()}>
                Search
              </button>
            </form>
          </div>

          <aside className="chat-results" aria-label="Assistant room recommendations">
        {rooms.length === 0 && !pending && (
          <div className="chat-results__empty">
            <span className="chat-results__icon" aria-hidden="true">⌕</span>
            <h2>Room recommendations</h2>
            <p>Ask the assistant to find rooms and they will appear here.</p>
          </div>
        )}
        {/* Found rooms displayed as package cards */}
        {rooms.length > 0 && (
          <>
            <p className="section-label">Rooms matching your search</p>
            <ul className="grid" style={{ listStyle: "none", padding: 0 }}>
              {rooms.map((r) => (
                <li key={r.room_id} className="room-card" role="button" tabIndex={0} onClick={() => pickRoom(r)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") pickRoom(r); }}>
                  <img className="room-card__image" src="/rooms/room-interior.png" alt={`Room ${r.room_number} interior`} />
                  <div className="room-card__body">
                    <div>
                      <div className="room-card__title">Room {r.room_number}</div>
                      <div className="room-card__building">{r.building_name}</div>
                    </div>
                    <BedMeter available={r.available_beds} total={r.active_beds} />
                    <Facilities items={r.facilities} />
                    <p className="state" style={{ fontSize: ".78rem", margin: 0 }}>
                      Verified {new Date(r.checked_at).toLocaleTimeString()}
                    </p>
                    <button type="button" onClick={(e) => { e.stopPropagation(); pickRoom(r); }} style={{ marginTop: 6, alignSelf: "flex-start" }}>
                      Choose a bed
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}

        {/* Pending proposal card */}
        {pending && (
          <div className="confirm-card">
            <h3>Booking Proposal Ready</h3>
            <p style={{ margin: 0 }}>
              <strong>{pending.building_name}</strong> — Room {pending.room_number} — Bed {pending.bed_number}
            </p>
            <p style={{ fontSize: ".82rem", opacity: .8, margin: 0 }}>
              Proposal reserved until {new Date(pending.expires_at).toLocaleTimeString()}.
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 4 }}>
              <button disabled={busy} onClick={confirmProposal}>Confirm booking</button>
              <button className="btn-ghost" onClick={() => setPending(null)}>Dismiss</button>
            </div>
          </div>
        )}

        {selectedRoom && (
          <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setSelectedRoom(null); }}>
            <div className="modal" role="dialog" aria-label="Choose a bed">
              <div className="modal__header">
                <span className="modal__title">Pick a bed</span>
                <button type="button" className="btn-ghost btn-sm" onClick={() => setSelectedRoom(null)}>Close</button>
              </div>
              <p style={{ fontSize: ".9rem", color: "var(--muted)", margin: 0 }}>
                {selectedRoom.building_name} — Room {selectedRoom.room_number}
              </p>
              <div style={{ height: 1, background: "var(--line)" }} />
              <div className="modal__actions">
                {bedsBusy && <p className="state">Loading free beds…</p>}
                {!bedsBusy && beds.map((bed) => (
                  <button key={bed.id} type="button" disabled={busy} onClick={() => bookBed(bed)} className="btn-outline">
                    Bed {bed.bed_number}
                  </button>
                ))}
                {!bedsBusy && beds.length === 0 && (
                  <p className="state">No beds free. Refresh and choose another room.</p>
                )}
              </div>
            </div>
          </div>
        )}
            </aside>
          </div>
      </div>
    </section>
  );
}