import { useEffect, useState } from "react";
import { supabase, friendly } from "../lib";
import { BedMeter, Facilities, SkeletonGrid } from "../components";

type Row = {
  building_id: string; building_name: string; room_id: string; room_number: string;
  room_type: string | null; facilities: string[]; available_beds: number; active_beds: number;
};
type Bed = { id: string; bed_number: string };
const BUILDING_IMAGE = "/buildings/building-1.png";

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

  const buildings = [...new Set((rows ?? []).map((r) => r.building_name))].map((name) => {
    const rooms = (rows ?? []).filter((r) => r.building_name === name);
    return {
      name,
      roomCount: rooms.length,
      availableBeds: rooms.reduce((total, room) => total + room.available_beds, 0),
    };
  });
  const shown = (rows ?? []).filter((r) => r.building_name === building);

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

      {!building ? (
        <>
          <div className="section-heading">
            <div>
              <p className="section-label">Choose a building</p>
              <p className="section-heading__hint">Select a building to browse its available rooms.</p>
            </div>
            <span className="section-heading__count">{buildings.length} building{buildings.length !== 1 ? "s" : ""}</span>
          </div>
          <ul className="building-grid" style={{ listStyle: "none", padding: 0 }}>
            {buildings.map((b, index) => (
              <li key={b.name}>
                <button className="building-card" onClick={() => setBuilding(b.name)}>
                <img className="building-card__image" src={BUILDING_IMAGE} alt={`${b.name} building`} />
                  <span className="building-card__body">
                    <span className="building-card__eyebrow">Building {String.fromCharCode(65 + index)}</span>
                    <span className="building-card__name">{b.name}</span>
                    <span className="building-card__meta">
                      {b.roomCount} room{b.roomCount !== 1 ? "s" : ""} · {b.availableBeds} bed{b.availableBeds !== 1 ? "s" : ""} available
                    </span>
                    <span className="building-card__action">View rooms <span aria-hidden="true">→</span></span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <div className="section-heading">
            <div>
              <p className="section-label">{building}</p>
              <p className="section-heading__hint">Available rooms in this building.</p>
            </div>
            <button className="btn-ghost btn-sm" onClick={() => setBuilding("")}>All buildings</button>
          </div>
          {shown.length === 0 && !err && (
            <p className="state">No rooms are available right now.</p>
          )}
          <ul className="grid" style={{ listStyle: "none", padding: 0 }}>
            {shown.map((r) => (
              <li key={r.room_id} className="room-card">
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
        </>
      )}

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