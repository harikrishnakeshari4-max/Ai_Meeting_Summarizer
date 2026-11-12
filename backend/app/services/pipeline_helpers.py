def merge_transcript_and_speakers(whisper_segments, speaker_turns):
    """Assign each Whisper segment to the speaker whose turn overlaps it most."""
    merged = []
    for seg in whisper_segments:
        best_speaker, best_overlap = None, 0
        for turn in speaker_turns:
            overlap = min(seg["end"], turn["end"]) - max(seg["start"], turn["start"])
            if overlap > best_overlap:
                best_overlap, best_speaker = overlap, turn["speaker"]
        merged.append({**seg, "speaker": best_speaker or "unknown"})
    return merged


def has_text(segments) -> bool:
    return any(
        isinstance(s, dict) and isinstance(s.get("text"), str) and s["text"].strip()
        for s in segments
    )


def fallback_segments(segments) -> list:
    """Keep the Whisper text if speaker merging fails."""
    out = []
    for s in segments:
        text = (s.get("text") or "").strip()
        if text:
            out.append(
                {"start": float(s.get("start", 0)), "end": float(s.get("end", 0)), "text": text, "speaker": "Unknown"}
            )
    return out


def chunk_segments(segments, size=5):
    """Group consecutive segments into (text, start, end) chunks for the vector store."""
    for i in range(0, len(segments), size):
        group = segments[i : i + size]
        text = "\n".join(
            f'{s.get("speaker", "Unknown")}: {(s.get("text") or "").strip()}'
            for s in group
            if (s.get("text") or "").strip()
        )
        if text.strip():
            yield text, group[0].get("start", 0), group[-1].get("end", 0)
