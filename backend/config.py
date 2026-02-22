from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

from dotenv import load_dotenv


PROJECT_ROOT = Path(__file__).resolve().parent.parent
ENV_FILE = PROJECT_ROOT / ".env"
load_dotenv(ENV_FILE, override=False)


def _as_bool(value: str | None, *, default: bool = False) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _as_int(
    value: str | None,
    *,
    default: int,
    min_value: int | None = None,
    max_value: int | None = None,
) -> int:
    if value is None or not value.strip():
        parsed = default
    else:
        try:
            parsed = int(value.strip())
        except ValueError as exc:
            raise ValueError(f"Expected integer value, got: {value!r}") from exc

    if min_value is not None and parsed < min_value:
        raise ValueError(f"Integer value {parsed} is less than allowed minimum {min_value}.")
    if max_value is not None and parsed > max_value:
        raise ValueError(f"Integer value {parsed} exceeds allowed maximum {max_value}.")
    return parsed


def _as_list(value: str | None, *, default: list[str]) -> list[str]:
    if not value:
        return default
    return [item.strip() for item in value.split(",") if item.strip()]


def _first_non_empty(*values: str | None) -> str:
    for item in values:
        if item and item.strip():
            return item.strip()
    return ""


def _normalize_database_url(raw_url: str) -> str:
    url = raw_url.strip()
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql+psycopg2://", 1)
    elif url.startswith("postgresql://") and "+psycopg2" not in url:
        url = url.replace("postgresql://", "postgresql+psycopg2://", 1)

    if not url.startswith("postgresql+psycopg2://"):
        raise ValueError("DATABASE_URL must be a PostgreSQL URL.")

    parsed = urlparse(url)
    host = (parsed.hostname or "").lower()
    is_local = (
        host in {"localhost", "127.0.0.1"}
        or host.startswith("10.")
        or host.startswith("192.168.")
        or host.startswith("172.")
    )
    if not is_local:
        query = dict(parse_qsl(parsed.query, keep_blank_values=True))
        query.setdefault("sslmode", "require")
        parsed = parsed._replace(query=urlencode(query))
        url = urlunparse(parsed)
    return url


@dataclass(frozen=True)
class Settings:
    app_name: str
    environment: str
    debug: bool
    port: int

    database_url: str
    secret_key: str
    jwt_algorithm: str
    access_token_expire_minutes: int

    sendgrid_api_key: str
    from_email: str
    admin_email: str
    admin_panel_email: str
    admin_panel_password_hash: str
    admin_session_hours: int
    google_client_id: str
    sendgrid_from_name: str
    verify_url_base: str
    groq_daily_limit: int

    mail_server: str
    mail_port: int
    mail_username: str
    mail_password: str
    mail_from: str
    mail_to: str

    aes_key: str
    cors_origins: list[str]


def _validate_for_production(settings: Settings) -> None:
    if settings.environment != "production":
        return

    missing: list[str] = []
    if not settings.database_url:
        missing.append("DATABASE_URL")
    if not settings.secret_key or settings.secret_key == "change-me-in-production":
        missing.append("SECRET_KEY")
    if not settings.sendgrid_api_key:
        missing.append("SENDGRID_API_KEY")
    if not settings.from_email:
        missing.append("FROM_EMAIL")
    if not settings.admin_email:
        missing.append("ADMIN_EMAIL")
    if not settings.admin_panel_email:
        missing.append("ADMIN_PANEL_EMAIL")
    if not settings.admin_panel_password_hash:
        missing.append("ADMIN_PANEL_PASSWORD_HASH")
    if missing:
        raise RuntimeError(
            "Missing required environment variables for production: " + ", ".join(missing)
        )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    raw_database_url = (os.getenv("DATABASE_URL") or "").strip()
    if not raw_database_url:
        raise RuntimeError("DATABASE_URL is required in .env")

    environment = (os.getenv("APP_ENV") or "development").strip().lower()
    settings = Settings(
        app_name=(os.getenv("APP_NAME") or "FastAPI Auth Service").strip(),
        environment=environment,
        debug=_as_bool(os.getenv("DEBUG"), default=environment != "production"),
        port=_as_int(os.getenv("PORT"), default=8000, min_value=1, max_value=65535),
        database_url=_normalize_database_url(raw_database_url),
        secret_key=(os.getenv("SECRET_KEY") or "change-me-in-production").strip(),
        jwt_algorithm=(os.getenv("JWT_ALGORITHM") or "HS256").strip(),
        access_token_expire_minutes=_as_int(
            os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES"),
            default=60,
            min_value=1,
            max_value=60 * 24 * 30,
        ),
        sendgrid_api_key=(os.getenv("SENDGRID_API_KEY") or "").strip(),
        from_email=_first_non_empty(
            os.getenv("FROM_EMAIL"),
            os.getenv("SENDGRID_FROM_EMAIL"),
            os.getenv("MAIL_FROM"),
            os.getenv("MAIL_USERNAME"),
        ),
        admin_email=_first_non_empty(os.getenv("ADMIN_EMAIL"), os.getenv("MAIL_TO")),
        admin_panel_email=_first_non_empty(os.getenv("ADMIN_PANEL_EMAIL"), os.getenv("ADMIN_EMAIL")),
        admin_panel_password_hash=(os.getenv("ADMIN_PANEL_PASSWORD_HASH") or "").strip(),
        admin_session_hours=_as_int(os.getenv("ADMIN_SESSION_HOURS"), default=8, min_value=1, max_value=168),
        google_client_id=(os.getenv("GOOGLE_CLIENT_ID") or "").strip(),
        sendgrid_from_name=(os.getenv("SENDGRID_FROM_NAME") or "My Doctor").strip(),
        verify_url_base=(os.getenv("VERIFY_URL_BASE") or "").strip(),
        groq_daily_limit=_as_int(os.getenv("GROQ_DAILY_LIMIT"), default=0, min_value=0, max_value=10_000_000),
        mail_server=(os.getenv("MAIL_SERVER") or "smtp.gmail.com").strip(),
        mail_port=_as_int(os.getenv("MAIL_PORT"), default=587, min_value=1, max_value=65535),
        mail_username=(os.getenv("MAIL_USERNAME") or "").strip(),
        mail_password=(os.getenv("MAIL_PASSWORD") or "").strip(),
        mail_from=(os.getenv("MAIL_FROM") or "").strip(),
        mail_to=(os.getenv("MAIL_TO") or "").strip(),
        aes_key=(os.getenv("AES_KEY") or "").strip(),
        cors_origins=_as_list(
            os.getenv("CORS_ORIGINS"),
            default=[
                "http://localhost:3000",
                "http://127.0.0.1:3000",
                "http://localhost:5173",
                "http://127.0.0.1:5173",
            ],
        ),
    )

    _validate_for_production(settings)
    return settings
