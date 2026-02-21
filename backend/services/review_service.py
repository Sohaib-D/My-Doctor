from __future__ import annotations

from datetime import datetime, timezone
from email.message import EmailMessage
import smtplib
import ssl

from backend.config import Settings

DEFAULT_FEEDBACK_RECIPIENT = "mesohaib5757@gmail.com"


def _safe_line(value: str | None, fallback: str) -> str:
    if not value:
        return fallback
    return value.replace("\r", " ").replace("\n", " ").strip() or fallback


def _feedback_email_body(
    *,
    feedback: str,
    user_email: str | None,
    user_name: str | None,
    timestamp: str | None,
) -> str:
    at = timestamp or datetime.now(timezone.utc).isoformat()
    display_name = _safe_line(user_name, "Anonymous")
    display_email = _safe_line(user_email, "Not provided")
    content = (feedback or "").strip()
    return (
        "User:\n"
        f"{display_name}\n\n"
        "Email:\n"
        f"{display_email}\n\n"
        "Feedback:\n"
        f"{content}\n\n"
        "Timestamp:\n"
        f"{at}\n"
    )


def send_feedback_email(
    *,
    settings: Settings,
    feedback: str,
    user_email: str | None,
    user_name: str | None,
    timestamp: str | None = None,
) -> None:
    mail_server = (settings.mail_server or "").strip()
    mail_username = (settings.mail_username or "").strip()
    mail_password = (settings.mail_password or "").strip()
    mail_from = (settings.mail_from or settings.mail_username or "").strip()
    mail_to = (settings.mail_to or DEFAULT_FEEDBACK_RECIPIENT).strip()
    mail_port = int(settings.mail_port or 587)

    if not all([mail_server, mail_username, mail_password, mail_from, mail_to]):
        raise RuntimeError("Mail service is not configured.")

    message = EmailMessage()
    message["Subject"] = "New App Feedback Received"
    message["From"] = mail_from
    message["To"] = mail_to
    message.set_content(
        _feedback_email_body(
            feedback=feedback,
            user_email=user_email,
            user_name=user_name,
            timestamp=timestamp,
        )
    )

    context = ssl.create_default_context()
    if mail_port == 465:
        with smtplib.SMTP_SSL(mail_server, mail_port, context=context, timeout=20) as smtp:
            smtp.login(mail_username, mail_password)
            smtp.send_message(message)
        return

    with smtplib.SMTP(mail_server, mail_port, timeout=20) as smtp:
        smtp.ehlo()
        smtp.starttls(context=context)
        smtp.ehlo()
        smtp.login(mail_username, mail_password)
        smtp.send_message(message)


def send_review_email(
    *,
    settings: Settings,
    review: str,
    user_email: str | None,
    user_name: str | None,
    timestamp: str | None = None,
) -> None:
    send_feedback_email(
        settings=settings,
        feedback=review,
        user_email=user_email,
        user_name=user_name,
        timestamp=timestamp,
    )
