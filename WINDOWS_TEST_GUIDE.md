# 🚀 My Doctor — Windows Local Testing & Pre-Deployment Checklist

This guide walks you through testing the full stack (backend + frontend) on Windows before deploying.

---

## ✅ Pre-Flight Checklist

- [ ] Python 3.9+ installed (`python --version`)
- [ ] Node.js 16+ installed (`node --version`)
- [ ] Git installed (optional, for version control)
- [ ] Have your `.env` file with `GROQ_API_KEY` set
- [ ] Terminal open at project root: `D:\My Doctor`

---

## 🔧 Step 1: Backend Setup (FastAPI + Uvicorn)

### 1.1 Create & Activate Virtual Environment

```powershell
# Create venv (one time only)
python -m venv venv

# Activate venv
venv\Scripts\activate
```

You should see `(venv)` in your prompt.

### 1.2 Install Backend Dependencies

```powershell
# Upgrade pip to latest
python -m pip install --upgrade pip

# Install requirements
pip install -r requirements.txt
```

### 1.3 Configure Environment Variables

```powershell
# Copy the example
Copy-Item .env.example .env

# Edit .env with your API keys (use Notepad or your editor)
notepad .env
```

Add:
```env
GROQ_API_KEY=gsk_your_key_here
NCBI_API_KEY=your_key_here  # optional
```

### 1.4 Start Backend Server

```powershell
# Run FastAPI server on port 8000
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Expected output:
```
INFO:     Uvicorn running on http://0.0.0.0:8000
INFO:     Application startup complete
```

**Keep this terminal open.** The backend is now running.

Visit the API docs to verify: **http://localhost:8000/docs**

---

## 🎨 Step 2: Frontend Setup (Next.js)

### 2.1 Open a New Terminal (Keep Backend Terminal Open!)

```powershell
# activate venv in new terminal
venv\Scripts\activate

# navigate to frontend directory
cd frontend-next
```

### 2.2 Install Frontend Dependencies

```powershell
npm install
```

This installs React, Next.js, Tailwind CSS, Framer Motion, etc.

(Optional) If you want confetti & sound effects:
```powershell
npm install react-confetti --save
```

### 2.3 Start Frontend Dev Server

```powershell
# Set backend URL and start
$env:NEXT_PUBLIC_API_URL="http://localhost:8000"
npm run dev
```

Expected output:
```
✓ Ready in 2.3s
✓ Ready in ...
- Local:        http://localhost:3000
- Environments: .env.local
```

---

## 🧪 Step 3: Run a Test

1. Open your browser at **http://localhost:3000**
2. You should see:
   - Dr. Amna (animated character) sitting on the right side of the chat box
   - Chat panel on the left
   - A message box at the bottom
3. Type a test question:
   ```
   What are early signs of diabetes?
   ```
4. Click **Send** (or press Enter)
5. Verify:
   - ✅ Your message appears in the chat (purple bubble)
   - ✅ Dr. Amna leans forward and her pen animates (writing motion)
   - ✅ Typing indicator appears ("Thinking...")
   - ✅ AI response appears (whitish bubble)
   - ✅ Dr. Amna returns to normal posture

---

## 🔊 Test Sound & Confetti (Optional)

1. Make sure sounds are **unmuted** (click 🔈 icon at top-left of chat)
2. Send a message with positive keywords, e.g.:
   ```
   How to improve my health with great exercise?
   ```
3. Verify:
   - ✅ Sound plays on send/receive
   - ✅ If response is positive, confetti falls & special glow appears on message
   - ✅ Mute toggle (🔇/🔈) prevents sounds

---

## 🛑 Troubleshooting

| Issue | Solution |
|-------|----------|
| Backend fails to start | Check .env has `GROQ_API_KEY`. Verify API key is valid (https://console.groq.com). |
| Frontend can't connect to backend | Check `NEXT_PUBLIC_API_URL=http://localhost:8000` is set. Verify backend server is running on port 8000. |
| npm install fails | Delete `node_modules` and `package-lock.json`, then run `npm install` again. |
| Port 8000/3000 already in use | Change port: `uvicorn main:app --port 9000` and set `NEXT_PUBLIC_API_URL=http://localhost:9000`. |
| Dr. Amna doesn't animate | Check browser console (F12 → Console tab) for JS errors. Verify Framer Motion is installed. |

---

## 📦 Building for Production

### Backend Build (Render / Docker)

```powershell
# Test production-like environment locally
# (Optional, if using gunicorn on Linux)
# For Windows, uvicorn is fine for production too

# Just run: uvicorn main:app --port 8000
```

### Frontend Build

```powershell
cd frontend-next

# Build static site
npm run build

# Test production build locally
npm run start
```

Visit **http://localhost:3000** — should look identical to dev but fully optimized.

---

## 🌐 Deployment Checklist

Before deploying to Vercel / Render:

- [ ] Backend: Test all routes work locally
  ```powershell
  curl "http://localhost:8000/chat" -X POST -H "Content-Type: application/json" -d "{\"prompt\":\"test\"}"
  ```
- [ ] Frontend: Run `npm run build` with no errors
- [ ] Environment variables set:
  - Backend: `GROQ_API_KEY`, `NCBI_API_KEY` (if using)
  - Frontend: `NEXT_PUBLIC_API_URL` = your backend URL
- [ ] `.env` is in `.gitignore` (not committed to git)
- [ ] All messages appear, sounds/confetti work
- [ ] Responsive on mobile (F12 → toggle device toolbar)

---

## 🚀 Deploy to Vercel (Frontend)

1. Push repo to GitHub (ensure `.env` is in `.gitignore`)
2. Go to https://vercel.com → **New Project** → Import Git repo
3. Set root directory to `frontend-next`
4. Set environment variable:
   - `NEXT_PUBLIC_API_URL` = `https://your-backend.com` (your deployed backend URL)
5. Click **Deploy**

---

## 🚀 Deploy Backend (Render.com)

1. Push repo to GitHub
2. Go to https://render.com → **New Web Service** → Connect GitHub
3. Set build command:
   ```
   pip install -r requirements.txt
   ```
4. Set start command:
   ```
   uvicorn main:app --host 0.0.0.0 --port $PORT
   ```
5. Add environment variables:
   - `GROQ_API_KEY` = your key
   - `NCBI_API_KEY` = (optional)
6. Click **Deploy**

Your backend URL will be something like: `https://my-doctor-api.onrender.com`

---

## 📝 Notes

- **Sound files** are placeholders in `frontend-next/public/sounds/`. Replace them with real `.mp3` files for actual sound effects.
- **Confetti** requires `react-confetti` to be installed (optional).
- **3D Character** (three.js) is optional; the current SVG character works great on all devices.
- For production, use a CDN or asset hosting for sound/image files to reduce bundle size.

---

Questions? Check `README.md` in the project root for more details.
