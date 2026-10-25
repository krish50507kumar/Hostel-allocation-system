import { useEffect, useState } from "react";
import { supabase, friendly } from "../lib";

type Bld = { id: string; name: string };
type Stats = { buildings: number; rooms: number; beds: number; occupied: number };

const STAT_LABELS: Record<string, string> = {
  buildings: "Buildings",
  rooms:     "Rooms",
  beds:      "Total beds",
  occupied:  "Occupied",
};

export default function Admin() {
  const [blds, setBlds]   = useState<Bld[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [err, setErr]     = useState("");
  const [msg, setMsg]     = useState("");
  const [bName, setBName] = useState("");
  const [r, setR] = useState({ building_id: "", room_number: "", room_type: "double", capacity: 2 });

  async function load() {
    const [b, rooms, beds, occ] = await Promise.all([
      supabase.from("buildings").select("id, name").order("name"),
      supabase.from("rooms").select("id", { count: "exact", head: true }).eq("is_active", true),
      supabase.from("beds").select("id", { count: "exact", head: true }).eq("is_active", true),
      supabase.from("bookings").select("id", { count: "exact", head: true }).eq("status", "active"),
    ]);
    setBlds((b.data ?? []) as Bld[]);
    setStats({ buildings: b.data?.length ?? 0, rooms: rooms.count ?? 0, beds: beds.count ?? 0, occupied: occ.count ?? 0 });
  }

  useEffect(() => { load(); }, []);

  async function addBuilding(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.rpc("admin_create_building", { p_name: bName.trim(), p_description: null });
    if (error) return setErr(friendly(error));
    setErr(""); setMsg("Building created."); setBName(""); load();
  }

  async function addRoom(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.rpc("admin_upsert_room", {
      p_room_id: null, p_building_id: r.building_id, p_room_number: r.room_number,
      p_room_type: r.room_type, p_capacity: r.capacity, p_facilities: [],
    });
    if (error) return setErr(friendly(error));
    setErr(""); setMsg("Room and beds created."); load();
  }

  const occupancyPct = stats?.beds ? Math.round((stats.occupied / stats.beds) * 100) : 0;

  return (
    <section>
      <div className="page-hero">
        <div className="page-hero__pattern" /><div className="page-hero__pattern2" />
        <div className="page-hero__text">
          <div className="page-hero__eyebrow">Admin</div>
          <h1>Dashboard</h1>
          <p>Manage buildings, rooms, and monitor occupancy across the hostel.</p>
        </div>
      </div>

      {msg && <div className="alert alert-success" role="status" style={{ marginBottom: 20 }}>{msg}</div>}
      {err && <div className="alert alert-error" role="alert" style={{ marginBottom: 20 }}>{err}</div>}

      {stats && (
        <>
          <p className="section-label">Overview</p>
          <div className="stat-grid">
            {(Object.entries(stats) as [keyof Stats, number][]).map(([k, v]) => (
              <div key={k} className="stat-card">
                <div className="stat-card__value">{v}</div>
                <div className="stat-card__label">{STAT_LABELS[k] ?? k}</div>
              </div>
            ))}
            <div className="stat-card">
              <div className="stat-card__value">{occupancyPct}%</div>
              <div className="stat-card__label">Occupancy rate</div>
            </div>
          </div>

          {/* Occupancy bar — like a "progress" visual from the reference */}
          <div className="card-pad" style={{ marginBottom: 28 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10, fontSize: ".88rem", fontWeight: 600 }}>
              <span>Bed occupancy</span>
              <span style={{ color: "var(--accent)", fontVariantNumeric: "tabular-nums" }}>
                {stats.occupied} / {stats.beds} beds
              </span>
            </div>
            <div style={{ height: 10, background: "var(--line)", borderRadius: 9999, overflow: "hidden" }}>
              <div style={{
                height: "100%", width: `${occupancyPct}%`,
                background: "var(--accent)", borderRadius: 9999, transition: "width .5s ease",
              }} />
            </div>
            <p style={{ fontSize: ".8rem", color: "var(--muted)", marginTop: 6 }}>
              {occupancyPct}% of all active beds are currently occupied.
            </p>
          </div>
        </>
      )}

      <div className="admin-section">
        <p className="section-label">Add building</p>
        <form className="card-pad form-card" onSubmit={addBuilding}>
          <div className="form-group">
            <label>Building name<input required value={bName} onChange={(e) => setBName(e.target.value)} placeholder="e.g. Block A" /></label>
            <button type="submit" style={{ alignSelf: "flex-start" }}>Create building</button>
          </div>
        </form>
      </div>

      <div className="admin-section">
        <p className="section-label">Add room</p>
        <form className="card-pad form-card" onSubmit={addRoom}>
          <div className="form-group">
            <label>
              Building
              <select required value={r.building_id} onChange={(e) => setR({ ...r, building_id: e.target.value })}>
                <option value="">Select a building…</option>
                {blds.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </label>
            <div className="input-row">
              <label>Room number<input required value={r.room_number} onChange={(e) => setR({ ...r, room_number: e.target.value })} placeholder="e.g. 101" /></label>
              <label>Type<input value={r.room_type} onChange={(e) => setR({ ...r, room_type: e.target.value })} placeholder="e.g. double" /></label>
            </div>
            <label>Capacity (beds)<input type="number" min={1} value={r.capacity} onChange={(e) => setR({ ...r, capacity: +e.target.value })} /></label>
            <button type="submit" style={{ alignSelf: "flex-start" }}>Create room</button>
          </div>
        </form>
      </div>
    </section>
  );
}