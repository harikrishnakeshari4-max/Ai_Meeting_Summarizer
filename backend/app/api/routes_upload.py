import os
import uuid
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile

from app.services.storage import ALLOWED_EXTENSIONS, UPLOAD_DIR

router = APIRouter()

MAX_BYTES = int(os.getenv("MAX_UPLOAD_MB", "2048")) * 1024 * 1024
CHUNK = 1024 * 1024


@router.post("/upload-audio")
async def upload_audio(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    extension = Path(file.filename).suffix.lower()
    if extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Unsupported audio format")

    file_id = str(uuid.uuid4())
    dest = UPLOAD_DIR / f"{file_id}{extension}"
    size = 0

    # Chunked + awaited reads: the old blocking copyfileobj froze the whole server during big uploads.
    try:
        with dest.open("wb") as buffer:
            while chunk := await file.read(CHUNK):
                size += len(chunk)
                if size > MAX_BYTES:
                    raise HTTPException(status_code=413, detail=f"File too large (limit {MAX_BYTES // 1048576} MB)")
                buffer.write(chunk)
    except HTTPException:
        dest.unlink(missing_ok=True)
        raise
    except OSError as exc:
        dest.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail="Could not save uploaded audio") from exc
    finally:
        await file.close()

    return {"file_id": file_id, "filename": dest.name, "path": str(dest)}
