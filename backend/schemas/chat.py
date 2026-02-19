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


class SessionListResponse(BaseModel):
    sessions: list[SessionSummary]
