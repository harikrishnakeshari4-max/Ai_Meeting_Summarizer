"""In-memory background jobs for the transcript pipeline.

Why: the pipeline takes minutes. Running it inside one HTTP request meant that anything that
interrupted that request (page reload, proxy/browser timeout, navigating away) lost the result.
Now the browser starts a job, gets an id immediately, and polls. The work runs in a worker
thread that does not depend on any client staying connected.

One worker thread: Whisper/pyannote are CPU-heavy, so jobs run one at a time, in order.
Jobs live in memory and are lost if the server restarts (the client is told so).
"""
import logging
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor

from app.services.errors import Cancelled, ProcessingError
from app.services.processing import process_audio

logger = logging.getLogger(__name__)

_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="pipeline")
_jobs: dict[str, dict] = {}
_lock = threading.Lock()
TTL_SECONDS = 6 * 3600
ACTIVE = ("queued", "running")


def _prune() -> None:  # caller holds _lock
    cutoff = time.time() - TTL_SECONDS
    for jid in [j for j, v in _jobs.items() if v["status"] not in ACTIVE and v["updated"] < cutoff]:
        del _jobs[jid]


def _set(job: dict, **changes) -> None:
    with _lock:
        job.update(changes, updated=time.time())


def submit(file_id: str) -> str:
    with _lock:
        _prune()
        for jid, job in _jobs.items():  # double-click protection: reuse the active job for this file
            if job["file_id"] == file_id and job["status"] in ACTIVE:
                return jid
        jid = uuid.uuid4().hex
        now = time.time()
        _jobs[jid] = {
            "job_id": jid, "file_id": file_id, "status": "queued", "stage": "Waiting in queue",
            "progress": None, "result": None, "error": None, "cancel": False,
            "created": now, "updated": now,
        }
    _executor.submit(_run, jid)
    return jid


def _run(jid: str) -> None:
    job = _jobs[jid]
    if job["cancel"]:
        _set(job, status="cancelled", stage="Cancelled")
        return
    _set(job, status="running", stage="Starting")

    def report(stage, pct=None):
        if job["cancel"]:
            raise Cancelled()
        _set(job, stage=stage, progress=pct)

    try:
        result = process_audio(job["file_id"], report)
        _set(job, status="done", stage="Done", progress=100, result=result)
    except Cancelled:
        _set(job, status="cancelled", stage="Cancelled")
    except ProcessingError as exc:
        _set(job, status="error", stage="Failed", error=exc.detail)
    except Exception as exc:
        logger.exception("Job %s crashed", jid)
        _set(job, status="error", stage="Failed", error=str(exc))


def get(jid: str):
    job = _jobs.get(jid)
    if not job:
        return None
    with _lock:
        view = {k: job[k] for k in ("job_id", "file_id", "status", "stage", "progress", "error")}
        if job["status"] == "done":
            view["result"] = job["result"]
    return view


def cancel(jid: str) -> bool:
    job = _jobs.get(jid)
    if not job:
        return False
    if job["status"] in ACTIVE:
        _set(job, cancel=True)  # stops at the next progress report / between pipeline steps
    return True
