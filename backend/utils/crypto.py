from __future__ import annotations

import base64
import hashlib
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from backend.config import get_settings


def _decode_key(raw_value: str) -> bytes:
    """Accept URL-safe base64 or plain string and always return 32-byte key."""
    value = raw_value.strip()
    try:
        decoded = base64.urlsafe_b64decode(value.encode("utf-8"))
        if len(decoded) == 32:
            return decoded
    except Exception:
        pass

    raw_bytes = value.encode("utf-8")
    if len(raw_bytes) == 32:
        return raw_bytes

    return hashlib.sha256(raw_bytes).digest()


def _resolve_key() -> bytes:
    settings = get_settings()
    if settings.aes_key:
        return _decode_key(settings.aes_key)

    # Fallback derives a deterministic key from SECRET_KEY.
    return hashlib.sha256(settings.secret_key.encode("utf-8")).digest()


def encrypt_text(plain_text: str) -> str:
    key = _resolve_key()
    aesgcm = AESGCM(key)
    nonce = os.urandom(12)
    encrypted = aesgcm.encrypt(nonce, plain_text.encode("utf-8"), None)
    payload = nonce + encrypted
    return base64.urlsafe_b64encode(payload).decode("utf-8")


def decrypt_text(cipher_text: str) -> str:
    key = _resolve_key()
    payload = base64.urlsafe_b64decode(cipher_text.encode("utf-8"))
    nonce = payload[:12]
    encrypted = payload[12:]
    aesgcm = AESGCM(key)
    plain = aesgcm.decrypt(nonce, encrypted, None)
    return plain.decode("utf-8")
