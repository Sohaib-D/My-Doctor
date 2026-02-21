from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException

from backend.config import get_settings
from backend.schemas.chat import ChatRequest, ChatResponse
from backend.schemas.review import SendFeedbackRequest, SendFeedbackResponse
from backend.services.groq_service import chat_with_groq
from backend.services.review_service import send_feedback_email

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


def _send_feedback(payload: SendFeedbackRequest) -> SendFeedbackResponse:
    settings = get_settings()
    try:
        send_feedback_email(
            settings=settings,
            feedback=str(payload.feedback or "").strip(),
            user_email=payload.user_email,
            user_name=payload.user_name,
            timestamp=datetime.now(timezone.utc).isoformat(),
        )
        return SendFeedbackResponse()
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Unable to send feedback right now. {str(exc)}")


@router.post("/send-feedback", response_model=SendFeedbackResponse)
async def send_feedback(payload: SendFeedbackRequest):
    return _send_feedback(payload)


# Backward-compatible endpoint for older frontend code.
@router.post("/send-review", response_model=SendFeedbackResponse)
async def send_review(payload: SendFeedbackRequest):
    return _send_feedback(payload)
