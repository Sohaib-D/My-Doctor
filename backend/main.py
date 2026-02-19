from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from backend.config import get_settings
from backend.database.session import init_db
from backend.routers import auth_router, chat_router, health_router, history_router, profile_router, tools_router
from backend.utils.logging import logger, setup_logging


settings = get_settings()
setup_logging("DEBUG" if settings.debug else "INFO")

dev_local_origin_regex = None
if settings.environment != "production":
    dev_local_origin_regex = r"^https?://(localhost|127\.0\.0\.1|\[::1\]|192\.168\.\d{1,3}\.\d{1,3})(:\d+)?$"


app = FastAPI(
    title="Personal Doctor API",
    description="Secure AI health assistant with voice, Groq, PubMed and encrypted history.",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=dev_local_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(auth_router)
app.include_router(chat_router)
app.include_router(history_router)
app.include_router(profile_router)
app.include_router(tools_router)


@app.on_event("startup")
def startup() -> None:
    init_db()
    logger.info("Personal Doctor API started in %s mode", settings.environment)


PROJECT_ROOT = Path(__file__).resolve().parent.parent
DIST_DIR = PROJECT_ROOT / "frontend" / "dist"
DIST_INDEX = DIST_DIR / "index.html"
LEGACY_HTML = PROJECT_ROOT / "frontend" / "legacy_index.html"

if DIST_DIR.exists():
    assets_dir = DIST_DIR / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")


def _frontend_entry():
    if DIST_INDEX.exists():
        return FileResponse(str(DIST_INDEX))
    if LEGACY_HTML.exists():
        return FileResponse(str(LEGACY_HTML))
    return {
        "message": "Frontend build not found.",
        "hint": "Run: npm --prefix frontend install && npm --prefix frontend run build",
    }


@app.get("/", include_in_schema=False)
def root():
    return _frontend_entry()


@app.get("/{full_path:path}", include_in_schema=False)
def spa_fallback(full_path: str):
    candidate = DIST_DIR / full_path
    if candidate.is_file():
        return FileResponse(str(candidate))
    return _frontend_entry()
