import { useEffect, useState } from "react";
import { NavLink, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { supabase } from "./lib";
import Login from "./pages/Login";
import Rooms from "./pages/Rooms";
import MyBookings from "./pages/MyBookings";
import Admin from "./pages/Admin";
import AIAssistant from "./pages/AIAssistant";
import AdminBookings from "./pages/AdminBookings";
import AdminSettings from "./pages/AdminSettings";

type Me = { id: string; full_name: string; role: "student" | "admin" } | null;

export default function App() {
  const [me, setMe] = useState<Me | undefined>(undefined);
  const nav = useNavigate();

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return setMe(null);
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, role")
      .eq("id", user.id)
      .single();
    setMe(data as Me);
  }

  useEffect(() => {
    load();
    const { data } = supabase.auth.onAuthStateChange(() => load());
    return () => data.subscription.unsubscribe();
  }, []);

  if (me === undefined) {
    return (
      <div className="app-shell loading-shell">
        <p className="state" role="status">Loading…</p>
      </div>
    );
  }

  return (
    <div className="app-shell">
      {me && (
        <header className="topnav">
          <div className="topnav__inner">
            <NavLink to="/student/rooms" className="topnav__brand">
              <span className="topnav__brand-icon" aria-hidden="true">H</span>
              <span>HostelHub</span>
            </NavLink>

            <nav className="topnav__links">
              <NavLink to="/student/rooms" className={({ isActive }) => "topnav__link" + (isActive ? " active" : "")}>
                Rooms
              </NavLink>
              <NavLink to="/student/ai-assistant" className={({ isActive }) => "topnav__link" + (isActive ? " active" : "")}>
                AI Assistant
              </NavLink>
              <NavLink to="/student/bookings" className={({ isActive }) => "topnav__link" + (isActive ? " active" : "")}>
                My Bookings
              </NavLink>
              {me.role === "admin" && (
                <>
                  <span className="topnav__divider" aria-hidden="true" />
                  <NavLink to="/admin" className={({ isActive }) => "topnav__link" + (isActive ? " active" : "")}>
                    Dashboard
                  </NavLink>
                  <NavLink to="/admin/bookings" className={({ isActive }) => "topnav__link" + (isActive ? " active" : "")}>
                    All Bookings
                  </NavLink>
                  <NavLink to="/admin/settings" className={({ isActive }) => "topnav__link" + (isActive ? " active" : "")}>
                    Settings
                  </NavLink>
                </>
              )}
            </nav>

            <div className="topnav__actions">
              <div className="topnav__user">
                <span className="topnav__user-dot" />
                <span>{me.full_name || me.role}</span>
              </div>
              <button
                className="btn-signout"
                onClick={async () => { await supabase.auth.signOut(); nav("/login"); }}
              >
                Sign out
              </button>
            </div>
          </div>
        </header>
      )}

      <main className={me ? "page-content" : ""}>
        <Routes>
          <Route path="/login" element={<Login onDone={load} />} />
          <Route path="/student/rooms" element={me ? <Rooms /> : <Navigate to="/login" />} />
          <Route path="/student/ai-assistant" element={me ? <AIAssistant /> : <Navigate to="/login" />} />
          <Route path="/student/bookings" element={me ? <MyBookings /> : <Navigate to="/login" />} />
          <Route path="/admin" element={me?.role === "admin" ? <Admin /> : <Navigate to="/login" />} />
          <Route path="/admin/bookings" element={me?.role === "admin" ? <AdminBookings /> : <Navigate to="/login" />} />
          <Route path="/admin/settings" element={me?.role === "admin" ? <AdminSettings /> : <Navigate to="/login" />} />
          <Route path="*" element={<Navigate to={me ? "/student/rooms" : "/login"} />} />
        </Routes>
      </main>
    </div>
  );
}