from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class ChatRequest(BaseModel):
    message: str
    session_id: str | None = None


class ChatResponse(BaseModel):
    response: str
    session_id: str | None = None
    emergency: bool = False
    disclaimer: str = (
        "⚠️ This information is for educational purposes only and does not constitute medical advice. "
        "Always consult a qualified healthcare professional for diagnosis and treatment."
    )


class HistoryMessage(BaseModel):
    id: str | None = None
    role: str
    text: str
    created_at: datetime | None = None


class HistoryResponse(BaseModel):
    session_id: str | None = None
    messages: list[HistoryMessage]


class SessionSummary(BaseModel):
    id: str
    title: str
    created_at: datetime
    last_message_at: datetime | None = None
    message_count: int
    is_pinned: bool = False
    is_archived: bool = False
    pinned_at: datetime | None = None


class SessionListResponse(BaseModel):
    sessions: list[SessionSummary]


class ShareSessionResponse(BaseModel):
    share_id: str
    share_url: str
    session_id: str


class SharedConversationResponse(BaseModel):
    share_id: str
    session_id: str
    title: str
    messages: list[HistoryMessage]


class ProfileContext(BaseModel):
    age: int | None = None
    gender: str | None = None
    medical_history: str | None = None
    allergies: str | None = None
    medications: str | None = None
    current_medications: str | None = None
    chronic_conditions: str | None = None


class SessionPinRequest(BaseModel):
    session_id: str
    is_pinned: bool = True


class SessionArchiveRequest(BaseModel):
    session_id: str
    is_archived: bool = True


class SessionDeleteRequest(BaseModel):
    session_id: str


class SessionActionResponse(BaseModel):
    status: str = "ok"
    session_id: str
