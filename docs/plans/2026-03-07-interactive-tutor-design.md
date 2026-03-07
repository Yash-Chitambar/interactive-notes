# Study Buddy — Design Document

**Date:** 2026-03-07
**Project:** Interactive AI Tutoring App (Hackathon)

## What We're Building

A web app that acts like a real-time AI tutor sitting next to you while you do homework. You write on a canvas (works with Apple Pencil on iPad in Safari), and the AI watches your work, highlights errors in red, gives hints in blue, and coaches you via voice — without giving away the answer.

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 15 + Tailwind CSS |
| Canvas | HTML5 Canvas API (pointer events) |
| VLM | Gemini 2.0 Flash |
| Voice | Gemini 2.0 Live API |
| Vector DB | ChromaDB (local Python FastAPI) |
| Deploy | Vercel |

## Architecture

```
Browser → POST /api/analyze → Gemini Flash → JSON annotations → SVG overlay
Browser ↔ ws://localhost:8080 ↔ ws-relay/server.js ↔ Gemini Live
Browser → POST /api/ingest → ChromaDB backend → embeddings stored
```

## 5-Person Team

| Person | Role | Key Files |
|--------|------|-----------|
| 1 | Data/ChromaDB | `chroma-backend/`, `/api/ingest`, `/api/search` |
| 2 | Audio/Gemini Live | `ws-relay/server.js`, `hooks/useAudioSession.ts`, `components/AudioBar.tsx` |
| 3 | Canvas/VLM | `components/Canvas.tsx`, `components/AIOverlay.tsx`, `hooks/useVLMAnalysis.ts`, `/api/analyze` |
| 4 | UI/Features | `app/upload/`, `app/settings/`, `app/review/`, `components/NotesPanel.tsx` |
| 5 | Integrations | `/api/external/verify`, `/api/external/resources` |

## Shared Contracts

See `types/index.ts` — everyone imports from here. Do not change types without telling the team.

## Running Locally

```bash
# Terminal 1: Next.js app
cp .env.local.example .env.local   # fill in API keys
npm install
npm run dev

# Terminal 2: ChromaDB backend (Person 1)
cd chroma-backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8001

# Terminal 3: WebSocket relay (Person 2)
npm run ws   # node ws-relay/server.js
```

Open http://localhost:3000 in Safari on iPad (or any browser).

## Demo Flow

1. Upload a photo of your notes
2. Write a math problem with a mistake on the canvas
3. Pause your stylus — AI overlay appears in ~2 seconds
4. Ask a question out loud — AI voice tutor responds
5. Fix the error — AI praises you in green
