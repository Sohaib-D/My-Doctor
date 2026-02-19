from __future__ import annotations

from datetime import datetime
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from backend.auth.deps import get_current_user, get_current_user_optional
from backend.config import get_settings
from backend.database.models import ChatMessage, ChatSession, User, UserMedicalProfile
from backend.database.session import get_db
from backend.schemas.chat import (
    ChatRequest,
    ChatResponse,
    SessionActionResponse,
    SessionArchiveRequest,
    SessionDeleteRequest,
    SessionPinRequest,
)
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
            if session.is_archived:
                session.is_archived = False
            session.updated_at = datetime.utcnow()
            db.commit()
            db.refresh(session)
            return session

    session = ChatSession(
        user_id=user.id,
        title=(first_message[:80] + "...") if len(first_message) > 80 else first_message,
        updated_at=datetime.utcnow(),
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


def _serialize_profile(row: UserMedicalProfile | None) -> dict[str, str | int]:
    if not row:
        return {}
    payload: dict[str, str | int] = {}
    if row.age is not None:
        payload["age"] = row.age
    if row.gender:
        payload["gender"] = row.gender
    if row.medical_history:
        payload["medical_history"] = row.medical_history
    if row.allergies:
        payload["allergies"] = row.allergies
    if row.medications:
        payload["medications"] = row.medications
    if row.chronic_conditions:
        payload["chronic_conditions"] = row.chronic_conditions
    return payload


def _profile_context(db: Session, current_user: User | None, payload: ChatRequest) -> dict[str, str | int]:
    context: dict[str, str | int] = {}
    if current_user:
        row = (
            db.query(UserMedicalProfile)
            .filter(UserMedicalProfile.firebase_uid == current_user.google_sub)
            .first()
        )
        context.update(_serialize_profile(row))
    if payload.profile:
        for key, value in payload.profile.model_dump(exclude_none=True).items():
            mapped_key = "medications" if key == "current_medications" else key
            if isinstance(value, str):
                text = value.strip()
                if text:
                    context[mapped_key] = text
            elif value is not None:
                context[mapped_key] = value
    return context


@router.post("/chat", response_model=ChatResponse)
async def chat(
    payload: ChatRequest,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    if current_user:
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

    profile_context = _profile_context(db, current_user, payload)

    session: ChatSession | None = None
    if current_user:
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
        session.updated_at = datetime.utcnow()
        db.commit()

    try:
        structured, response_text, emergency, language = await generate_medical_response(
            incoming,
            requested_language=payload.language,
            profile_context=profile_context,
        )
    except Exception as exc:
        logger.exception("Chat generation failed: %s", str(exc))
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Unable to generate response right now. Please retry.",
        ) from exc

    if not current_user:
        return ChatResponse(
            session_id=payload.session_id or f"guest-{uuid.uuid4()}",
            message_id=f"guest-{uuid.uuid4()}",
            response=response_text,
            structured=structured,
            emergency=emergency,
            language=language,
            tts_url=None,
        )

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
    session.updated_at = datetime.utcnow()
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


def _get_owned_session(db: Session, user: User, session_id: str) -> ChatSession:
    session = (
        db.query(ChatSession)
        .filter(ChatSession.id == session_id, ChatSession.user_id == user.id)
        .first()
    )
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found.")
    return session


@router.post("/chat/pin", response_model=SessionActionResponse)
def pin_chat(
    payload: SessionPinRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = _get_owned_session(db, current_user, payload.session_id)
    session.is_pinned = payload.is_pinned
    session.pinned_at = datetime.utcnow() if payload.is_pinned else None
    session.updated_at = datetime.utcnow()
    db.commit()
    return SessionActionResponse(session_id=session.id)


@router.post("/chat/archive", response_model=SessionActionResponse)
def archive_chat(
    payload: SessionArchiveRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = _get_owned_session(db, current_user, payload.session_id)
    session.is_archived = payload.is_archived
    session.updated_at = datetime.utcnow()
    db.commit()
    return SessionActionResponse(session_id=session.id)


@router.post("/chat/delete", response_model=SessionActionResponse)
def delete_chat(
    payload: SessionDeleteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = _get_owned_session(db, current_user, payload.session_id)
    db.delete(session)
    db.commit()
    return SessionActionResponse(session_id=payload.session_id)


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
        ) from exc

    return StreamingResponse(iter_audio_chunks(audio_bytes), media_type="audio/mpeg")
