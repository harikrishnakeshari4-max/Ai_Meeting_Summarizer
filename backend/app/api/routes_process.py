from typing import Optional

from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel

from app.services import jobs
from app.services.errors import ProcessingError
from app.services.processing import process_audio
from app.services.storage import resolve_upload

router = APIRouter()


class ProcessBody(BaseModel):
    file_id: str
    path: Optional[str] = None  # accepted for backward compatibility, ignored (never trust client paths)


def _http(exc: ProcessingError) -> HTTPException:
    return HTTPException(status_code=exc.status_code, detail=exc.detail)


# --- Background jobs (used by the web UI) -----------------------------------
@router.post("/process/jobs", status_code=202)
async def start_job(body: ProcessBody):
    try:
        resolve_upload(body.file_id)  # fail fast if the upload is missing
    except ProcessingError as exc:
        raise _http(exc) from exc
    return {"job_id": jobs.submit(body.file_id)}


@router.get("/process/jobs/{job_id}")
async def job_status(job_id: str):
    job = jobs.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Unknown job (the server may have restarted)")
    return job


@router.delete("/process/jobs/{job_id}")
async def cancel_job(job_id: str):
    if not jobs.cancel(job_id):
        raise HTTPException(status_code=404, detail="Unknown job")
    return {"cancelled": True}


# --- Legacy blocking endpoint (kept for scripts/curl) -----------------------
@router.post("/process")
async def process(body: ProcessBody):
    try:
        return await run_in_threadpool(process_audio, body.file_id)
    except ProcessingError as exc:
        raise _http(exc) from exc
