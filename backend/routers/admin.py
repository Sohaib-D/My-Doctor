from __future__ import annotations

from datetime import datetime, timedelta, timezone
from html import escape
from urllib.parse import parse_qs

import bcrypt
from fastapi import APIRouter, Depends, Request, status
from fastapi.responses import HTMLResponse, RedirectResponse
from jose import JWTError, jwt
from sqlalchemy import func, inspect, select, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from backend.config import get_settings
from backend.database.models import Feedback, User
from backend.database.session import get_db


router = APIRouter(prefix="/admin", tags=["admin"])
SESSION_COOKIE_NAME = "admin_session"


def _admin_email() -> str:
    settings = get_settings()
    return (settings.admin_panel_email or settings.admin_email or "").strip().lower()


def _admin_password_hash() -> str:
    return (get_settings().admin_panel_password_hash or "").strip()


def _verify_admin_password(raw_password: str, hashed_password: str) -> bool:
    if not hashed_password:
        return False
    try:
        return bcrypt.checkpw(raw_password.encode("utf-8"), hashed_password.encode("utf-8"))
    except Exception:
        return False


def _create_admin_session(email: str) -> str:
    settings = get_settings()
    now = datetime.now(timezone.utc)
    expires = now + timedelta(hours=settings.admin_session_hours)
    payload = {
        "sub": email,
        "role": "admin",
        "iat": now,
        "exp": expires,
    }
    return jwt.encode(payload, settings.secret_key, algorithm=settings.jwt_algorithm)


def _get_authenticated_admin(request: Request) -> str | None:
    token = request.cookies.get(SESSION_COOKIE_NAME)
    if not token:
        return None

    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.jwt_algorithm])
    except JWTError:
        return None

    if payload.get("role") != "admin":
        return None

    email = str(payload.get("sub") or "").strip().lower()
    if not email or email != _admin_email():
        return None

    return email


def _html_page(title: str, body: str) -> str:
    safe_title = escape(title)
    return f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{safe_title}</title>
    <style>
      :root {{
        --bg: #f7fafc;
        --card: #ffffff;
        --text: #111827;
        --muted: #6b7280;
        --primary: #1d4ed8;
        --danger: #b91c1c;
        --border: #e5e7eb;
      }}
      * {{ box-sizing: border-box; }}
      body {{
        margin: 0;
        font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
        background: var(--bg);
        color: var(--text);
      }}
      .container {{
        max-width: 1100px;
        margin: 0 auto;
        padding: 24px 16px 48px;
      }}
      .card {{
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: 10px;
        padding: 18px;
      }}
      h1 {{
        margin: 0 0 16px;
        font-size: 28px;
      }}
      h2 {{
        margin: 0 0 12px;
        font-size: 20px;
      }}
      .muted {{
        color: var(--muted);
      }}
      .row {{
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
      }}
      .kpi {{
        flex: 1 1 220px;
        min-width: 220px;
      }}
      .kpi .label {{
        font-size: 13px;
        color: var(--muted);
      }}
      .kpi .value {{
        margin-top: 6px;
        font-size: 28px;
        font-weight: 700;
      }}
      input[type="email"],
      input[type="password"],
      input[type="search"],
      button {{
        width: 100%;
        padding: 10px 12px;
        border-radius: 8px;
        border: 1px solid var(--border);
        font-size: 14px;
      }}
      button {{
        background: var(--primary);
        color: #fff;
        border-color: var(--primary);
        cursor: pointer;
      }}
      button.secondary {{
        background: #fff;
        color: var(--text);
        border-color: var(--border);
      }}
      .danger {{
        color: var(--danger);
        font-weight: 600;
      }}
      table {{
        width: 100%;
        border-collapse: collapse;
        font-size: 14px;
      }}
      th, td {{
        border-bottom: 1px solid var(--border);
        text-align: left;
        padding: 10px 8px;
      }}
      th {{
        background: #f3f4f6;
        font-weight: 600;
      }}
      .topbar {{
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 10px;
        margin-bottom: 14px;
      }}
      .stack {{
        display: grid;
        gap: 14px;
      }}
      .form-grid {{
        display: grid;
        gap: 10px;
      }}
      .not-auth {{
        max-width: 580px;
        margin: 100px auto;
      }}
    </style>
  </head>
  <body>
    <div class="container">
      {body}
    </div>
  </body>
</html>"""


def _login_page(error: str | None = None) -> str:
    error_html = ""
    if error:
        error_html = f'<p class="danger">{escape(error)}</p>'
    body = f"""
<div class="card not-auth">
  <h1>Admin Login</h1>
  <p class="muted">Sign in with your admin Gmail and password.</p>
  {error_html}
  <form method="post" action="/admin/login" class="form-grid">
    <input type="email" name="email" placeholder="you@gmail.com" required />
    <input type="password" name="password" placeholder="Password" required />
    <button type="submit">Login</button>
  </form>
</div>"""
    return _html_page("Admin Login", body)


def _not_authorized_page() -> str:
    body = """
<div class="card not-auth">
  <h1>Not Authorized</h1>
  <p class="muted">You are not authorized to access this admin panel.</p>
  <a href="/admin/login">Go to Login</a>
</div>"""
    return _html_page("Not Authorized", body)


def _parse_form(body: bytes) -> dict[str, str]:
    parsed = parse_qs(body.decode("utf-8", errors="ignore"), keep_blank_values=True)
    return {key: (values[0] if values else "") for key, values in parsed.items()}


def _count_guest_users(db: Session) -> int:
    try:
        inspector = inspect(db.bind)
        if not inspector.has_table("users"):
            return 0
        columns = {col["name"] for col in inspector.get_columns("users")}

        if "is_guest" in columns:
            query = text('SELECT COUNT(*) FROM "users" WHERE "is_guest" = true')
            return int(db.execute(query).scalar() or 0)

        if "user_type" in columns:
            query = text('SELECT COUNT(*) FROM "users" WHERE LOWER("user_type") = \'guest\'')
            return int(db.execute(query).scalar() or 0)
    except Exception:
        return 0

    query = select(func.count(User.id)).where(func.lower(User.email).like("guest%"))
    return int(db.execute(query).scalar() or 0)


def _find_message_table(db: Session) -> tuple[str | None, set[str]]:
    try:
        inspector = inspect(db.bind)
        for table in ("messages", "chat_messages", "user_messages"):
            if inspector.has_table(table):
                columns = {col["name"] for col in inspector.get_columns(table)}
                return table, columns
    except Exception:
        return None, set()
    return None, set()


def _message_counts_by_user(db: Session, table: str | None, columns: set[str]) -> tuple[str, dict[str, int], int]:
    if not table:
        return "none", {}, 0

    if "user_id" in columns:
        query = text(f'SELECT "user_id"::text AS user_key, COUNT(*)::bigint AS total FROM "{table}" GROUP BY "user_id"')
        rows = db.execute(query).mappings().all()
        counts = {str(row["user_key"]): int(row["total"]) for row in rows if row["user_key"] is not None}
        return "user_id", counts, int(sum(counts.values()))

    email_column = "user_email" if "user_email" in columns else ("email" if "email" in columns else None)
    if email_column:
        query = text(
            f'SELECT LOWER("{email_column}") AS user_key, COUNT(*)::bigint AS total '
            f'FROM "{table}" GROUP BY LOWER("{email_column}")'
        )
        rows = db.execute(query).mappings().all()
        counts = {str(row["user_key"]): int(row["total"]) for row in rows if row["user_key"] is not None}
        return "email", counts, int(sum(counts.values()))

    total_query = text(f'SELECT COUNT(*) FROM "{table}"')
    total = int(db.execute(total_query).scalar() or 0)
    return "none", {}, total


def _groq_usage_summary(db: Session, table: str | None, columns: set[str], fallback_used: int) -> str:
    limit = get_settings().groq_daily_limit
    if limit <= 0:
        return "Not configured (set GROQ_DAILY_LIMIT in .env)."

    used_today = fallback_used
    if table:
        timestamp_col = None
        for candidate in ("created_at", "timestamp", "sent_at", "requested_at"):
            if candidate in columns:
                timestamp_col = candidate
                break
        if timestamp_col:
            query = text(
                f'SELECT COUNT(*) FROM "{table}" '
                f'WHERE "{timestamp_col}" >= DATE_TRUNC(\'day\', NOW())'
            )
            used_today = int(db.execute(query).scalar() or 0)

    remaining = max(limit - used_today, 0)
    return f"{remaining} remaining today (limit: {limit}, used: {used_today})"


def _dashboard_page(
    *,
    admin_email: str,
    total_registered_users: int,
    total_guest_users: int,
    groq_summary: str,
    users_rows_html: str,
    feedback_rows_html: str,
    search_query: str,
) -> str:
    safe_query = escape(search_query)
    safe_admin_email = escape(admin_email)
    body = f"""
<div class="topbar">
  <h1>Admin Dashboard</h1>
  <form method="post" action="/admin/logout">
    <button type="submit" class="secondary">Logout</button>
  </form>
</div>

<p class="muted">Signed in as {safe_admin_email}</p>

<div class="row">
  <div class="card kpi">
    <div class="label">Total Registered Users</div>
    <div class="value">{total_registered_users}</div>
  </div>
  <div class="card kpi">
    <div class="label">Total Guest Users</div>
    <div class="value">{total_guest_users}</div>
  </div>
  <div class="card kpi">
    <div class="label">Groq Usage</div>
    <div class="value" style="font-size:18px;">{escape(groq_summary)}</div>
  </div>
</div>

<div class="stack" style="margin-top:14px;">
  <div class="card">
    <div class="topbar">
      <h2>Users</h2>
      <form method="get" action="/admin/dashboard" style="display:flex; gap:8px; width:380px; max-width:100%;">
        <input type="search" name="q" value="{safe_query}" placeholder="Search users by email..." />
        <button type="submit">Search</button>
      </form>
    </div>
    <table>
      <thead>
        <tr>
          <th>ID</th>
          <th>Email</th>
          <th>Verified</th>
          <th>Messages Sent</th>
        </tr>
      </thead>
      <tbody>
        {users_rows_html}
      </tbody>
    </table>
  </div>

  <div class="card">
    <h2>Feedback</h2>
    <table>
      <thead>
        <tr>
          <th>ID</th>
          <th>Name</th>
          <th>Email</th>
          <th>Message</th>
          <th>Created At</th>
        </tr>
      </thead>
      <tbody>
        {feedback_rows_html}
      </tbody>
    </table>
  </div>
</div>
"""
    return _html_page("Admin Dashboard", body)


@router.get("/login", response_class=HTMLResponse)
def admin_login_page(request: Request) -> HTMLResponse:
    if _get_authenticated_admin(request):
        return RedirectResponse(url="/admin/dashboard", status_code=status.HTTP_303_SEE_OTHER)
    return HTMLResponse(_login_page())


@router.post("/login")
async def admin_login(request: Request) -> HTMLResponse:
    credentials_configured = bool(_admin_email() and _admin_password_hash())
    if not credentials_configured:
        return HTMLResponse(
            _login_page("Admin credentials are not configured. Set ADMIN_PANEL_EMAIL and ADMIN_PANEL_PASSWORD_HASH."),
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    form = _parse_form(await request.body())
    email = (form.get("email") or "").strip().lower()
    password = form.get("password") or ""

    if email != _admin_email() or not _verify_admin_password(password, _admin_password_hash()):
        return RedirectResponse(url="/admin/not-authorized", status_code=status.HTTP_303_SEE_OTHER)

    token = _create_admin_session(email)
    settings = get_settings()
    response = RedirectResponse(url="/admin/dashboard", status_code=status.HTTP_303_SEE_OTHER)
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=token,
        max_age=settings.admin_session_hours * 3600,
        httponly=True,
        secure=settings.environment == "production",
        samesite="lax",
    )
    return response


@router.get("/dashboard", response_class=HTMLResponse)
def admin_dashboard(request: Request, q: str = "", db: Session = Depends(get_db)) -> HTMLResponse:
    admin_email = _get_authenticated_admin(request)
    if not admin_email:
        return RedirectResponse(url="/admin/not-authorized", status_code=status.HTTP_303_SEE_OTHER)

    try:
        total_users = int(db.execute(select(func.count(User.id))).scalar() or 0)
        total_guest_users = _count_guest_users(db)
        total_registered_users = max(total_users - total_guest_users, 0)

        search = (q or "").strip()
        users_stmt = select(User).order_by(User.id.desc())
        if search:
            users_stmt = users_stmt.where(func.lower(User.email).like(f"%{search.lower()}%"))
        users = db.execute(users_stmt).scalars().all()

        table, columns = _find_message_table(db)
        count_mode, counts, total_messages = _message_counts_by_user(db, table, columns)
        groq_summary = _groq_usage_summary(db, table, columns, total_messages)

        user_rows: list[str] = []
        for user in users:
            key = str(user.id) if count_mode == "user_id" else user.email.lower()
            message_count = counts.get(key, 0) if count_mode in {"user_id", "email"} else 0
            user_rows.append(
                "<tr>"
                f"<td>{user.id}</td>"
                f"<td>{escape(user.email)}</td>"
                f"<td>{'Yes' if user.is_verified else 'No'}</td>"
                f"<td>{message_count}</td>"
                "</tr>"
            )
        users_rows_html = "\n".join(user_rows) if user_rows else '<tr><td colspan="4">No users found.</td></tr>'

        feedback_items = db.execute(select(Feedback).order_by(Feedback.created_at.desc()).limit(300)).scalars().all()
        feedback_rows: list[str] = []
        for item in feedback_items:
            created_at = item.created_at.isoformat() if item.created_at else "-"
            feedback_rows.append(
                "<tr>"
                f"<td>{item.id}</td>"
                f"<td>{escape(item.name)}</td>"
                f"<td>{escape(item.email)}</td>"
                f"<td>{escape(item.message)}</td>"
                f"<td>{escape(created_at)}</td>"
                "</tr>"
            )
        feedback_rows_html = (
            "\n".join(feedback_rows)
            if feedback_rows
            else '<tr><td colspan="5">No feedback submitted yet.</td></tr>'
        )

    except SQLAlchemyError:
        return HTMLResponse(
            _html_page(
                "Admin Dashboard Error",
                (
                    "<div class='card not-auth'>"
                    "<h1>Dashboard Error</h1>"
                    "<p class='muted'>Unable to load admin metrics right now.</p>"
                    "</div>"
                ),
            ),
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    return HTMLResponse(
        _dashboard_page(
            admin_email=admin_email,
            total_registered_users=total_registered_users,
            total_guest_users=total_guest_users,
            groq_summary=groq_summary,
            users_rows_html=users_rows_html,
            feedback_rows_html=feedback_rows_html,
            search_query=q,
        )
    )


@router.get("/logout")
def admin_logout_get() -> RedirectResponse:
    response = RedirectResponse(url="/admin/login", status_code=status.HTTP_303_SEE_OTHER)
    response.delete_cookie(SESSION_COOKIE_NAME)
    return response


@router.post("/logout")
def admin_logout_post() -> RedirectResponse:
    response = RedirectResponse(url="/admin/login", status_code=status.HTTP_303_SEE_OTHER)
    response.delete_cookie(SESSION_COOKIE_NAME)
    return response


@router.get("/not-authorized", response_class=HTMLResponse)
def admin_not_authorized() -> HTMLResponse:
    return HTMLResponse(_not_authorized_page(), status_code=status.HTTP_403_FORBIDDEN)
