from __future__ import annotations

from datetime import datetime
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from backend.auth.deps import get_current_user, get_current_user_optional
from backend.config import get_settings
from backend.database.models import ChatMessage, ChatSession, User, UserMedicalProfile, UserPersonalization
from backend.database.session import get_db
from backend.schemas.chat import (
    ChatRequest,
    ChatResponse,
    SessionActionResponse,
    SessionArchiveRequest,
    SessionDeleteRequest,
    SessionPinRequest,
)
from backend.schemas.personalization import ChatPersonalizationContext
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


VALID_RESPONSE_STYLES = {"default", "simple_clear", "detailed_technical", "friendly", "professional"}


def _clean_text(value: str | None, *, max_len: int) -> str:
    return str(value or "").strip()[:max_len]


def _serialize_personalization_row(row: UserPersonalization | None) -> dict[str, str | bool | list[str]]:
    if not row:
        return {
            "response_style": "default",
            "custom_instructions": "",
            "nickname": "",
            "occupation": "",
            "about_user": "",
            "allow_memory": False,
            "allow_chat_reference": False,
            "recent_chat_summaries": [],
        }
    response_style = str(row.response_style or "default").strip().lower()
    if response_style not in VALID_RESPONSE_STYLES:
        response_style = "default"
    return {
        "response_style": response_style,
        "custom_instructions": _clean_text(row.custom_instructions, max_len=4000),
        "nickname": _clean_text(row.nickname, max_len=120),
        "occupation": _clean_text(row.occupation, max_len=160),
        "about_user": _clean_text(row.about_user, max_len=2000),
        "allow_memory": bool(row.allow_memory),
        "allow_chat_reference": bool(row.allow_chat_reference),
        "recent_chat_summaries": [],
    }


def _merge_personalization_payload(
    base: dict[str, str | bool | list[str]],
    payload_personalization: ChatPersonalizationContext | None,
) -> dict[str, str | bool | list[str]]:
    merged = dict(base)
    if not payload_personalization:
        if not merged.get("allow_memory"):
            merged["allow_chat_reference"] = False
        return merged

    requested_style = str(payload_personalization.response_style or "default").strip().lower()
    merged["response_style"] = requested_style if requested_style in VALID_RESPONSE_STYLES else "default"
    merged["custom_instructions"] = _clean_text(payload_personalization.custom_instructions, max_len=4000)
    merged["nickname"] = _clean_text(payload_personalization.nickname, max_len=120)
    merged["occupation"] = _clean_text(payload_personalization.occupation, max_len=160)
    merged["about_user"] = _clean_text(payload_personalization.about_user, max_len=2000)
    merged["allow_memory"] = bool(payload_personalization.allow_memory)
    merged["allow_chat_reference"] = bool(payload_personalization.allow_chat_reference)
    merged["recent_chat_summaries"] = [
        _clean_text(item, max_len=300)
        for item in payload_personalization.recent_chat_summaries
        if _clean_text(item, max_len=300)
    ][:12]

    if not merged.get("allow_memory"):
        merged["allow_chat_reference"] = False
    return merged


def _personalization_context(
    db: Session,
    current_user: User | None,
    payload: ChatRequest,
) -> dict[str, str | bool | list[str]]:
    base_context = {
        "response_style": "default",
        "custom_instructions": "",
        "nickname": "",
        "occupation": "",
        "about_user": "",
        "allow_memory": False,
        "allow_chat_reference": False,
        "recent_chat_summaries": [],
    }
    if current_user:
        firebase_uid = (current_user.google_sub or "").strip()
        if firebase_uid:
            row = db.query(UserPersonalization).filter(UserPersonalization.firebase_uid == firebase_uid).first()
            base_context = _serialize_personalization_row(row)

    return _merge_personalization_payload(base_context, payload.personalization)


def _build_memory_context(
    db: Session,
    current_user: User | None,
    personalization_context: dict[str, str | bool | list[str]],
) -> list[str]:
    if not bool(personalization_context.get("allow_memory")):
        return []
    if not bool(personalization_context.get("allow_chat_reference")):
        return []

    if current_user:
        records = (
            db.query(ChatMessage)
            .filter(ChatMessage.user_id == current_user.id)
            .order_by(ChatMessage.created_at.desc())
            .limit(16)
            .all()
        )
        lines: list[str] = []
        for row in records:
            try:
                text = _clean_text(decrypt_text(row.encrypted_text), max_len=240)
            except Exception:
                continue
            if not text:
                continue
            role = "assistant" if row.role == "assistant" else "user"
            lines.append(f"{role}: {text}")
            if len(lines) >= 8:
                break
        lines.reverse()
        return lines

    recent = personalization_context.get("recent_chat_summaries")
    if isinstance(recent, list):
        return [_clean_text(item, max_len=300) for item in recent if _clean_text(item, max_len=300)][:8]
    return []


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

    is_follow_up = bool(payload.session_id)
    profile_context = _profile_context(db, current_user, payload)
    personalization_context = _personalization_context(db, current_user, payload)
    memory_context = _build_memory_context(db, current_user, personalization_context)

    session: ChatSession | None = None
    if current_user:
        session = _get_or_create_session(db, current_user, payload.session_id, incoming)
        is_follow_up = (
            db.query(ChatMessage.id)
            .filter(ChatMessage.session_id == session.id)
            .first()
            is not None
        )

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
        structured, response_text, emergency, language, selected_mode = await generate_medical_response(
            incoming,
            requested_language=payload.language,
            mode=payload.mode,
            profile_context=profile_context,
            personalization_context=personalization_context,
            memory_context=memory_context,
            is_follow_up=is_follow_up,
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
            mode=selected_mode,
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
        mode=selected_mode,
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
