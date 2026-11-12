// Backend endpoints (same as the original console).
//   POST /upload-audio   -> { file_id, path }
//   POST /process/jobs   -> { job_id }          (start background transcription)
//   GET  /process/jobs/{id} -> { status, stage, progress, result? }
//   POST /meetings       -> { id }
//   GET  /meetings/{id}  -> meeting
//   GET  /meetings       -> list of meetings (optional; see listMeetings)
//   POST /ask            -> { answer, sources }
const E = { upload: "/upload-audio", process: "/process", meetings: "/meetings", ask: "/ask" };

const BASE_KEY = "mi.apiBase";
const RECENT_KEY = "mi.recent";

export const getBase = () => localStorage.getItem(BASE_KEY) || "";
export const setBase = (v) => localStorage.setItem(BASE_KEY, v.trim().replace(/\/$/, ""));

const parse = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

const failure = (status, data) => {
  const d = typeof data === "string" ? data : data?.detail ?? data;
  return new Error(`${status} ${typeof d === "string" ? d : JSON.stringify(d)}`);
};

async function call(path, options = {}) {
  const res = await fetch(getBase() + path, options);
  const data = parse(await res.text());
  if (!res.ok) throw failure(res.status, data);
  return data;
}

const json = (body, signal) => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
  signal,
});

// Upload uses XMLHttpRequest (not fetch) so we get real upload progress.
// Meeting details are sent with the file so the backend can store them.
export function uploadAudio(file, details, { signal, onProgress } = {}) {
  const form = new FormData();
  form.append("file", file);
  form.append("title", details.title);
  form.append("meeting_date", details.meeting_date);
  form.append("participants", details.participants);
  form.append("description", details.description);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", getBase() + E.upload);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      const data = parse(xhr.responseText);
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(failure(xhr.status, data));
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.onabort = () => reject(new DOMException("Aborted", "AbortError"));
    signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(form);
  });
}

// Processing runs as a background job on the server: start it, then poll for status.
export const startProcess = (upload, { diarize = true } = {}) =>
  call(`${E.process}/jobs`, json({ file_id: upload.file_id, diarize }));
export const getJob = (id) => call(`${E.process}/jobs/${encodeURIComponent(id)}`);
export const cancelProcess = (id) => call(`${E.process}/jobs/${encodeURIComponent(id)}`, { method: "DELETE" });

// URL of the original recording; usable directly as <audio src>.
export const audioUrl = (fileId) => `${getBase()}/audio/${encodeURIComponent(fileId)}`;

export const saveMeeting = (payload) => call(E.meetings, json(payload));
export const getMeeting = (id) => call(`${E.meetings}/${encodeURIComponent(id)}`);
// meetingId (optional) limits the search to that saved meeting; omit to search all meetings.
export const ask = (question, meetingId) => call(E.ask, json({ question, ...(meetingId ? { meeting_id: meetingId } : {}) }));

// --- list of meetings ---------------------------------------------------
// Uses GET /meetings if your backend has it, and always merges with the
// meetings remembered in this browser, so the list works either way.
export const idOf = (m) => m?.id ?? m?._id?.$oid ?? m?._id;

export const summarise = (m) => ({
  id: idOf(m),
  title: m.title || m.details?.title || "Untitled meeting",
  date: m.meeting_date || m.details?.meeting_date || "",
  participants: m.participants || m.details?.participants || "",
});

export function remember(m) {
  const s = summarise(m);
  if (!s.id) return;
  const rest = readRecent().filter((r) => r.id !== s.id);
  localStorage.setItem(RECENT_KEY, JSON.stringify([s, ...rest].slice(0, 100)));
}
export function forget(id) {
  localStorage.setItem(RECENT_KEY, JSON.stringify(readRecent().filter((r) => r.id !== id)));
}
function readRecent() {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY)) || [];
  } catch {
    return [];
  }
}

export async function listMeetings() {
  let remote = [];
  try {
    const data = await call(E.meetings);
    const arr = Array.isArray(data) ? data : data?.meetings || data?.items || [];
    remote = arr.map(summarise).filter((m) => m.id);
  } catch {
    /* endpoint not available: fall back to local list */
  }
  const seen = new Set(remote.map((m) => m.id));
  return [...remote, ...readRecent().filter((m) => !seen.has(m.id))];
}
