from __future__ import annotations

from dataclasses import dataclass

from fastapi import HTTPException, status

from backend.config import get_settings


try:
    import firebase_admin
    from firebase_admin import auth as firebase_auth
    from firebase_admin import credentials
except ImportError:  # pragma: no cover
    firebase_admin = None
    firebase_auth = None
    credentials = None


@dataclass
class FirebaseIdentity:
    uid: str
    email: str
    name: str | None


def _build_credential_payload() -> dict:
    settings = get_settings()

    if not all([settings.firebase_project_id, settings.firebase_private_key, settings.firebase_client_email]):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Firebase service account env vars are not configured.",
        )

    # FIREBASE_PRIVATE_KEY usually comes as one-line string with literal \n.
    private_key = settings.firebase_private_key.replace("\\n", "\n")

    return {
        "type": "service_account",
        "project_id": settings.firebase_project_id,
        "private_key": private_key,
        "client_email": settings.firebase_client_email,
        "token_uri": "https://oauth2.googleapis.com/token",
    }


def initialize_firebase_admin() -> None:
    if firebase_admin is None or credentials is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="firebase-admin dependency missing. Install firebase-admin.",
        )

    if firebase_admin._apps:
        return

    cred_payload = _build_credential_payload()
    cred = credentials.Certificate(cred_payload)
    firebase_admin.initialize_app(cred)


def verify_firebase_id_token(id_token: str) -> FirebaseIdentity:
    if firebase_auth is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="firebase-admin dependency missing. Install firebase-admin.",
        )

    initialize_firebase_admin()

    try:
        decoded = firebase_auth.verify_id_token(id_token, check_revoked=False)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Firebase ID token.",
        ) from exc

    uid = decoded.get("uid") or decoded.get("sub")
    email = decoded.get("email")
    name = decoded.get("name")

    if not uid or not email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Firebase token missing required claims (uid/email).",
        )

    return FirebaseIdentity(uid=str(uid), email=str(email).lower(), name=(str(name) if name else None))
