from bson import ObjectId
from fastapi import APIRouter, HTTPException

from app.db.mongo_client import meetings_collection

router = APIRouter()


@router.post("/meetings")
async def save_meeting(meeting: dict):
    result = await meetings_collection.insert_one(meeting)
    return {"id": str(result.inserted_id)}


@router.get("/meetings/{meeting_id}")
async def get_meeting(meeting_id: str):
    # Previously: a bad id or missing meeting crashed with a 500.
    if not ObjectId.is_valid(meeting_id):
        raise HTTPException(status_code=422, detail="Invalid meeting id")
    doc = await meetings_collection.find_one({"_id": ObjectId(meeting_id)})
    if doc is None:
        raise HTTPException(status_code=404, detail="Meeting not found")
    doc["_id"] = str(doc["_id"])
    return doc
