from __future__ import annotations

import json

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.auth.deps import get_current_user
from backend.database.models import ChatMessage, ChatSession, User
from backend.database.session import get_db
from backend.schemas.chat import (
    HistoryMessage,
    HistoryResponse,
    SessionListResponse,
    SessionSummary,
    StructuredMedicalResponse,
)
from backend.utils.crypto import decrypt_text


router = APIRouter(tags=["history"])


@router.get("/sessions", response_model=SessionListResponse)
def sessions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rows = (
        db.query(
            ChatSession.id,
            ChatSession.title,
            ChatSession.created_at,
            func.max(ChatMessage.created_at).label("last_message_at"),
            func.count(ChatMessage.id).label("message_count"),
        )
        .outerjoin(ChatMessage, ChatMessage.session_id == ChatSession.id)
        .filter(ChatSession.user_id == current_user.id)
        .group_by(ChatSession.id, ChatSession.title, ChatSession.created_at)
        .order_by(func.coalesce(func.max(ChatMessage.created_at), ChatSession.created_at).desc())
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
            )
            for row in rows
        ]
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

    items: list[HistoryMessage] = []
    for row in records:
        text = decrypt_text(row.encrypted_text)
        structured = None
        if row.encrypted_payload:
            try:
                payload = json.loads(decrypt_text(row.encrypted_payload))
                structured = StructuredMedicalResponse(**payload)
            except Exception:
                structured = None

        items.append(
            HistoryMessage(
                id=row.id,
                session_id=row.session_id,
                role=row.role,
                text=text,
                structured=structured,
                language=row.language,
                emergency=row.emergency,
                created_at=row.created_at,
            )
        )

    return HistoryResponse(session_id=session_id, messages=items)

