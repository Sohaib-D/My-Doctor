from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator


class StructuredMedicalResponse(BaseModel):
    symptoms: str
    possible_causes: str
    advice: str
    urgency_level: Literal["low", "moderate", "high", "emergency"]
    when_to_see_doctor: str
    references: list[str] = Field(default_factory=list)


class ChatRequest(BaseModel):
    message: str | None = None
    voice_text: str | None = None
    session_id: str | None = None
    language: Literal["en", "ur"] | None = None
    profile: ProfileContext | None = None

    @model_validator(mode="after")
    def require_text_or_voice(self) -> "ChatRequest":
        text = (self.message or "").strip()
        voice = (self.voice_text or "").strip()
        if not text and not voice:
            raise ValueError("Either message or voice_text must be provided.")
        return self


class ChatResponse(BaseModel):
    session_id: str
    message_id: str
    response: str
    structured: StructuredMedicalResponse
    emergency: bool
    language: Literal["en", "ur"]
    tts_url: str | None = None
    disclaimer: str = (
        "This is educational information, not a diagnosis. "
        "If symptoms are severe or worsening, seek in-person medical care."
    )


class HistoryMessage(BaseModel):
    id: str
    session_id: str
    role: Literal["user", "assistant"]
    text: str
    structured: StructuredMedicalResponse | None = None
    language: str
    emergency: bool
    created_at: datetime


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
