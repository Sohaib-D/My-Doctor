# FastAPI Backend Deployment Guide (Render Free Tier)

FastAPI backend with PostgreSQL, SendGrid email integration, signup verification, feedback API, static file serving, and health checks.

## Render Startup Command

Configured in `render.yaml`:

```bash
alembic upgrade head && uvicorn backend.main:app --host 0.0.0.0 --port $PORT
```

## Deployment Checklist

1. Push this repository to GitHub.
2. Create a new **Web Service** on Render from your repo.
3. Confirm Render uses `render.yaml` from repo root.
4. Add required environment variables in Render:
   - `DATABASE_URL`
   - `SECRET_KEY`
   - `GOOGLE_CLIENT_ID`
   - `SENDGRID_API_KEY`
   - `FROM_EMAIL`
   - `ADMIN_EMAIL`
   - `ADMIN_PANEL_EMAIL`
   - `ADMIN_PANEL_PASSWORD_HASH`
   - `CORS_ORIGINS`
5. Ensure `APP_ENV=production` and `DEBUG=false`.
6. Verify health checks target `GET /health`.
7. Confirm logs show migrations applied on startup (`alembic upgrade head`).
8. Validate app is reachable and health endpoint returns:
   - `{"status":"ok"}`

## Database Configuration

- Database connection is loaded from `.env` / environment via `DATABASE_URL`.
- Config source: `backend/config.py`
- SQLAlchemy engine source: `backend/database/session.py`

## Health Endpoints

- `GET /health` (for Render uptime checks)
- `GET /healthz` (secondary health check)

## Static Files and Templates

### Static files

- Store static assets in repository root `static/` directory.
- Files are served at `/static/...` by `StaticFiles` mount in `backend/main.py`.
- Example:
  - File path: `static/logo.png`
  - URL: `/static/logo.png`

### Templates

- Store server-rendered HTML templates in `backend/templates/`.
- Current project includes directory placeholder: `backend/templates/.gitkeep`.
- If you add Jinja rendering later, point it to:
  - `backend/templates`

## Local Run

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
alembic upgrade head
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

## Admin Panel Credentials

Set these in `.env` / Render:

- `ADMIN_PANEL_EMAIL`
- `ADMIN_PANEL_PASSWORD_HASH`

Generate `ADMIN_PANEL_PASSWORD_HASH`:

```bash
python -c "import bcrypt; print(bcrypt.hashpw('YourStrongPassword'.encode(), bcrypt.gensalt()).decode())"
```

## Pre-Deploy Verification Script

Run a full local verification before pushing:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\predeploy_check.ps1
```

Useful options:

```powershell
# Skip frontend build and HTTP checks
powershell -ExecutionPolicy Bypass -File .\scripts\predeploy_check.ps1 -SkipFrontendBuild -SkipHttpChecks

# Treat missing env vars as hard failures
powershell -ExecutionPolicy Bypass -File .\scripts\predeploy_check.ps1 -StrictEnv

# Check a different running backend URL
powershell -ExecutionPolicy Bypass -File .\scripts\predeploy_check.ps1 -BaseUrl https://your-app.onrender.com
```
