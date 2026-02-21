from __future__ import annotations

import asyncio
import os
import time
from asyncio import Lock
from uuid import uuid4

import httpx
from fastapi import HTTPException

from backend.schemas.chat import ChatResponse

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL = "llama-3.3-70b-versatile"

SYSTEM_PROMPT = """
You are a clinically trained medical assistant (Female Doctor) named "Dr. Amna".
Provide structured, evidence-based advice in response to patient questions.

YOUR PERSONALITY:
- Confident, concise, and genuinely helpful
- Warm but not over-the-top
- Give specific answers, not vague responses

RESPONSE RULES:
1. Answer directly and specifically.
2. Keep responses practical and focused.
3. Use simple language.
4. Avoid exact medication doses.
5. Use headings, bullets, and clear formatting when useful.

Language rule:
- Reply in the same language the user uses.
- Determine reply language from the latest user message in the current turn.
- English -> English
- Urdu script -> Urdu script
- Roman Urdu -> Roman Urdu
- Never switch language on your own. If user writes English or Roman Urdu, do not reply in Urdu script unless user explicitly asks.
- For Urdu script replies: write pure Urdu script, keep wording naturally Urdu, and use proper Urdu punctuation (۔ ، ؟).
- For Urdu script formatting: keep lines clean and left-aligned in output text.

Safety:
- Only include emergency guidance for true red-flag symptoms.
- Ask focused follow-up questions only when required.
""".strip()

CONTEXT_MEMORY_SYSTEM_PROMPT = (
    "Always remember previous conversation context. "
    "Do not ask for information already provided. "
    "Use earlier symptoms and details to give consistent and personalized responses."
)

EMERGENCY_KEYWORDS = [
    "heart attack",
    "chest pain",
    "can't breathe",
    "cannot breathe",
    "shortness of breath",
    "stroke",
    "seizure",
    "unconscious",
    "overdose",
    "suicide",
    "suicidal",
    "self-harm",
    "self harm",
    "severe bleeding",
    "choking",
    "anaphylaxis",
    "allergic reaction",
    "poisoning",
    "dying",
    "kill myself",
    "want to die",
    "end my life",
    "stop breathing",
    "not breathing",
    "passing out",
    "fainted",
    "blood everywhere",
    "severe chest",
    "sakht dard",
    "saans nahin",
    "saans nahi",
    "behosh",
    "khudkushi",
    "zyada khoon",
]

_SYSTEM_MESSAGES = [
    {"role": "system", "content": SYSTEM_PROMPT},
    {"role": "system", "content": CONTEXT_MEMORY_SYSTEM_PROMPT},
]

# In-memory session store (session-based memory).
_SESSION_HISTORIES: dict[str, list[dict[str, str]]] = {}
_SESSION_TOUCHED_AT: dict[str, float] = {}
_HISTORY_LOCK = Lock()

_SESSION_TTL_SECONDS = 60 * 60 * 24
_MAX_MESSAGES_PER_SESSION = 120

_MAX_GROQ_RETRIES = 2
_BASE_RETRY_DELAY_SECONDS = 1.2
_MAX_RETRY_DELAY_SECONDS = 8.0


def detect_emergency(message: str) -> bool:
    message_lower = str(message or "").lower()
    return any(keyword in message_lower for keyword in EMERGENCY_KEYWORDS)


def _seed_history() -> list[dict[str, str]]:
    return [dict(item) for item in _SYSTEM_MESSAGES]


def _prune_expired_sessions(now: float) -> None:
    expired_ids = [
        session_id
        for session_id, touched in _SESSION_TOUCHED_AT.items()
        if now - touched > _SESSION_TTL_SECONDS
    ]
    for session_id in expired_ids:
        _SESSION_TOUCHED_AT.pop(session_id, None)
        _SESSION_HISTORIES.pop(session_id, None)


def _trim_history(history: list[dict[str, str]]) -> list[dict[str, str]]:
    if len(history) <= _MAX_MESSAGES_PER_SESSION:
        return history
    keep_tail = max(_MAX_MESSAGES_PER_SESSION - len(_SYSTEM_MESSAGES), 0)
    tail = history[-keep_tail:] if keep_tail else []
    return _seed_history() + tail


def _parse_retry_after_seconds(headers: httpx.Headers | None) -> float | None:
    if not headers:
        return None
    value = str(headers.get("Retry-After", "")).strip()
    if not value:
        return None
    try:
        seconds = float(value)
    except ValueError:
        return None
    if seconds < 0:
        return None
    return min(seconds, _MAX_RETRY_DELAY_SECONDS)


async def _request_groq_with_retry(payload: dict, headers: dict[str, str]) -> dict:
    async with httpx.AsyncClient(timeout=30.0) as client:
        for attempt in range(_MAX_GROQ_RETRIES + 1):
            response = await client.post(GROQ_API_URL, json=payload, headers=headers)
            if response.status_code != 429:
                response.raise_for_status()
                return response.json()

            if attempt >= _MAX_GROQ_RETRIES:
                response.raise_for_status()

            retry_after = _parse_retry_after_seconds(response.headers)
            wait_seconds = (
                retry_after
                if retry_after is not None
                else min(_BASE_RETRY_DELAY_SECONDS * (2**attempt), _MAX_RETRY_DELAY_SECONDS)
            )
            await asyncio.sleep(wait_seconds)

    raise RuntimeError("Unexpected retry flow while calling Groq API.")


async def _append_user_message(session_id: str | None, message: str) -> tuple[str, list[dict[str, str]]]:
    normalized_session_id = str(session_id or "").strip() or str(uuid4())
    normalized_message = str(message or "").strip()

    async with _HISTORY_LOCK:
        now = time.time()
        _prune_expired_sessions(now)
        history = _SESSION_HISTORIES.get(normalized_session_id)
        if not history:
            history = _seed_history()
        history.append({"role": "user", "content": normalized_message})
        history = _trim_history(history)
        _SESSION_HISTORIES[normalized_session_id] = history
        _SESSION_TOUCHED_AT[normalized_session_id] = now
        return normalized_session_id, [dict(item) for item in history]


async def _append_assistant_message(session_id: str, message: str) -> None:
    normalized_session_id = str(session_id or "").strip()
    if not normalized_session_id:
        return

    async with _HISTORY_LOCK:
        now = time.time()
        _prune_expired_sessions(now)
        history = _SESSION_HISTORIES.get(normalized_session_id)
        if not history:
            history = _seed_history()
        history.append({"role": "assistant", "content": str(message or "").strip()})
        history = _trim_history(history)
        _SESSION_HISTORIES[normalized_session_id] = history
        _SESSION_TOUCHED_AT[normalized_session_id] = now


async def chat_with_groq(message: str, session_id: str | None = None) -> ChatResponse:
    user_message = str(message or "").strip()
    is_emergency = detect_emergency(user_message)

    if not GROQ_API_KEY:
        raise ValueError("GROQ_API_KEY environment variable is not set.")

    active_session_id, history = await _append_user_message(session_id, user_message)

    payload = {
        "model": GROQ_MODEL,
        "messages": history,
        "temperature": 0.45,
        "max_tokens": 1024,
    }
    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json",
    }

    try:
        data = await _request_groq_with_retry(payload, headers)
    except httpx.HTTPStatusError as exc:
        status_code = exc.response.status_code if exc.response is not None else 502
        if status_code == 429:
            retry_after = _parse_retry_after_seconds(exc.response.headers if exc.response else None)
            wait_seconds = max(1, int(round(retry_after))) if retry_after is not None else 6
            raise HTTPException(
                status_code=429,
                detail=(
                    "Dr. Amna is receiving too many requests right now. "
                    f"Please retry in about {wait_seconds} seconds."
                ),
                headers={"Retry-After": str(wait_seconds)},
            ) from exc

        raise HTTPException(
            status_code=502,
            detail="Upstream AI service error. Please try again shortly.",
        ) from exc
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=503,
            detail="Unable to reach the AI service right now. Please check your connection and try again.",
        ) from exc

    ai_reply = str(data["choices"][0]["message"]["content"])
    await _append_assistant_message(active_session_id, ai_reply)

    emergency_prefix = ""
    if is_emergency:
        emergency_prefix = (
            "🚨 **Emergency Alert**\n"
            "This may be a medical emergency.\n"
            "Please call emergency services (**911** or local emergency number) immediately.\n\n"
        )

    final_response = f"{emergency_prefix}{ai_reply}".strip()
    return ChatResponse(response=final_response, session_id=active_session_id, emergency=is_emergency)
