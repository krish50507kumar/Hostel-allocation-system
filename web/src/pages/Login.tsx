import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib";

export default function Login({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [f, setF] = useState({ email: "", password: "", full_name: "", student_number: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const { error } = mode === "in"
      ? await supabase.auth.signInWithPassword({ email: f.email, password: f.password })
      : await supabase.auth.signUp({
          email: f.email,
          password: f.password,
          options: { data: { full_name: f.full_name, student_number: f.student_number } },
        });
    setBusy(false);
    if (error) return setErr(error.message);
    onDone();
    nav("/student/rooms");
  }

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF({ ...f, [k]: e.target.value });

  return (
    <div className="login-shell">
      {/* Left landing showcase panel — inspired by reference hostel website */}
      <aside className="login-aside">
        <div className="login-aside__logo">
          <div className="login-aside__logo-icon">H</div>
          <span>HostelHub</span>
        </div>

        <div className="login-aside__hero">
          <div style={{ display: "inline-block", fontSize: ".72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".12em", color: "#5eead4", marginBottom: 10 }}>
            Student Living Redefined
          </div>
          <h1>Not Just a Bed. A Community.</h1>
          <p>
            Experience campus accommodation with real-time bed selection, verified amenities, and intelligent room matching.
          </p>
        </div>

        <ul className="login-aside__features">
          <li className="login-aside__feature">
            <span className="login-aside__feature-icon">01</span>
            <div>
              <div style={{ fontWeight: 700, color: "#fff" }}>Live Bed Availability</div>
              <div style={{ fontSize: ".8rem", opacity: .75 }}>Pick and reserve your exact bed number in seconds</div>
            </div>
          </li>
          <li className="login-aside__feature">
            <span className="login-aside__feature-icon">02</span>
            <div>
              <div style={{ fontWeight: 700, color: "#fff" }}>Dedicated Study &amp; Social Zones</div>
              <div style={{ fontSize: ".8rem", opacity: .75 }}>High-speed connectivity and quiet study desks</div>
            </div>
          </li>
          <li className="login-aside__feature">
            <span className="login-aside__feature-icon">03</span>
            <div>
              <div style={{ fontWeight: 700, color: "#fff" }}>AI Room Assistant</div>
              <div style={{ fontSize: ".8rem", opacity: .75 }}>Natural language search for rooms matching your schedule</div>
            </div>
          </li>
        </ul>

        {/* Resident review card — inspired by 'What guests loved most' section */}
        <div style={{ background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.15)", borderRadius: "var(--radius)", padding: "16px 20px" }}>
          <p style={{ fontStyle: "italic", fontSize: ".86rem", color: "rgba(255,255,255,.9)", margin: "0 0 8px 0", lineHeight: 1.5 }}>
            &ldquo;Found my preferred room with an attached bath in under two minutes. Smooth and transparent booking.&rdquo;
          </p>
          <div style={{ fontSize: ".75rem", fontWeight: 600, color: "#5eead4", textTransform: "uppercase", letterSpacing: ".06em" }}>
            Verified Resident · Block B
          </div>
        </div>
      </aside>

      {/* Right form panel */}
      <div className="login-main">
        <div className="login-box">
          <div className="login-box__heading">
            <h2>{mode === "in" ? "Welcome back" : "Create your student account"}</h2>
            <p>
              {mode === "in"
                ? "Sign in to access room bookings and live hostel status."
                : "Register with your student details to reserve your bed."}
            </p>
          </div>

          <div className="login-box__form">
            <form onSubmit={submit} className="form-group">
              {mode === "up" && (
                <div className="input-row">
                  <label>
                    Full name
                    <input required value={f.full_name} onChange={set("full_name")} placeholder="Jane Smith" />
                  </label>
                  <label>
                    Student number
                    <input required value={f.student_number} onChange={set("student_number")} placeholder="e.g. 12345678" />
                  </label>
                </div>
              )}
              <label>
                Email address
                <input type="email" required value={f.email} onChange={set("email")} placeholder="student@university.edu" />
              </label>
              <label>
                Password
                <input type="password" minLength={8} required value={f.password} onChange={set("password")} placeholder="At least 8 characters" />
              </label>

              {err && (
                <div className="alert alert-error" role="alert">
                  {err}
                </div>
              )}

              <button type="submit" disabled={busy} style={{ width: "100%", padding: "13px" }}>
                {busy ? "Please wait…" : mode === "in" ? "Sign in to HostelHub" : "Create account"}
              </button>
            </form>

            <div className="divider">or</div>

            <p style={{ fontSize: ".9rem", color: "var(--muted)" }}>
              {mode === "in" ? "New student? " : "Already have an account? "}
              <button type="button" className="link" onClick={() => setMode(mode === "in" ? "up" : "in")}>
                {mode === "in" ? "Register here" : "Sign in"}
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
