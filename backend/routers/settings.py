from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.auth.deps import get_current_user
from backend.database.models import User, UserSettings
from backend.database.session import get_db
from backend.schemas.settings import UserSettingsResponse, UserSettingsUpdate

router = APIRouter(tags=["settings"])


def _get_or_create_settings(db: Session, user: User) -> UserSettings:
    row = db.query(UserSettings).filter(UserSettings.user_id == user.id).first()
    if row:
        return row

    row = UserSettings(user_id=user.id)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _clean_display_name(value: str | None) -> str | None:
    if value is None:
        return None
    text = value.strip()
    return text or None


def _to_response(user: User, row: UserSettings) -> UserSettingsResponse:
    return UserSettingsResponse(
        user_id=user.id,
        appearance=row.appearance if row.appearance in {"light", "dark", "system"} else "system",
        language=row.language if row.language in {"en", "ur"} else "en",
        voice_gender="female",
        voice_auto_detect=bool(row.voice_auto_detect),
        display_name=user.full_name,
        email=user.email,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.get("/settings", response_model=UserSettingsResponse)
def get_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = _get_or_create_settings(db, current_user)
    return _to_response(current_user, row)


@router.put("/settings", response_model=UserSettingsResponse)
def update_settings(
    payload: UserSettingsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = _get_or_create_settings(db, current_user)
    row.appearance = payload.appearance
    row.language = payload.language
    row.voice_gender = "female"
    row.voice_auto_detect = bool(payload.voice_auto_detect)
    current_user.full_name = _clean_display_name(payload.display_name)

    db.commit()
    db.refresh(row)
    db.refresh(current_user)
    return _to_response(current_user, row)
