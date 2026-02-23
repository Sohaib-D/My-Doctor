from __future__ import annotations

import asyncio
import logging
import os
import re
import secrets
import time
from asyncio import Lock
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

import httpx
from fastapi import HTTPException

from backend.schemas.chat import ChatAttachment, ChatResponse

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
PRIMARY_MODEL = (os.getenv("PRIMARY_MODEL") or "").strip()
SECONDARY_MODEL = (os.getenv("SECONDARY_MODEL") or "").strip()
TERTIARY_MODEL = (os.getenv("TERTIARY_MODEL") or "").strip()
GROQ_MODEL = PRIMARY_MODEL
GROQ_VISION_MODEL = (os.getenv("GROQ_VISION_MODEL") or "").strip()
logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """
You are a clinically trained medical assistant (Female Doctor) named "Dr. Amna".
Provide structured, evidence-based advice in response to patient questions.

YOUR PERSONALITY:
- Confident, concise, and genuinely helpful
- Warm but not over-the-top
- Give specific answers, not vague responses
- If out of medical domain question is asked by user then answer and guide them to ask medical related question. If both medical and non-medical questions are asked then answer medical question first at priority and then non-medical, and guide them to ask more medical related question.

RESPONSE RULES:
1. Answer directly and specifically. (If out of medical domain question is asked by user then answer and guide them to ask medical related question. If both medical and non-medical questions are asked then answer medical question first at priority and then non-medical, and guide them to ask more medical related question.)
2. Keep responses practical and focused.
3. Use simple language.
4. Avoid exact medication doses. Just mention medication names if relevant, and advise consulting a doctor for dosing. 
5. Do not ask for information already provided. Always remember previous conversation context.
6. Use headings, bullets, and clear formatting when useful.
7. Use 1 to 3 or 5 emojis per response, but only if they add value. Do not use emojis in emergency guidance.
8. If files/images are attached, use their extracted text and visual details in your clinical reasoning.
9. If you are unsure about the user's question, ask focused follow-up questions to clarify before giving advice.
10. Always provide an answer, even if it's to say "I don't know". Never leave the user without a response.
11. If the user asks for a diagnosis, provide a differential diagnosis list with the most likely conditions first, and include red flags to watch for.
12. If the user describes symptoms, provide a structured assessment of possible causes, recommended next steps.
13. If the user asks about medications, provide general informationt.
14. If the user asks about test results, help interpret them as a field specialist and advise on next steps.
15. Always remember that your advice is not a substitute for in-person medical care. Encourage users to see a healthcare professional when appropriate.
16. Always remember that you are a female, so be crefull in your responses in Urdu Script and Roman Urdu to use the feminine form of words when referring to yourself or your advice.

Language rule:
- Reply in the same language the user uses.
- Determine reply language from the latest user message in the current turn.
- English -> English
- Urdu script -> Urdu script with pure Urdu vocabulary (no any other language) and proper Urdu punctuation (\u06d4 \u060c \u061f).
- Roman Urdu -> Roman Urdu (Latin letters only).
- Never switch language on your own. If user writes English or Roman Urdu, do not reply in Urdu script unless user explicitly orders.
- If the user in any language (Roman Urdu or English) explicitly orders Urdu script replies, reply in Urdu Script.
- For Urdu script replies: do not use Devanagari/Hindi words or mixed scripts.
- Keep formatting clear with headings and bullets when useful.

Safety:
- Only include emergency guidance for true red-flag symptoms.
- Ask focused follow-up questions only when required.
""".strip()

CONTEXT_MEMORY_SYSTEM_PROMPT = (
    "Always remember previous conversation context. "
    "Do not ask for information already provided. "
    "Use earlier symptoms and details to give consistent and personalized responses."
)

ATTACHMENT_SYSTEM_PROMPT = (
    "If attachment context is provided, treat it as patient-provided evidence. "
    "For images, analyze relevant visible details. "
    "For files, use extracted text and do not ask the user to repeat already extracted details."
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
    {"role": "system", "content": ATTACHMENT_SYSTEM_PROMPT},
]

# In-memory session store (session-based memory).
_SESSION_HISTORIES: dict[str, list[dict[str, Any]]] = {}
_SESSION_TOUCHED_AT: dict[str, float] = {}
_SESSION_CREATED_AT: dict[str, float] = {}
_SESSION_FLAGS: dict[str, dict[str, Any]] = {}
_SHARED_SESSION_MAP: dict[str, str] = {}
_HISTORY_LOCK = Lock()

_SESSION_TTL_SECONDS = 60 * 60 * 24
_MAX_MESSAGES_PER_SESSION = 120

_MAX_GROQ_RETRIES = 2
_BASE_RETRY_DELAY_SECONDS = 1.2
_MAX_RETRY_DELAY_SECONDS = 8.0
_MAX_ATTACHMENT_TEXT_CHARS = 12000
_MAX_IMAGE_DATA_URL_CHARS = 4_000_000
_MAX_IMAGE_ATTACHMENTS_PER_TURN = 3

_URDU_SCRIPT_RE = re.compile(r"[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]")
_DEVANAGARI_RE = re.compile(r"[\u0900-\u097F]")
_LATIN_RE = re.compile(r"[A-Za-z]")
_URDU_LIST_MARKER_RE = re.compile(r"(?m)^\s*[-*+]\s+")
_URDU_MARKDOWN_DECORATION_RE = re.compile(r"[`*_#]+")
_URDU_BRACKETS_RE = re.compile(r"[()\[\]{}]")
_URDU_MULTISPACE_RE = re.compile(r"[ \t]{2,}")
_URDU_EXCESS_NEWLINES_RE = re.compile(r"\n{3,}")
_URDU_ASCII_PUNCT_TRANSLATION = str.maketrans(
    {
        "?": "\u061f",
        ",": "\u060c",
        ";": "\u061b",
        ".": "\u06d4",
        ":": "\u06d4",
        "!": "\u06d4",
    }
)

_LANG_ENGLISH = "english"
_LANG_URDU_SCRIPT = "urdu_script"
_LANG_ROMAN_URDU = "roman_urdu"

_ROMAN_URDU_HINTS = {
    "aoa",
    "assalam",
    "walikum",
    "salam",
    "salaam",
    "aap",
    "ap",
    "tum",
    "tm",
    "mujhe",
    "mujhy",
    "mera",
    "meri",
    "mere",
    "main",
    "mai",
    "hain",
    "hai",
    "ho",
    "haan",
    "han",
    "hn",
    "nahi",
    "nahin",
    "nai",
    "nhi",
    "kia",
    "kiya",
    "kya",
    "kesay",
    "kaise",
    "kese",
    "kaisy",
    "haal",
    "hal",
    "hay",
    "theek",
    "thik",
    "thk",
    "kr",
    "karo",
    "kar",
    "kren",
    "karein",
    "plz",
    "pleasee",
    "ky",
    "kyu",
    "kyun",
    "kuch",
    "kush",
    "dard",
    "bukhar",
    "khansi",
    "saans",
    "tabiyat",
    "thakan",
    "behosh",
    "dawai",
    "ilaaj",
}

_ENGLISH_HINTS = {
    "a",
    "an",
    "and",
    "are",
    "as",
    "at",
    "be",
    "can",
    "could",
    "do",
    "does",
    "for",
    "from",
    "hello",
    "help",
    "hi",
    "how",
    "i",
    "if",
    "in",
    "is",
    "it",
    "let",
    "me",
    "my",
    "of",
    "on",
    "or",
    "please",
    "thanks",
    "thank",
    "the",
    "this",
    "to",
    "what",
    "when",
    "where",
    "which",
    "who",
    "why",
    "with",
    "you",
    "your",
}

_URDU_SCRIPT_PHRASES = (
    "Ã˜Â§Ã˜Â±Ã˜Â¯Ã™Ë† Ã™â€¦Ã›Å’ÃšÂº",
    "Ã˜Â§Ã™ÂÃ˜Â±Ã˜Â¯Ã™Ë† Ã™â€¦Ã›Å’ÃšÂº",
    "Ã˜Â§Ã˜Â±Ã˜Â¯Ã™Ë† Ã™â€¦Ã™Å ÃšÂº",
)

_URDU_SCRIPT_REQUEST_PATTERNS = (
    re.compile(r"\burdu\s+script\b", re.IGNORECASE),
    re.compile(r"\bin\s+urdu\b", re.IGNORECASE),
    re.compile(r"\burdu\s+(mein|main|me|may|mai)\b", re.IGNORECASE),
    re.compile(r"\b(reply|write|answer)\s+in\s+urdu\b", re.IGNORECASE),
    re.compile(r"\burdu\s+(likho|likhen|likhein|jawab|batao|btao)\b", re.IGNORECASE),
)


def _roman_urdu_hit_count(tokens: list[str]) -> int:
    return sum(1 for token in tokens if token in _ROMAN_URDU_HINTS)


def _english_hit_count(tokens: list[str]) -> int:
    return sum(1 for token in tokens if token in _ENGLISH_HINTS)


def _looks_like_roman_urdu(tokens: list[str]) -> bool:
    if not tokens:
        return False
    roman_hits = _roman_urdu_hit_count(tokens)
    english_hits = _english_hit_count(tokens)

    if roman_hits >= 2:
        return True
    if roman_hits >= 1 and len(tokens) <= 8 and english_hits <= 1:
        return True
    if len(tokens) <= 4 and roman_hits >= 1 and english_hits == 0:
        return True
    return False


def detect_emergency(message: str) -> bool:
    message_lower = str(message or "").lower()
    return any(keyword in message_lower for keyword in EMERGENCY_KEYWORDS)


def _contains_urdu_script(text: str) -> bool:
    return bool(_URDU_SCRIPT_RE.search(str(text or "")))


def _contains_devanagari(text: str) -> bool:
    return bool(_DEVANAGARI_RE.search(str(text or "")))


def _contains_latin(text: str) -> bool:
    return bool(_LATIN_RE.search(str(text or "")))


def _tokenize_latin_words(text: str) -> list[str]:
    return re.findall(r"[A-Za-z']+", str(text or "").lower())


def _explicitly_requests_urdu_script(text: str) -> bool:
    raw = str(text or "").strip()
    if not raw:
        return False
    lowered = raw.lower()
    if any(phrase in raw for phrase in _URDU_SCRIPT_PHRASES):
        return True
    return any(pattern.search(lowered) for pattern in _URDU_SCRIPT_REQUEST_PATTERNS)


def _detect_expected_language(user_message: str) -> str:
    text = str(user_message or "").strip()
    if not text:
        return _LANG_ENGLISH

    if _explicitly_requests_urdu_script(text):
        return _LANG_URDU_SCRIPT

    if _contains_urdu_script(text):
        return _LANG_URDU_SCRIPT

    tokens = _tokenize_latin_words(text)
    if not tokens:
        return _LANG_ENGLISH

    if _looks_like_roman_urdu(tokens):
        return _LANG_ROMAN_URDU
    return _LANG_ENGLISH


def _build_turn_language_instruction(expected_language: str) -> str:
    if expected_language == _LANG_URDU_SCRIPT:
        return (
            "Reply only in Urdu script. Use pure Urdu vocabulary with proper Urdu punctuation (\u06d4 \u060c \u061f). "
            "Do not use English, Roman Urdu, Devanagari, or mixed scripts. "
            "When referring to yourself, use feminine wording."
        )
    if expected_language == _LANG_ROMAN_URDU:
        return (
            "Reply only in Roman Urdu using Latin letters. "
            "Do not use Urdu script or Devanagari. "
            "When referring to yourself, use feminine wording."
        )
    return "Reply only in English. Do not use Urdu script or Devanagari."



def _inject_turn_system_message(messages: list[dict[str, Any]], instruction: str) -> list[dict[str, Any]]:
    if not instruction:
        return messages
    system_message = {"role": "system", "content": instruction}
    if not messages:
        return [system_message]
    if str(messages[-1].get("role") or "") == "user":
        return [*messages[:-1], system_message, messages[-1]]
    return [*messages, system_message]


def _normalize_urdu_script_reply(text: str) -> str:
    value = str(text or "").replace("\r\n", "\n").replace("\r", "\n").strip()
    if not value:
        return ""

    value = _URDU_LIST_MARKER_RE.sub("\u2022 ", value)
    value = _URDU_MARKDOWN_DECORATION_RE.sub("", value)
    value = value.translate(_URDU_ASCII_PUNCT_TRANSLATION)
    value = _URDU_BRACKETS_RE.sub(" ", value)
    value = _URDU_MULTISPACE_RE.sub(" ", value)
    value = _URDU_EXCESS_NEWLINES_RE.sub("\n\n", value)
    return value.strip()


def _normalize_reply_for_expected_language(text: str, expected_language: str) -> str:
    value = str(text or "").strip()
    if expected_language == _LANG_URDU_SCRIPT:
        return _normalize_urdu_script_reply(value)
    return value


def _is_language_compliant(text: str, expected_language: str) -> bool:
    """Return True if *text* appears to comply with *expected_language*.

    - Urdu-script responses must contain Urdu characters,
      and may not include Latin or Devanagari scripts.
    - Roman Urdu responses are composed of Latin words that look
      like Urdu and must not contain native script characters.
    - English responses may not contain Urdu/Devanagari text and
      should not resemble Roman Urdu.
    """
    value = str(text or "").strip()
    if not value:
        return False

    if expected_language == _LANG_URDU_SCRIPT:
        # must contain at least one Urdu script character
        if not _contains_urdu_script(value):
            return False
        # disallow other scripts
        if _contains_devanagari(value):
            return False
        if _contains_latin(value):
            return False
        return True

    if expected_language == _LANG_ROMAN_URDU:
        # roman urdu should have only latin letters and not any native script
        if _contains_urdu_script(value) or _contains_devanagari(value):
            return False
        tokens = _tokenize_latin_words(value)
        return _looks_like_roman_urdu(tokens)

    # expected English
    if _contains_urdu_script(value) or _contains_devanagari(value):
        return False
    tokens = _tokenize_latin_words(value)
    if _looks_like_roman_urdu(tokens):
        return False
    return _contains_latin(value)


def _build_language_rewrite_instruction(expected_language: str) -> str:
    if expected_language == _LANG_URDU_SCRIPT:
        return (
            "Rewrite the response in pure Urdu script only. "
            "Keep the same medical meaning, structure, and safety notes. "
            "Use pure Urdu vocabulary and proper Urdu punctuation (\u06d4 \u060c \u061f). "
            "Do not use English, Roman Urdu, Devanagari, or mixed scripts. "
            "Use feminine wording for self-reference."
        )
    if expected_language == _LANG_ROMAN_URDU:
        return (
            "Rewrite the response in Roman Urdu only using Latin letters. "
            "Keep the same medical meaning and structure. "
            "Do not use Urdu script or Devanagari. "
            "Use feminine wording for self-reference."
        )
    return (
        "Rewrite the response in clear English only. "
        "Keep the same medical meaning and structure. "
        "Do not use Urdu script or Devanagari."
    )


def _build_language_fallback(expected_language: str) -> str:
    if expected_language == _LANG_URDU_SCRIPT:
        return (
            "\u0645\u06cc\u06ba \u0622\u067e \u06a9\u06cc \u0645\u062f\u062f \u06a9\u06d2 \u0644\u06cc\u06d2 \u0645\u0648\u062c\u0648\u062f \u06c1\u0648\u06ba\u06d4 "
            "\u0628\u0631\u0627\u06c1\u0650 \u06a9\u0631\u0645 \u0627\u067e\u0646\u0627 \u0637\u0628\u06cc \u0633\u0648\u0627\u0644 \u0648\u0627\u0636\u062d \u0627\u0646\u062f\u0627\u0632 \u0645\u06cc\u06ba \u0644\u06a9\u06be\u06cc\u06ba \u062a\u0627\u06a9\u06c1 \u0645\u06cc\u06ba \u0628\u06c1\u062a\u0631 \u0631\u06c1\u0646\u0645\u0627\u0626\u06cc \u06a9\u0631 \u0633\u06a9\u0648\u06ba\u06d4"
        )
    if expected_language == _LANG_ROMAN_URDU:
        return (
            "Main aap ki madad ke liye maujood hoon. "
            "Barah-e-karam apna tibbi sawal wazeh taur par likhen taa ke main behtar rehnumai kar sakun."
        )
    return (
        "I am here to help you. "
        "Please share your medical question clearly so I can guide you better."
    )

async def _rewrite_reply_for_language(
    ai_reply: str,
    *,
    expected_language: str,
) -> str:
    rewrite_instruction = _build_language_rewrite_instruction(expected_language)
    rewritten = await generate_with_fallback(
        [
            {
                "role": "system",
                "content": (
                    "You are a medical response language editor. "
                    "Rewrite only. Do not add new facts."
                ),
            },
            {
                "role": "user",
                "content": (
                    f"{rewrite_instruction}\n\n"
                    "Original response:\n"
                    f"{ai_reply}"
                ),
            },
        ]
    )
    return rewritten or ai_reply


def _build_emergency_prefix(expected_language: str) -> str:
    if expected_language == _LANG_URDU_SCRIPT:
        return (
            "**\u06c1\u0646\u06af\u0627\u0645\u06cc \u062a\u0646\u0628\u06cc\u06c1**\n"
            "\u06cc\u06c1 \u0637\u0628\u06cc \u06c1\u0646\u06af\u0627\u0645\u06cc \u0635\u0648\u0631\u062a\u0650 \u062d\u0627\u0644 \u06c1\u0648 \u0633\u06a9\u062a\u06cc \u06c1\u06d2\u06d4\n"
            "\u0628\u0631\u0627\u06c1\u0650 \u06a9\u0631\u0645 \u0641\u0648\u0631\u0627\u064b \u0627\u06cc\u0645\u0631\u062c\u0646\u0633\u06cc \u0633\u0631\u0648\u0633\u0632 (911 \u06cc\u0627 \u0627\u067e\u0646\u06d2 \u0645\u0642\u0627\u0645\u06cc \u06c1\u0646\u06af\u0627\u0645\u06cc \u0646\u0645\u0628\u0631) \u067e\u0631 \u0631\u0627\u0628\u0637\u06c1 \u06a9\u0631\u06cc\u06ba\u06d4\n\n"
        )
    if expected_language == _LANG_ROMAN_URDU:
        return (
            "**Emergency Alert**\n"
            "Yeh medical emergency ho sakti hai.\n"
            "Barah-e-karam foran emergency services (911 ya local emergency number) ko call karein.\n\n"
        )
    return (
        "**Emergency Alert**\n"
        "This may be a medical emergency.\n"
        "Please call emergency services (911 or local emergency number) immediately.\n\n"
    )

def _seed_history() -> list[dict[str, Any]]:
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
        _SESSION_CREATED_AT.pop(session_id, None)
        _SESSION_FLAGS.pop(session_id, None)
        stale_shares = [share_id for share_id, value in _SHARED_SESSION_MAP.items() if value == session_id]
        for share_id in stale_shares:
            _SHARED_SESSION_MAP.pop(share_id, None)


def _get_session_flags(session_id: str) -> dict[str, Any]:
    flags = _SESSION_FLAGS.get(session_id)
    if flags:
        return flags
    flags = {
        "is_pinned": False,
        "is_archived": False,
        "pinned_at": None,
    }
    _SESSION_FLAGS[session_id] = flags
    return flags


def _trim_history(history: list[dict[str, Any]]) -> list[dict[str, Any]]:
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


def _clean_text(value: str | None, *, max_len: int = _MAX_ATTACHMENT_TEXT_CHARS) -> str:
    raw = str(value or "").replace("\x00", "").strip()
    if not raw:
        return ""
    return raw[:max_len]


def _normalize_image_data_url(value: str | None) -> str:
    raw = str(value or "").strip()
    if not raw:
        return ""
    if not raw.startswith("data:image/"):
        return ""
    if len(raw) > _MAX_IMAGE_DATA_URL_CHARS:
        return ""
    return raw


def _build_attachment_context(attachments: list[ChatAttachment] | None) -> tuple[str, list[str]]:
    items = attachments or []
    if not items:
        return "", []

    text_blocks: list[str] = []
    image_urls: list[str] = []

    for idx, item in enumerate(items, start=1):
        name = _clean_text(item.name, max_len=120) or f"Attachment {idx}"
        mime = _clean_text(item.mime_type, max_len=80)
        text_content = _clean_text(item.text_content, max_len=_MAX_ATTACHMENT_TEXT_CHARS)
        image_url = _normalize_image_data_url(item.image_data_url)

        label = f"{name} ({mime})" if mime else name
        if text_content:
            text_blocks.append(f"[File {idx}: {label}]\nExtracted text:\n{text_content}")
        elif image_url:
            text_blocks.append(
                f"[Image {idx}: {label}]\n"
                "User attached this image for visual analysis. "
                "Use only medically relevant visible details."
            )
            image_urls.append(image_url)
        else:
            text_blocks.append(f"[Attachment {idx}: {label}]")

    return "\n\n".join(text_blocks), image_urls[:_MAX_IMAGE_ATTACHMENTS_PER_TURN]


def _build_storage_user_message(message: str, attachment_context: str) -> str:
    base = _clean_text(message, max_len=2400)
    extra = _clean_text(attachment_context, max_len=20_000)
    if not extra:
        return base
    if not base:
        return f"Attachment context:\n{extra}"
    return f"{base}\n\nAttachment context:\n{extra}"


def _build_request_messages(
    history: list[dict[str, Any]],
    *,
    latest_user_message: str,
    attachment_context: str,
    image_urls: list[str],
) -> list[dict[str, Any]]:
    messages = [dict(item) for item in history]
    if not messages:
        return messages
    if not image_urls:
        return messages

    content_blocks: list[dict[str, Any]] = []
    user_text = _clean_text(latest_user_message, max_len=2400)
    if user_text:
        content_blocks.append({"type": "text", "text": user_text})
    if attachment_context:
        content_blocks.append({"type": "text", "text": f"Attachment context:\n{attachment_context}"})
    for image_url in image_urls:
        content_blocks.append({"type": "image_url", "image_url": {"url": image_url}})

    if content_blocks:
        messages[-1] = {"role": "user", "content": content_blocks}
    return messages


def _extract_assistant_text(content: Any) -> str:
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, dict) and str(item.get("type")) == "text":
                text_part = _clean_text(str(item.get("text") or ""), max_len=6000)
                if text_part:
                    parts.append(text_part)
        return "\n".join(parts).strip()
    return _clean_text(str(content or ""), max_len=6000)


def _is_rate_limited_error(exc: Exception) -> bool:
    if isinstance(exc, httpx.HTTPStatusError):
        status_code = exc.response.status_code if exc.response is not None else None
        if status_code == 429:
            return True
        response_text = ""
        if exc.response is not None:
            try:
                response_text = exc.response.text or ""
            except Exception:
                response_text = ""
        if "rate limit" in response_text.lower():
            return True
    return "rate limit" in str(exc or "").lower()


def _build_generation_payload(model: str, messages: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "model": model,
        "messages": messages,
        "temperature": 0.45,
        "max_tokens": 1024,
    }


async def _request_groq_once(payload: dict[str, Any], headers: dict[str, str]) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(GROQ_API_URL, json=payload, headers=headers)
    response.raise_for_status()
    return response.json()


async def _generate_with_model(
    model: str,
    messages: list[dict[str, Any]],
    headers: dict[str, str],
) -> str:
    payload = _build_generation_payload(model, messages)
    data = await _request_groq_once(payload, headers)
    return _extract_assistant_text(data["choices"][0]["message"]["content"])


async def generate_with_fallback(messages: list[dict[str, Any]]) -> str:
    if not PRIMARY_MODEL or not SECONDARY_MODEL or not TERTIARY_MODEL:
        raise HTTPException(
            status_code=500,
            detail="Model fallback configuration is incomplete.",
        )

    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json",
    }

    try:
        try:
            return await _generate_with_model(PRIMARY_MODEL, messages, headers)
        except httpx.HTTPStatusError as primary_exc:
            if not _is_rate_limited_error(primary_exc):
                raise
            logger.warning("Primary rate limited. Switching to secondary.")
            try:
                return await _generate_with_model(SECONDARY_MODEL, messages, headers)
            except httpx.HTTPStatusError as secondary_exc:
                if not _is_rate_limited_error(secondary_exc):
                    raise
                logger.warning("Secondary rate limited. Switching to tertiary.")
                try:
                    return await _generate_with_model(TERTIARY_MODEL, messages, headers)
                except httpx.HTTPStatusError as tertiary_exc:
                    if _is_rate_limited_error(tertiary_exc):
                        raise HTTPException(
                            status_code=503,
                            detail="All models are currently rate limited. Please try again shortly.",
                        ) from tertiary_exc
                    raise
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=502,
            detail="Upstream AI service error. Please try again shortly.",
        ) from exc
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=503,
            detail="Unable to reach the AI service right now. Please check your connection and try again.",
        ) from exc


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


async def _append_user_message(session_id: str | None, message: str) -> tuple[str, list[dict[str, Any]]]:
    normalized_session_id = str(session_id or "").strip() or str(uuid4())
    normalized_message = str(message or "").strip()

    async with _HISTORY_LOCK:
        now = time.time()
        _prune_expired_sessions(now)
        history = _SESSION_HISTORIES.get(normalized_session_id)
        is_new_session = history is None
        if not history:
            history = _seed_history()
        history.append({"role": "user", "content": normalized_message})
        history = _trim_history(history)
        _SESSION_HISTORIES[normalized_session_id] = history
        _SESSION_TOUCHED_AT[normalized_session_id] = now
        if is_new_session:
            _SESSION_CREATED_AT[normalized_session_id] = now
            _get_session_flags(normalized_session_id)
        else:
            _SESSION_CREATED_AT.setdefault(normalized_session_id, now)
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
            _SESSION_CREATED_AT.setdefault(normalized_session_id, now)
            _get_session_flags(normalized_session_id)
        history.append({"role": "assistant", "content": str(message or "").strip()})
        history = _trim_history(history)
        _SESSION_HISTORIES[normalized_session_id] = history
        _SESSION_TOUCHED_AT[normalized_session_id] = now


def _history_to_ui_messages(session_id: str, history: list[dict[str, Any]]) -> list[dict[str, Any]]:
    messages: list[dict[str, Any]] = []
    idx = 0
    for item in history:
        role = str(item.get("role") or "")
        if role == "system":
            continue
        text = _extract_assistant_text(item.get("content"))
        if not text:
            continue
        idx += 1
        messages.append(
            {
                "id": f"{session_id}-{idx}",
                "role": role,
                "text": text,
                "created_at": None,
            }
        )
    return messages


def _derive_session_title(history: list[dict[str, Any]]) -> str:
    for item in history:
        if str(item.get("role")) != "user":
            continue
        text = _extract_assistant_text(item.get("content"))
        if not text:
            continue
        first_line = text.splitlines()[0].strip()
        return _clean_text(first_line, max_len=80) or "New chat"
    return "New chat"


async def hydrate_session_history(
    session_id: str,
    messages: list[dict[str, Any]] | None,
    *,
    replace: bool = False,
) -> None:
    normalized_session_id = str(session_id or "").strip()
    if not normalized_session_id:
        return

    async with _HISTORY_LOCK:
        now = time.time()
        _prune_expired_sessions(now)
        if normalized_session_id in _SESSION_HISTORIES and not replace:
            _SESSION_TOUCHED_AT[normalized_session_id] = now
            _SESSION_CREATED_AT.setdefault(normalized_session_id, now)
            _get_session_flags(normalized_session_id)
            return

        history = _seed_history()
        for entry in messages or []:
            role = str((entry or {}).get("role") or "").strip().lower()
            if role not in {"user", "assistant"}:
                continue
            text = _clean_text(str((entry or {}).get("text") or ""), max_len=12000)
            if not text:
                continue
            history.append({"role": role, "content": text})

        history = _trim_history(history)
        _SESSION_HISTORIES[normalized_session_id] = history
        _SESSION_TOUCHED_AT[normalized_session_id] = now
        _SESSION_CREATED_AT.setdefault(normalized_session_id, now)
        _get_session_flags(normalized_session_id)


async def get_session_flags_snapshot(session_id: str) -> dict[str, Any]:
    normalized_session_id = str(session_id or "").strip()
    if not normalized_session_id:
        return {
            "is_pinned": False,
            "is_archived": False,
            "pinned_at": None,
        }

    async with _HISTORY_LOCK:
        now = time.time()
        _prune_expired_sessions(now)
        flags = _get_session_flags(normalized_session_id)
        _SESSION_TOUCHED_AT[normalized_session_id] = now
        return {
            "is_pinned": bool(flags.get("is_pinned")),
            "is_archived": bool(flags.get("is_archived")),
            "pinned_at": flags.get("pinned_at"),
        }


async def list_session_summaries() -> list[dict[str, Any]]:
    async with _HISTORY_LOCK:
        now = time.time()
        _prune_expired_sessions(now)
        sessions: list[dict[str, Any]] = []
        for session_id, history in _SESSION_HISTORIES.items():
            ui_messages = _history_to_ui_messages(session_id, history)
            created_ts = _SESSION_CREATED_AT.get(session_id, _SESSION_TOUCHED_AT.get(session_id, now))
            touched_ts = _SESSION_TOUCHED_AT.get(session_id, created_ts)
            flags = _get_session_flags(session_id)
            pinned_at_ts = flags.get("pinned_at")
            sessions.append(
                {
                    "id": session_id,
                    "title": _derive_session_title(history),
                    "created_at": datetime.fromtimestamp(created_ts, tz=timezone.utc),
                    "last_message_at": datetime.fromtimestamp(touched_ts, tz=timezone.utc),
                    "message_count": len(ui_messages),
                    "is_pinned": bool(flags.get("is_pinned")),
                    "is_archived": bool(flags.get("is_archived")),
                    "pinned_at": (
                        datetime.fromtimestamp(float(pinned_at_ts), tz=timezone.utc)
                        if pinned_at_ts
                        else None
                    ),
                }
            )
        sessions.sort(
            key=lambda item: (
                0 if item["is_pinned"] else 1,
                -(item["last_message_at"].timestamp() if item["last_message_at"] else 0.0),
            )
        )
        return sessions


async def get_session_history(session_id: str) -> list[dict[str, Any]]:
    normalized_session_id = str(session_id or "").strip()
    if not normalized_session_id:
        return []
    async with _HISTORY_LOCK:
        now = time.time()
        _prune_expired_sessions(now)
        history = _SESSION_HISTORIES.get(normalized_session_id)
        if not history:
            return []
        return _history_to_ui_messages(normalized_session_id, history)


async def pin_session(session_id: str, is_pinned: bool) -> bool:
    normalized_session_id = str(session_id or "").strip()
    if not normalized_session_id:
        return False
    async with _HISTORY_LOCK:
        now = time.time()
        _prune_expired_sessions(now)
        if (
            normalized_session_id not in _SESSION_HISTORIES
            and normalized_session_id not in _SESSION_FLAGS
        ):
            return False
        flags = _get_session_flags(normalized_session_id)
        flags["is_pinned"] = bool(is_pinned)
        flags["pinned_at"] = now if is_pinned else None
        _SESSION_TOUCHED_AT[normalized_session_id] = now
        return True


async def archive_session(session_id: str, is_archived: bool) -> bool:
    normalized_session_id = str(session_id or "").strip()
    if not normalized_session_id:
        return False
    async with _HISTORY_LOCK:
        now = time.time()
        _prune_expired_sessions(now)
        if (
            normalized_session_id not in _SESSION_HISTORIES
            and normalized_session_id not in _SESSION_FLAGS
        ):
            return False
        flags = _get_session_flags(normalized_session_id)
        flags["is_archived"] = bool(is_archived)
        _SESSION_TOUCHED_AT[normalized_session_id] = now
        return True


async def delete_session(session_id: str) -> bool:
    normalized_session_id = str(session_id or "").strip()
    if not normalized_session_id:
        return False
    async with _HISTORY_LOCK:
        now = time.time()
        _prune_expired_sessions(now)
        existed = normalized_session_id in _SESSION_HISTORIES
        _SESSION_HISTORIES.pop(normalized_session_id, None)
        _SESSION_TOUCHED_AT.pop(normalized_session_id, None)
        _SESSION_CREATED_AT.pop(normalized_session_id, None)
        _SESSION_FLAGS.pop(normalized_session_id, None)
        stale_shares = [share_id for share_id, value in _SHARED_SESSION_MAP.items() if value == normalized_session_id]
        for share_id in stale_shares:
            _SHARED_SESSION_MAP.pop(share_id, None)
        return existed


async def create_share_link(session_id: str) -> str | None:
    normalized_session_id = str(session_id or "").strip()
    if not normalized_session_id:
        return None
    async with _HISTORY_LOCK:
        now = time.time()
        _prune_expired_sessions(now)
        if normalized_session_id not in _SESSION_HISTORIES:
            return None
        for share_id, mapped_session_id in _SHARED_SESSION_MAP.items():
            if mapped_session_id == normalized_session_id:
                return share_id
        share_id = secrets.token_urlsafe(12)
        _SHARED_SESSION_MAP[share_id] = normalized_session_id
        return share_id


async def get_shared_conversation(share_id: str) -> dict[str, Any] | None:
    normalized_share_id = str(share_id or "").strip()
    if not normalized_share_id:
        return None
    async with _HISTORY_LOCK:
        now = time.time()
        _prune_expired_sessions(now)
        session_id = _SHARED_SESSION_MAP.get(normalized_share_id)
        if not session_id:
            return None
        history = _SESSION_HISTORIES.get(session_id)
        if not history:
            return None
        return {
            "share_id": normalized_share_id,
            "session_id": session_id,
            "title": _derive_session_title(history),
            "messages": _history_to_ui_messages(session_id, history),
        }


async def chat_with_groq(
    message: str,
    session_id: str | None = None,
    attachments: list[ChatAttachment] | None = None,
) -> ChatResponse:
    user_message = str(message or "").strip()
    expected_language = _detect_expected_language(user_message)
    attachment_context, image_urls = _build_attachment_context(attachments)
    storage_user_message = _build_storage_user_message(user_message, attachment_context)
    emergency_probe_text = "\n".join(part for part in [user_message, attachment_context] if part).strip()
    is_emergency = detect_emergency(emergency_probe_text)

    if not GROQ_API_KEY:
        raise ValueError("GROQ_API_KEY environment variable is not set.")

    active_session_id, history = await _append_user_message(session_id, storage_user_message)
    request_messages = _build_request_messages(
        history,
        latest_user_message=user_message,
        attachment_context=attachment_context,
        image_urls=image_urls,
    )
    language_instruction = _build_turn_language_instruction(expected_language)
    request_messages = _inject_turn_system_message(request_messages, language_instruction)

    ai_reply = await generate_with_fallback(request_messages)
    ai_reply = _normalize_reply_for_expected_language(ai_reply, expected_language)
    if not _is_language_compliant(ai_reply, expected_language):
        try:
            ai_reply = await _rewrite_reply_for_language(
                ai_reply,
                expected_language=expected_language,
            )
            ai_reply = _normalize_reply_for_expected_language(ai_reply, expected_language)
        except Exception:
            # Keep original reply if rewrite service fails.
            pass
    if not _is_language_compliant(ai_reply, expected_language):
        try:
            ai_reply = await _rewrite_reply_for_language(
                ai_reply,
                expected_language=expected_language,
            )
            ai_reply = _normalize_reply_for_expected_language(ai_reply, expected_language)
        except Exception:
            pass
    if not _is_language_compliant(ai_reply, expected_language):
        ai_reply = _build_language_fallback(expected_language)
    await _append_assistant_message(active_session_id, ai_reply)

    emergency_prefix = ""
    if is_emergency:
        emergency_prefix = _build_emergency_prefix(expected_language)

    final_response = f"{emergency_prefix}{ai_reply}".strip()
    return ChatResponse(response=final_response, session_id=active_session_id, emergency=is_emergency)
