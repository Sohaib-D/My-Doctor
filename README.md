# Personal Doctor AI

Production-style fullstack app with:
- FastAPI backend (`/chat`, `/history`, `/sessions`, auth)
- React + Tailwind frontend (served by FastAPI at `/`)
- SQLite/PostgreSQL persistence with encrypted chat text
- JWT authentication (email/password) plus optional Firebase login route

## One-command run

After dependencies are installed and frontend is built, run:

```bash
uvicorn main:app --reload
```

Then open:

```text
http://127.0.0.1:8000
```

## Project structure

```text
.
├─ main.py
├─ backend/
│  ├─ main.py
│  ├─ config.py
│  ├─ auth/
│  │  ├─ deps.py
│  │  ├─ jwt.py
│  │  ├─ passwords.py
│  │  └─ firebase_auth.py
│  ├─ database/
│  │  ├─ models.py
│  │  └─ session.py
│  ├─ routers/
│  │  ├─ auth.py
│  │  ├─ chat.py
│  │  ├─ history.py
│  │  ├─ health.py
│  │  └─ tools.py
│  ├─ schemas/
│  │  ├─ auth.py
│  │  ├─ chat.py
│  │  └─ tools.py
│  └─ services/
│     ├─ chat_service.py
│     ├─ groq_service.py
│     ├─ pubmed_service.py
│     └─ tts_service.py
├─ frontend/
│  ├─ dist/                 # built and served by FastAPI
│  ├─ src/
│  │  ├─ App.jsx
│  │  ├─ main.jsx
│  │  ├─ index.css
│  │  └─ services/api.js
│  ├─ index.html
│  ├─ package.json
│  ├─ tailwind.config.js
│  └─ postcss.config.js
├─ .env.example
└─ requirements.txt
```

## Backend API

- `POST /auth/register`  
  Register with email/password, returns JWT.
- `POST /auth/login`  
  Login with email/password, returns JWT.
- `POST /login`  
  Optional Firebase ID token login.
- `GET /auth/me`  
  Current user from bearer token.
- `POST /chat`  
  Save user message + generate assistant response.
- `GET /history?session_id=<id>`  
  Fetch ordered messages for a session.
- `GET /sessions`  
  Fetch chat sessions for sidebar.

## Database initialization snippet

`backend/database/session.py` initializes schema on startup:

```python
def init_db() -> None:
    from backend.database import models  # metadata registration
    Base.metadata.create_all(bind=engine)
```

## Frontend UX features

- ChatGPT-style layout:
  - collapsible sidebar with sessions
  - sticky chat header with stethoscope icon
  - scrollable message stream
  - sticky composer + footer disclaimer
- Keyboard behavior:
  - `Enter`: send message
  - `Shift+Enter`: newline
- Input actions:
  - Dictate icon (`Mic`) for speech-to-text
  - Use Voice icon (`Volume2` / `VolumeX`) for assistant readout
- Footer disclaimer:
  - `Not a substitute for professional medical advice. Sohaib Shahid All Rights Reserved.`

## Setup

1. Python dependencies

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

2. Environment

```bash
copy .env.example .env
```

3. Frontend dependencies + build

```bash
npm --prefix frontend install
npm --prefix frontend run build
```

4. Run server

```bash
uvicorn main:app --reload
```

## Environment variables

See `.env.example` for full list. Critical variables:

- `SECRET_KEY`
- `DATABASE_URL`
- `GROQ_API_KEY`
- `RATE_LIMIT_PER_MINUTE`

## Security notes

- Chat message text is encrypted at rest before database write.
- JWT token validation is enforced on protected routes.
- Passwords are hashed with `scrypt` before storage.
- CORS is configurable via `CORS_ORIGINS`.

