import os
import requests


def answer_from_context(question: str, context: str) -> str:
    """Generate a concise answer using the meeting transcript and Ollama."""

    url = os.getenv(
        "OLLAMA_URL",
        "http://localhost:11434"
    )
    model = os.getenv(
        "OLLAMA_MODEL",
        "llama3.2"
    )

    prompt = f"""
You are an assistant for meeting transcripts.

Answer the question using only the meeting information below (it may include a summary and transcript passages).
Do not invent information.
If the answer is missing, say:
"That information was not found in the meeting transcript."

Meeting information:
{context}

Question: {question}

Provide a concise, direct answer.
"""

    response = requests.post(
        f"{url.rstrip('/')}/api/generate",
        json={
            "model": model,
            "prompt": prompt,
            "stream": False
        },
        timeout=120
    )

    response.raise_for_status()

    data = response.json()
    answer = data.get("response", "").strip()

    if not answer:
        raise RuntimeError("Ollama returned an empty answer.")

    return answer
