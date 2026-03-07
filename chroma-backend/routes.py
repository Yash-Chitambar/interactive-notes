# ============================================================
# chroma-backend/routes.py — PERSON 1 OWNS THIS FILE
# /ingest and /search endpoints.
# ============================================================

from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import JSONResponse
from chroma_service import ChromaService
from typing import Optional

router = APIRouter()
chroma = ChromaService()


@router.post("/ingest")
async def ingest(
    file: UploadFile = File(...),
    session_id: Optional[str] = Form(None),
):
    """
    Accept a PDF or image file, OCR it with Gemini Vision,
    chunk the text, embed it, and store in ChromaDB.
    Returns: { doc_id, chunks_created, source_name }
    """
    content = await file.read()
    mime_type = file.content_type or "application/octet-stream"

    try:
        result = await chroma.ingest(
            content=content,
            filename=file.filename or "upload",
            mime_type=mime_type,
            session_id=session_id or "default",
        )
        return JSONResponse(result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/search")
async def search(q: str, k: int = 5, session_id: Optional[str] = None):
    """
    Semantic search over ingested notes.
    Returns: list of { text, source, relevance }
    """
    try:
        chunks = await chroma.search(query=q, k=k, session_id=session_id)
        return JSONResponse(chunks)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
