import { useEffect, useState } from "react";
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
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
  const [menuOpen, setMenuOpen] = useState(false);
  const nav = useNavigate();
  const location = useLocation();

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

  // Close mobile navigation menu on route navigation
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

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
            <NavLink to="/student/rooms" className="topnav__brand" onClick={() => setMenuOpen(false)}>
              <span className="topnav__brand-icon" aria-hidden="true">H</span>
              <span>HostelHub</span>
            </NavLink>

            {/* Clear, labeled menu toggle for smaller screens */}
            <button
              className={`topnav__toggle ${menuOpen ? "active" : ""}`}
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label="Toggle navigation menu"
              aria-expanded={menuOpen}
              type="button"
            >
              <span className="topnav__toggle-bars" aria-hidden="true">
                <span className="topnav__hamburger-bar" />
                <span className="topnav__hamburger-bar" />
                <span className="topnav__hamburger-bar" />
              </span>
              <span className="topnav__toggle-label">{menuOpen ? "Close" : "Menu"}</span>
            </button>

            {/* Main navigation (Desktop horizontal, Tablet/Mobile spacious drawer) */}
            <div className={`topnav__menu ${menuOpen ? "open" : ""}`}>
              <div className="topnav__menu-section">
                <div className="topnav__menu-label">Main Menu</div>
                <nav className="topnav__links">
                  <NavLink
                    to="/student/rooms"
                    onClick={() => setMenuOpen(false)}
                    className={({ isActive }) => "topnav__link" + (isActive ? " active" : "")}
                  >
                    Rooms
                  </NavLink>
                  <NavLink
                    to="/student/ai-assistant"
                    onClick={() => setMenuOpen(false)}
                    className={({ isActive }) => "topnav__link" + (isActive ? " active" : "")}
                  >
                    AI Assistant
                  </NavLink>
                  <NavLink
                    to="/student/bookings"
                    onClick={() => setMenuOpen(false)}
                    className={({ isActive }) => "topnav__link" + (isActive ? " active" : "")}
                  >
                    My Bookings
                  </NavLink>
                </nav>
              </div>

              {me.role === "admin" && (
                <div className="topnav__menu-section admin-section-menu">
                  <span className="topnav__divider" aria-hidden="true" />
                  <div className="topnav__menu-label">Admin Management</div>
                  <nav className="topnav__links">
                    <NavLink
                      to="/admin"
                      onClick={() => setMenuOpen(false)}
                      className={({ isActive }) => "topnav__link" + (isActive ? " active" : "")}
                    >
                      Dashboard
                    </NavLink>
                    <NavLink
                      to="/admin/bookings"
                      onClick={() => setMenuOpen(false)}
                      className={({ isActive }) => "topnav__link" + (isActive ? " active" : "")}
                    >
                      All Bookings
                    </NavLink>
                    <NavLink
                      to="/admin/settings"
                      onClick={() => setMenuOpen(false)}
                      className={({ isActive }) => "topnav__link" + (isActive ? " active" : "")}
                    >
                      Settings
                    </NavLink>
                  </nav>
                </div>
              )}

              <div className="topnav__actions">
                <div className="topnav__user">
                  <span className="topnav__user-dot" />
                  <span>{me.full_name || me.role}</span>
                </div>
                <button
                  className="btn-signout"
                  onClick={async () => {
                    setMenuOpen(false);
                    await supabase.auth.signOut();
                    nav("/login");
                  }}
                >
                  Sign out
                </button>
              </div>
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

      {/* Mobile Bottom Quick Navigation Bar (always visible & spacious on phones) */}
      {me && (
        <nav className="bottom-bar" aria-label="Mobile bottom navigation">
          <NavLink
            to="/student/rooms"
            className={({ isActive }) => "bottom-bar__item" + (isActive ? " active" : "")}
            onClick={() => setMenuOpen(false)}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
            <span>Rooms</span>
          </NavLink>

          <NavLink
            to="/student/ai-assistant"
            className={({ isActive }) => "bottom-bar__item" + (isActive ? " active" : "")}
            onClick={() => setMenuOpen(false)}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <span>AI Chat</span>
          </NavLink>

          <NavLink
            to="/student/bookings"
            className={({ isActive }) => "bottom-bar__item" + (isActive ? " active" : "")}
            onClick={() => setMenuOpen(false)}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            <span>Bookings</span>
          </NavLink>

          {me.role === "admin" && (
            <NavLink
              to="/admin"
              className={({ isActive }) => "bottom-bar__item" + (isActive ? " active" : "")}
              onClick={() => setMenuOpen(false)}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="7" />
                <rect x="14" y="14" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" />
              </svg>
              <span>Admin</span>
            </NavLink>
          )}

          <button
            type="button"
            className={`bottom-bar__item ${menuOpen ? "active" : ""}`}
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="More options"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
            <span>{menuOpen ? "Close" : "More"}</span>
          </button>
        </nav>
      )}
    </div>
  );
}
