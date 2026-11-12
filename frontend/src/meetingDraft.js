import { createStore } from "./store.js";
import { uploadAudio, startProcess, getJob, cancelProcess, saveMeeting } from "./api.js";

/**
 * The "Add meeting" draft: form fields, file, upload, transcript result, busy state, errors.
 *
 * Two layers protect a long transcript from being lost:
 *  1. State lives here at module level (not in a component), so switching tabs/pages
 *     (which unmounts NewMeeting) changes nothing.
 *  2. Transcription runs as a background job on the server and this module polls it. The active job id
 *     is saved in localStorage, so even a full page reload resumes polling instead of losing the work.
 *     (Only the file upload itself, which is a single browser request, can't survive a reload.)
 */
const ACTIVE_KEY = "mi.activeJob";
const POLL_MS = 2000;
const MAX_POLL_FAILURES = 5; // consecutive network errors tolerated while polling

const today = () => new Date().toISOString().slice(0, 10);
const initial = () => ({
  details: { title: "", meeting_date: today(), participants: "", description: "" },
  diarize: true, // identify speakers (slower); off = faster, speakers labelled "Unknown"
  file: null,
  fileName: "", // survives a reload, when the File object itself is gone
  upload: null, // { file_id, path } once uploaded
  result: null, // transcript + extraction once processed
  busy: "", // "", "Uploading", a pipeline stage, or "Saving"
  progress: null, // 0-100 when known
  jobId: null,
  error: "",
});

export const draftStore = createStore(initial());
const patch = (changes) => draftStore.set((s) => ({ ...s, ...changes }));

const readActive = () => {
  try {
    return JSON.parse(localStorage.getItem(ACTIVE_KEY));
  } catch {
    return null;
  }
};
const writeActive = (value) => {
  try {
    if (value) localStorage.setItem(ACTIVE_KEY, JSON.stringify(value));
    else localStorage.removeItem(ACTIVE_KEY);
  } catch {
    /* storage unavailable: resume-after-reload just won't work */
  }
};

class JobFailed extends Error {}

let controller = null;

const sleep = (ms, signal) =>
  new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => { clearTimeout(t); resolve(); }, { once: true });
  });

async function pollJob(jobId, signal) {
  let failures = 0;
  while (!signal.aborted) {
    try {
      const job = await getJob(jobId);
      failures = 0;
      if (job.status === "done") return job.result;
      if (job.status === "error") throw new JobFailed(job.error || "Processing failed");
      if (job.status === "cancelled") throw new JobFailed("Processing was cancelled.");
      patch({ busy: job.stage || "Processing", progress: job.progress ?? null });
    } catch (e) {
      if (e instanceof JobFailed) throw e;
      if (String(e.message).startsWith("404"))
        throw new JobFailed("The server no longer has this job (it may have restarted). Please start again.");
      if (++failures >= MAX_POLL_FAILURES) throw e;
    }
    await sleep(POLL_MS, signal);
  }
  throw new DOMException("Aborted", "AbortError");
}

async function finishJob(jobId, signal) {
  const result = await pollJob(jobId, signal);
  writeActive(null);
  patch({ result });
}

// Runs `work`, owns the busy/error bookkeeping, and is the only place a job ends.
async function drive(work) {
  const ctrl = (controller = new AbortController());
  try {
    await work(ctrl.signal);
  } catch (e) {
    if (ctrl.signal.aborted || e instanceof JobFailed) writeActive(null);
    patch({
      error: ctrl.signal.aborted
        ? "Cancelled. You can start again."
        : e instanceof JobFailed
          ? e.message
          : `Processing failed: ${e.message}`,
    });
  } finally {
    patch({ busy: "", progress: null, jobId: null });
    controller = null;
  }
}

export const setDetail = (key, value) =>
  draftStore.set((s) => ({ ...s, details: { ...s.details, [key]: value } }));

export const setDiarize = (diarize) => patch({ diarize });

export function pickFile(file) {
  if (draftStore.get().busy) return;
  draftStore.set((s) => ({
    ...s,
    file,
    fileName: file?.name ?? "",
    upload: null,
    result: null,
    error: "",
    details: file && !s.details.title ? { ...s.details, title: file.name.replace(/\.[^.]+$/, "") } : s.details,
  }));
}

export function uploadAndProcess() {
  const s = draftStore.get();
  if (!s.file || !s.details.title.trim() || s.busy) return;
  return drive(async (signal) => {
    patch({ busy: "Uploading", progress: 0, error: "" });
    let up = s.upload;
    if (!up) {
      up = await uploadAudio(s.file, s.details, { signal, onProgress: (progress) => patch({ progress }) });
      patch({ upload: up });
    }
    patch({ busy: "Starting", progress: null });
    const { job_id } = await startProcess(up, { diarize: s.diarize });
    const { details, fileName } = draftStore.get();
    patch({ jobId: job_id });
    writeActive({ jobId: job_id, upload: up, details, fileName });
    await finishJob(job_id, signal);
  });
}

export function cancelDraft() {
  const { jobId } = draftStore.get();
  controller?.abort();
  if (jobId) cancelProcess(jobId).catch(() => {}); // stops the server-side job at its next step
  writeActive(null);
}

export const clearError = () => patch({ error: "" });

export function resetDraft() {
  if (draftStore.get().busy) return;
  writeActive(null);
  draftStore.set(initial());
}

// Returns { payload, id } on success so the caller can navigate to the saved meeting.
export async function saveDraft() {
  const { result, upload, details, busy } = draftStore.get();
  if (!result || busy) return null;
  patch({ busy: "Saving", error: "" });
  try {
    const payload = { ...result, file_id: upload?.file_id ?? result.file_id, ...details, details };
    const saved = await saveMeeting(payload);
    draftStore.set(initial());
    return { payload, id: saved.id };
  } catch (e) {
    patch({ busy: "", error: `Saving failed: ${e.message}` });
    return null;
  }
}

// After a full page reload: pick up a transcription that is still running on the server.
function resume() {
  const saved = readActive();
  if (!saved?.jobId) return;
  draftStore.set((s) => ({
    ...s,
    details: saved.details ?? s.details,
    upload: saved.upload ?? null,
    fileName: saved.fileName ?? "",
    jobId: saved.jobId,
    busy: "Resuming",
  }));
  drive((signal) => finishJob(saved.jobId, signal));
}
resume();

// Only the upload itself can't survive a reload. Once transcription starts, it's safe.
window.addEventListener("beforeunload", (e) => {
  if (draftStore.get().busy === "Uploading") {
    e.preventDefault();
    e.returnValue = "";
  }
});
