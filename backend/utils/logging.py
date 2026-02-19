from __future__ import annotations

import hashlib
import logging
import re
from logging.config import dictConfig


EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}")
PHONE_RE = re.compile(r"\\+?\\d[\\d\\s().-]{7,}\\d")


class _PIIRedactionFilter(logging.Filter):
    """Basic redaction to avoid writing PII to logs."""

    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.msg, str):
            record.msg = redact(record.msg)
        if record.args:
            record.args = tuple(redact(arg) if isinstance(arg, str) else arg for arg in record.args)
        return True


def redact(value: str) -> str:
    value = EMAIL_RE.sub("[redacted-email]", value)
    value = PHONE_RE.sub("[redacted-phone]", value)
    return value


def setup_logging(level: str = "INFO") -> None:
    dictConfig(
        {
            "version": 1,
            "disable_existing_loggers": False,
            "filters": {
                "redact_pii": {
                    "()": _PIIRedactionFilter,
                }
            },
            "formatters": {
                "default": {
                    "format": "%(asctime)s | %(levelname)s | %(name)s | %(message)s"
                }
            },
            "handlers": {
                "console": {
                    "class": "logging.StreamHandler",
                    "formatter": "default",
                    "filters": ["redact_pii"],
                }
            },
            "root": {
                "handlers": ["console"],
                "level": level,
            },
        }
    )


def user_fingerprint(user_id: str) -> str:
    return hashlib.sha256(user_id.encode("utf-8")).hexdigest()[:12]


logger = logging.getLogger("personal_doctor")
