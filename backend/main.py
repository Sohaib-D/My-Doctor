from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi import HTTPException
from fastapi import Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

from backend.config import get_settings
from backend.database.session import engine
from backend.routers.admin import router as admin_router
from backend.routers.auth import router as auth_router
from backend.routers.chat import router as chat_router
from backend.routers.feedback import router as feedback_router
from backend.routers.signup import router as signup_router


settings = get_settings()
PROJECT_ROOT = Path(__file__).resolve().parent.parent
STATIC_DIR = PROJECT_ROOT / "static"
FRONTEND_DIST_DIR = PROJECT_ROOT / "frontend" / "dist"
FRONTEND_INDEX_FILE = FRONTEND_DIST_DIR / "index.html"
FRONTEND_ASSETS_DIR = FRONTEND_DIST_DIR / "assets"


def _serve_frontend_index() -> Response:
    if FRONTEND_INDEX_FILE.exists():
        return FileResponse(str(FRONTEND_INDEX_FILE))
    return RedirectResponse(url="/docs", status_code=307)


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.app_name,
        version="1.0.0",
        debug=settings.debug,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.mount("/static", StaticFiles(directory=str(STATIC_DIR), check_dir=False), name="static")
    app.mount("/assets", StaticFiles(directory=str(FRONTEND_ASSETS_DIR), check_dir=False), name="assets")

    app.include_router(auth_router)
    app.include_router(signup_router)
    app.include_router(chat_router)
    app.include_router(feedback_router)
    app.include_router(admin_router)

    @app.on_event("startup")
    def startup_check() -> None:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))

    @app.get("/healthz", tags=["system"])
    def healthz() -> dict:
        return {"status": "ok"}

    @app.get("/health", tags=["system"])
    def health() -> dict:
        return {"status": "ok"}

    @app.get("/", include_in_schema=False)
    def root() -> Response:
        return _serve_frontend_index()

    @app.get("/favicon.ico", include_in_schema=False)
    def favicon() -> Response:
        frontend_favicon = FRONTEND_DIST_DIR / "favicon.ico"
        if frontend_favicon.exists():
            return FileResponse(str(frontend_favicon))
        return Response(status_code=204)

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa_fallback(full_path: str) -> Response:
        candidate = (FRONTEND_DIST_DIR / full_path).resolve()
        try:
            candidate.relative_to(FRONTEND_DIST_DIR.resolve())
        except ValueError as exc:
            raise HTTPException(status_code=404, detail="Not found") from exc

        if candidate.is_file():
            return FileResponse(str(candidate))
        return _serve_frontend_index()

    return app


app = create_app()
