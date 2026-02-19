from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.auth.deps import get_current_user
from backend.auth.firebase_auth import verify_firebase_id_token
from backend.auth.jwt import create_access_token
from backend.auth.passwords import hash_password, verify_password
from backend.database.models import LocalCredential, User
from backend.database.session import get_db
from backend.schemas.auth import (
    LoginRequest,
    LoginResponse,
    PasswordLoginRequest,
    PasswordRegisterRequest,
    PublicUser,
)


router = APIRouter(tags=["auth"])


def _to_public_user(user: User) -> PublicUser:
    return PublicUser(
        id=user.id,
        uid=user.google_sub,
        email=user.email,
        full_name=user.full_name,
        is_verified=user.is_verified,
    )


def _issue_login_response(user: User) -> LoginResponse:
    access_token = create_access_token(subject=user.id)
    return LoginResponse(
        access_token=access_token,
        user=_to_public_user(user),
    )


@router.post("/auth/register", response_model=LoginResponse, status_code=status.HTTP_201_CREATED)
def register(payload: PasswordRegisterRequest, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email is already registered.")

    user = User(
        email=payload.email,
        full_name=payload.full_name,
        google_sub=f"local:{uuid.uuid4()}",
        is_verified=True,
    )
    db.add(user)
    db.flush()

    credential = LocalCredential(
        user_id=user.id,
        password_hash=hash_password(payload.password),
    )
    db.add(credential)
    db.commit()
    db.refresh(user)
    return _issue_login_response(user)


@router.post("/auth/login", response_model=LoginResponse)
def password_login(payload: PasswordLoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials.")

    credential = db.query(LocalCredential).filter(LocalCredential.user_id == user.id).first()
    if not credential or not verify_password(payload.password, credential.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials.")

    return _issue_login_response(user)


@router.post("/login", response_model=LoginResponse)
def firebase_login(payload: LoginRequest, db: Session = Depends(get_db)):
    identity = verify_firebase_id_token(payload.firebase_id_token)
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
    else:
        updated = False
        if user.email != identity.email:
            user.email = identity.email
            updated = True
        if identity.name and user.full_name != identity.name:
            user.full_name = identity.name
            updated = True
        if not user.is_verified:
            user.is_verified = True
            updated = True
        if updated:
            db.commit()
            db.refresh(user)

    return _issue_login_response(user)


@router.get("/auth/me", response_model=PublicUser)
def auth_me(current_user: User = Depends(get_current_user)):
    return _to_public_user(current_user)

