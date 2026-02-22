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


def send_feedback_email(name: str, email: str, message: str) -> None:
    settings = get_settings()
    api_key = _get_api_key()
    from_email, from_name = _get_sender_info()
    admin_email = settings.admin_email.strip()
    if not admin_email:
        raise RuntimeError("ADMIN_EMAIL is not configured.")

    safe_name = html.escape(name)
    safe_email = html.escape(email)
    safe_message = html.escape(message).replace("\n", "<br>")

    text_content = (
        "New feedback received.\n\n"
        f"Name: {name}\n"
        f"Email: {email}\n\n"
        f"Message:\n{message}"
    )
    html_content = (
        "<p>New feedback received.</p>"
        f"<p><strong>Name:</strong> {safe_name}<br>"
        f"<strong>Email:</strong> {safe_email}</p>"
        f"<p><strong>Message:</strong><br>{safe_message}</p>"
    )

    payload = {
        "personalizations": [{"to": [{"email": admin_email}]}],
        "from": {"email": from_email, "name": from_name},
        "reply_to": {"email": email, "name": name},
        "subject": f"New Feedback from {name}",
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
