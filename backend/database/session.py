from __future__ import annotations

from collections.abc import Generator

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import Session, declarative_base, sessionmaker

from backend.config import get_settings


settings = get_settings()
connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}

engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
    future=True,
    connect_args=connect_args,
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, class_=Session)
Base = declarative_base()


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    from backend.database import models  # noqa: F401 - imported for metadata side effects

    Base.metadata.create_all(bind=engine)
    _apply_runtime_migrations()


def _apply_runtime_migrations() -> None:
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    if "chat_sessions" not in tables:
        return

    existing_columns = {column["name"] for column in inspector.get_columns("chat_sessions")}
    with engine.begin() as connection:
        if "is_pinned" not in existing_columns:
            connection.execute(text("ALTER TABLE chat_sessions ADD COLUMN is_pinned BOOLEAN NOT NULL DEFAULT 0"))
        if "is_archived" not in existing_columns:
            connection.execute(text("ALTER TABLE chat_sessions ADD COLUMN is_archived BOOLEAN NOT NULL DEFAULT 0"))
        if "pinned_at" not in existing_columns:
            connection.execute(text("ALTER TABLE chat_sessions ADD COLUMN pinned_at DATETIME"))
        if "updated_at" not in existing_columns:
            connection.execute(text("ALTER TABLE chat_sessions ADD COLUMN updated_at DATETIME"))
            connection.execute(
                text("UPDATE chat_sessions SET updated_at = COALESCE(created_at, CURRENT_TIMESTAMP) WHERE updated_at IS NULL")
            )
