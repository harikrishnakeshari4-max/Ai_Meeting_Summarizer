import uuid
from pathlib import Path

from app.services.errors import ProcessingError

BACKEND_DIR = Path(__file__).resolve().parents[2]
UPLOAD_DIR = BACKEND_DIR / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_EXTENSIONS = {".wav", ".mp3", ".m4a", ".ogg", ".webm", ".mp4"}


def resolve_upload(file_id: str) -> Path:
    """Find an uploaded file by id. The client never gets to choose a filesystem path."""
    try:
        canonical = str(uuid.UUID(str(file_id)))
    except ValueError:
        raise ProcessingError(422, "Invalid file_id") from None

    for candidate in UPLOAD_DIR.glob(f"{canonical}*"):
        if candidate.is_file() and candidate.suffix.lower() in ALLOWED_EXTENSIONS:
            return candidate
    raise ProcessingError(404, f"No uploaded file with id {canonical}")
