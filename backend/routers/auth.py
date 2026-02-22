from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

import bcrypt
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import HTMLResponse, RedirectResponse
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.auth.deps import get_current_user
from backend.auth.jwt import create_access_token
from backend.config import get_settings
from backend.database.models import User
from backend.database.session import get_db
from backend.services.email_service import send_verification_email

try:
    from google.auth.transport import requests as google_requests
    from google.oauth2 import id_token as google_id_token
except ImportError:  # pragma: no cover
    google_requests = None
    google_id_token = None


router = APIRouter(tags=["auth"])
OTP_EXPIRY_MINUTES = 15


def _normalize_email(value: str) -> str:
    email = value.strip().lower()
    if "@" not in email or "." not in email.split("@")[-1]:
        raise ValueError("A valid email is required.")
    return email


def _hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def _verify_password(password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), hashed_password.encode("utf-8"))
    except Exception:
        return False


def _generate_otp() -> str:
    return str(secrets.randbelow(900000) + 100000)


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _mask_email(email: str) -> str:
    local, _, domain = email.partition("@")
    if len(local) <= 2:
        local_masked = local[:1] + "*"
    else:
        local_masked = local[0] + ("*" * (len(local) - 2)) + local[-1]
    return f"{local_masked}@{domain}"


def _public_user(user: User) -> dict:
    return {
        "id": str(user.id),
        "email": user.email,
        "full_name": None,
        "is_verified": user.is_verified,
    }


def _resolve_google_redirect_uri(request: Request) -> str:
    settings = get_settings()
    configured = (settings.google_redirect_uri or "").strip()
    if configured:
        return configured

    forwarded_host = str(request.headers.get("x-forwarded-host") or "").split(",")[0].strip()
    forwarded_proto = str(request.headers.get("x-forwarded-proto") or "").split(",")[0].strip()
    if forwarded_host:
        scheme = forwarded_proto or request.url.scheme or "https"
        return f"{scheme}://{forwarded_host}/auth/google/callback"

    return str(request.url_for("auth_google_callback"))


def _auth_payload(user: User) -> dict:
    token = create_access_token(str(user.id))
    return {
        "status": "authenticated",
        "access_token": token,
        "token_type": "bearer",
        "user": _public_user(user),
    }


class SignupRequest(BaseModel):
    email: str
    password: str = Field(min_length=8, max_length=128)
    full_name: str | None = Field(default=None, max_length=200)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return _normalize_email(value)


class VerifyOtpRequest(BaseModel):
    email: str
    login_token: str = Field(min_length=4, max_length=255)
    otp: str = Field(min_length=4, max_length=20)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return _normalize_email(value)

    @field_validator("login_token", "otp")
    @classmethod
    def strip_fields(cls, value: str) -> str:
        return value.strip()


class LoginRequest(BaseModel):
    email: str
    password: str = Field(min_length=8, max_length=128)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return _normalize_email(value)


class GoogleLoginRequest(BaseModel):
    id_token: str = Field(min_length=20)


@router.post("/auth/signup", status_code=status.HTTP_201_CREATED)
def signup(data: SignupRequest, db: Session = Depends(get_db)) -> dict:
    now = datetime.now(timezone.utc)
    otp = _generate_otp()
    expiry = now + timedelta(minutes=OTP_EXPIRY_MINUTES)
    hashed_password = _hash_password(data.password)

    user = db.execute(select(User).where(User.email == data.email)).scalar_one_or_none()
    if user and user.is_verified:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered.")

    if user:
        user.hashed_password = hashed_password
        user.is_verified = False
        user.verification_token = otp
        user.token_expiry = expiry
    else:
        user = User(
            email=data.email,
            hashed_password=hashed_password,
            is_verified=False,
            verification_token=otp,
            token_expiry=expiry,
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
        send_verification_email(data.email, otp, OTP_EXPIRY_MINUTES)
    except RuntimeError as exc:
        email_sent = False
        if settings.environment == "production":
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Unable to send verification email. Please try again.",
            ) from exc

    db.commit()
    debug_otp = None if settings.environment == "production" else otp
    return {
        "message": "OTP sent to email" if email_sent else "OTP generated for development",
        "login_token": otp,
        "expires_in_minutes": OTP_EXPIRY_MINUTES,
        "masked_email": _mask_email(data.email),
        "otp": debug_otp,
    }


@router.post("/auth/verify-otp")
def verify_otp(data: VerifyOtpRequest, db: Session = Depends(get_db)) -> dict:
    user = db.execute(select(User).where(User.email == data.email)).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User not found.")

    if not user.verification_token or user.verification_token != data.login_token:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No OTP found.")

    if user.verification_token != data.otp:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid OTP.")

    if user.token_expiry is None or _as_utc(user.token_expiry) < datetime.now(timezone.utc):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="OTP expired.")

    user.is_verified = True
    user.verification_token = None
    user.token_expiry = None
    db.commit()
    db.refresh(user)

    return _auth_payload(user)


@router.post("/auth/login")
def login(data: LoginRequest, db: Session = Depends(get_db)) -> dict:
    user = db.execute(select(User).where(User.email == data.email)).scalar_one_or_none()
    if not user or not _verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password.")
    if not user.is_verified:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Email not verified.")
    return _auth_payload(user)


def _verify_google_id_token(token: str) -> str:
    settings = get_settings()
    if google_id_token is None or google_requests is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="google-auth dependency missing.",
        )
    if not settings.google_client_id:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="GOOGLE_CLIENT_ID not set.")

    try:
        token_info = google_id_token.verify_oauth2_token(
            token,
            google_requests.Request(),
            settings.google_client_id,
        )
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid Google token.") from exc

    issuer = str(token_info.get("iss") or "")
    if issuer not in {"accounts.google.com", "https://accounts.google.com"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid token issuer.")

    email = str(token_info.get("email") or "").strip().lower()
    email_verified = bool(token_info.get("email_verified"))
    if not email or not email_verified:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Google email not verified.")
    return email


@router.post("/auth/google")
def google_login(data: GoogleLoginRequest, db: Session = Depends(get_db)) -> dict:
    email = _verify_google_id_token(data.id_token)
    user = db.execute(select(User).where(User.email == email)).scalar_one_or_none()
    if not user:
        user = User(
            email=email,
            hashed_password=_hash_password(secrets.token_urlsafe(24)),
            is_verified=True,
            verification_token=None,
            token_expiry=None,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    else:
        if not user.is_verified:
            user.is_verified = True
            user.verification_token = None
            user.token_expiry = None
            db.commit()
            db.refresh(user)
    return _auth_payload(user)


@router.get("/auth/google/start", include_in_schema=False)
def google_auth_start(request: Request, state: str | None = None) -> RedirectResponse:
    settings = get_settings()
    if not settings.google_client_id:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="GOOGLE_CLIENT_ID not set.")

    callback_url = _resolve_google_redirect_uri(request)
    query = {
        "client_id": settings.google_client_id,
        "redirect_uri": callback_url,
        "response_type": "id_token",
        "scope": "openid email profile",
        "nonce": secrets.token_urlsafe(24),
        "prompt": "select_account",
        "state": state or secrets.token_urlsafe(16),
    }
    auth_url = f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(query)}"
    return RedirectResponse(url=auth_url, status_code=status.HTTP_302_FOUND)


@router.get(
    "/auth/google/callback",
    include_in_schema=False,
    response_class=HTMLResponse,
    name="auth_google_callback",
)
def google_auth_callback() -> HTMLResponse:
    html = """
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Google Sign-In</title>
  </head>
  <body>
    <script>
      (function () {
        const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : '';
        const params = new URLSearchParams(hash);
        const payload = {
          type: 'pd_google_oauth',
          id_token: params.get('id_token') || '',
          state: params.get('state') || '',
          error: params.get('error') || '',
          error_description: params.get('error_description') || '',
        };
        if (window.opener && window.opener !== window) {
          window.opener.postMessage(payload, '*');
        }
        window.close();
      })();
    </script>
  </body>
</html>
""".strip()
    return HTMLResponse(content=html)


@router.get("/auth/me")
def me(current_user: User = Depends(get_current_user)) -> dict:
    return _public_user(current_user)
