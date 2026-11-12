import os
from dotenv import load_dotenv

load_dotenv()

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import routes_ask, routes_audio, routes_meetings, routes_process, routes_upload
from app.auth import authRoutes
from app.db.mongo_client import ensure_user_indexes

logger = logging.getLogger(__name__)


async def _ensure_indexes():
    try:
        await ensure_user_indexes()  # was defined but never called
    except Exception:
        logger.exception("Could not create user indexes (is MongoDB running?)")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Background task: never delay or block startup if MongoDB is slow or down.
    task = asyncio.create_task(_ensure_indexes())
    yield
    task.cancel()


app = FastAPI(lifespan=lifespan)

origins = [
    o.strip()
    for o in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")
    if o.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True, 
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(authRoutes.router)
app.include_router(routes_upload.router)
app.include_router(routes_meetings.router)
app.include_router(routes_process.router)
app.include_router(routes_ask.router)
app.include_router(routes_audio.router)


@app.get("/health")
async def health():
    return {"ok": True}
