from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone
import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import delete, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from backend.auth.deps import get_current_user_optional
from backend.database.models import ChatMessage, User
from backend.database.session import get_db
from backend.schemas.chat import (
    ChatRequest,
    ChatResponse,
    HistoryResponse,
    SessionActionResponse,
    SessionArchiveRequest,
    SessionDeleteRequest,
    SessionListResponse,
    SessionPinRequest,
    ShareSessionResponse,
    SharedConversationResponse,
)
from backend.services.groq_service import (
    archive_session,
    bind_guest_device_to_session,
    chat_with_groq,
    create_share_link,
    delete_session,
    get_session_flags_snapshot,
    get_session_history,
    get_shared_conversation,
    hydrate_session_history,
    list_session_summaries,
    pin_session,
)


router = APIRouter(tags=["chat"])
logger = logging.getLogger(__name__)


def _normalize_session_id(value: str | None) -> str:
    return str(value or "").strip()


def _safe_datetime(value: datetime | None) -> datetime:
    return value or datetime.now(timezone.utc)


def _trim_title(text: str, max_len: int = 80) -> str:
    cleaned = str(text or "").replace("\n", " ").strip()
    if not cleaned:
        return "New chat"
    return cleaned[:max_len]


def _derive_title(rows: list[ChatMessage]) -> str:
    for row in rows:
        if row.role == "user" and str(row.text or "").strip():
            return _trim_title(row.text)
    for row in rows:
        if str(row.text or "").strip():
            return _trim_title(row.text)
    return "New chat"


def _runtime_seed_from_rows(rows: list[ChatMessage]) -> list[dict]:
    seed: list[dict] = []
    for row in rows:
        if row.role not in {"user", "assistant"}:
            continue
        text = str(row.text or "").strip()
        if not text:
            continue
        seed.append({"role": row.role, "text": text})
    return seed


async def _hydrate_runtime_session(
    session_id: str,
    rows: list[ChatMessage],
    *,
    replace: bool = False,
) -> None:
    if not session_id or not rows:
        return
    await hydrate_session_history(
        session_id,
        _runtime_seed_from_rows(rows),
        replace=replace,
    )


def _build_user_turn_text(message: str, attachment_count: int) -> str:
    cleaned = str(message or "").strip()
    if cleaned:
        return cleaned
    if attachment_count <= 0:
        return ""
    label = "attachment" if attachment_count == 1 else "attachments"
    return f"[{attachment_count} {label} sent]"


def _load_user_session_rows(db: Session, *, user_id: int, session_id: str) -> list[ChatMessage]:
    stmt = (
        select(ChatMessage)
        .where(ChatMessage.user_id == user_id, ChatMessage.session_id == session_id)
        .order_by(ChatMessage.created_at.asc(), ChatMessage.id.asc())
    )
    return list(db.execute(stmt).scalars().all())


def _store_chat_turn(
    db: Session,
    *,
    user: User,
    session_id: str,
    user_text: str,
    assistant_text: str,
) -> None:
    entries: list[ChatMessage] = []
    normalized_user_text = str(user_text or "").strip()
    normalized_assistant_text = str(assistant_text or "").strip()
    normalized_session_id = _normalize_session_id(session_id) or None
    normalized_user_email = user.email.lower()

    if normalized_user_text:
        entries.append(
            ChatMessage(
                user_id=user.id,
                user_email=normalized_user_email,
                session_id=normalized_session_id,
                role="user",
                text=normalized_user_text,
            )
        )
    if normalized_assistant_text:
        entries.append(
            ChatMessage(
                user_id=user.id,
                user_email=normalized_user_email,
                session_id=normalized_session_id,
                role="assistant",
                text=normalized_assistant_text,
            )
        )
    if not entries:
        return
    db.add_all(entries)
    db.commit()


def _user_session_exists(db: Session, *, user_id: int, session_id: str) -> bool:
    stmt = (
        select(ChatMessage.id)
        .where(ChatMessage.user_id == user_id, ChatMessage.session_id == session_id)
        .limit(1)
    )
    return db.execute(stmt).scalar_one_or_none() is not None


def _session_history_payload(session_id: str, rows: list[ChatMessage]) -> dict:
    messages = [
        {
            "id": str(row.id),
            "role": row.role,
            "text": str(row.text or ""),
            "created_at": row.created_at,
        }
        for row in rows
        if row.role in {"user", "assistant"} and str(row.text or "").strip()
    ]
    return {"session_id": session_id, "messages": messages}


@router.post("/chat", response_model=ChatResponse)
async def chat(
    payload: ChatRequest,
    current_user: User | None = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    message = str(payload.message or "").strip()
    attachments = payload.attachments or []
    if not message and not attachments:
        raise HTTPException(status_code=400, detail="Message cannot be empty.")
    if len(message) > 2000:
        raise HTTPException(status_code=400, detail="Message too long. Maximum 2000 characters.")

    requested_session_id = _normalize_session_id(payload.session_id)
    if current_user and requested_session_id:
        try:
            previous_rows = _load_user_session_rows(
                db,
                user_id=current_user.id,
                session_id=requested_session_id,
            )
            if previous_rows:
                await _hydrate_runtime_session(
                    requested_session_id,
                    previous_rows,
                    replace=True,
                )
        except SQLAlchemyError:
            db.rollback()
            logger.exception("Failed loading persisted history for session restore.")

    try:
        response = await chat_with_groq(
            message,
            session_id=payload.session_id,
            attachments=attachments,
        )
        if not current_user and response.session_id:
            try:
                await bind_guest_device_to_session(response.session_id, payload.guest_device_id)
            except Exception:
                logger.exception("Failed binding guest device id to runtime session.")
        if current_user and response.session_id:
            stored_user_text = _build_user_turn_text(message, len(attachments))
            try:
                _store_chat_turn(
                    db,
                    user=current_user,
                    session_id=response.session_id,
                    user_text=stored_user_text,
                    assistant_text=response.response,
                )
            except SQLAlchemyError:
                db.rollback()
                logger.exception("Failed to store persisted chat turn.")
        return response
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@router.get("/sessions", response_model=SessionListResponse)
async def sessions(
    current_user: User | None = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    if not current_user:
        return {"sessions": await list_session_summaries()}

    stmt = (
        select(ChatMessage)
        .where(
            ChatMessage.user_id == current_user.id,
            ChatMessage.session_id.is_not(None),
            ChatMessage.session_id != "",
            ChatMessage.text.is_not(None),
            ChatMessage.text != "",
            ChatMessage.role.in_(("user", "assistant")),
        )
        .order_by(ChatMessage.created_at.asc(), ChatMessage.id.asc())
    )
    rows = list(db.execute(stmt).scalars().all())
    if not rows:
        return {"sessions": []}

    grouped: dict[str, list[ChatMessage]] = defaultdict(list)
    for row in rows:
        normalized_session_id = _normalize_session_id(row.session_id)
        if not normalized_session_id:
            continue
        grouped[normalized_session_id].append(row)

    sessions_payload: list[dict] = []
    for session_id, session_rows in grouped.items():
        await _hydrate_runtime_session(session_id, session_rows)
        flags = await get_session_flags_snapshot(session_id)
        pinned_at_raw = flags.get("pinned_at")
        pinned_at = (
            datetime.fromtimestamp(float(pinned_at_raw), tz=timezone.utc)
            if pinned_at_raw
            else None
        )
        created_at = _safe_datetime(session_rows[0].created_at)
        last_message_at = _safe_datetime(session_rows[-1].created_at)
        message_count = len(
            [
                row
                for row in session_rows
                if row.role in {"user", "assistant"} and str(row.text or "").strip()
            ]
        )
        sessions_payload.append(
            {
                "id": session_id,
                "title": _derive_title(session_rows),
                "created_at": created_at,
                "last_message_at": last_message_at,
                "message_count": message_count,
                "is_pinned": bool(flags.get("is_pinned")),
                "is_archived": bool(flags.get("is_archived")),
                "pinned_at": pinned_at,
            }
        )

    sessions_payload.sort(
        key=lambda item: (
            0 if item["is_pinned"] else 1,
            -(item["last_message_at"].timestamp() if item["last_message_at"] else 0.0),
        )
    )
    return {"sessions": sessions_payload}


@router.get("/history", response_model=HistoryResponse)
async def history(
    session_id: str,
    current_user: User | None = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    normalized_session_id = _normalize_session_id(session_id)
    if not normalized_session_id:
        return {"session_id": "", "messages": []}

    if not current_user:
        return {
            "session_id": normalized_session_id,
            "messages": await get_session_history(normalized_session_id),
        }

    rows = _load_user_session_rows(db, user_id=current_user.id, session_id=normalized_session_id)
    if not rows:
        return {"session_id": normalized_session_id, "messages": []}
    await _hydrate_runtime_session(normalized_session_id, rows)
    return _session_history_payload(normalized_session_id, rows)


@router.post("/chat/pin", response_model=SessionActionResponse)
async def set_session_pin(
    payload: SessionPinRequest,
    current_user: User | None = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    normalized_session_id = _normalize_session_id(payload.session_id)
    if not normalized_session_id:
        raise HTTPException(status_code=400, detail="Session not found.")

    if current_user:
        if not _user_session_exists(db, user_id=current_user.id, session_id=normalized_session_id):
            raise HTTPException(status_code=404, detail="Session not found.")
        await get_session_flags_snapshot(normalized_session_id)
        updated = await pin_session(normalized_session_id, payload.is_pinned)
    else:
        updated = await pin_session(normalized_session_id, payload.is_pinned)

    if not updated:
        raise HTTPException(status_code=404, detail="Session not found.")
    return {"status": "ok", "session_id": normalized_session_id}


@router.post("/chat/archive", response_model=SessionActionResponse)
async def set_session_archive(
    payload: SessionArchiveRequest,
    current_user: User | None = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    normalized_session_id = _normalize_session_id(payload.session_id)
    if not normalized_session_id:
        raise HTTPException(status_code=400, detail="Session not found.")

    if current_user:
        if not _user_session_exists(db, user_id=current_user.id, session_id=normalized_session_id):
            raise HTTPException(status_code=404, detail="Session not found.")
        await get_session_flags_snapshot(normalized_session_id)
        updated = await archive_session(normalized_session_id, payload.is_archived)
    else:
        updated = await archive_session(normalized_session_id, payload.is_archived)

    if not updated:
        raise HTTPException(status_code=404, detail="Session not found.")
    return {"status": "ok", "session_id": normalized_session_id}


@router.post("/chat/delete", response_model=SessionActionResponse)
async def remove_session(
    payload: SessionDeleteRequest,
    current_user: User | None = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    normalized_session_id = _normalize_session_id(payload.session_id)
    if not normalized_session_id:
        raise HTTPException(status_code=400, detail="Session not found.")

    if current_user:
        if not _user_session_exists(db, user_id=current_user.id, session_id=normalized_session_id):
            raise HTTPException(status_code=404, detail="Session not found.")
        try:
            db.execute(
                delete(ChatMessage).where(
                    ChatMessage.user_id == current_user.id,
                    ChatMessage.session_id == normalized_session_id,
                )
            )
            db.commit()
        except SQLAlchemyError as exc:
            db.rollback()
            raise HTTPException(status_code=500, detail="Failed to delete session.") from exc
        return {"status": "ok", "session_id": normalized_session_id}

    deleted = await delete_session(normalized_session_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Session not found.")
    return {"status": "ok", "session_id": normalized_session_id}


@router.post("/sessions/{session_id}/share", response_model=ShareSessionResponse)
async def share_session(
    session_id: str,
    request: Request,
    current_user: User | None = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    normalized_session_id = _normalize_session_id(session_id)
    if not normalized_session_id:
        raise HTTPException(status_code=404, detail="Session not found.")

    if current_user:
        rows = _load_user_session_rows(db, user_id=current_user.id, session_id=normalized_session_id)
        if not rows:
            raise HTTPException(status_code=404, detail="Session not found.")
        await _hydrate_runtime_session(normalized_session_id, rows)

    share_id = await create_share_link(normalized_session_id)
    if not share_id:
        raise HTTPException(status_code=404, detail="Session not found.")
    base_url = str(request.base_url).rstrip("/")
    return {
        "share_id": share_id,
        "share_url": f"{base_url}/share/{share_id}",
        "session_id": normalized_session_id,
    }


@router.get("/share/{share_id}", response_model=SharedConversationResponse)
async def read_shared_session(share_id: str):
    shared = await get_shared_conversation(share_id)
    if not shared:
        raise HTTPException(status_code=404, detail="Shared conversation not found.")
    return shared
