from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from backend.auth.deps import get_current_user_optional
from backend.database.models import Feedback, User
from backend.database.session import get_db
from backend.schemas.feedback import FeedbackCreate
from backend.services.email_service import send_feedback_email


router = APIRouter(prefix="/feedback", tags=["feedback"])


@router.post("", status_code=status.HTTP_201_CREATED)
def submit_feedback(
    payload: FeedbackCreate,
    current_user: User | None = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
) -> dict:
    _ = payload.name.strip()
    email = str(payload.email).strip().lower()
    sender_type = "Guest User"

    if current_user and current_user.is_verified:
        email = current_user.email.lower()
        sender_type = "Verified User"
    else:
        verified_match = db.execute(
            select(User.id)
            .where(
                func.lower(User.email) == email,
                User.is_verified.is_(True),
            )
            .limit(1)
        ).scalar_one_or_none()
        if verified_match is not None and not email.startswith("guest"):
            sender_type = "Verified User"

    name = sender_type

    feedback = Feedback(
        name=name,
        email=email,
        message=payload.message.strip(),
        rating=payload.rating,
    )

    try:
        db.add(feedback)
        db.commit()
        db.refresh(feedback)
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to save feedback right now.",
        ) from exc

    try:
        send_feedback_email(
            feedback.name,
            feedback.email,
            feedback.message,
            feedback.rating,
            sender_type=sender_type,
        )
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Feedback saved, but notification email could not be sent.",
        ) from exc

    return {
        "message": "Feedback submitted successfully.",
        "id": feedback.id,
        "sender_type": sender_type,
    }
