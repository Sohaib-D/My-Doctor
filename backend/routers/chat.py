from fastapi import APIRouter, HTTPException

from backend.schemas.chat import ChatRequest, ChatResponse
from backend.services.groq_service import chat_with_groq

router = APIRouter(tags=["chat"])


@router.post("/chat", response_model=ChatResponse)
async def chat(payload: ChatRequest):
    """Simple passthrough to the Groq LLM service.

    This mirrors the original project: no database, no personalization,
    just call `chat_with_groq` and return its result.  Keeps emergency checks
    and the rich system prompt defined in groq_service.
    """
    message = str(payload.message or "").strip()
    if not message:
        raise HTTPException(status_code=400, detail="Message cannot be empty.")
    if len(message) > 2000:
        raise HTTPException(status_code=400, detail="Message too long. Maximum 2000 characters.")

    try:
        return await chat_with_groq(message, session_id=payload.session_id)
    except HTTPException:
        raise
    except Exception as exc:
        # generic fallback similar to old main.py
        raise HTTPException(status_code=502, detail=str(exc))
