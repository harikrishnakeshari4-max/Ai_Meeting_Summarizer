import glob
import os
import subprocess
import tempfile
import threading

from dotenv import load_dotenv

load_dotenv()


def _setup_ffmpeg() -> None:
    """Make FFmpeg's DLLs/binaries visible. Set FFMPEG_BIN, or rely on the WinGet auto-detect."""
    candidates = []
    if os.getenv("FFMPEG_BIN"):
        candidates.append(os.environ["FFMPEG_BIN"])
    local = os.environ.get("LOCALAPPDATA")
    if local:
        candidates += glob.glob(os.path.join(local, "Microsoft", "WinGet", "Packages", "Gyan.FFmpeg*", "*", "bin"))
    for path in candidates:
        if os.path.isdir(path):
            if hasattr(os, "add_dll_directory"):
                os.add_dll_directory(path)
            os.environ["PATH"] = path + os.pathsep + os.environ.get("PATH", "")
            return


_setup_ffmpeg()

_pipeline = None
_pipeline_lock = threading.Lock()


def _get_pipeline():
    """Load pyannote on first use, so the server starts fast and boots even without a token."""
    global _pipeline
    with _pipeline_lock:
        if _pipeline is None:
            from pyannote.audio import Pipeline

            _pipeline = Pipeline.from_pretrained(
                "pyannote/speaker-diarization-community-1",
                token=os.getenv("HF_TOKEN") or os.getenv("hug"),
            )
        return _pipeline


def normalize_audio(audio_path: str) -> str:
    # Unique temp file per call. The old fixed name let two runs overwrite/delete each other's audio.
    fd, output_path = tempfile.mkstemp(prefix="meeting_", suffix=".wav")
    os.close(fd)
    command = [
        "ffmpeg", "-y", "-i", audio_path, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", output_path,
    ]
    try:
        subprocess.run(command, check=True, capture_output=True, text=True)
    except subprocess.CalledProcessError as exc:
        os.remove(output_path)
        raise RuntimeError(f"ffmpeg failed: {(exc.stderr or '')[-500:]}") from exc
    except FileNotFoundError as exc:
        os.remove(output_path)
        raise RuntimeError("ffmpeg not found. Install it or set FFMPEG_BIN.") from exc
    return output_path


def _num_speakers():
    """Optional: set DIARIZATION_NUM_SPEAKERS when you always know it (faster and usually more accurate)."""
    raw = (os.getenv("DIARIZATION_NUM_SPEAKERS") or "").strip()
    return int(raw) if raw.isdigit() and int(raw) > 0 else None


def _diarize_pyannote(normalized_path: str):
    num = _num_speakers()
    output = _get_pipeline()(normalized_path, **({"num_speakers": num} if num else {}))
    return [
        {"start": turn.start, "end": turn.end, "speaker": speaker}
        for turn, speaker in output.speaker_diarization
    ]


def _diarize_lib(normalized_path: str):
    """Backend 'diarize' (pip install diarize): Silero VAD + WeSpeaker + spectral clustering, CPU-oriented."""
    from diarize import diarize as run  # imported lazily; only needed for this backend

    num = _num_speakers()
    result = run(normalized_path, **({"num_speakers": num} if num else {}))
    return [{"start": float(seg.start), "end": float(seg.end), "speaker": str(seg.speaker)} for seg in result.segments]


_BACKENDS = {"pyannote": _diarize_pyannote, "diarize": _diarize_lib}


def diarize(audio_path: str):
    """Return [{start, end, speaker}, ...]. Backend chosen by DIARIZATION_BACKEND (default: pyannote)."""
    name = (os.getenv("DIARIZATION_BACKEND") or "pyannote").strip().lower()
    backend = _BACKENDS.get(name)
    if backend is None:
        raise RuntimeError(f"Unknown DIARIZATION_BACKEND '{name}'. Use one of: {', '.join(_BACKENDS)}")

    normalized_path = normalize_audio(audio_path)
    try:
        return backend(normalized_path)
    finally:
        if os.path.exists(normalized_path):
            os.remove(normalized_path)
