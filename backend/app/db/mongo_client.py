import os

import motor.motor_asyncio
from pymongo import ASCENDING

client = motor.motor_asyncio.AsyncIOMotorClient(os.getenv("MONGODB_URI") or "mongodb://localhost:27017")
db = client.meeting_intelligence
meetings_collection = db.meetings
users_collection = db.users


async def ensure_user_indexes():
    await users_collection.create_index([("email", ASCENDING)], unique=True)
