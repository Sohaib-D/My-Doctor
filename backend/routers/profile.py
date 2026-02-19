from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.auth.deps import get_current_user
from backend.database.models import User, UserMedicalProfile
from backend.database.session import get_db
from backend.schemas.profile import UserProfileCreate, UserProfileResponse, UserProfileUpdate

router = APIRouter(tags=["profile"])


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
    text = value.strip()
    return text or None


def _to_response(row: UserMedicalProfile) -> UserProfileResponse:
    return UserProfileResponse(
        firebase_uid=row.firebase_uid,
        age=row.age,
        gender=row.gender,
        medical_history=row.medical_history,
        allergies=row.allergies,
        medications=row.medications,
        chronic_conditions=row.chronic_conditions,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.get("/profile", response_model=UserProfileResponse)
def get_profile(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    firebase_uid = _require_firebase_uid(current_user)
    row = db.query(UserMedicalProfile).filter(UserMedicalProfile.firebase_uid == firebase_uid).first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found.")
    return _to_response(row)


@router.post("/profile", response_model=UserProfileResponse, status_code=status.HTTP_201_CREATED)
def create_profile(
    payload: UserProfileCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    firebase_uid = _require_firebase_uid(current_user)
    existing = db.query(UserMedicalProfile).filter(UserMedicalProfile.firebase_uid == firebase_uid).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Profile already exists.")

    row = UserMedicalProfile(
        firebase_uid=firebase_uid,
        age=payload.age,
        gender=payload.gender,
        medical_history=_clean_text(payload.medical_history),
        allergies=_clean_text(payload.allergies),
        medications=_clean_text(payload.medications),
        chronic_conditions=_clean_text(payload.chronic_conditions),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _to_response(row)


@router.put("/profile", response_model=UserProfileResponse)
def update_profile(
    payload: UserProfileUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    firebase_uid = _require_firebase_uid(current_user)
    row = db.query(UserMedicalProfile).filter(UserMedicalProfile.firebase_uid == firebase_uid).first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found.")

    row.age = payload.age
    row.gender = payload.gender
    row.medical_history = _clean_text(payload.medical_history)
    row.allergies = _clean_text(payload.allergies)
    row.medications = _clean_text(payload.medications)
    row.chronic_conditions = _clean_text(payload.chronic_conditions)
    db.commit()
    db.refresh(row)
    return _to_response(row)
