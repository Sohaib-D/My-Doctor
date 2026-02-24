from __future__ import annotations

import asyncio
import hashlib
import logging
import os
import time
from typing import Any

import httpx


DEFAULT_GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
_RETRY_DELAYS_SECONDS = (1.0, 2.0, 4.0)
_MAX_RETRIES = len(_RETRY_DELAYS_SECONDS)

logger = logging.getLogger(__name__)


def _read_int_env(name: str, default: int, *, min_value: int = 1, max_value: int = 10_000) -> int:
    raw = str(os.getenv(name) or "").strip()
    if not raw:
        return default
    try:
        value = int(raw)
    except ValueError:
        return default
    if value < min_value:
        return min_value
    if value > max_value:
        return max_value
    return value


_MAX_CONCURRENT_GROQ_REQUESTS = _read_int_env("GROQ_MAX_CONCURRENCY", 3, min_value=1, max_value=64)
_CACHE_TTL_SECONDS = _read_int_env("GROQ_CACHE_TTL_SECONDS", 300, min_value=1, max_value=3600)
_CACHE_MAX_ITEMS = _read_int_env("GROQ_CACHE_MAX_ITEMS", 2048, min_value=64, max_value=50_000)

_REQUEST_SEMAPHORE = asyncio.Semaphore(_MAX_CONCURRENT_GROQ_REQUESTS)
_CACHE_LOCK = asyncio.Lock()
_RESPONSE_CACHE: dict[str, tuple[float, str]] = {}


def _extract_text_from_content(content: Any) -> str:
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, dict):
                if str(item.get("type") or "") != "text":
                    continue
                text = str(item.get("text") or "").strip()
                if text:
                    parts.append(text)
            elif isinstance(item, str):
                text = item.strip()
                if text:
                    parts.append(text)
        return "\n".join(parts).strip()
    return str(content or "").strip()


def _extract_prompt_text(messages: list[dict[str, Any]]) -> str:
    for item in reversed(messages or []):
        if str((item or {}).get("role") or "") != "user":
            continue
        text = _extract_text_from_content((item or {}).get("content"))
        if text:
            return text
    return ""


def _build_cache_key(model: str, prompt_text: str) -> str:
    source = f"{model.strip()}\n{prompt_text.strip()}"
    return hashlib.sha256(source.encode("utf-8")).hexdigest()


async def _cache_get(cache_key: str) -> str | None:
    now = time.time()
    async with _CACHE_LOCK:
        entry = _RESPONSE_CACHE.get(cache_key)
        if not entry:
            return None
        expires_at, value = entry
        if expires_at <= now:
            _RESPONSE_CACHE.pop(cache_key, None)
            return None
        return value


async def _cache_set(cache_key: str, value: str) -> None:
    now = time.time()
    async with _CACHE_LOCK:
        expired_keys = [key for key, (expires_at, _) in _RESPONSE_CACHE.items() if expires_at <= now]
        for key in expired_keys:
            _RESPONSE_CACHE.pop(key, None)

        if len(_RESPONSE_CACHE) >= _CACHE_MAX_ITEMS:
            oldest_key = next(iter(_RESPONSE_CACHE), None)
            if oldest_key is not None:
                _RESPONSE_CACHE.pop(oldest_key, None)

        _RESPONSE_CACHE[cache_key] = (now + _CACHE_TTL_SECONDS, value)


def _extract_assistant_text_from_payload(payload: dict[str, Any]) -> str:
    choices = payload.get("choices")
    if not isinstance(choices, list) or not choices:
        raise ValueError("Invalid Groq response payload: missing choices.")
    message = choices[0].get("message") if isinstance(choices[0], dict) else None
    if not isinstance(message, dict):
        raise ValueError("Invalid Groq response payload: missing message.")
    content = message.get("content")
    return _extract_text_from_content(content)


def _build_generation_payload(
    *,
    model: str,
    messages: list[dict[str, Any]],
    temperature: float = 0.45,
    max_tokens: int = 1024,
) -> dict[str, Any]:
    return {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }


async def _post_chat_completions_with_retry(
    *,
    payload: dict[str, Any],
    headers: dict[str, str],
    api_url: str,
    timeout_seconds: float,
) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=timeout_seconds) as client:
        for attempt in range(_MAX_RETRIES + 1):
            try:
                async with _REQUEST_SEMAPHORE:
                    response = await client.post(api_url, json=payload, headers=headers)
                response.raise_for_status()
                return response.json()
            except httpx.HTTPStatusError as exc:
                status_code = exc.response.status_code if exc.response is not None else None
                is_retryable = status_code == 429
                if is_retryable and attempt < _MAX_RETRIES:
                    delay = _RETRY_DELAYS_SECONDS[min(attempt, len(_RETRY_DELAYS_SECONDS) - 1)]
                    logger.warning(
                        "Groq rate limit encountered (attempt %s/%s). Retrying in %.1fs.",
                        attempt + 1,
                        _MAX_RETRIES + 1,
                        delay,
                    )
                    await asyncio.sleep(delay)
                    continue
                if is_retryable:
                    logger.warning(
                        "Groq rate limit persisted after %s attempts.",
                        _MAX_RETRIES + 1,
                    )
                raise
            except httpx.RequestError:
                if attempt < _MAX_RETRIES:
                    delay = _RETRY_DELAYS_SECONDS[min(attempt, len(_RETRY_DELAYS_SECONDS) - 1)]
                    logger.warning(
                        "Temporary Groq network error (attempt %s/%s). Retrying in %.1fs.",
                        attempt + 1,
                        _MAX_RETRIES + 1,
                        delay,
                    )
                    await asyncio.sleep(delay)
                    continue
                raise

    raise RuntimeError("Unexpected Groq retry flow.")


async def get_groq_response(
    *,
    model: str,
    messages: list[dict[str, Any]],
    api_key: str,
    api_url: str = DEFAULT_GROQ_API_URL,
    timeout_seconds: float = 30.0,
) -> str:
    normalized_model = str(model or "").strip()
    normalized_api_key = str(api_key or "").strip()
    if not normalized_model:
        raise ValueError("Groq model is required.")
    if not normalized_api_key:
        raise ValueError("Groq API key is required.")

    prompt_text = _extract_prompt_text(messages)
    cache_key = _build_cache_key(normalized_model, prompt_text) if prompt_text else ""
    if cache_key:
        cached = await _cache_get(cache_key)
        if cached is not None:
            logger.info("Groq cache hit for model=%s", normalized_model)
            return cached

    headers = {
        "Authorization": f"Bearer {normalized_api_key}",
        "Content-Type": "application/json",
    }
    payload = _build_generation_payload(model=normalized_model, messages=messages)
    data = await _post_chat_completions_with_retry(
        payload=payload,
        headers=headers,
        api_url=api_url,
        timeout_seconds=timeout_seconds,
    )
    text = _extract_assistant_text_from_payload(data)
    if cache_key and text:
        await _cache_set(cache_key, text)
    return text
