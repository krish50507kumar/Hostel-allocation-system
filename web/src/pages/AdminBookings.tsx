import { useEffect, useState } from "react";
import { supabase, friendly } from "../lib";
import { SkeletonGrid } from "../components";

type Row = {
  booking_reference: string; status: string; booked_at: string;
  student_name: string; student_number: string | null; phone: string | null;
  building_name: string; room_number: string; bed_number: string; total_count: number;
};
const SIZE = 25;

export default function AdminBookings() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    let live = true;
    setRows(null);
    const t = setTimeout(async () => {
      const { data, error } = await supabase.rpc("admin_list_bookings", {
        p_status: status || null, p_search: q, p_page: page, p_page_size: SIZE,
      });
      if (!live) return;
      if (error) return setErr(friendly(error));
      setErr(""); setRows(data as Row[]);
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [q, status, page]);

  const total = rows?.[0]?.total_count ?? 0;
  const pages = Math.max(1, Math.ceil(total / SIZE));

  return (
    <section>
      <div className="page-hero">
        <div className="page-hero__pattern" /><div className="page-hero__pattern2" />
        <div className="page-hero__text">
          <div className="page-hero__eyebrow">Admin</div>
          <h1>All Bookings</h1>
          <p>Search, filter, and inspect reservations across all buildings and rooms.</p>
        </div>
      </div>

      <div className="filter-bar">
        <label style={{ flex: 2, minWidth: 220 }}>
          Search
          <input
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1); }}
            placeholder="Reference, name, student no., room…"
          />
        </label>
        <label style={{ minWidth: 160 }}>
          Status
          <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>
      </div>

      {err && (
        <div className="alert alert-error" role="alert" style={{ marginBottom: 16 }}>
          {err}
        </div>
      )}

      {!rows && !err && <SkeletonGrid count={3} />}

      {rows?.length === 0 && (
        <p className="state">No bookings match your search.</p>
      )}

      {!!rows?.length && (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Student</th>
                  <th>Student no.</th>
                  <th>Contact</th>
                  <th>Room</th>
                  <th>Bed</th>
                  <th>Status</th>
                  <th>Booked</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.booking_reference}>
                    <td>
                      <span style={{ fontFamily: "monospace", fontSize: ".85rem", fontWeight: 700, color: "var(--fg)" }}>
                        {r.booking_reference}
                      </span>
                    </td>
                    <td style={{ fontWeight: 600 }}>{r.student_name}</td>
                    <td>{r.student_number ?? <span style={{ color: "var(--muted)" }}>—</span>}</td>
                    <td>{r.phone ?? <span style={{ color: "var(--muted)" }}>—</span>}</td>
                    <td>{r.building_name} · {r.room_number}</td>
                    <td>Bed {r.bed_number}</td>
                    <td>
                      <span className={`badge ${r.status}`}>
                        {r.status === "active" ? "Active" : "Cancelled"}
                      </span>
                    </td>
                    <td style={{ color: "var(--muted)", fontSize: ".82rem" }}>
                      {new Date(r.booked_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="pagination">
            <button
              className="btn-outline btn-sm"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </button>
            <span style={{ flex: 1, fontSize: ".88rem", color: "var(--muted)" }}>
              Page <strong>{page}</strong> of <strong>{pages}</strong> &nbsp;·&nbsp; {total} booking{total !== 1 ? "s" : ""}
            </span>
            <button
              className="btn-outline btn-sm"
              disabled={page >= pages}
              onClick={() => setPage(page + 1)}
            >
              Next
            </button>
          </div>
        </>
      )}
    </section>
  );
}