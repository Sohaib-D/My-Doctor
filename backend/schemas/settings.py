from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class UserSettingsBase(BaseModel):
    appearance: Literal["light", "dark", "system"] = "system"
    language: Literal["en", "ur"] = "en"
    voice_gender: Literal["female"] = "female"
    voice_auto_detect: bool = True


class UserSettingsUpdate(UserSettingsBase):
    display_name: str | None = Field(default=None, max_length=200)


class UserSettingsResponse(UserSettingsBase):
    user_id: str
    display_name: str | None = None
    email: str
    created_at: datetime | None = None
    updated_at: datetime | None = None

