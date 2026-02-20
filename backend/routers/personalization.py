from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.auth.deps import get_current_user
from backend.database.models import User, UserPersonalization
from backend.database.session import get_db
from backend.schemas.personalization import (
    UserPersonalizationCreate,
    UserPersonalizationResponse,
    UserPersonalizationUpdate,
)

router = APIRouter(tags=["personalization"])


def _require_firebase_uid(current_user: User) -> str:
    firebase_uid = (current_user.google_sub or "").strip()
    if not firebase_uid or firebase_uid.startswith("local:"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Firebase authentication is required.",
        )
    return firebase_uid


def _clean_text(value: str | None) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _to_response(row: UserPersonalization) -> UserPersonalizationResponse:
    return UserPersonalizationResponse(
        firebase_uid=row.firebase_uid,
        response_style=row.response_style,
        custom_instructions=row.custom_instructions,
        nickname=row.nickname,
        occupation=row.occupation,
        about_user=row.about_user,
        allow_memory=bool(row.allow_memory),
        allow_chat_reference=bool(row.allow_chat_reference),
        updated_at=row.updated_at,
    )


@router.get("/personalization", response_model=UserPersonalizationResponse)
def get_personalization(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    firebase_uid = _require_firebase_uid(current_user)
    row = db.query(UserPersonalization).filter(UserPersonalization.firebase_uid == firebase_uid).first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Personalization not found.")
    return _to_response(row)


@router.post("/personalization", response_model=UserPersonalizationResponse, status_code=status.HTTP_201_CREATED)
def create_personalization(
    payload: UserPersonalizationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    firebase_uid = _require_firebase_uid(current_user)
    existing = db.query(UserPersonalization).filter(UserPersonalization.firebase_uid == firebase_uid).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Personalization already exists.")

    row = UserPersonalization(
        firebase_uid=firebase_uid,
        response_style=payload.response_style,
        custom_instructions=_clean_text(payload.custom_instructions),
        nickname=_clean_text(payload.nickname),
        occupation=_clean_text(payload.occupation),
        about_user=_clean_text(payload.about_user),
        allow_memory=bool(payload.allow_memory),
        allow_chat_reference=bool(payload.allow_chat_reference),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _to_response(row)


@router.put("/personalization", response_model=UserPersonalizationResponse)
def update_personalization(
    payload: UserPersonalizationUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    firebase_uid = _require_firebase_uid(current_user)
    row = db.query(UserPersonalization).filter(UserPersonalization.firebase_uid == firebase_uid).first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Personalization not found.")

    row.response_style = payload.response_style
    row.custom_instructions = _clean_text(payload.custom_instructions)
    row.nickname = _clean_text(payload.nickname)
    row.occupation = _clean_text(payload.occupation)
    row.about_user = _clean_text(payload.about_user)
    row.allow_memory = bool(payload.allow_memory)
    row.allow_chat_reference = bool(payload.allow_chat_reference)
    db.commit()
    db.refresh(row)
    return _to_response(row)
