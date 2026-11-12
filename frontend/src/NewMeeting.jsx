import { useRef, useState } from "react";
import MeetingView from "./MeetingView.jsx";
import { useStore } from "./store.js";
import {
  draftStore, setDetail, setDiarize, pickFile, uploadAndProcess, saveDraft, cancelDraft, resetDraft, clearError,
} from "./meetingDraft.js";

export default function NewMeeting({ onSaved }) {
  const { details, diarize, file, fileName, upload, result, busy, progress, error } = useStore(draftStore);
  const [drag, setDrag] = useState(false);
  const input = useRef(null);

  const set = (k) => (e) => setDetail(k, e.target.value);
  const ready = file && details.title.trim() && !busy;
  const working = busy && busy !== "Saving";

  async function save() {
    const done = await saveDraft();
    if (done) onSaved(done.payload, done.id);
  }

  return (
    <div className="stack">
      <header>
        <h2>Add a meeting</h2>
        <p className="hint">
          Fill in the details, attach the recording, then review the results before saving. Processing keeps running if you open another tab.
        </p>
      </header>

      {error && (
        <div className="mi-toast" role="alert">
          <span>{error}</span>
          <button className="link" onClick={clearError}>Dismiss</button>
        </div>
      )}

      <section className="card">
        <div className="fields">
          <label className="span2">
            Meeting title
            <input value={details.title} onChange={set("title")} placeholder="Weekly product sync" />
          </label>
          <label>
            Date
            <input type="date" value={details.meeting_date} onChange={set("meeting_date")} />
          </label>
          <label>
            Participants
            <input value={details.participants} onChange={set("participants")} placeholder="Asha, Ravi, Meera" />
          </label>
          <label className="span2">
            Agenda / notes
            <textarea rows={3} value={details.description} onChange={set("description")} placeholder="Optional context for this meeting" />
          </label>
        </div>

        <label className="mi-check">
          <input type="checkbox" checked={diarize} disabled={!!busy} onChange={(e) => setDiarize(e.target.checked)} />
          <span>Identify speakers <small className="hint">(slower; turn off for a quick transcript)</small></span>
        </label>

        <div
          className={`drop ${drag ? "drag" : ""} ${file ? "has" : ""}`}
          onClick={() => !busy && input.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); pickFile(e.dataTransfer.files?.[0] ?? null); }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && !busy && input.current?.click()}
        >
          <input ref={input} type="file" accept="audio/*,video/*" hidden onChange={(e) => pickFile(e.target.files?.[0] ?? null)} />
          {file ? (
            <><strong>{file.name}</strong><small>{(file.size / 1048576).toFixed(1)} MB{busy ? "" : " · click to change"}</small></>
          ) : fileName ? (
            <><strong>{fileName}</strong><small>{busy ? "Processing on the server" : "Uploaded"}</small></>
          ) : (
            <><strong>Drop an audio or video file here</strong><small>or click to browse</small></>
          )}
        </div>

        <div className="mi-row">
          <button className="primary" disabled={!ready} onClick={uploadAndProcess}>
            {busy ? busy + "…" : upload && !result ? "Retry processing" : "Upload and analyse"}
          </button>
          {working && <button className="secondary" onClick={cancelDraft}>Cancel</button>}
          {busy && <span className="spinner" aria-hidden />}
          {progress != null && (
            <><progress max="100" value={progress} /><small className="hint">{progress}%</small></>
          )}
          {upload && !busy && <small className="hint">Uploaded · file id {upload.file_id}</small>}
          {!busy && (file || fileName || result) && <button className="link" onClick={resetDraft}>Start over</button>}
        </div>
      </section>

      {result && (
        <>
          <div className="savebar">
            <span>Review the results, then save this meeting.</span>
            <button className="primary" disabled={!!busy} onClick={save}>
              {busy === "Saving" ? "Saving…" : "Save meeting"}
            </button>
          </div>
          <MeetingView key={result.file_id} meeting={{ ...result, ...details }} preview />
        </>
      )}
    </div>
  );
}
