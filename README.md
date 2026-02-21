# Personal Doctor AI

Minimal FastAPI backend exposing a single `/chat` endpoint powered by Groq LLM. This repo mirrors an earlier project where replies came with medical context and formatting.

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
├─ main.py            # entrypoint (mounts chat router)
├─ backend/
│  ├─ main.py         # FastAPI app definition
│  ├─ config.py       # environment settings
│  ├─ database/       # (unused by chat endpoint)
│  │  ├─ models.py
│  │  └─ session.py
│  ├─ routers/
│  │  └─ chat.py      # only router in this workspace
│  ├─ schemas/
│  │  └─ chat.py      # request/response models
│  └─ services/
│     └─ groq_service.py  # LLM integration
├─ requirements.txt
```

## Backend API

- `POST /chat`  
  Accepts `ChatRequest` JSON and returns a medical-style assistant response.



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

The only required environment variable is:

- `GROQ_API_KEY` (used by `groq_service`).

## Security notes

- Chat message text is encrypted at rest before database write.
- JWT token validation is enforced on protected routes.
- Passwords are hashed with `scrypt` before storage.
- CORS is configurable via `CORS_ORIGINS`.

