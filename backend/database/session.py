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

    with engine.begin() as connection:
        if "chat_sessions" in tables:
            existing_columns = {column["name"] for column in inspector.get_columns("chat_sessions")}
            if "is_pinned" not in existing_columns:
                connection.execute(text("ALTER TABLE chat_sessions ADD COLUMN is_pinned BOOLEAN NOT NULL DEFAULT 0"))
            if "is_archived" not in existing_columns:
                connection.execute(text("ALTER TABLE chat_sessions ADD COLUMN is_archived BOOLEAN NOT NULL DEFAULT 0"))
            if "pinned_at" not in existing_columns:
                connection.execute(text("ALTER TABLE chat_sessions ADD COLUMN pinned_at DATETIME"))
            if "updated_at" not in existing_columns:
                connection.execute(text("ALTER TABLE chat_sessions ADD COLUMN updated_at DATETIME"))
                connection.execute(
                    text(
                        "UPDATE chat_sessions SET updated_at = COALESCE(created_at, CURRENT_TIMESTAMP) "
                        "WHERE updated_at IS NULL"
                    )
                )

        if "user_personalization" in tables:
            personalization_columns = {column["name"] for column in inspector.get_columns("user_personalization")}
            if "response_style" not in personalization_columns:
                connection.execute(
                    text(
                        "ALTER TABLE user_personalization "
                        "ADD COLUMN response_style VARCHAR(40) NOT NULL DEFAULT 'default'"
                    )
                )
            if "custom_instructions" not in personalization_columns:
                connection.execute(text("ALTER TABLE user_personalization ADD COLUMN custom_instructions TEXT"))
            if "nickname" not in personalization_columns:
                connection.execute(text("ALTER TABLE user_personalization ADD COLUMN nickname VARCHAR(120)"))
            if "occupation" not in personalization_columns:
                connection.execute(text("ALTER TABLE user_personalization ADD COLUMN occupation VARCHAR(160)"))
            if "about_user" not in personalization_columns:
                connection.execute(text("ALTER TABLE user_personalization ADD COLUMN about_user TEXT"))
            if "allow_memory" not in personalization_columns:
                connection.execute(
                    text("ALTER TABLE user_personalization ADD COLUMN allow_memory BOOLEAN NOT NULL DEFAULT 0")
                )
            if "allow_chat_reference" not in personalization_columns:
                connection.execute(
                    text(
                        "ALTER TABLE user_personalization ADD COLUMN allow_chat_reference BOOLEAN NOT NULL DEFAULT 0"
                    )
                )
            if "updated_at" not in personalization_columns:
                connection.execute(text("ALTER TABLE user_personalization ADD COLUMN updated_at DATETIME"))
                connection.execute(
                    text(
                        "UPDATE user_personalization SET updated_at = COALESCE(updated_at, CURRENT_TIMESTAMP) "
                        "WHERE updated_at IS NULL"
                    )
                )
