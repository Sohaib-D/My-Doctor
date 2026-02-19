from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class UserProfileBase(BaseModel):
    age: int | None = Field(default=None, ge=0, le=130)
    gender: Literal["male", "female", "other", "prefer_not_to_say"] | None = None
    medical_history: str | None = Field(default=None, max_length=4000)
    allergies: str | None = Field(default=None, max_length=4000)
    medications: str | None = Field(default=None, max_length=4000)
    chronic_conditions: str | None = Field(default=None, max_length=4000)


class UserProfileCreate(UserProfileBase):
    pass


class UserProfileUpdate(UserProfileBase):
    pass


class UserProfileResponse(UserProfileBase):
    firebase_uid: str
    created_at: datetime | None = None
    updated_at: datetime | None = None
