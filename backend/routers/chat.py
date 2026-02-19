from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from backend.auth.deps import get_current_user
from backend.config import get_settings
from backend.database.models import ChatMessage, ChatSession, User
from backend.database.session import get_db
from backend.schemas.chat import ChatRequest, ChatResponse
from backend.services.chat_service import generate_medical_response, serialize_structured
from backend.services.tts_service import build_tts_bytes, iter_audio_chunks
from backend.utils.crypto import decrypt_text, encrypt_text
from backend.utils.logging import logger
from backend.utils.rate_limit import InMemorySlidingWindowLimiter


settings = get_settings()
limiter = InMemorySlidingWindowLimiter(max_requests=settings.rate_limit_per_minute, window_seconds=60)

router = APIRouter(tags=["chat"])


def _get_or_create_session(db: Session, user: User, session_id: str | None, first_message: str) -> ChatSession:
    if session_id:
        session = (
            db.query(ChatSession)
            .filter(ChatSession.id == session_id, ChatSession.user_id == user.id)
            .first()
        )
        if session:
            return session

    session = ChatSession(
        user_id=user.id,
        title=(first_message[:80] + "...") if len(first_message) > 80 else first_message,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


@router.post("/chat", response_model=ChatResponse)
async def chat(
    payload: ChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    allowed, retry_after = limiter.check(current_user.id)
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Rate limit exceeded. Try again in {retry_after}s.",
            headers={"Retry-After": str(retry_after)},
        )

    incoming = (payload.message or payload.voice_text or "").strip()
    if not incoming:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Message is required.")

    session = _get_or_create_session(db, current_user, payload.session_id, incoming)

    user_message = ChatMessage(
        session_id=session.id,
        user_id=current_user.id,
        role="user",
        encrypted_text=encrypt_text(incoming),
        language=payload.language or "en",
        emergency=False,
    )
    db.add(user_message)
    db.commit()

    try:
        structured, response_text, emergency, language = await generate_medical_response(
            incoming,
            requested_language=payload.language,
        )
    except Exception as exc:
        logger.exception("Chat generation failed: %s", str(exc))
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Unable to generate response right now. Please retry.",
        ) from exc

    assistant_message = ChatMessage(
        session_id=session.id,
        user_id=current_user.id,
        role="assistant",
        encrypted_text=encrypt_text(response_text),
        encrypted_payload=encrypt_text(serialize_structured(structured)),
        language=language,
        emergency=emergency,
    )
    db.add(assistant_message)
    db.commit()
    db.refresh(assistant_message)

    tts_url = f"/voice_stream?message_id={assistant_message.id}"

    return ChatResponse(
        session_id=session.id,
        message_id=assistant_message.id,
        response=response_text,
        structured=structured,
        emergency=emergency,
        language=language,
        tts_url=tts_url,
    )


@router.get("/voice_stream")
def voice_stream(
    message_id: str = Query(..., description="Assistant message ID returned by /chat"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    message = (
        db.query(ChatMessage)
        .filter(
            ChatMessage.id == message_id,
            ChatMessage.user_id == current_user.id,
            ChatMessage.role == "assistant",
        )
        .first()
    )
    if not message:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found.")

    try:
        plain_text = decrypt_text(message.encrypted_text)
        audio_bytes = build_tts_bytes(plain_text, message.language)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"TTS generation failed: {str(exc)}",
        )

    return StreamingResponse(iter_audio_chunks(audio_bytes), media_type="audio/mpeg")
