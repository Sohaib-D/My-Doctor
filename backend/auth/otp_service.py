from __future__ import annotations

from datetime import datetime, timedelta
from email.message import EmailMessage
import hashlib
import hmac
import secrets
import smtplib

from sqlalchemy.orm import Session

from backend.config import get_settings
from backend.database.models import OtpChallenge, User
from backend.utils.logging import logger


def _hash_value(value: str) -> str:
    settings = get_settings()
    digest = hmac.new(
        key=settings.secret_key.encode("utf-8"),
        msg=value.encode("utf-8"),
        digestmod=hashlib.sha256,
    ).hexdigest()
    return digest


def hash_value(value: str) -> str:
    """Public hash helper used to resolve OTP challenges by login token hash."""
    return _hash_value(value)


def mask_email(email: str) -> str:
    local, _, domain = email.partition("@")
    if len(local) <= 2:
        local_masked = local[0] + "*"
    else:
        local_masked = local[0] + ("*" * (len(local) - 2)) + local[-1]
    return f"{local_masked}@{domain}"


def create_otp_challenge(db: Session, user: User) -> tuple[str, str]:
    settings = get_settings()
    otp = "".join(secrets.choice("0123456789") for _ in range(settings.otp_length))
    login_token = secrets.token_urlsafe(32)

    challenge = OtpChallenge(
        user_id=user.id,
        login_token_hash=_hash_value(login_token),
        otp_hash=_hash_value(f"{user.id}:{otp}"),
        expires_at=datetime.utcnow() + timedelta(minutes=settings.otp_expiry_minutes),
    )
    db.add(challenge)
    db.commit()

    return login_token, otp


def verify_otp_challenge(db: Session, user: User, login_token: str, otp: str) -> bool:
    challenge = (
        db.query(OtpChallenge)
        .filter(
            OtpChallenge.user_id == user.id,
            OtpChallenge.login_token_hash == _hash_value(login_token),
            OtpChallenge.consumed_at.is_(None),
        )
        .order_by(OtpChallenge.created_at.desc())
        .first()
    )
    if not challenge:
        return False

    if challenge.expires_at < datetime.utcnow():
        return False

    expected = _hash_value(f"{user.id}:{otp}")
    if not hmac.compare_digest(expected, challenge.otp_hash):
        return False

    challenge.consumed_at = datetime.utcnow()
    user.is_verified = True
    db.commit()
    return True


def send_otp_email(email: str, otp: str) -> bool:
    settings = get_settings()

    if not all([settings.smtp_host, settings.smtp_username, settings.smtp_password, settings.smtp_sender]):
        # Intentionally do not log OTP or full email to avoid leaking PII in logs.
        logger.info("SMTP not configured; OTP email not sent.")
        return False

    msg = EmailMessage()
    msg["From"] = settings.smtp_sender
    msg["To"] = email
    msg["Subject"] = "Personal Doctor login verification code"
    msg.set_content(
        f"Your OTP code is: {otp}\n"
        f"It expires in {settings.otp_expiry_minutes} minutes."
    )

    with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as smtp:
        smtp.starttls()
        smtp.login(settings.smtp_username, settings.smtp_password)
        smtp.send_message(msg)

    return True
