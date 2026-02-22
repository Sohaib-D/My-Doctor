from __future__ import annotations

from pydantic import BaseModel, Field, field_validator


class FeedbackCreate(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    email: str
    message: str = Field(min_length=10, max_length=2000)

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        email = value.strip().lower()
        if "@" not in email or "." not in email.split("@")[-1]:
            raise ValueError("A valid email is required.")
        return email
