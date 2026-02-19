from __future__ import annotations

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from backend.auth.firebase_auth import verify_firebase_id_token
from backend.auth.jwt import decode_access_token
from backend.database.models import User
from backend.database.session import get_db


oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    user = None

    # Primary mode: internal JWT issued by /auth/login or /login.
    try:
        user_id = decode_access_token(token)
        user = db.query(User).filter(User.id == user_id).first()
    except HTTPException as jwt_exc:
        # Fallback mode: accept Firebase bearer token directly on protected routes.
        # If Firebase is not configured/available, preserve JWT-style 401 behavior.
        try:
            identity = verify_firebase_id_token(token)
        except HTTPException:
            raise jwt_exc

        user = db.query(User).filter(User.google_sub == identity.uid).first()
        if not user:
            user = User(
                email=identity.email,
                full_name=identity.name,
                google_sub=identity.uid,
                is_verified=True,
            )
            db.add(user)
            db.commit()
            db.refresh(user)

    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found.")
    if not user.is_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is not verified by Firebase login.",
        )
    return user
