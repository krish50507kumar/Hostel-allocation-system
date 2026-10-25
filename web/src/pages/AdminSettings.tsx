import { useEffect, useState } from "react";
import { supabase, friendly } from "../lib";

export default function AdminSettings() {
  const [f, setF] = useState<{ start: string; days: number; tz: string } | null>(null);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  useEffect(() => {
    supabase.from("app_settings").select("*").single().then(({ data, error }) => {
      if (error) return setErr(friendly(error));
      setF({ start: data!.college_start_date, days: data!.cancellation_days_before_start, tz: data!.timezone });
    });
  }, []);

  if (!f) return err
    ? <div className="alert alert-error" role="alert">{err}</div>
    : <p className="state" role="status">Loading…</p>;

  const cutoff = f.start
    ? new Date(new Date(f.start).getTime() - f.days * 86400000).toISOString().slice(0, 10)
    : "—";

  async function save(e: React.FormEvent) {
    e.preventDefault(); setErr(""); setOk("");
    const { error } = await supabase.rpc("admin_update_settings", { p_start: f!.start, p_days: f!.days, p_tz: f!.tz });
    if (error) return setErr(friendly(error));
    setOk("Settings saved successfully.");
  }

  return (
    <section>
      <div className="page-hero">
        <div className="page-hero__pattern" /><div className="page-hero__pattern2" />
        <div className="page-hero__text">
          <div className="page-hero__eyebrow">Admin</div>
          <h1>Settings</h1>
          <p>Configure academic calendar dates and cancellation policies.</p>
        </div>
      </div>

      <form onSubmit={save} style={{ maxWidth: 580 }}>
        <div className="card-pad">
          <h2>Academic Calendar &amp; Policies</h2>
          <p style={{ fontSize: ".88rem", color: "var(--muted)" }}>
            Control the college start timeline and lead time required for bed releases.
          </p>

          <div style={{ height: 1, background: "var(--line)", margin: "4px 0 8px" }} />

          <div className="form-group">
            <label>
              College start date
              <input
                type="date"
                required
                value={f.start}
                onChange={(e) => setF({ ...f, start: e.target.value })}
              />
            </label>

            <label>
              Cancellation lead time
              <div style={{ position: "relative" }}>
                <input
                  type="number"
                  min={0}
                  required
                  value={f.days}
                  onChange={(e) => setF({ ...f, days: +e.target.value })}
                  style={{ paddingRight: 52 }}
                />
                <span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", fontSize: ".82rem", color: "var(--muted)", pointerEvents: "none" }}>
                  days
                </span>
              </div>
            </label>

            <label>
              Timezone
              <input
                required
                value={f.tz}
                onChange={(e) => setF({ ...f, tz: e.target.value })}
                placeholder="e.g. Asia/Kolkata"
              />
            </label>
          </div>

          {/* Cutoff preview card */}
          <div style={{ background: "var(--surface2)", border: "1px solid var(--line)", borderRadius: "var(--radius-sm)", padding: "16px 18px" }}>
            <p style={{ fontWeight: 700, fontSize: ".9rem", color: "var(--fg)", marginBottom: 4 }}>
              Cancellation cutoff: <span style={{ color: "var(--accent)" }}>{cutoff}</span>
            </p>
            <p style={{ fontSize: ".82rem", color: "var(--muted)", margin: 0 }}>
              Students may cancel their bookings before the start of {cutoff} ({f.tz}). Cancellations are strictly locked on and after that date.
            </p>
          </div>

          {err && <div className="alert alert-error" role="alert">{err}</div>}
          {ok  && <div className="alert alert-success" role="status">{ok}</div>}

          <div>
            <button type="submit" style={{ alignSelf: "flex-start" }}>Save settings</button>
          </div>
        </div>
      </form>
    </section>
  );
}
