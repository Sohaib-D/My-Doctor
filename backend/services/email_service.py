from __future__ import annotations

import html

import httpx

from backend.config import get_settings


SENDGRID_API_URL = "https://api.sendgrid.com/v3/mail/send"


def _get_api_key() -> str:
    api_key = get_settings().sendgrid_api_key
    if not api_key:
        raise RuntimeError("SENDGRID_API_KEY is not configured.")
    return api_key


def _get_sender_info() -> tuple[str, str]:
    settings = get_settings()
    from_email = settings.from_email.strip()
    if not from_email:
        raise RuntimeError("FROM_EMAIL is not configured.")
    from_name = settings.sendgrid_from_name.strip() or "My Doctor"
    return from_email, from_name


def _format_feedback_rating(rating: int | None) -> str:
    if rating is None:
        return "Not provided"
    if rating < 1 or rating > 5:
        return "Not provided"
    filled = "*" * rating
    empty = "-" * (5 - rating)
    return f"{rating}/5 ({filled}{empty})"


def send_verification_email(recipient_email: str, verification_token: str, expires_in_minutes: int = 15) -> None:
    settings = get_settings()
    api_key = _get_api_key()
    from_email, from_name = _get_sender_info()
    verification_url_base = settings.verify_url_base

    token_hint = f"Token: {verification_token}"
    link_hint = ""
    if verification_url_base:
        separator = "&" if "?" in verification_url_base else "?"
        verification_url = f"{verification_url_base}{separator}token={verification_token}"
        link_hint = f"\nVerification link: {verification_url}"

    text_content = (
        "Welcome to My Doctor.\n\n"
        f"Use this verification token to verify your account:\n{verification_token}\n\n"
        f"This token expires in {expires_in_minutes} minutes."
    )
    if link_hint:
        text_content += link_hint

    escaped_token = html.escape(token_hint)
    escaped_link = html.escape(link_hint.strip()) if link_hint else ""
    html_content = (
        "<p>Welcome to <strong>My Doctor</strong>.</p>"
        "<p>Use this verification token to verify your account:</p>"
        f"<p><code>{escaped_token}</code></p>"
        f"<p>This token expires in {expires_in_minutes} minutes.</p>"
    )
    if escaped_link:
        html_content += f"<p>{escaped_link}</p>"

    payload = {
        "personalizations": [{"to": [{"email": recipient_email}]}],
        "from": {"email": from_email, "name": from_name},
        "subject": "Verify your My Doctor account",
        "content": [
            {"type": "text/plain", "value": text_content},
            {"type": "text/html", "value": html_content},
        ],
    }

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    try:
        response = httpx.post(SENDGRID_API_URL, json=payload, headers=headers, timeout=10.0)
    except httpx.HTTPError as exc:
        raise RuntimeError("Failed to reach SendGrid.") from exc

    if response.status_code != 202:
        details = response.text[:300]
        raise RuntimeError(f"SendGrid rejected email ({response.status_code}): {details}")


def send_password_reset_email(recipient_email: str, reset_token: str, expires_in_minutes: int = 15) -> None:
    api_key = _get_api_key()
    from_email, from_name = _get_sender_info()

    token_hint = f"Reset Token: {reset_token}"
    text_content = (
        "Password reset request received.\n\n"
        f"Use this OTP to reset your account password:\n{reset_token}\n\n"
        f"This OTP expires in {expires_in_minutes} minutes.\n"
        "If you did not request a password reset, please ignore this email."
    )

    escaped_token = html.escape(token_hint)
    html_content = (
        "<p>Password reset request received.</p>"
        "<p>Use this OTP to reset your account password:</p>"
        f"<p><code>{escaped_token}</code></p>"
        f"<p>This OTP expires in {expires_in_minutes} minutes.</p>"
        "<p>If you did not request a password reset, please ignore this email.</p>"
    )

    payload = {
        "personalizations": [{"to": [{"email": recipient_email}]}],
        "from": {"email": from_email, "name": from_name},
        "subject": "Reset your My Doctor account password",
        "content": [
            {"type": "text/plain", "value": text_content},
            {"type": "text/html", "value": html_content},
        ],
    }

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    try:
        response = httpx.post(SENDGRID_API_URL, json=payload, headers=headers, timeout=10.0)
    except httpx.HTTPError as exc:
        raise RuntimeError("Failed to reach SendGrid.") from exc

    if response.status_code != 202:
        details = response.text[:300]
        raise RuntimeError(f"SendGrid rejected password reset email ({response.status_code}): {details}")


def send_feedback_email(
    name: str,
    email: str,
    message: str,
    rating: int | None = None,
    *,
    sender_type: str = "Guest User",
) -> None:
    settings = get_settings()
    api_key = _get_api_key()
    from_email, from_name = _get_sender_info()
    admin_email = settings.admin_email.strip()
    if not admin_email:
        raise RuntimeError("ADMIN_EMAIL is not configured.")

    safe_name = html.escape(name)
    safe_email = html.escape(email)
    normalized_sender_type = str(sender_type or "Guest User").strip() or "Guest User"
    safe_sender_type = html.escape(normalized_sender_type)
    safe_message = html.escape(message).replace("\n", "<br>")
    rating_text = _format_feedback_rating(rating)
    safe_rating = html.escape(rating_text)

    text_content = (
        "New feedback received.\n\n"
        f"Sender Type: {normalized_sender_type}\n"
        f"Name: {name}\n"
        f"Email: {email}\n\n"
        f"Rating: {rating_text}\n\n"
        f"Message:\n{message}"
    )
    html_content = (
        "<p>New feedback received.</p>"
        f"<p><strong>Sender Type:</strong> {safe_sender_type}<br>"
        f"<strong>Name:</strong> {safe_name}<br>"
        f"<strong>Email:</strong> {safe_email}<br>"
        f"<strong>Rating:</strong> {safe_rating}</p>"
        f"<p><strong>Message:</strong><br>{safe_message}</p>"
    )

    payload = {
        "personalizations": [{"to": [{"email": admin_email}]}],
        "from": {"email": from_email, "name": from_name},
        "reply_to": {"email": email, "name": name},
        "subject": f"New Feedback ({normalized_sender_type}) from {name}",
        "content": [
            {"type": "text/plain", "value": text_content},
            {"type": "text/html", "value": html_content},
        ],
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    try:
        response = httpx.post(SENDGRID_API_URL, json=payload, headers=headers, timeout=10.0)
    except httpx.HTTPError as exc:
        raise RuntimeError("Failed to reach SendGrid.") from exc

    if response.status_code != 202:
        details = response.text[:300]
        raise RuntimeError(f"SendGrid rejected feedback email ({response.status_code}): {details}")
