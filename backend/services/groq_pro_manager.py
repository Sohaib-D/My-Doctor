from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from typing import Any, AsyncGenerator

import httpx
from fastapi import HTTPException


logger = logging.getLogger(__name__)

GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"


class _RateLimitedKeyError(Exception):
    """Raised when a key is rate-limited and moved to cooldown."""


class _TransientUpstreamError(Exception):
    """Raised for temporary upstream issues where fast failover is safe."""


def _read_int_env(name: str, default: int, *, min_value: int = 1, max_value: int = 3600) -> int:
    raw = str(os.getenv(name) or "").strip()
    if not raw:
        return default
    try:
        parsed = int(raw)
    except ValueError:
        return default
    return max(min_value, min(max_value, parsed))


def _read_key_list() -> list[str]:
    raw_keys = str(os.getenv("GROQ_API_KEYS") or "").strip()
    keys = [part.strip() for part in raw_keys.split(",") if part.strip()]
    if keys:
        return keys
    single = str(os.getenv("GROQ_API_KEY") or "").strip()
    return [single] if single else []


def _read_model_list() -> list[str]:
    primary = str(os.getenv("PRIMARY_MODEL") or "").strip()
    secondary = str(os.getenv("SECONDARY_MODEL") or "").strip()
    tertiary = str(os.getenv("TERTIARY_MODEL") or "").strip()
    models = [model for model in (primary, secondary, tertiary) if model]
    # Preserve order but avoid duplicates.
    seen: set[str] = set()
    unique: list[str] = []
    for model in models:
        if model in seen:
            continue
        seen.add(model)
        unique.append(model)
    return unique


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


def _extract_assistant_text(payload: dict[str, Any]) -> str:
    choices = payload.get("choices")
    if not isinstance(choices, list) or not choices:
        return ""
    first_choice = choices[0] if isinstance(choices[0], dict) else {}
    message = first_choice.get("message") if isinstance(first_choice, dict) else {}
    if not isinstance(message, dict):
        return ""
    return _extract_text_from_content(message.get("content"))


def _normalize_messages(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [dict(message or {}) for message in (messages or [])]


def _coerce_image_url(item: Any) -> str:
    if isinstance(item, str):
        return item.strip()
    if isinstance(item, dict):
        if "url" in item:
            return str(item.get("url") or "").strip()
        if "image_url" in item:
            nested = item.get("image_url")
            if isinstance(nested, dict):
                return str(nested.get("url") or "").strip()
            return str(nested or "").strip()
    return ""


class GroqProManager:
    def __init__(self) -> None:
        self.keys = _read_key_list()
        self.models = _read_model_list()
        self.vision_model = str(os.getenv("GROQ_VISION_MODEL") or "").strip()
        self.cooldown_seconds = _read_int_env("GROQ_COOLDOWN_SECONDS", 60, min_value=1, max_value=3600)
        self.cooldowns: dict[str, float] = {}

        self._cooldown_lock = asyncio.Lock()
        self._client_lock = asyncio.Lock()
        self._client: httpx.AsyncClient | None = None
        self._key_to_index = {key: index for index, key in enumerate(self.keys)}

    def has_keys(self) -> bool:
        return bool(self.keys)

    def has_models(self) -> bool:
        return bool(self.models)

    async def _get_client(self) -> httpx.AsyncClient:
        client = self._client
        if client is not None and not client.is_closed:
            return client

        async with self._client_lock:
            client = self._client
            if client is None or client.is_closed:
                self._client = httpx.AsyncClient(timeout=30.0)
            return self._client

    async def _available_keys(self) -> list[tuple[int, str]]:
        now = time.time()
        entries: list[tuple[int, str]] = []
        async with self._cooldown_lock:
            for index, key in enumerate(self.keys):
                available_at = float(self.cooldowns.get(key, 0.0))
                if now >= available_at:
                    entries.append((index, key))
        return entries

    async def _set_cooldown(self, key: str) -> None:
        if not key:
            return
        available_at = time.time() + float(self.cooldown_seconds)
        async with self._cooldown_lock:
            self.cooldowns[key] = available_at
        key_index = self._key_to_index.get(key, -1)
        logger.warning(
            "Groq key rate-limited. Cooldown started key_index=%s cooldown_seconds=%s",
            key_index,
            self.cooldown_seconds,
        )

    @staticmethod
    def _build_payload(
        *,
        model: str,
        messages: list[dict[str, Any]],
        temperature: float,
        max_tokens: int,
        stream: bool = False,
    ) -> dict[str, Any]:
        payload = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        if stream:
            payload["stream"] = True
        return payload

    @staticmethod
    def _build_headers(api_key: str) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }

    async def _request_json(
        self,
        *,
        api_key: str,
        key_index: int,
        model: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        client = await self._get_client()
        headers = self._build_headers(api_key)
        logger.info("Groq request model=%s key_index=%s", model, key_index)

        try:
            response = await client.post(GROQ_API_URL, json=payload, headers=headers)
        except httpx.RequestError as exc:
            raise _TransientUpstreamError(str(exc)) from exc

        if response.status_code == 429:
            await self._set_cooldown(api_key)
            raise _RateLimitedKeyError(f"rate limited key_index={key_index}")

        if response.status_code >= 500:
            raise _TransientUpstreamError(f"upstream {response.status_code}")

        response.raise_for_status()
        return response.json()

    async def chat(
        self,
        messages: list[dict[str, Any]],
        *,
        temperature: float = 0.45,
        max_tokens: int = 1024,
    ) -> str:
        if not self.has_keys():
            raise HTTPException(status_code=500, detail="Groq API key configuration is missing.")
        if not self.has_models():
            raise HTTPException(status_code=500, detail="Model fallback configuration is incomplete.")

        normalized_messages = _normalize_messages(messages)

        for model in self.models:
            key_entries = await self._available_keys()
            for key_index, api_key in key_entries:
                payload = self._build_payload(
                    model=model,
                    messages=normalized_messages,
                    temperature=temperature,
                    max_tokens=max_tokens,
                    stream=False,
                )
                try:
                    data = await self._request_json(
                        api_key=api_key,
                        key_index=key_index,
                        model=model,
                        payload=payload,
                    )
                    return _extract_assistant_text(data)
                except _RateLimitedKeyError:
                    continue
                except _TransientUpstreamError as exc:
                    logger.warning(
                        "Groq transient failure model=%s key_index=%s error=%s",
                        model,
                        key_index,
                        exc,
                    )
                    continue

        logger.error("All Groq models exhausted for current request.")
        raise HTTPException(status_code=503, detail="All Groq capacity exhausted")

    async def _stream_once(
        self,
        *,
        api_key: str,
        key_index: int,
        model: str,
        payload: dict[str, Any],
    ) -> AsyncGenerator[str, None]:
        client = await self._get_client()
        headers = self._build_headers(api_key)
        logger.info("Groq stream request model=%s key_index=%s", model, key_index)

        try:
            async with client.stream("POST", GROQ_API_URL, json=payload, headers=headers) as response:
                if response.status_code == 429:
                    await self._set_cooldown(api_key)
                    raise _RateLimitedKeyError(f"rate limited key_index={key_index}")
                if response.status_code >= 500:
                    raise _TransientUpstreamError(f"upstream {response.status_code}")
                response.raise_for_status()

                async for line in response.aiter_lines():
                    if not line:
                        continue
                    if not line.startswith("data:"):
                        continue
                    chunk_payload = line[5:].strip()
                    if not chunk_payload:
                        continue
                    if chunk_payload == "[DONE]":
                        yield "data: [DONE]\n\n"
                        return
                    try:
                        parsed = json.loads(chunk_payload)
                    except json.JSONDecodeError:
                        continue
                    choices = parsed.get("choices")
                    if not isinstance(choices, list) or not choices:
                        continue
                    delta = choices[0].get("delta") if isinstance(choices[0], dict) else None
                    if not isinstance(delta, dict):
                        continue
                    text = str(delta.get("content") or "")
                    if text:
                        yield f"data: {text}\n\n"
        except httpx.RequestError as exc:
            raise _TransientUpstreamError(str(exc)) from exc

    async def chat_stream(
        self,
        messages: list[dict[str, Any]],
        *,
        temperature: float = 0.45,
        max_tokens: int = 1024,
    ) -> AsyncGenerator[str, None]:
        if not self.has_keys():
            raise HTTPException(status_code=500, detail="Groq API key configuration is missing.")
        if not self.has_models():
            raise HTTPException(status_code=500, detail="Model fallback configuration is incomplete.")

        normalized_messages = _normalize_messages(messages)

        for model in self.models:
            key_entries = await self._available_keys()
            for key_index, api_key in key_entries:
                payload = self._build_payload(
                    model=model,
                    messages=normalized_messages,
                    temperature=temperature,
                    max_tokens=max_tokens,
                    stream=True,
                )
                try:
                    async for chunk in self._stream_once(
                        api_key=api_key,
                        key_index=key_index,
                        model=model,
                        payload=payload,
                    ):
                        yield chunk
                    return
                except _RateLimitedKeyError:
                    continue
                except _TransientUpstreamError as exc:
                    logger.warning(
                        "Groq stream transient failure model=%s key_index=%s error=%s",
                        model,
                        key_index,
                        exc,
                    )
                    continue

        logger.error("All Groq models exhausted for current streaming request.")
        raise HTTPException(status_code=503, detail="All Groq capacity exhausted")

    def _inject_images_into_messages(
        self,
        messages: list[dict[str, Any]],
        images: list[Any] | None,
    ) -> list[dict[str, Any]]:
        normalized = _normalize_messages(messages)
        image_urls = [_coerce_image_url(item) for item in (images or [])]
        image_urls = [value for value in image_urls if value]
        if not image_urls:
            return normalized

        for index in range(len(normalized) - 1, -1, -1):
            row = normalized[index]
            if str(row.get("role") or "") != "user":
                continue
            content = row.get("content")
            blocks: list[dict[str, Any]] = []
            if isinstance(content, str):
                text = content.strip()
                if text:
                    blocks.append({"type": "text", "text": text})
            elif isinstance(content, list):
                for item in content:
                    if isinstance(item, dict):
                        blocks.append(dict(item))
            for url in image_urls:
                blocks.append({"type": "image_url", "image_url": {"url": url}})
            row["content"] = blocks
            normalized[index] = row
            return normalized

        content_blocks = [{"type": "text", "text": "Analyze the attached images."}]
        for url in image_urls:
            content_blocks.append({"type": "image_url", "image_url": {"url": url}})
        normalized.append({"role": "user", "content": content_blocks})
        return normalized

    async def vision(
        self,
        messages: list[dict[str, Any]],
        images: list[Any] | None,
        *,
        temperature: float = 0.45,
        max_tokens: int = 1024,
    ) -> str:
        if not self.has_keys():
            raise HTTPException(status_code=500, detail="Groq API key configuration is missing.")
        if not self.vision_model:
            raise HTTPException(status_code=500, detail="Vision model configuration is missing.")

        request_messages = self._inject_images_into_messages(messages, images)
        key_entries = await self._available_keys()
        for key_index, api_key in key_entries:
            payload = self._build_payload(
                model=self.vision_model,
                messages=request_messages,
                temperature=temperature,
                max_tokens=max_tokens,
                stream=False,
            )
            try:
                data = await self._request_json(
                    api_key=api_key,
                    key_index=key_index,
                    model=self.vision_model,
                    payload=payload,
                )
                return _extract_assistant_text(data)
            except _RateLimitedKeyError:
                continue
            except _TransientUpstreamError as exc:
                logger.warning(
                    "Groq vision transient failure model=%s key_index=%s error=%s",
                    self.vision_model,
                    key_index,
                    exc,
                )
                continue

        logger.error("Groq vision model exhausted for current request.")
        raise HTTPException(status_code=503, detail="All Groq capacity exhausted")

    async def aclose(self) -> None:
        async with self._client_lock:
            if self._client is not None and not self._client.is_closed:
                await self._client.aclose()
            self._client = None


groq_pro_manager = GroqProManager()
