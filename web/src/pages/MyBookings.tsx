import { useEffect, useState } from "react";
import { supabase, friendly } from "../lib";
import { SkeletonGrid } from "../components";

type B = {
  id: string; booking_reference: string; status: "active" | "cancelled";
  booked_at: string;
  beds: { bed_number: string; rooms: { room_number: string; buildings: { name: string } } };
};
type S = { college_start_date: string; cancellation_days_before_start: number; timezone: string };

export default function MyBookings() {
  const [rows, setRows] = useState<B[] | null>(null);
  const [s, setS] = useState<S | null>(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  async function load() {
    const [b, st] = await Promise.all([
      supabase
        .from("bookings")
        .select("id, booking_reference, status, booked_at, beds(bed_number, rooms(room_number, buildings(name)))")
        .order("booked_at", { ascending: false }),
      supabase.from("app_settings").select("*").single(),
    ]);
    if (b.error) return setErr(friendly(b.error));
    setRows(b.data as unknown as B[]);
    setS(st.data as S);
  }

  useEffect(() => { load(); }, []);

  const cutoff = s
    ? new Date(new Date(s.college_start_date).getTime() - s.cancellation_days_before_start * 86400000)
        .toISOString().slice(0, 10)
    : "";

  async function cancel(id: string) {
    if (!confirm("Cancel this booking? Your bed will be released.")) return;
    const { error } = await supabase.rpc("cancel_booking", { p_booking_id: id, p_reason: "Cancelled by student" });
    if (error) return setErr(friendly(error));
    setErr(""); setMsg("Booking cancelled."); load();
  }

  if (!rows && !err) return (
    <section>
      <div className="page-hero">
        <div className="page-hero__pattern" /><div className="page-hero__pattern2" />
        <div className="page-hero__text">
          <div className="page-hero__eyebrow">Student</div>
          <h1>My Bookings</h1>
          <p>View and manage your hostel reservations.</p>
        </div>
      </div>
      <SkeletonGrid count={2} />
    </section>
  );

  const active = (rows ?? []).filter((b) => b.status === "active");
  const past   = (rows ?? []).filter((b) => b.status !== "active");

  return (
    <section>
      <div className="page-hero">
        <div className="page-hero__pattern" /><div className="page-hero__pattern2" />
        <div className="page-hero__text">
          <div className="page-hero__eyebrow">Student</div>
          <h1>My Bookings</h1>
          <p>View and manage your hostel reservations.</p>
        </div>
      </div>

      {s && cutoff && (
        <div className="alert alert-info" style={{ marginBottom: 20 }}>
          Cancellation is allowed until <strong>{cutoff}</strong> ({s.timezone}). After that date, cancellations are blocked.
        </div>
      )}
      {msg && <div className="alert alert-success" role="status" style={{ marginBottom: 16 }}>{msg}</div>}
      {err && <div className="alert alert-error" role="alert" style={{ marginBottom: 16 }}>{err}</div>}

      {rows?.length === 0 && (
        <p className="state">You have no bookings yet.</p>
      )}

      {active.length > 0 && (
        <>
          <p className="section-label">Active bookings</p>
          <ul className="grid" style={{ marginBottom: 28, listStyle: "none", padding: 0 }}>
            {active.map((b) => (
              <li key={b.id} className="booking-card">
                <div className="booking-card__accent" />
                <div className="booking-card__body">
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ fontFamily: "monospace", fontSize: ".9rem", fontWeight: 700, color: "var(--fg)" }}>
                      {b.booking_reference}
                    </span>
                    <span className="badge active">Active</span>
                  </div>
                  <p style={{ fontSize: ".88rem", fontWeight: 600, color: "var(--fg-2)", margin: 0 }}>
                    {b.beds.rooms.buildings.name} — Room {b.beds.rooms.room_number} — Bed {b.beds.bed_number}
                  </p>
                  <p style={{ fontSize: ".8rem", color: "var(--muted)", margin: 0 }}>
                    Booked {new Date(b.booked_at).toLocaleString()}
                  </p>
                  <button className="btn-danger btn-sm" style={{ alignSelf: "flex-start", marginTop: 4 }} onClick={() => cancel(b.id)}>
                    Cancel booking
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {past.length > 0 && (
        <>
          <p className="section-label">Past bookings</p>
          <ul className="grid" style={{ listStyle: "none", padding: 0 }}>
            {past.map((b) => (
              <li key={b.id} className="booking-card" style={{ opacity: .65 }}>
                <div className="booking-card__accent cancelled" />
                <div className="booking-card__body">
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ fontFamily: "monospace", fontSize: ".9rem", fontWeight: 700, color: "var(--fg)" }}>
                      {b.booking_reference}
                    </span>
                    <span className="badge cancelled">Cancelled</span>
                  </div>
                  <p style={{ fontSize: ".88rem", fontWeight: 600, color: "var(--fg-2)", margin: 0 }}>
                    {b.beds.rooms.buildings.name} — Room {b.beds.rooms.room_number} — Bed {b.beds.bed_number}
                  </p>
                  <p style={{ fontSize: ".8rem", color: "var(--muted)", margin: 0 }}>
                    Booked {new Date(b.booked_at).toLocaleString()}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}