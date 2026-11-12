import logging
from pathlib import Path

import chromadb

logger = logging.getLogger(__name__)

BACKEND_DIR = Path(__file__).resolve().parents[2]
DB_PATH = BACKEND_DIR / "chroma_db"

chroma_client = chromadb.PersistentClient(path=str(DB_PATH))
collection = chroma_client.get_or_create_collection(name="meeting_chunks")


def add_chunks(chunk_texts: list[str], chunk_ids: list[str], metadatas: list[dict]):
    if not chunk_texts:
        return
    collection.upsert(ids=chunk_ids, documents=chunk_texts, metadatas=metadatas)
    logger.info("Saved %d chunks. Total chunks: %d", len(chunk_texts), collection.count())


def query_chunks(question: str, n_results: int = 4, file_id: str | None = None):
    """Semantic search. With file_id, only that meeting's transcript chunks are searched."""
    # (The old file defined this function twice; the second definition silently won. Only it is kept.)
    question = question.strip()
    if not question:
        return {"question": question, "matches": [], "total_chunks": 0, "message": "Please enter a question."}

    where = {"file_id": file_id} if file_id else None
    if where:
        total = len(collection.get(where=where, include=[])["ids"])  # count only this meeting's chunks
    else:
        total = collection.count()
    if total == 0:
        return {
            "question": question, "matches": [], "total_chunks": 0,
            "message": "No transcript chunks stored for this meeting. Process the audio again."
            if where else "No transcript chunks stored. Process the audio again.",
        }

    results = collection.query(
        query_texts=[question],
        n_results=min(n_results, total),
        where=where,
        include=["documents", "metadatas", "distances"],
    )
    documents = results.get("documents", [[]])[0]
    metadatas = results.get("metadatas", [[]])[0]
    distances = results.get("distances", [[]])[0]

    seen, matches = set(), []  # drop duplicate passages, keep the best-ranked
    for document, metadata, distance in zip(documents, metadatas, distances):
        key = " ".join(document.split()).lower()
        if key in seen:
            continue
        seen.add(key)
        matches.append({"text": document, "metadata": metadata, "distance": distance})

    return {
        "question": question,
        "matches": matches,
        "total_chunks": total,
        "message": "Matching passages retrieved." if matches else "No matching passages found.",
    }
