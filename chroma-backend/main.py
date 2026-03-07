# ============================================================
# chroma-backend/main.py — PERSON 1 OWNS THIS FILE
# FastAPI server exposing ChromaDB ingestion + search.
# Run: uvicorn main:app --reload --port 8001
# ============================================================

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routes import router

app = FastAPI(title="Study Buddy — ChromaDB Backend", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "https://*.vercel.app"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)


@app.get("/health")
def health():
    return {"status": "ok"}
