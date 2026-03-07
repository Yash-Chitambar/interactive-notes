# ============================================================
# chroma-backend/main.py
# FastAPI server exposing ChromaDB ingestion + search.
# Run: uvicorn main:app --reload --port 8001
# ============================================================

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routes import router

app = FastAPI(
    title="Study Buddy — ChromaDB Backend",
    version="0.2.0",
    description="Ingests PDFs and images, embeds them with sentence-transformers, and exposes semantic search.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://*.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)


@app.get("/health")
def health():
    """Liveness probe — returns 200 when the server is up."""
    return {"status": "ok"}
