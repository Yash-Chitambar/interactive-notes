# ============================================================
# chroma-backend/routes.py
# /ingest and /search endpoints.
# ============================================================

from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from chroma_service import ChromaService

router = APIRouter()
chroma = ChromaService()


@router.post("/ingest")
async def ingest(
    file: UploadFile = File(...),
    session_id: Optional[str] = Form(None),
):
    """
    Accept a PDF or image file, extract its text (via pypdf or Gemini Vision),
    chunk the text, embed it with sentence-transformers, and store in ChromaDB.

    Returns: { doc_id, chunks_created, source_name }
    """
    content = await file.read()
    mime_type = file.content_type or "application/octet-stream"
    filename = file.filename or "upload"

    try:
        result = await chroma.ingest(
            content=content,
            filename=filename,
            mime_type=mime_type,
            session_id=session_id or "default",
        )
        return JSONResponse(content=result)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/search")
async def search(
    q: str,
    k: int = 5,
    session_id: Optional[str] = None,
):
    """
    Semantic search over ingested notes.

    Query params:
      q          — search query (required)
      k          — number of results to return (default 5)
      session_id — optional filter to a specific session

    Returns: list of { text, source, relevance }
    """
    if not q.strip():
        raise HTTPException(status_code=400, detail="Query parameter 'q' must not be empty.")

    try:
        chunks = await chroma.search(query=q, k=k, session_id=session_id)
        return JSONResponse(content=chunks)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
