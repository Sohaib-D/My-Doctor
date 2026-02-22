from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request

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
    chat_with_groq,
    create_share_link,
    delete_session,
    get_session_history,
    get_shared_conversation,
    list_session_summaries,
    pin_session,
)


router = APIRouter(tags=["chat"])


@router.post("/chat", response_model=ChatResponse)
async def chat(payload: ChatRequest):
    message = str(payload.message or "").strip()
    attachments = payload.attachments or []
    if not message and not attachments:
        raise HTTPException(status_code=400, detail="Message cannot be empty.")
    if len(message) > 2000:
        raise HTTPException(status_code=400, detail="Message too long. Maximum 2000 characters.")

    try:
        return await chat_with_groq(
            message,
            session_id=payload.session_id,
            attachments=attachments,
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@router.get("/sessions", response_model=SessionListResponse)
async def sessions():
    return {"sessions": await list_session_summaries()}


@router.get("/history", response_model=HistoryResponse)
async def history(session_id: str):
    return {
        "session_id": session_id,
        "messages": await get_session_history(session_id),
    }


@router.post("/chat/pin", response_model=SessionActionResponse)
async def set_session_pin(payload: SessionPinRequest):
    updated = await pin_session(payload.session_id, payload.is_pinned)
    if not updated:
        raise HTTPException(status_code=404, detail="Session not found.")
    return {"status": "ok", "session_id": payload.session_id}


@router.post("/chat/archive", response_model=SessionActionResponse)
async def set_session_archive(payload: SessionArchiveRequest):
    updated = await archive_session(payload.session_id, payload.is_archived)
    if not updated:
        raise HTTPException(status_code=404, detail="Session not found.")
    return {"status": "ok", "session_id": payload.session_id}


@router.post("/chat/delete", response_model=SessionActionResponse)
async def remove_session(payload: SessionDeleteRequest):
    deleted = await delete_session(payload.session_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Session not found.")
    return {"status": "ok", "session_id": payload.session_id}


@router.post("/sessions/{session_id}/share", response_model=ShareSessionResponse)
async def share_session(session_id: str, request: Request):
    share_id = await create_share_link(session_id)
    if not share_id:
        raise HTTPException(status_code=404, detail="Session not found.")
    base_url = str(request.base_url).rstrip("/")
    return {
        "share_id": share_id,
        "share_url": f"{base_url}/share/{share_id}",
        "session_id": session_id,
    }


@router.get("/share/{share_id}", response_model=SharedConversationResponse)
async def read_shared_session(share_id: str):
    shared = await get_shared_conversation(share_id)
    if not shared:
        raise HTTPException(status_code=404, detail="Shared conversation not found.")
    return shared
