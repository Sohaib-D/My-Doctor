from __future__ import annotations

from fastapi import APIRouter


router = APIRouter(tags=["health"])


@router.get("/health")
def health_check() -> dict:
    return {"status": "healthy"}


@router.get("/api/info")
def api_info() -> dict:
    return {
        "service": "Personal Doctor",
        "status": "online",
        "version": "2.0.0",
        "endpoints": {
            "login": "POST /login",
            "chat": "POST /chat",
            "voice_stream": "GET /voice_stream?message_id=<id>",
            "history": "GET /history",
            "drug": "GET /drug?name=<drug>",
            "research": "GET /research?query=<query>",
            "stats": "GET /stats?topic=<topic>",
        },
    }
