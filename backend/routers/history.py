from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.auth.deps import get_current_user
from backend.database.models import ChatMessage, ChatSession, SharedSession, User
from backend.database.session import get_db
from backend.schemas.chat import (
    HistoryMessage,
    HistoryResponse,
    SessionListResponse,
    SessionSummary,
    ShareSessionResponse,
    SharedConversationResponse,
    StructuredMedicalResponse,
)
from backend.utils.crypto import decrypt_text


router = APIRouter(tags=["history"])


def _to_history_message(row: ChatMessage) -> HistoryMessage:
    text = decrypt_text(row.encrypted_text)
    structured = None
    if row.encrypted_payload:
        try:
            payload = json.loads(decrypt_text(row.encrypted_payload))
            structured = StructuredMedicalResponse(**payload)
        except Exception:
            structured = None

    return HistoryMessage(
        id=row.id,
        session_id=row.session_id,
        role=row.role,
        text=text,
        structured=structured,
        language=row.language,
        emergency=row.emergency,
        created_at=row.created_at,
    )


@router.get("/sessions", response_model=SessionListResponse)
def sessions(
    include_archived: bool = Query(default=False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = (
        db.query(
            ChatSession.id,
            ChatSession.title,
            ChatSession.created_at,
            ChatSession.is_pinned,
            ChatSession.is_archived,
            ChatSession.pinned_at,
            func.max(ChatMessage.created_at).label("last_message_at"),
            func.count(ChatMessage.id).label("message_count"),
        )
        .outerjoin(ChatMessage, ChatMessage.session_id == ChatSession.id)
        .filter(ChatSession.user_id == current_user.id)
    )
    if not include_archived:
        query = query.filter(ChatSession.is_archived.is_(False))

    rows = (
        query.group_by(
            ChatSession.id,
            ChatSession.title,
            ChatSession.created_at,
            ChatSession.is_pinned,
            ChatSession.is_archived,
            ChatSession.pinned_at,
        )
        .order_by(
            ChatSession.is_pinned.desc(),
            func.coalesce(ChatSession.pinned_at, ChatSession.created_at).desc(),
            func.coalesce(func.max(ChatMessage.created_at), ChatSession.created_at).desc(),
        )
        .all()
    )

    return SessionListResponse(
        sessions=[
            SessionSummary(
                id=row.id,
                title=(row.title or "New chat").strip() or "New chat",
                created_at=row.created_at,
                last_message_at=row.last_message_at,
                message_count=int(row.message_count or 0),
                is_pinned=bool(row.is_pinned),
                is_archived=bool(row.is_archived),
                pinned_at=row.pinned_at,
            )
            for row in rows
        ]
    )


@router.post("/sessions/{session_id}/share", response_model=ShareSessionResponse)
def create_share_link(
    session_id: str,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = (
        db.query(ChatSession)
        .filter(ChatSession.id == session_id, ChatSession.user_id == current_user.id)
        .first()
    )
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found.")

    shared = db.query(SharedSession).filter(SharedSession.session_id == session.id).first()
    if not shared:
        shared = SharedSession(user_id=current_user.id, session_id=session.id)
        db.add(shared)
        db.commit()
        db.refresh(shared)

    share_url = str(request.base_url).rstrip("/") + f"/share/{shared.share_id}"
    return ShareSessionResponse(
        share_id=shared.share_id,
        share_url=share_url,
        session_id=session.id,
    )


@router.get("/share/{share_id}", response_model=SharedConversationResponse)
def read_shared_conversation(
    share_id: str,
    db: Session = Depends(get_db),
):
    shared = db.query(SharedSession).filter(SharedSession.share_id == share_id).first()
    if not shared:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shared conversation not found.")

    session = db.query(ChatSession).filter(ChatSession.id == shared.session_id).first()
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found.")

    records = (
        db.query(ChatMessage)
        .filter(ChatMessage.session_id == session.id)
        .order_by(ChatMessage.created_at.asc())
        .all()
    )
    messages = [_to_history_message(row) for row in records]
    return SharedConversationResponse(
        share_id=share_id,
        session_id=session.id,
        title=(session.title or "Shared conversation").strip() or "Shared conversation",
        messages=messages,
    )


@router.get("/history", response_model=HistoryResponse)
def history(
    session_id: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(ChatMessage).filter(ChatMessage.user_id == current_user.id)
    if session_id:
        query = query.filter(ChatMessage.session_id == session_id)

    records = query.order_by(ChatMessage.created_at.desc()).limit(limit).all()
    records.reverse()
    return HistoryResponse(session_id=session_id, messages=[_to_history_message(row) for row in records])
