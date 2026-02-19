from __future__ import annotations

import base64
import hashlib
import hmac
import os


_SCRYPT_N = 2**14
_SCRYPT_R = 8
_SCRYPT_P = 1
_KEY_LEN = 32


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.scrypt(
        password.encode("utf-8"),
        salt=salt,
        n=_SCRYPT_N,
        r=_SCRYPT_R,
        p=_SCRYPT_P,
        dklen=_KEY_LEN,
    )
    encoded_salt = base64.urlsafe_b64encode(salt).decode("utf-8")
    encoded_digest = base64.urlsafe_b64encode(digest).decode("utf-8")
    return f"scrypt${encoded_salt}${encoded_digest}"


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        algo, encoded_salt, encoded_digest = stored_hash.split("$", 2)
        if algo != "scrypt":
            return False
        salt = base64.urlsafe_b64decode(encoded_salt.encode("utf-8"))
        expected = base64.urlsafe_b64decode(encoded_digest.encode("utf-8"))
    except Exception:
        return False

    candidate = hashlib.scrypt(
        password.encode("utf-8"),
        salt=salt,
        n=_SCRYPT_N,
        r=_SCRYPT_R,
        p=_SCRYPT_P,
        dklen=len(expected),
    )
    return hmac.compare_digest(candidate, expected)

