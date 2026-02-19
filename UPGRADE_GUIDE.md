# Personal Doctor v2 Upgrade Guide (Firebase Auth)

This project now includes:
- FastAPI modular backend (`backend/`)
- React frontend (`frontend/src/`) with Gemini-like voice UI
- Firebase Authentication (Google Sign-In) for login (`POST /login`)
- JWT-protected chat/history after Firebase token verification
- AES-encrypted chat logs
- Per-user rate limiting
- Groq + PubMed structured medical response engine
- Live TTS streaming endpoint (`GET /voice_stream`)

## 1) Environment

Backend env file (`.env`) should include values from `.env.example`.

Frontend env file (`frontend/.env`) should include:

```env
VITE_API_URL=http://localhost:8000
VITE_FIREBASE_CONFIG={"apiKey":"...","authDomain":"...","projectId":"...","storageBucket":"...","messagingSenderId":"...","appId":"..."}
```

## 2) Local Run

### Backend

```bash
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open: `http://localhost:5173`

## 3) Login Flow (Firebase)

1. Frontend uses Firebase SDK `signInWithPopup(GoogleAuthProvider)`.
2. Frontend gets Firebase ID token (`user.getIdToken()`).
3. Frontend calls:

```http
POST /login
Content-Type: application/json

{
  "firebase_id_token": "<firebase-id-token>"
}
```

4. Backend verifies token using Firebase Admin SDK.
5. Backend creates/updates user and returns internal JWT.
6. Frontend uses that JWT for `/chat`, `/history`, `/voice_stream`.

## 4) Key Endpoints

- `POST /login`
- `GET /auth/me` (JWT or Firebase bearer token required)
- `POST /chat` (JWT required)
- `GET /voice_stream?message_id=...` (JWT required)
- `GET /history` (JWT required)
- `GET /drug?name=...`
- `GET /research?query=...`
- `GET /stats?topic=...`

## 5) Sample /chat Response

```json
{
  "session_id": "0d737968-f63e-4e00-9655-1f2c4a1501ad",
  "message_id": "ccf4a8e5-86fc-4a65-90ef-3dc96f9c1572",
  "response": "### Symptoms\n...",
  "structured": {
    "symptoms": "Headache, mild fever, sore throat",
    "possible_causes": "Most likely viral upper respiratory infection, dehydration, or sinus irritation",
    "advice": "Hydrate, rest, monitor fever, and use safe over-the-counter options as needed",
    "urgency_level": "moderate",
    "when_to_see_doctor": "See a doctor if fever > 39C, breathing difficulty, or symptoms persist > 3 days",
    "references": [
      "https://pubmed.ncbi.nlm.nih.gov/12345678/",
      "https://pubmed.ncbi.nlm.nih.gov/23456789/"
    ]
  },
  "emergency": false,
  "language": "en",
  "tts_url": "/voice_stream?message_id=ccf4a8e5-86fc-4a65-90ef-3dc96f9c1572",
  "disclaimer": "This is educational information, not a diagnosis..."
}
```

## 6) Voice Stream

Request:

```http
GET /voice_stream?message_id=<assistant_message_id>
Authorization: Bearer <JWT>
```

Response:
- `200 OK`
- `Content-Type: audio/mpeg`
- Streaming MP3 bytes

## 7) Deployment

### Backend (Render Asia)

- Use included `render.yaml`
- Region: `singapore`
- Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
- Set all secure env vars in Render dashboard:
  - `DATABASE_URL`, `SECRET_KEY`, `APP_AES_KEY`
  - `GROQ_API_KEY`, `NCBI_API_KEY`
  - `FIREBASE_PROJECT_ID`, `FIREBASE_PRIVATE_KEY`, `FIREBASE_CLIENT_EMAIL`

### Frontend (Vercel)

- Root: `frontend`
- Build command: `npm run build`
- Output dir: `dist`
- Env vars:
  - `VITE_API_URL=https://<your-render-domain>`
  - `VITE_FIREBASE_CONFIG=<firebase-config-json>`

## 8) Legacy UI

Original single-file frontend is preserved as:
- `frontend/legacy_index.html`

The backend serves React build from `frontend/dist` when available.
