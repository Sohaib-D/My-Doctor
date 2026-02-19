from __future__ import annotations

from pydantic import BaseModel, Field, model_validator


def _is_valid_email(value: str) -> bool:
    if "@" not in value:
        return False
    local, _, domain = value.partition("@")
    return bool(local) and "." in domain


class LoginRequest(BaseModel):
    firebase_id_token: str


class PasswordRegisterRequest(BaseModel):
    email: str
    password: str = Field(min_length=8, max_length=128)
    full_name: str | None = Field(default=None, max_length=200)

    @model_validator(mode="after")
    def validate_email(self) -> "PasswordRegisterRequest":
        candidate = self.email.strip().lower()
        if not _is_valid_email(candidate):
            raise ValueError("A valid email is required.")
        self.email = candidate
        self.full_name = self.full_name.strip() if self.full_name else None
        return self


class PasswordLoginRequest(BaseModel):
    email: str
    password: str = Field(min_length=8, max_length=128)

    @model_validator(mode="after")
    def validate_email(self) -> "PasswordLoginRequest":
        candidate = self.email.strip().lower()
        if not _is_valid_email(candidate):
            raise ValueError("A valid email is required.")
        self.email = candidate
        return self


class PublicUser(BaseModel):
    id: str
    uid: str
    email: str
    full_name: str | None = None
    is_verified: bool


class LoginResponse(BaseModel):
    status: str = "authenticated"
    access_token: str
    token_type: str = "bearer"
    user: PublicUser

