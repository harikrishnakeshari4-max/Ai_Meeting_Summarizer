import { useEffect, useRef, useState } from "react";
import { audioUrl } from "./api.js";

const COLORS = ["#2f5bea", "#c2410c", "#0f766e", "#a21caf", "#4d7c0f", "#b45309"];
const SPEEDS = [1, 1.25, 1.5, 2];

const fmtTime = (s = 0) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

// Index of the segment being spoken at time t (binary search; segments are sorted by start).
function indexAt(segs, t) {
  let lo = 0, hi = segs.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (segs[mid].start <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans >= 0 && t > segs[ans].end + 2 ? -1 : ans; // in a long silence, highlight nothing
}

function List({ items }) {
  if (!items?.length) return <p className="hint">None recorded.</p>;
  return (
    <ul className="plain">
      {items.map((x, i) => (
        <li key={i}>{typeof x === "string" ? x : JSON.stringify(x)}</li>
      ))}
    </ul>
  );
}

export default function MeetingView({ meeting, id, preview, onForget, onAsk }) {
  const [tab, setTab] = useState("summary");
  const [find, setFind] = useState("");
  const [active, setActive] = useState(-1); // segment currently being played
  const [playing, setPlaying] = useState(false);
  const [follow, setFollow] = useState(true); // auto-scroll the transcript while playing
  const [speed, setSpeed] = useState(1);
  const [audioError, setAudioError] = useState(false);
  const audio = useRef(null);
  const box = useRef(null);

  const m = meeting || {};
  const d = m.details || {};
  const title = m.title || d.title || "Untitled meeting";
  const date = m.meeting_date || d.meeting_date;
  const people = m.participants || d.participants;
  const notes = m.description || d.description;
  const ex = m.extraction;
  const fileId = m.file_id || d.file_id;
  const segs = m.segments ?? [];
  const speakers = [...new Set(segs.map((s) => s.speaker))];
  const color = (sp) => COLORS[speakers.indexOf(sp) % COLORS.length];
  const q = find.trim().toLowerCase();
  // keep each segment's original index so highlighting/seeking still work while filtering
  const visible = segs
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => !q || `${s.speaker} ${s.text}`.toLowerCase().includes(q));

  useEffect(() => {
    if (audio.current) audio.current.playbackRate = speed;
  }, [speed, fileId]);

  // Keep the active line in view while playing.
  useEffect(() => {
    if (!follow || !playing || tab !== "transcript" || active < 0 || !box.current) return;
    const el = box.current.querySelector(`[data-i="${active}"]`);
    if (el) box.current.scrollTo({ top: el.offsetTop - box.current.clientHeight / 3, behavior: "smooth" });
  }, [active, follow, playing, tab]);

  const onTime = () => {
    if (audio.current) setActive(indexAt(segs, audio.current.currentTime)); // no re-render if unchanged
  };

  const seek = (s) => {
    const a = audio.current;
    if (!a) return;
    a.currentTime = s.start;
    a.play().catch(() => {});
  };

  const seekProps = (s) =>
    fileId && !audioError
      ? {
          role: "button",
          tabIndex: 0,
          title: "Play from here",
          onClick: () => seek(s),
          onKeyDown: (e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              seek(s);
            }
          },
        }
      : {};

  const copy = () => {
    const text = segs.map((s) => `[${fmtTime(s.start)}] ${s.speaker}: ${s.text}`).join("\n");
    navigator.clipboard?.writeText(text);
  };

  return (
    <article className="stack">
      <header className="mhead">
        <div>
          <h2>{title}</h2>
          <p className="meta">
            {[date, people].filter(Boolean).join("  ·  ")}
            {id && !preview && <span className="idtag"> id {id}</span>}
          </p>
          {notes && <p className="notes">{notes}</p>}
        </div>
        {!preview && (onAsk || onForget) && (
          <div className="mi-row">
            {onAsk && <button className="secondary" onClick={onAsk}>Ask about this meeting</button>}
            {onForget && (
              <button className="link" onClick={onForget} title="Remove from this browser's list">Remove from list</button>
            )}
          </div>
        )}
      </header>

      {fileId && !audioError && (
        <section className="card player">
          <audio
            key={fileId}
            ref={audio}
            controls
            preload="metadata"
            src={audioUrl(fileId)}
            onTimeUpdate={onTime}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
            onError={() => setAudioError(true)}
          />
          <div className="mi-row speeds" role="group" aria-label="Playback speed">
            <small className="hint">Speed</small>
            {SPEEDS.map((v) => (
              <button key={v} className={`secondary ${speed === v ? "on" : ""}`} onClick={() => setSpeed(v)}>
                {v}×
              </button>
            ))}
            <small className="hint">Tip: click any transcript line to play from there.</small>
          </div>
        </section>
      )}
      {fileId && audioError && <p className="hint">The original recording is no longer available on the server.</p>}

      <div className="tabs" role="tablist">
        {[["summary", "Summary"], ["transcript", `Transcript (${segs.length})`]].map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>
            {l}
          </button>
        ))}
      </div>

      {tab === "summary" && (
        <section className="card">
          {ex ? <p className="summary">{ex.summary}</p> : <p className="hint">No extraction in this result.</p>}
          {ex && (
            <div className="cols">
              <div><h3>Decisions</h3><List items={ex.decisions} /></div>
              <div><h3>Open questions</h3><List items={ex.open_questions} /></div>
            </div>
          )}
          {ex?.action_items?.length > 0 && (
            <>
              <h3>Action items</h3>
              <div className="scroll">
                <table>
                  <thead><tr><th>Task</th><th>Owner</th><th>Deadline</th></tr></thead>
                  <tbody>
                    {ex.action_items.map((a, i) => (
                      <tr key={i}><td>{a.task}</td><td>{a.owner}</td><td>{a.deadline}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      )}

      {tab === "transcript" && (
        <section className="card">
          <div className="mi-row between">
            <div className="legend">
              {speakers.map((sp) => (<span key={sp}><i style={{ background: color(sp) }} />{sp}</span>))}
            </div>
            <div className="mi-row toolbar">
              {fileId && (
                <label className="mi-check">
                  <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} />
                  <span>Auto-scroll</span>
                </label>
              )}
              <input className="search" placeholder="Search transcript" value={find} onChange={(e) => setFind(e.target.value)} />
              <button className="secondary" onClick={copy}>Copy</button>
            </div>
          </div>
          <div className="transcript" ref={box}>
            {visible.map(({ s, i }) => (
              <div
                className={`seg ${i === active ? "playing" : ""} ${fileId && !audioError ? "seekable" : ""}`}
                key={i}
                data-i={i}
                style={{ borderLeftColor: color(s.speaker) }}
                {...seekProps(s)}
              >
                <span className="time">{fmtTime(s.start)}</span>
                <span className="who" style={{ color: color(s.speaker) }}>{s.speaker}</span>
                <span className="text">{s.text}</span>
              </div>
            ))}
            {visible.length === 0 && <p className="hint">{segs.length ? "No matches." : "No transcript available."}</p>}
          </div>
        </section>
      )}
    </article>
  );
}
