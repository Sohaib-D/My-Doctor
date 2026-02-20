from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

ResponseStyle = Literal["default", "simple_clear", "detailed_technical", "friendly", "professional"]


def _clean_text(value: str | None) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


class UserPersonalizationBase(BaseModel):
    response_style: ResponseStyle = "default"
    custom_instructions: str | None = Field(default=None, max_length=4000)
    nickname: str | None = Field(default=None, max_length=120)
    occupation: str | None = Field(default=None, max_length=160)
    about_user: str | None = Field(default=None, max_length=2000)
    allow_memory: bool = False
    allow_chat_reference: bool = False

    @field_validator("custom_instructions", "nickname", "occupation", "about_user")
    @classmethod
    def _normalize_strings(cls, value: str | None) -> str | None:
        return _clean_text(value)


class UserPersonalizationCreate(UserPersonalizationBase):
    pass


class UserPersonalizationUpdate(UserPersonalizationBase):
    pass


class UserPersonalizationResponse(UserPersonalizationBase):
    firebase_uid: str
    updated_at: datetime | None = None


class ChatPersonalizationContext(UserPersonalizationBase):
    recent_chat_summaries: list[str] = Field(default_factory=list, max_length=12)

    @field_validator("recent_chat_summaries")
    @classmethod
    def _normalize_recent_chat_summaries(cls, value: list[str]) -> list[str]:
        cleaned: list[str] = []
        for item in value or []:
            text = str(item or "").strip()
            if text:
                cleaned.append(text[:300])
        return cleaned[:12]
