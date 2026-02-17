# 🏥 My Doctor — AI-Powered Medical Information API

> ⚠️ **Medical Disclaimer:** This application provides general health information for educational purposes only. It is **not** a substitute for professional medical advice, diagnosis, or treatment. Always seek the advice of your physician or other qualified healthcare provider.

---

## 📋 Overview

**My Doctor** is a production-ready FastAPI backend that combines:

| Service | Purpose |
|---|---|
| **Groq LLM (LLaMA 3 70B)** | Conversational medical Q&A with safety guardrails |
| **OpenFDA API** | Drug indications, warnings, and side effects |
| **PubMed (NCBI E-utilities)** | Peer-reviewed medical research articles |
| **WHO Global Health Observatory** | Global public health statistics |

---

## 🗂️ Project Structure

```
my-doctor/
├── main.py                  # FastAPI app & all route definitions
├── services/
│   ├── groq_service.py      # Groq LLM chat + emergency detection
│   ├── fda_service.py       # OpenFDA drug label data
│   ├── pubmed_service.py    # PubMed ESearch + ESummary
│   └── who_service.py       # WHO GHO public health statistics
├── models/
│   └── schemas.py           # Pydantic request/response models
├── .env.example             # Environment variable template
├── requirements.txt         # Python dependencies
└── README.md                # This file
```

---

## 🚀 Local Setup & Deployment

### 1. Create Virtual Environment

```bash
# Windows
python -m venv venv
venv\Scripts\activate

# macOS / Linux
python3 -m venv venv
source venv/bin/activate
```

### 2. Install Requirements

```bash
pip install -r requirements.txt
```

### 3. Set Environment Variables

```bash
# Copy the example file
cp .env.example .env

# Edit .env and add your API keys
nano .env   # or use any text editor
```

Your `.env` file should look like:
```env
GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxxxxxxxxxx
NCBI_API_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**Where to get API keys:**
- **Groq API Key:** https://console.groq.com (free tier available)
- **NCBI API Key:** https://www.ncbi.nlm.nih.gov/account/ (optional, increases PubMed rate limits)

### 4. Run Locally

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Visit the interactive API docs at: **http://localhost:8000/docs**

### Frontend (Next.js)

This repository includes a reference Next.js frontend in `frontend-next/` that you can run locally.

1. Install Node dependencies

```bash
cd frontend-next
npm install
```

2. Start the dev server (connects to the FastAPI backend at `NEXT_PUBLIC_API_URL`)

```bash
NEXT_PUBLIC_API_URL=http://localhost:8000 npm run dev
```

3. Build for production

```bash
npm run build
npm run start
```

In production, set the `NEXT_PUBLIC_API_URL` environment variable to your backend URL (for example in Vercel project settings).

Frontend notes

- Optional 3D and sound features: `frontend-next` contains optional dependencies for 3D (`three`, `@react-three/fiber`, `@react-three/drei`), confetti (`react-confetti`) and sound playback (`howler`). These are marked as optional in `package.json` — install them if you want the extra effects:

```bash
cd frontend-next
npm install three @react-three/fiber @react-three/drei react-confetti howler
```

- Placeholder sound files are included in `frontend-next/public/sounds/` (`send.mp3`, `receive.mp3`, `positive.mp3`). Replace these with short MP3/OGG files for actual sound effects.


---

## ☁️ Deploy on Render (Free Tier)

1. **Push your project to GitHub** (make sure `.env` is in `.gitignore`)

2. **Create a new Web Service on [Render](https://render.com)**
   - Connect your GitHub repository
   - Set **Runtime** to `Python 3`
   - Set **Build Command** to:
     ```
     pip install -r requirements.txt
     ```
   - Set **Start Command** to:
     ```
     uvicorn main:app --host 0.0.0.0 --port $PORT
     ```

3. **Add Environment Variables in Render Dashboard:**
   - `GROQ_API_KEY` → your Groq API key
   - `NCBI_API_KEY` → your NCBI API key (optional)

4. Click **Deploy** — your API will be live in ~2 minutes.

---

## 🧪 Example cURL Requests

### Chat Endpoint — General Medical Q&A
```bash
curl -X POST "http://localhost:8000/chat" \
  -H "Content-Type: application/json" \
  -d '{"message": "What are the common symptoms of type 2 diabetes?"}'
```

### Chat Endpoint — Emergency Detection
```bash
curl -X POST "http://localhost:8000/chat" \
  -H "Content-Type: application/json" \
  -d '{"message": "I have severe chest pain and cannot breathe"}'
```

### Drug Info — FDA Label Data
```bash
curl "http://localhost:8000/drug?name=aspirin"
curl "http://localhost:8000/drug?name=metformin"
curl "http://localhost:8000/drug?name=ibuprofen"
```

### Research — PubMed Articles
```bash
curl "http://localhost:8000/research?query=diabetes+treatment"
curl "http://localhost:8000/research?query=COVID+19+long+term+effects"
curl "http://localhost:8000/research?query=hypertension+lifestyle+interventions"
```

### WHO Statistics
```bash
curl "http://localhost:8000/stats?topic=malaria"
curl "http://localhost:8000/stats?topic=tuberculosis"
curl "http://localhost:8000/stats?topic=diabetes"
curl "http://localhost:8000/stats?topic=hiv"
```

---

## 🔒 Safety Features

- **Emergency Detection:** Automatically flags messages containing emergency keywords (chest pain, suicidal ideation, severe bleeding, etc.) and prepends urgent instructions to call emergency services.
- **Medical Safety System Prompt:** The Groq LLM is instructed to never diagnose, never prescribe exact dosages, always recommend professional consultation, and provide only evidence-based information.
- **Disclaimer on All Responses:** Every endpoint response includes a medical disclaimer reminding users this is not professional medical advice.

---

## 📡 API Endpoints Summary

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/` | Service info & endpoint listing |
| `GET` | `/health` | Health check |
| `POST` | `/chat` | AI medical chat (Groq) |
| `GET` | `/drug?name=` | Drug info (OpenFDA) |
| `GET` | `/research?query=` | Medical research (PubMed) |
| `GET` | `/stats?topic=` | Global health stats (WHO) |

Interactive API docs: `http://localhost:8000/docs`

---

## 🛡️ License

MIT License — use freely, but always include the medical disclaimer when deploying publicly.
