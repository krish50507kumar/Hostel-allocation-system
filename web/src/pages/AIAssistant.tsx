import { useState } from "react";
import { supabase, friendly } from "../lib";
import { BedMeter, Facilities } from "../components";

type Room = {
  room_id: string; building_name: string; room_number: string;
  room_type: string | null; facilities: string[];
  available_beds: number; active_beds?: number;
  checked_at: string; evidence: string[];
};
type Pending = {
  proposal_id: string; building_name: string; room_number: string;
  bed_number: string; expires_at: string;
};
type Msg = { role: "user" | "model"; text: string };

const PROMPTS = [
  "Find an available bed in Building A",
  "Show rooms with an attached bathroom",
  "Compare the available room options",
];

const TYPE_COLORS: Record<string, string> = {
  single:  "linear-gradient(135deg, #1a4f4a 0%, #0d9488 100%)",
  double:  "linear-gradient(135deg, #1e3a5f 0%, #2d7dd2 100%)",
  triple:  "linear-gradient(135deg, #4a1f3a 0%, #9b4c7e 100%)",
  quad:    "linear-gradient(135deg, #3a2a0a 0%, #c07c2a 100%)",
  default: "linear-gradient(135deg, #2a2a2a 0%, #555 100%)",
};

function roomGradient(type: string | null) {
  const t = (type ?? "").toLowerCase();
  return TYPE_COLORS[t] ?? TYPE_COLORS.default;
}

export default function AIAssistant() {
  const [msgs, setMsgs]       = useState<Msg[]>([]);
  const [input, setInput]     = useState("");
  const [busy, setBusy]       = useState(false);
  const [rooms, setRooms]     = useState<Room[]>([]);
  const [pending, setPending] = useState<Pending | null>(null);
  const [err, setErr]         = useState("");
  const [ok, setOk]           = useState("");

  async function send(text: string) {
    if (!text.trim() || busy) return;
    setBusy(true); setErr(""); setOk(""); setPending(null);
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

  async function confirm() {
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
                <div className="chat-msg__bubble">{m.text}</div>
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

        {/* Found rooms displayed as package cards */}
        {rooms.length > 0 && (
          <>
            <p className="section-label">Rooms matching your search</p>
            <ul className="grid" style={{ listStyle: "none", padding: 0 }}>
              {rooms.map((r) => (
                <li key={r.room_id} className="room-card">
                  <div
                    className="room-card__header"
                    style={{ background: roomGradient(r.room_type) }}
                  >
                    <span className="room-card__badge">{r.room_type ?? "Standard"}</span>
                  </div>
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
              <button disabled={busy} onClick={confirm}>Confirm booking</button>
              <button className="btn-ghost" onClick={() => setPending(null)}>Dismiss</button>
            </div>
          </div>
        )}

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
    </section>
  );
}