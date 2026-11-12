import logging
import pathlib

from app.db.chroma_client import add_chunks
from app.services.diarization import diarize
from app.services.errors import Cancelled, ProcessingError
from app.services.extraction import extract_structured_info
from app.services.pipeline_helpers import (
    chunk_segments,
    fallback_segments,
    has_text,
    merge_transcript_and_speakers,
)
from app.services.storage import resolve_upload
from app.services.transcription import transcribe

logger = logging.getLogger(__name__)


def process_audio(file_id: str, report=lambda stage, pct=None: None) -> dict:
    """Run the whole pipeline. `report(stage, pct)` is called as work progresses
    and may raise Cancelled to stop the job between steps."""
    audio_path: pathlib.Path = resolve_upload(file_id)
    if audio_path.stat().st_size == 0:
        raise ProcessingError(422, "The uploaded audio file is empty.")

    # 1. Transcribe
    report("Transcribing", 0)
    try:
        segments = transcribe(str(audio_path), on_progress=lambda p: report("Transcribing", p))
    except Cancelled:
        raise
    except Exception as exc:
        logger.exception("Transcription failed")
        raise ProcessingError(500, f"Transcription failed: {exc}") from exc

    if not segments or not has_text(segments):
        raise ProcessingError(
            422,
            "No speech could be transcribed from this file. Check that the recording contains "
            "audible speech, uses a supported format, and has good audio quality.",
        )

    # 2. Speaker labels. If diarization fails, keep the transcript.
    report("Identifying speakers", None)
    try:
        merged = merge_transcript_and_speakers(segments, diarize(str(audio_path)))
    except Exception:
        logger.exception("Speaker diarization failed; using unknown speaker labels")
        merged = []
    if not merged or not has_text(merged):
        merged = fallback_segments(segments)
    if not merged:
        raise ProcessingError(422, "The transcript is empty after processing.")

    full_text = "\n".join(
        f'{s.get("speaker", "Unknown")}: {s["text"].strip()}'
        for s in merged
        if (s.get("text") or "").strip()
    ).strip()
    if not full_text:
        raise ProcessingError(422, "No usable transcript text was generated.")
    logger.info("Transcript ready: %d segments, %d characters", len(merged), len(full_text))

    # 3. Summary / decisions / action items via Ollama
    report("Summarising", None)
    try:
        extraction = extract_structured_info(full_text)
    except Exception as exc:
        logger.exception("Meeting information extraction failed")
        raise ProcessingError(502, f"Meeting extraction failed: {exc}") from exc

    # 4. Index chunks for /ask
    report("Indexing", None)
    chunks = list(chunk_segments(merged))
    if chunks:
        try:
            add_chunks(
                chunk_texts=[c[0] for c in chunks],
                chunk_ids=[f"{file_id}_{i}" for i in range(len(chunks))],
                metadatas=[{"file_id": file_id, "start": c[1], "end": c[2]} for c in chunks],
            )
        except Exception as exc:
            logger.exception("Failed to store transcript chunks")
            raise ProcessingError(500, f"Failed to store transcript: {exc}") from exc

    return {"file_id": file_id, "segments": merged, "extraction": extraction}
