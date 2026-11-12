from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from app.services.errors import ProcessingError
from app.services.storage import resolve_upload

router = APIRouter()

MEDIA_TYPES = {
    ".mp3": "audio/mpeg", ".wav": "audio/wav", ".m4a": "audio/mp4",
    ".ogg": "audio/ogg", ".webm": "audio/webm", ".mp4": "video/mp4",
}


@router.get("/audio/{file_id}")
def get_audio(file_id: str):
    """Stream an uploaded recording. FileResponse answers HTTP Range requests (206), which is
    what lets the browser seek (click a transcript line -> jump there) without downloading it all."""
    try:
        path = resolve_upload(file_id)  # validates the uuid; the client never supplies a path
    except ProcessingError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return FileResponse(
        path,
        media_type=MEDIA_TYPES.get(path.suffix.lower(), "application/octet-stream"),
        headers={"Cache-Control": "private, max-age=3600"},
    )
