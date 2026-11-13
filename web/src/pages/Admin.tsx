import { useEffect, useState } from "react";
import { supabase, friendly } from "../lib";

type Bld = { id: string; name: string; description: string | null; latitude: number | null; longitude: number | null };
type Room = {
  id: string; building_id: string; room_number: string; room_type: string | null;
  capacity: number; facilities: string[];
};
type PlaceType = "class_building" | "hostel_building" | "library" | "mess";
type Place = { id: string; name: string; description: string | null; place_type: PlaceType; latitude: number | null; longitude: number | null };
type PlaceDraft = { id: string | null; name: string; description: string; type: PlaceType; latitude: string; longitude: string };
type Stats = { buildings: number; rooms: number; beds: number; occupied: number };

const STAT_LABELS: Record<string, string> = {
  buildings: "Buildings",
  rooms:     "Rooms",
  beds:      "Total beds",
  occupied:  "Occupied",
};

const FACILITIES = ["study_desk", "attached_bathroom", "wifi", "air_conditioning","Bed","Mess","Elevator"];
const ROOM_TYPES = [
  { value: "single", label: "One seater" },
  { value: "double", label: "Two seater" },
  { value: "triple", label: "Three seater" },
  { value: "quad", label: "Four seater" },
  { value: "apartment", label: "Apartment" },
];
const PLACE_TYPES: { value: PlaceType; label: string }[] = [
  { value: "class_building", label: "Class building" },
  { value: "hostel_building", label: "Hostel building" },
  { value: "library", label: "Library" },
  { value: "mess", label: "Mess" },
];

export default function Admin() {
  const [blds, setBlds]   = useState<Bld[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [places, setPlaces] = useState<Place[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [err, setErr]     = useState("");
  const [msg, setMsg]     = useState("");
  const [bName, setBName] = useState("");
  const [desc, setDesc]   = useState("");
  const [bLat, setBLat] = useState("");
  const [bLng, setBLng] = useState("");
  const [place, setPlace] = useState({ name: "", description: "", type: "class_building" as PlaceType, latitude: "", longitude: "" });
  const [facs, setFacs]   = useState<string[]>([]);
  const [r, setR] = useState({ building_id: "", room_number: "", room_type: "double", capacity: 2 });
  const [editingBuilding, setEditingBuilding] = useState<string | null>(null);
  const [buildingDraft, setBuildingDraft] = useState({ name: "", description: "", latitude: "", longitude: "" });
  const [editingRoom, setEditingRoom] = useState<string | null>(null);
  const [roomDraft, setRoomDraft] = useState<Room | null>(null);
  const [editingPlace, setEditingPlace] = useState<string | null>(null);
  const [placeDraft, setPlaceDraft] = useState<PlaceDraft | null>(null);

  const toggle = (k: string) => setFacs((f) => f.includes(k) ? f.filter((x) => x !== k) : [...f, k]);

  async function load() {
    const [b, roomRows, roomCount, bedCount, occupied, campusPlaces] = await Promise.all([
      supabase.from("buildings").select("id, name, description, latitude, longitude").order("name"),
      supabase.from("rooms").select("id, building_id, room_number, room_type, capacity, facilities").eq("is_active", true).order("room_number"),
      supabase.from("rooms").select("id", { count: "exact", head: true }).eq("is_active", true),
      supabase.from("beds").select("id", { count: "exact", head: true }).eq("is_active", true),
      supabase.from("bookings").select("id", { count: "exact", head: true }).eq("status", "active"),
      supabase.from("campus_places").select("id, name, description, place_type, latitude, longitude").eq("is_active", true).order("name"),
    ]);
    setBlds((b.data ?? []) as Bld[]);
    setRooms((roomRows.data ?? []) as Room[]);
    setPlaces((campusPlaces.data ?? []) as Place[]);
    setStats({ buildings: b.data?.length ?? 0, rooms: roomCount.count ?? 0, beds: bedCount.count ?? 0, occupied: occupied.count ?? 0 });
  }

  useEffect(() => { load(); }, []);

  async function addBuilding(e: React.FormEvent) {
    e.preventDefault();
    if (!desc.trim()) return setErr("Building description is required.");
    const { error } = await supabase.rpc("admin_create_building_with_location", {
      p_name: bName.trim(),
      p_description: desc.trim(),
      p_latitude: bLat ? Number(bLat) : null,
      p_longitude: bLng ? Number(bLng) : null,
    });
    if (error) return setErr(friendly(error));
    setErr(""); setMsg("Building created."); setBName(""); setDesc(""); setBLat(""); setBLng(""); load();
  }

  async function addRoom(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.rpc("admin_upsert_room", {
      p_room_id: null, p_building_id: r.building_id, p_room_number: r.room_number,
      p_room_type: r.room_type, p_capacity: r.capacity, p_facilities: facs,
    });
    if (error) return setErr(friendly(error));
    setErr(""); setMsg("Room and beds created."); setFacs([]); setR({ ...r, room_number: "" }); load();
  }

  function startBuildingEdit(b: Bld) {
    setEditingBuilding(b.id);
    setBuildingDraft({ name: b.name, description: b.description ?? "", latitude: b.latitude?.toString() ?? "", longitude: b.longitude?.toString() ?? "" });
    setEditingRoom(null);
  }

  async function saveBuilding(id: string) {
    if (!buildingDraft.name.trim() || !buildingDraft.description.trim()) {
      return setErr("Building name and description are required.");
    }
    const { error } = await supabase.rpc("admin_update_building", {
      p_id: id, p_name: buildingDraft.name.trim(), p_description: buildingDraft.description.trim(),
      p_latitude: buildingDraft.latitude ? Number(buildingDraft.latitude) : null,
      p_longitude: buildingDraft.longitude ? Number(buildingDraft.longitude) : null,
    });
    if (error) return setErr(friendly(error));
    setErr(""); setMsg("Building updated."); setEditingBuilding(null); load();
  }

  function startRoomEdit(room: Room) {
    setEditingRoom(room.id);
    setRoomDraft({ ...room, facilities: [...(room.facilities ?? [])] });
    setEditingBuilding(null);
  }

  async function saveRoom() {
    if (!roomDraft) return;
    const { error } = await supabase.rpc("admin_upsert_room", {
      p_room_id: roomDraft.id, p_building_id: roomDraft.building_id,
      p_room_number: roomDraft.room_number, p_room_type: roomDraft.room_type ?? "",
      p_capacity: roomDraft.capacity, p_facilities: roomDraft.facilities,
    });
    if (error) return setErr(friendly(error));
    setErr(""); setMsg("Room updated."); setEditingRoom(null); setRoomDraft(null); load();
  }

  function startPlaceEdit(item: Place) {
    setEditingPlace(item.id);
    setPlaceDraft({
      id: item.id, name: item.name, description: item.description ?? "", type: item.place_type,
      latitude: item.latitude?.toString() ?? "", longitude: item.longitude?.toString() ?? "",
    });
  }

  async function savePlace(item: { id: string | null; name: string; description: string; type: PlaceType; latitude: string; longitude: string }) {
    const { error } = await supabase.rpc("admin_upsert_campus_place", {
      p_place_id: item.id,
      p_name: item.name.trim(),
      p_description: item.description.trim(),
      p_place_type: item.type,
      p_latitude: item.latitude ? Number(item.latitude) : null,
      p_longitude: item.longitude ? Number(item.longitude) : null,
    });
    if (error) return setErr(friendly(error));
    setErr(""); setMsg(item.id ? "Campus place updated." : "Campus place created.");
    setEditingPlace(null); setPlaceDraft(null);
    if (!item.id) setPlace({ name: "", description: "", type: "class_building", latitude: "", longitude: "" });
    load();
  }

  const occupancyPct = stats?.beds ? Math.min(100, Math.round((stats.occupied / stats.beds) * 100)) : 0;

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
        <p className="section-label">Create inventory</p>
        <div className="admin-create-grid">
          <form className="card-pad form-card" onSubmit={addBuilding}>
            <h2>New building</h2>
            <div className="form-group">
              <label>Building name<input required value={bName} onChange={(e) => setBName(e.target.value)} placeholder="e.g. Block A" /></label>
              <label>Building description
                <textarea required value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Describe the location and facilities" rows={3} />
              </label>
              <div className="input-row">
                <label>Latitude<input type="number" step="any" min="-90" max="90" value={bLat} onChange={(e) => setBLat(e.target.value)} placeholder="e.g. 31.2536" /></label>
                <label>Longitude<input type="number" step="any" min="-180" max="180" value={bLng} onChange={(e) => setBLng(e.target.value)} placeholder="e.g. 75.7050" /></label>
              </div>
              <button type="submit" style={{ alignSelf: "flex-start" }}>Create building</button>
            </div>
          </form>

          <form className="card-pad form-card" onSubmit={addRoom}>
            <h2>New room</h2>
            <div className="form-group">
              <label>Building<select required value={r.building_id} onChange={(e) => setR({ ...r, building_id: e.target.value })}>
                <option value="">Select a building…</option>
                {blds.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select></label>
              <div className="input-row">
                <label>Room number<input required value={r.room_number} onChange={(e) => setR({ ...r, room_number: e.target.value })} placeholder="e.g. 101" /></label>
                <label>Type<select value={r.room_type} onChange={(e) => setR({ ...r, room_type: e.target.value })}>
                  {ROOM_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                </select></label>
              </div>
              <label>Capacity (beds)<input type="number" min={1} value={r.capacity} onChange={(e) => setR({ ...r, capacity: +e.target.value })} /></label>
              <fieldset><legend>Facilities</legend>
                {FACILITIES.map((k) => <label key={k} style={{ flexDirection: "row", gap: 8, fontWeight: 400 }}>
                  <input type="checkbox" checked={facs.includes(k)} onChange={() => toggle(k)} style={{ width: "auto" }} />{k.replace(/_/g, " ")}
                </label>)}
              </fieldset>
              <button type="submit" style={{ alignSelf: "flex-start" }}>Create room</button>
            </div>
          </form>
        </div>
      </div>

      <div className="admin-section">
        <p className="section-label">Campus places</p>
        <div className="admin-create-grid">
          <form className="card-pad form-card" onSubmit={(e) => { e.preventDefault(); savePlace({ id: null, ...place }); }}>
            <h2>Add class building, library or mess</h2>
            <div className="form-group">
              <label>Name<input required value={place.name} onChange={(e) => setPlace({ ...place, name: e.target.value })} placeholder="e.g. Central Library" /></label>
              <label>Place type<select value={place.type} onChange={(e) => setPlace({ ...place, type: e.target.value as PlaceType })}>
                {PLACE_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
              </select></label>
              <label>Description<textarea value={place.description} onChange={(e) => setPlace({ ...place, description: e.target.value })} rows={2} placeholder="Details" /></label>
              <div className="input-row">
                <label>Latitude<input type="number" step="any" min="-90" max="90" value={place.latitude} onChange={(e) => setPlace({ ...place, latitude: e.target.value })} /></label>
                <label>Longitude<input type="number" step="any" min="-180" max="180" value={place.longitude} onChange={(e) => setPlace({ ...place, longitude: e.target.value })} /></label>
              </div>
              <button type="submit" style={{ alignSelf: "flex-start" }}>Add campus place</button>
            </div>
          </form>

          <div className="card-pad admin-place-list">
            <h2>Manage campus places</h2>
            {places.length === 0 && <p className="state">No campus places added yet.</p>}
            {places.map((item) => editingPlace === item.id && placeDraft ? (
              <div className="admin-place-edit" key={item.id}>
                <label>Name<input value={placeDraft.name} onChange={(e) => setPlaceDraft({ ...placeDraft, name: e.target.value })} /></label>
                <label>Type<select value={placeDraft.type} onChange={(e) => setPlaceDraft({ ...placeDraft, type: e.target.value as PlaceType })}>{PLACE_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select></label>
                <label>Description<textarea value={placeDraft.description} onChange={(e) => setPlaceDraft({ ...placeDraft, description: e.target.value })} rows={2} /></label>
                <div className="input-row">
                  <label>Latitude<input type="number" step="any" min="-90" max="90" value={placeDraft.latitude} onChange={(e) => setPlaceDraft({ ...placeDraft, latitude: e.target.value })} /></label>
                  <label>Longitude<input type="number" step="any" min="-180" max="180" value={placeDraft.longitude} onChange={(e) => setPlaceDraft({ ...placeDraft, longitude: e.target.value })} /></label>
                </div>
                <div className="admin-edit-actions"><button type="button" onClick={() => savePlace(placeDraft)}>Save place</button><button type="button" className="btn-ghost" onClick={() => setEditingPlace(null)}>Cancel</button></div>
              </div>
            ) : (
              <div className="admin-place-row" key={item.id}>
                <div><strong>{item.name}</strong><span>{PLACE_TYPES.find((type) => type.value === item.place_type)?.label ?? item.place_type}</span></div>
                <span>{item.latitude ?? "—"}, {item.longitude ?? "—"}</span>
                <button className="btn-outline btn-sm" type="button" onClick={() => startPlaceEdit(item)}>Edit</button>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="admin-section">
        <div className="section-heading">
          <div><p className="section-label">Master inventory control</p><p className="section-heading__hint">Edit any building or active room directly from this dashboard.</p></div>
          <span className="section-heading__count">{blds.length} building{blds.length !== 1 ? "s" : ""}</span>
        </div>
        <div className="admin-inventory">
          {blds.map((b) => (
            <div className="admin-inventory__building" key={b.id}>
              {editingBuilding === b.id ? (
                <div className="admin-edit-form">
                  <label>Building name<input value={buildingDraft.name} onChange={(e) => setBuildingDraft({ ...buildingDraft, name: e.target.value })} /></label>
                  <label>Description<textarea required value={buildingDraft.description} onChange={(e) => setBuildingDraft({ ...buildingDraft, description: e.target.value })} rows={3} /></label>
                  <div className="input-row">
                    <label>Latitude<input type="number" step="any" min="-90" max="90" value={buildingDraft.latitude} onChange={(e) => setBuildingDraft({ ...buildingDraft, latitude: e.target.value })} /></label>
                    <label>Longitude<input type="number" step="any" min="-180" max="180" value={buildingDraft.longitude} onChange={(e) => setBuildingDraft({ ...buildingDraft, longitude: e.target.value })} /></label>
                  </div>
                  <div className="admin-edit-actions"><button type="button" onClick={() => saveBuilding(b.id)}>Save building</button><button type="button" className="btn-ghost" onClick={() => setEditingBuilding(null)}>Cancel</button></div>
                </div>
              ) : (
                <div className="admin-inventory__building-header">
                  <div><h2>{b.name}</h2><p>{b.description || "No description provided."}</p></div>
                  <button className="btn-outline btn-sm" onClick={() => startBuildingEdit(b)}>Edit building</button>
                </div>
              )}
              <div className="admin-room-list">
                {rooms.filter((room) => room.building_id === b.id).map((room) => editingRoom === room.id && roomDraft ? (
                  <div className="admin-room-row admin-room-row--edit" key={room.id}>
                    <label>Room<input value={roomDraft.room_number} onChange={(e) => setRoomDraft({ ...roomDraft, room_number: e.target.value })} /></label>
                    <label>Type<select value={roomDraft.room_type ?? "double"} onChange={(e) => setRoomDraft({ ...roomDraft!, room_type: e.target.value })}>
                      {ROOM_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                    </select></label>
                    <label>Beds<input type="number" min={1} value={roomDraft.capacity} onChange={(e) => setRoomDraft({ ...roomDraft!, capacity: +e.target.value })} /></label>
                    <label>Building<select value={roomDraft.building_id} onChange={(e) => setRoomDraft({ ...roomDraft!, building_id: e.target.value })}>{blds.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                    <fieldset className="admin-room-edit-facilities"><legend>Facilities</legend>
                      {FACILITIES.map((facility) => <label key={facility} style={{ flexDirection: "row", gap: 8, fontWeight: 400 }}>
                        <input type="checkbox" checked={roomDraft.facilities.includes(facility)} onChange={() => setRoomDraft({
                          ...roomDraft!, facilities: roomDraft!.facilities.includes(facility)
                            ? roomDraft!.facilities.filter((item) => item !== facility)
                            : [...roomDraft!.facilities, facility],
                        })} style={{ width: "auto" }} />
                        {facility.replace(/_/g, " ")}
                      </label>)}
                    </fieldset>
                    <div className="admin-edit-actions"><button type="button" onClick={saveRoom}>Save</button><button type="button" className="btn-ghost" onClick={() => setEditingRoom(null)}>Cancel</button></div>
                  </div>
                ) : (
                  <div className="admin-room-row" key={room.id}>
                    <div><strong>Room {room.room_number}</strong><span>{room.room_type || "Standard"} · {room.capacity} beds</span></div>
                    <span className="admin-room-row__facilities">{room.facilities?.join(", ") || "No facilities listed"}</span>
                    <button className="btn-outline btn-sm" onClick={() => startRoomEdit(room)}>Edit room</button>
                  </div>
                ))}
                {!rooms.some((room) => room.building_id === b.id) && <p className="state">No active rooms in this building.</p>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
