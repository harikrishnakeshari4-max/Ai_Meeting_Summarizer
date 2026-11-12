import { askStore, clearAskError, runAsk, setQuestion, setScope } from "./askStore.js";
import { useStore } from "./store.js";

export default function AskPanel({ meetings = [] }) {
  const { scope, q, res, busy, error } = useStore(askStore);
  const scoped = meetings.find((m) => m.id === scope);
  const scopeLabel = scope ? scoped?.title || "the selected meeting" : "all saved meetings";

  function submit(e) {
    e.preventDefault();
    runAsk();
  }

  return (
    <div className="stack">
      <header>
        <h2>Ask your meetings</h2>
        <p className="hint">Search one meeting, or all of them.</p>
      </header>

      {error && (
        <div className="mi-toast" role="alert">
          <span>{error}</span>
          <button className="link" onClick={clearAskError}>Dismiss</button>
        </div>
      )}

      <form className="card stack" onSubmit={submit}>
        <label>
          Search in
          <select value={scope} onChange={(e) => setScope(e.target.value)} disabled={busy}>
            <option value="">All saved meetings</option>
            {scope && !scoped && <option value={scope}>Selected meeting</option>}
            {meetings.map((m) => (
              <option key={m.id} value={m.id}>
                {m.title}{m.date ? ` · ${m.date}` : ""}
              </option>
            ))}
          </select>
        </label>
        <div className="mi-row grow">
          <input
            value={q}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="e.g. Who owns the budget review?"
            autoFocus
          />
          <button className="primary" disabled={!q.trim() || busy}>{busy ? "Searching…" : "Search"}</button>
        </div>
      </form>

      {res && (
        <section className="card">
          <p className="hint">Searched in {scopeLabel}</p>
          {res.answer && (
            <div className="answer">
              <h3>Answer</h3>
              <p>{res.answer}</p>
            </div>
          )}
          <h3>Matching passages</h3>
          {Array.isArray(res.sources) && res.sources.length > 0 ? (
            res.sources.map((s, i) => (
              <blockquote key={i}>
                <p>{s.text}</p>
                <footer>
                  {s.metadata ? Object.values(s.metadata).filter((v) => typeof v !== "object").join(" · ") : ""}
                  {s.distance != null ? `  ·  distance ${Number(s.distance).toFixed(3)}` : ""}
                </footer>
              </blockquote>
            ))
          ) : (
            <p className="hint">{res.sources ? "No matching passages." : "Unexpected API response."}</p>
          )}
        </section>
      )}
    </div>
  );
}
