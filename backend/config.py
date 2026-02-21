from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv


# Load env vars deterministically regardless of cwd.
# Preferred location is project root `.env`; backend/.env is fallback only.
_BACKEND_DIR = Path(__file__).resolve().parent
_PROJECT_ROOT = _BACKEND_DIR.parent
load_dotenv(_PROJECT_ROOT / ".env", override=False)
load_dotenv(_BACKEND_DIR / ".env", override=False)


def _as_bool(value: str | None, default: bool = False) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _as_list(value: str | None, default: list[str]) -> list[str]:
    if not value:
        return default
    return [item.strip() for item in value.split(",") if item.strip()]


@dataclass(frozen=True)
class Settings:
    app_name: str
    environment: str
    debug: bool

    secret_key: str
    jwt_algorithm: str
    access_token_expire_minutes: int

    database_url: str
    aes_key: str | None

    groq_api_key: str | None
    groq_model: str
    ncbi_api_key: str | None

    firebase_project_id: str | None
    firebase_private_key: str | None
    firebase_client_email: str | None

    rate_limit_per_minute: int
    cors_origins: list[str]

    mail_server: str | None
    mail_port: int
    mail_username: str | None
    mail_password: str | None
    mail_from: str | None
    mail_to: str | None


def _normalize_database_url(raw_url: str) -> str:
    url = raw_url.strip()
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql+psycopg://", 1)
    if url.startswith("postgresql://") and "+psycopg" not in url:
        return url.replace("postgresql://", "postgresql+psycopg://", 1)
    return url


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    env = os.getenv("APP_ENV", "development")
    return Settings(
        app_name=os.getenv("APP_NAME", "Personal Doctor"),
        environment=env,
        debug=_as_bool(os.getenv("DEBUG"), default=env != "production"),
        secret_key=os.getenv("SECRET_KEY", "change-me-in-production"),
        jwt_algorithm=os.getenv("JWT_ALGORITHM", "HS256"),
        access_token_expire_minutes=int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "120")),
        database_url=_normalize_database_url(os.getenv("DATABASE_URL", "sqlite:///./personal_doctor.db")),
        aes_key=os.getenv("APP_AES_KEY"),
        groq_api_key=os.getenv("GROQ_API_KEY"),
        groq_model=os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile"),
        ncbi_api_key=os.getenv("NCBI_API_KEY"),
        firebase_project_id=os.getenv("FIREBASE_PROJECT_ID"),
        firebase_private_key=os.getenv("FIREBASE_PRIVATE_KEY"),
        firebase_client_email=os.getenv("FIREBASE_CLIENT_EMAIL"),
        rate_limit_per_minute=int(os.getenv("RATE_LIMIT_PER_MINUTE", "30")),
        cors_origins=_as_list(
            os.getenv("CORS_ORIGINS"),
            default=[
                "http://localhost:3000",
                "http://127.0.0.1:3000",
                "http://localhost:5173",
                "http://127.0.0.1:5173",
                "http://localhost:8000",
                "http://127.0.0.1:8000",
                "https://localhost:3000",
                "https://127.0.0.1:3000",
                "https://localhost:5173",
                "https://127.0.0.1:5173",
                "https://localhost:8000",
                "https://127.0.0.1:8000",
            ],
        ),
        mail_server=os.getenv("MAIL_SERVER"),
        mail_port=int(os.getenv("MAIL_PORT", "587")),
        mail_username=os.getenv("MAIL_USERNAME"),
        mail_password=os.getenv("MAIL_PASSWORD"),
        mail_from=os.getenv("MAIL_FROM"),
        mail_to=os.getenv("MAIL_TO", "mesohaib5757@gmail.com"),
    )
