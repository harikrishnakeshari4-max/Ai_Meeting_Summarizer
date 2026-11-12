import { useCallback, useEffect, useState } from "react";
import { listMeetings, getMeeting, forget, remember, idOf } from "./api.js";
import NewMeeting from "./NewMeeting.jsx";
import MeetingView from "./MeetingView.jsx";
import AskPanel from "./AskPanel.jsx";
import Login from './Login.jsx';
import Register from './Register.jsx';
import { Route, Routes} from "react-router-dom";
import ProtectedRoute from './protectroute.jsx';
import Profile from "./Profile.jsx";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./Auth";
import { draftStore } from "./meetingDraft.js";
import { useStore } from "./store.js";
import { setScope } from "./askStore.js";
export default function App() {
  const [view, setView] = useState({ name: "new" }); // new | meeting | ask
  const [meetings, setMeetings] = useState([]);
  const [filter, setFilter] = useState("");
  const [loadId, setLoadId] = useState("");
  const [toast, setToast] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const draft = useStore(draftStore); // lets the sidebar show background progress

  const refresh = useCallback(async () => setMeetings(await listMeetings()), []);
  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  async function open(id) {
    setMenuOpen(false);
    setView({ name: "meeting", loading: true, id });
    try {
      const m = await getMeeting(id);
      remember({ id, ...m });
      setView({ name: "meeting", id, meeting: m });
      refresh();
    } catch (e) {
      setToast(`Could not open meeting: ${e.message}`);
      setView({ name: "new" });
    }
  }

  function onSaved(meeting, id) {
    remember({ ...meeting, id });
    refresh();
    setView({ name: "meeting", id, meeting: { ...meeting, id } });
  }

  const q = filter.trim().toLowerCase();
  const shown = meetings.filter((m) =>
    !q || `${m.title} ${m.participants} ${m.date}`.toLowerCase().includes(q)
  );
  const activeId = view.name === "meeting" ? view.id : null;

 const { logout } = useAuth();
const navigate = useNavigate();

const handleLogout = () => {
  logout();
  navigate("/login", { replace: true });
};
  return (
    <Routes>
      <Route path="/login" element={<Login/>} />
      <Route path="/register" element={<Register />} />

      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <Profile />
          </ProtectedRoute>
        }
      />

      <Route
        path="/*"
        element={
            <ProtectedRoute>
          <div className="app">
            <button
              className="burger"
              onClick={() => setMenuOpen((o) => !o)}
              aria-label="Menu"
            >
              ☰
            </button>

            <aside className={`side ${menuOpen ? "open" : ""}`}>
              <h1 className="brand">Meeting Intelligence</h1>

              <button
                className="primary block"
                onClick={() => {
                  setView({ name: "new" });
                  setMenuOpen(false);
                }}
              >
                + Add meeting{draft.busy && draft.busy !== "Saving" ? " · working…" : draft.result ? " · ready to save" : ""}
              </button>

              <button
                className={`nav ${view.name === "ask" ? "on" : ""}`}
                onClick={() => {
                  setView({ name: "ask" });
                  setMenuOpen(false);
                }}
              >
                Ask your meetings
              </button>

              <button
                className="nav"
                onClick={() => {
                  setMenuOpen(false);
                  navigate("/profile"); // client-side: a full reload would kill the upload
                }}
              >
                My Profile
              </button>

              <div className="list-head">
                <span>Meetings</span>
                <button className="link" onClick={refresh}>
                  Refresh
                </button>
              </div>

              <input
                className="search"
                placeholder="Filter meetings"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />

              <ul className="meetings">
                {shown.map((m) => (
                  <li key={m.id}>
                    <button
                      className={m.id === activeId ? "on" : ""}
                      onClick={() => open(m.id)}
                    >
                      <strong>{m.title}</strong>
                      <small>
                        {[m.date, m.participants]
                          .filter(Boolean)
                          .join(" · ") || m.id}
                      </small>
                    </button>
                  </li>
                ))}
                {shown.length === 0 && (
                  <li className="empty">No meetings yet.</li>
                )}
              </ul>

              <form
                className="open-id"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (loadId.trim()) open(loadId.trim());
                }}
              >
                <input
                  placeholder="Open by meeting id"
                  value={loadId}
                  onChange={(e) => setLoadId(e.target.value)}
                  spellCheck={false}
                />
                <button
                  className="secondary"
                  disabled={!loadId.trim()}
                >
                  Open
                </button>
              </form>
              <button className="nav" onClick={handleLogout}>
  Logout
</button>
            </aside>

            <main className="main">
              {toast && (
                <div className="mi-toast" role="alert">
                  <span>{toast}</span>
                  <button
                    className="link"
                    onClick={() => setToast("")}
                  >
                    Dismiss
                  </button>
                </div>
              )}

              {view.name === "new" && (
                <NewMeeting onSaved={onSaved} />
              )}

              {view.name === "ask" && (
                <AskPanel meetings={meetings} />
              )}

              {view.name === "meeting" &&
                (view.loading ? (
                  <p className="hint">Loading…</p>
                ) : (
                  <MeetingView
                    key={view.id} // fresh player/tab state per meeting
                    meeting={view.meeting}
                    id={idOf(view.meeting) ?? view.id}
                    onAsk={() => {
                      setScope(idOf(view.meeting) ?? view.id); // search only this meeting
                      setView({ name: "ask" });
                    }}
                    onForget={() => {
                      forget(view.id);
                      refresh();
                      setView({ name: "new" });
                    }}
                  />
                ))}
            </main>
          </div>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

