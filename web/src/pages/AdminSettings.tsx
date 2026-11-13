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
  const formatDate = (date: string) => date === "—"
    ? date
    : new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${date}T00:00:00`));
  const cutoffDate = formatDate(cutoff);
  const startDate = formatDate(f.start);
  const daysUntilCutoff = cutoff === "—"
    ? null
    : Math.max(0, Math.ceil((new Date(`${cutoff}T00:00:00`).getTime() - Date.now()) / 86400000));

  async function save(e: React.FormEvent) {
    e.preventDefault(); setErr(""); setOk("");
    const { error } = await supabase.rpc("admin_update_settings", { p_start: f!.start, p_days: f!.days, p_tz: f!.tz });
    if (error) return setErr(friendly(error));
    setOk("Settings saved successfully.");
  }

  return (
    <section>
      <div className="settings-heading">
        <div className="page-hero__eyebrow">System policy</div>
        <h1>Academic Calendar Settings</h1>
        <p>Set semester dates and keep cancellation rules consistent across HostelHub.</p>
      </div>

      <div className="settings-layout">
        <form onSubmit={save} className="settings-form card-pad">
          <div>
            <h2>Academic calendar &amp; policies</h2>
            <p className="settings-muted">These rules apply to student bookings across all buildings.</p>
          </div>
          <div className="settings-rule" />
          <div className="form-group">
            <label>
              College start date
              <input type="date" required value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} />
              <span className="settings-help">First day of the upcoming semester.</span>
            </label>

            <label>
              Cancellation lead time
              <div className="settings-stepper">
                <button type="button" className="btn-ghost" aria-label="Decrease cancellation lead time" onClick={() => setF({ ...f, days: Math.max(0, f.days - 1) })}>−</button>
                <span>{f.days} days</span>
                <button type="button" className="btn-ghost" aria-label="Increase cancellation lead time" onClick={() => setF({ ...f, days: f.days + 1 })}>+</button>
              </div>
              <span className="settings-help">Number of days before the college start date.</span>
            </label>

            <label>
              Timezone
              <select required value={f.tz} onChange={(e) => setF({ ...f, tz: e.target.value })}>
                <option value="Asia/Kolkata">Asia/Kolkata</option>
                <option value="UTC">UTC</option>
              </select>
              <span className="settings-help">Available options: Asia/Kolkata · UTC</span>
            </label>
          </div>

          {err && <div className="alert alert-error" role="alert">{err}</div>}
          <button type="submit" className="settings-save">Save settings</button>
          <p className="settings-help">Changing the dates updates the cancellation cutoff preview.</p>
        </form>

        <div className="settings-side">
          <section className="cutoff-card">
            <div className="settings-overline">Cutoff preview</div>
            <div className="cutoff-date">{cutoffDate}</div>
            <p className="cutoff-label">Cancellation cutoff · Start of day</p>
            <p className="cutoff-zone">{f.tz} · 00:00 {f.tz === "UTC" ? "UTC" : "IST"}</p>
            <div className="settings-rule" />
            <p className="cutoff-label">Last date students can cancel</p>
            <strong className="cutoff-last-date">{cutoffDate}</strong>
            <div className="cutoff-days">
              <strong>{daysUntilCutoff ?? "—"}</strong>
              <span>days <small>remaining until the cancellation cutoff</small></span>
            </div>
            <p className="cutoff-zone">Preview clock: {cutoffDate}, 00:00 {f.tz === "UTC" ? "UTC" : "IST"}</p>
          </section>

          <section className="settings-explanation card-pad">
            <h2>How the cutoff is calculated</h2>
            <p className="calculation">{startDate} <strong>−</strong> {f.days} days <strong>=</strong> {cutoffDate}</p>
            <p>Students may cancel before the cutoff. Cancellations are blocked at and after 00:00 on {cutoffDate} in the selected timezone.</p>
            <p>Dates and timezone are shown again before students confirm a booking or cancellation.</p>
          </section>
        </div>
      </div>

      {ok && <div className="settings-saved" role="status"><strong>✓ {ok}</strong><span>The updated policy is applied to booking and cancellation checks.</span></div>}
      <p className="settings-footer-note">Policy changes are restricted to authorized administrators.</p>
    </section>
  );
}
