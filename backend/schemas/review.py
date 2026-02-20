from __future__ import annotations

from pydantic import BaseModel, Field, model_validator


def _is_valid_email(value: str) -> bool:
    if "@" not in value:
        return False
    local, _, domain = value.partition("@")
    return bool(local) and "." in domain


class SendReviewRequest(BaseModel):
    review: str = Field(min_length=10, max_length=4000)
    user_email: str | None = Field(default=None, max_length=320)
    user_name: str | None = Field(default=None, max_length=200)

    @model_validator(mode="after")
    def normalize(self) -> "SendReviewRequest":
        normalized_review = (self.review or "").strip()
        if len(normalized_review) < 10:
            raise ValueError("Review must be at least 10 characters.")
        self.review = normalized_review

        if self.user_email:
            email = self.user_email.strip().lower()
            if not _is_valid_email(email):
                raise ValueError("A valid user_email is required.")
            self.user_email = email

        if self.user_name:
            self.user_name = self.user_name.strip()

        return self


class SendReviewResponse(BaseModel):
    status: str = "sent"
    message: str = "Thank you for your feedback!"

