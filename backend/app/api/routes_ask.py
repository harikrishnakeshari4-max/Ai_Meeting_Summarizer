from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel

from app.db.chroma_client import query_chunks
from app.db.mongo_client import meetings_collection
from app.services.answer_service import answer_from_context

router = APIRouter()

MEETING_FIELDS = {"file_id": 1, "title": 1, "meeting_date": 1, "participants": 1, "description": 1, "extraction": 1}


def _lines(items, fmt=str):
    return [f"- {fmt(i)}" for i in items or [] if i]


def build_overview(doc: dict) -> str:
    """The saved meeting summary as plain text. Passage search can't answer broad questions
    ("what is the topic?", "summarise") because no single passage states the answer; the summary can."""
    ex = doc.get("extraction") or {}
    parts = [f"Meeting title: {doc.get('title') or 'Untitled meeting'}"]
    for label, key in (("Date", "meeting_date"), ("Participants", "participants"), ("Agenda/notes", "description")):
        if doc.get(key):
            parts.append(f"{label}: {doc[key]}")
    if ex.get("summary"):
        parts.append(f"Summary: {ex['summary']}")
    for label, key, fmt in (
        ("Decisions", "decisions", str),
        ("Open questions", "open_questions", str),
        ("Action items", "action_items",
         lambda a: f"{a.get('task')} (owner: {a.get('owner') or 'n/a'}, deadline: {a.get('deadline') or 'n/a'})"
         if isinstance(a, dict) else str(a)),
    ):
        lines = _lines(ex.get(key), fmt)
        if lines:
            parts.append(f"{label}:\n" + "\n".join(lines))
    return "\n".join(parts)


class AskRequest(BaseModel):
    question: str
    meeting_id: Optional[str] = None  # set to search only this saved meeting; omit to search all


@router.post("/ask")
async def ask_meeting(request: AskRequest):
    question = request.question.strip()
    if not question:
        raise HTTPException(status_code=400, detail="Please enter a question.")

    # Resolve the selected meeting to the file_id its transcript chunks were indexed under.
    file_id = None
    overview = ""
    if request.meeting_id:
        if not ObjectId.is_valid(request.meeting_id):
            raise HTTPException(status_code=422, detail="Invalid meeting id")
        doc = await meetings_collection.find_one({"_id": ObjectId(request.meeting_id)}, MEETING_FIELDS)
        if doc is None:
            raise HTTPException(status_code=404, detail="Meeting not found")
        file_id = doc.get("file_id")
        overview = build_overview(doc)
        if not file_id:
            raise HTTPException(status_code=422, detail="This meeting has no indexed transcript to search.")

    try:
        n_results = 6 if file_id else 4  # a single meeting is a smaller pool, so allow a bit more context
        matches = (await run_in_threadpool(query_chunks, question, n_results, file_id)).get("matches", [])
        if not matches and not overview:
            return {
                "question": question,
                "meeting_id": request.meeting_id,
                "answer": "No relevant passages were found" + (" in this meeting." if file_id else "."),
                "sources": [],
            }
        passages = "\n\n".join(m["text"] for m in matches)
        # Scoped search: lead with the saved summary, then the best-matching transcript passages.
        context = f"{overview}\n\nTranscript passages:\n{passages}" if overview else passages
        answer = await run_in_threadpool(answer_from_context, question, context)
        return {"question": question, "meeting_id": request.meeting_id, "answer": answer, "sources": matches}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to answer question: {e}") from e
