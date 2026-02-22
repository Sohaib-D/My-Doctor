from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from backend.database.models import Feedback
from backend.database.session import get_db
from backend.schemas.feedback import FeedbackCreate
from backend.services.email_service import send_feedback_email


router = APIRouter(prefix="/feedback", tags=["feedback"])


@router.post("", status_code=status.HTTP_201_CREATED)
def submit_feedback(payload: FeedbackCreate, db: Session = Depends(get_db)) -> dict:
    feedback = Feedback(
        name=payload.name.strip(),
        email=str(payload.email).strip().lower(),
        message=payload.message.strip(),
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
        send_feedback_email(feedback.name, feedback.email, feedback.message)
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Feedback saved, but notification email could not be sent.",
        ) from exc

    return {
        "message": "Feedback submitted successfully.",
        "id": feedback.id,
    }
