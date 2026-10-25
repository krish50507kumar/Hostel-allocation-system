import { useEffect, useState } from "react";
import { supabase, friendly } from "../lib";
import { BedMeter, Facilities, SkeletonGrid } from "../components";

type Row = {
  building_id: string; building_name: string; room_id: string; room_number: string;
  room_type: string | null; facilities: string[]; available_beds: number; active_beds: number;
};
type Bed = { id: string; bed_number: string };

// Colour gradient per room type — inspired by the reference's package cards
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

export default function Rooms() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [building, setBuilding] = useState("");
  const [open, setOpen] = useState<Row | null>(null);
  const [beds, setBeds] = useState<Bed[]>([]);
  const [busy, setBusy] = useState(false);

  async function load() {
    setErr("");
    const { data, error } = await supabase.rpc("get_availability");
    if (error) return setErr(friendly(error));
    setRows(data as Row[]);
  }

  useEffect(() => { load(); }, []);

  async function pick(r: Row) {
    setOpen(r); setMsg(""); setErr("");
    const { data: all } = await supabase
      .from("beds").select("id, bed_number").eq("room_id", r.room_id).eq("is_active", true).order("bed_number");
    const { data: taken } = await supabase.rpc("get_taken_bed_ids", { p_room_id: r.room_id });
    const t = new Set((taken ?? []) as string[]);
    setBeds(((all ?? []) as Bed[]).filter((b) => !t.has(b.id)));
  }

  async function book(b: Bed) {
    if (!confirm(`Book bed ${b.bed_number} in ${open!.building_name} room ${open!.room_number}?`)) return;
    setBusy(true); setErr("");
    const { data, error } = await supabase.rpc("create_booking", { p_bed_id: b.id, p_source: "manual" });
    setBusy(false);
    if (error) { setErr(friendly(error)); load(); setOpen(null); return; }
    setMsg(`Booked! Your reference is ${(data as { booking_reference: string }).booking_reference}.`);
    setOpen(null); load();
  }

  if (!rows && !err) return (
    <section>
      <div className="page-hero">
        <div className="page-hero__pattern" />
        <div className="page-hero__pattern2" />
        <div className="page-hero__text">
          <div className="page-hero__eyebrow">Hostel</div>
          <h1>Available Rooms</h1>
          <p>Browse and book beds from available rooms across all buildings.</p>
        </div>
      </div>
      <SkeletonGrid />
    </section>
  );

  const buildings = [...new Set((rows ?? []).map((r) => r.building_name))];
  const shown = (rows ?? []).filter((r) => !building || r.building_name === building);

  return (
    <section>
      {/* Page hero — inspired by reference hero section */}
      <div className="page-hero">
        <div className="page-hero__pattern" />
        <div className="page-hero__pattern2" />
        <div className="page-hero__text">
          <div className="page-hero__eyebrow">Hostel</div>
          <h1>Available Rooms</h1>
          <p>Browse and book beds from available rooms across all buildings.</p>
        </div>
      </div>

      {msg && <div className="alert alert-success" role="status" style={{ marginBottom: 16 }}>{msg}</div>}
      {err && <div className="alert alert-error" role="alert" style={{ marginBottom: 16 }}>{err}</div>}

      {/* Filter bar */}
      <div className="filter-bar">
        <label style={{ maxWidth: 280 }}>
          Filter by building
          <select value={building} onChange={(e) => setBuilding(e.target.value)}>
            <option value="">All buildings</option>
            {buildings.map((b) => <option key={b}>{b}</option>)}
          </select>
        </label>
        {building && (
          <button className="btn-ghost btn-sm" onClick={() => setBuilding("")}>Clear</button>
        )}
        <span style={{ marginLeft: "auto", fontSize: ".85rem", color: "var(--muted)", alignSelf: "flex-end", paddingBottom: 2 }}>
          {shown.length} room{shown.length !== 1 ? "s" : ""} available
        </span>
      </div>

      {shown.length === 0 && !err && (
        <p className="state">No rooms are available right now.</p>
      )}

      {/* Package-style room cards — inspired by "Our Packages" section */}
      <ul className="grid" style={{ listStyle: "none", padding: 0 }}>
        {shown.map((r) => (
          <li key={r.room_id} className="room-card">
            {/* Coloured image-top area — one colour per room type */}
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
              <button onClick={() => pick(r)} style={{ marginTop: 6, alignSelf: "flex-start" }}>
                Choose a bed
              </button>
            </div>
          </li>
        ))}
      </ul>

      {/* Bed picker modal */}
      {open && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setOpen(null); }}>
          <div className="modal" role="dialog" aria-label="Choose a bed">
            <div className="modal__header">
              <span className="modal__title">Pick a bed</span>
              <button className="btn-ghost btn-sm" onClick={() => setOpen(null)}>Close</button>
            </div>
            <p style={{ fontSize: ".9rem", color: "var(--muted)", margin: 0 }}>
              {open.building_name} — Room {open.room_number}
            </p>
            <div style={{ height: 1, background: "var(--line)" }} />
            <div className="modal__actions">
              {beds.map((b) => (
                <button key={b.id} disabled={busy} onClick={() => book(b)} className="btn-outline">
                  Bed {b.bed_number}
                </button>
              ))}
              {beds.length === 0 && (
                <p style={{ fontSize: ".9rem", color: "var(--muted)" }}>
                  No beds free. Refresh and choose another room.
                </p>
              )}
            </div>
            <button className="btn-ghost btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => setOpen(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}