from app.services.transcription import transcribe
from app.services.diarization import diarize
from app.services.extraction import extract_structured_info
from backend.app.db.chroma_client import add_chunks
from app.services.pipeline_helpers import merge_transcript_and_speakers, chunk_transcript

def process_meeting(audio_path: str, meeting_id: str):
    whisper_segments = transcribe(audio_path)
    speaker_turns = diarize(audio_path)
    merged = merge_transcript_and_speakers(whisper_segments, speaker_turns)

    full_text = " ".join(s["text"] for s in merged)
    structured = extract_structured_info(full_text)

    chunks = chunk_transcript(merged)
    ids = [f"{meeting_id}_{i}" for i in range(len(chunks))]
    metadatas = [{"meeting_id": meeting_id} for _ in chunks]
    add_chunks(chunks, ids, metadatas)

    return {"transcript": merged, **structured}