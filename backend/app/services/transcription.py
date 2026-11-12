import os

os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")

from faster_whisper import WhisperModel  # noqa: E402

model = WhisperModel(
    os.getenv("WHISPER_MODEL", "base"),
    device=os.getenv("WHISPER_DEVICE", "cpu"),
    compute_type=os.getenv("WHISPER_COMPUTE", "int8"),
    cpu_threads=int(os.getenv("WHISPER_THREADS", "4")),
    num_workers=1,
)


def _run(audio_path: str, vad_filter: bool, on_progress) -> list:
    segments, info = model.transcribe(audio_path, beam_size=1, vad_filter=vad_filter)
    total = float(getattr(info, "duration", 0) or 0)
    results = []
    for seg in segments:  # lazy generator: this loop is where the time is spent
        text = (seg.text or "").strip()
        if text:
            results.append({"start": float(seg.start), "end": float(seg.end), "text": text})
        if on_progress and total:
            on_progress(min(99, int(seg.end / total * 100)))  # may raise Cancelled
    return results


def transcribe(audio_path: str, on_progress=None) -> list:
    """Transcribe audio, retrying without VAD if no text is detected."""
    if not os.path.isfile(audio_path):
        raise FileNotFoundError(f"Audio file does not exist: {audio_path}")
    if os.path.getsize(audio_path) == 0:
        raise ValueError("The uploaded audio file is empty.")

    results = _run(audio_path, True, on_progress)
    if not results:
        results = _run(audio_path, False, on_progress)
    return results
