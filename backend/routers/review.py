from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.concurrency import run_in_threadpool

from backend.auth.deps import get_current_user_optional
from backend.config import get_settings
from backend.database.models import User
from backend.schemas.review import SendReviewRequest, SendReviewResponse
from backend.services.review_service import send_review_email
from backend.utils.logging import logger


router = APIRouter(tags=["review"])


@router.post("/send-review", response_model=SendReviewResponse)
async def send_review(
    payload: SendReviewRequest,
    current_user: User | None = Depends(get_current_user_optional),
):
    review_text = (payload.review or "").strip()
    if len(review_text) < 10:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Review must be at least 10 characters.",
        )

    settings = get_settings()
    user_email = payload.user_email or (current_user.email if current_user else None)
    user_name = payload.user_name or (current_user.full_name if current_user else None)
    timestamp = datetime.now(timezone.utc).isoformat()

    try:
        await run_in_threadpool(
            send_review_email,
            settings=settings,
            review=review_text,
            user_email=user_email,
            user_name=user_name,
            timestamp=timestamp,
        )
    except RuntimeError as exc:
        logger.error("Review email configuration error: %s", str(exc))
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Review service is unavailable right now.",
        ) from exc
    except Exception as exc:
        logger.exception("Failed to send review email: %s", str(exc))
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Unable to send review right now. Please try again.",
        ) from exc

    return SendReviewResponse()

