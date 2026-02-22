from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone

import bcrypt
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.config import get_settings
from backend.database.models import User
from backend.database.session import get_db
from backend.services.email_service import send_verification_email


TOKEN_EXPIRY_MINUTES = 15
router = APIRouter(tags=["signup"])


def _hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def _normalize_email(value: str) -> str:
    email = value.strip().lower()
    if "@" not in email or "." not in email.split("@")[-1]:
        raise ValueError("A valid email is required.")
    return email


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


class SignupRequest(BaseModel):
    email: str
    password: str = Field(min_length=8, max_length=128)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return _normalize_email(value)


class VerifyRequest(BaseModel):
    token: str = Field(min_length=16, max_length=255)

    @field_validator("token")
    @classmethod
    def normalize_token(cls, value: str) -> str:
        token = value.strip()
        if not token:
            raise ValueError("Token is required.")
        return token


@router.post("/signup", status_code=status.HTTP_201_CREATED)
def signup(payload: SignupRequest, db: Session = Depends(get_db)) -> dict:
    now = datetime.now(timezone.utc)
    verification_token = secrets.token_urlsafe(32)
    token_expiry = now + timedelta(minutes=TOKEN_EXPIRY_MINUTES)
    hashed_password = _hash_password(payload.password)

    user = db.execute(select(User).where(User.email == payload.email)).scalar_one_or_none()
    if user and user.is_verified:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered.")

    if user:
        user.hashed_password = hashed_password
        user.is_verified = False
        user.verification_token = verification_token
        user.token_expiry = token_expiry
    else:
        user = User(
            email=payload.email,
            hashed_password=hashed_password,
            is_verified=False,
            verification_token=verification_token,
            token_expiry=token_expiry,
        )
        db.add(user)

    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered.") from None

    settings = get_settings()
    email_sent = True
    try:
        send_verification_email(payload.email, verification_token, TOKEN_EXPIRY_MINUTES)
    except RuntimeError as exc:
        email_sent = False
        if settings.environment == "production":
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Unable to send verification email. Please try again.",
            ) from exc

    db.commit()
    return {
        "message": "Verification email sent." if email_sent else "Verification token generated for development.",
        "expires_in_minutes": TOKEN_EXPIRY_MINUTES,
    }


@router.post("/verify")
def verify(payload: VerifyRequest, db: Session = Depends(get_db)) -> dict:
    user = db.execute(select(User).where(User.verification_token == payload.token)).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid verification token.")

    if user.token_expiry is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Verification token expired.")

    now = datetime.now(timezone.utc)
    if _as_utc(user.token_expiry) < now:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Verification token expired.")

    user.is_verified = True
    user.verification_token = None
    user.token_expiry = None
    db.commit()

    return {"message": "Email verified successfully."}
