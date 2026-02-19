from backend.routers.auth import router as auth_router
from backend.routers.chat import router as chat_router
from backend.routers.health import router as health_router
from backend.routers.history import router as history_router
from backend.routers.profile import router as profile_router
from backend.routers.tools import router as tools_router

__all__ = [
    "auth_router",
    "chat_router",
    "health_router",
    "history_router",
    "profile_router",
    "tools_router",
]
