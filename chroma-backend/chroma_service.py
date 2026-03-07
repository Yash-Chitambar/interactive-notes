# ============================================================
# chroma-backend/chroma_service.py
# ChromaDB ingestion + search logic.
# ============================================================

import asyncio
import base64
import io
import os
import uuid

import chromadb
from chromadb.utils import embedding_functions

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
CHUNK_SIZE = 500   # characters per chunk
CHUNK_OVERLAP = 50


class ChromaService:
    def __init__(self):
        self.client = chromadb.PersistentClient(path="./chroma_data")

        self.embedding_fn = embedding_functions.DefaultEmbeddingFunction()

        self.collection = self.client.get_or_create_collection(
            name="study_notes",
            embedding_function=self.embedding_fn,
            metadata={"hnsw:space": "cosine"},
        )

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def ingest(
        self,
        content: bytes,
        filename: str,
        mime_type: str,
        session_id: str,
    ) -> dict:
        """OCR the file (if image/PDF), chunk the text, embed, store."""

        # Step 1: Extract text
        text = await self._extract_text(content, filename, mime_type)

        # Step 2: Chunk
        chunks = self._chunk(text)

        # Step 3: Store in ChromaDB (blocking call — run in thread)
        doc_id = str(uuid.uuid4())
        ids = [f"{doc_id}_{i}" for i in range(len(chunks))]
        metadatas = [
            {
                "source": filename,
                "session_id": session_id,
                "chunk_index": i,
            }
            for i in range(len(chunks))
        ]

        await asyncio.to_thread(
            self.collection.add,
            ids=ids,
            documents=chunks,
            metadatas=metadatas,
        )

        return {
            "doc_id": doc_id,
            "chunks_created": len(chunks),
            "source_name": filename,
        }

    async def search(
        self,
        query: str,
        k: int = 5,
        session_id: str = None,
    ) -> list:
        """Semantic search, optionally filtered by session_id."""

        # Get count in thread to avoid blocking
        count = await asyncio.to_thread(self.collection.count)
        if count == 0:
            return []

        n = min(k, count)
        where = {"session_id": session_id} if session_id else None

        results = await asyncio.to_thread(
            self.collection.query,
            query_texts=[query],
            n_results=n,
            where=where,
        )

        chunks = []
        if results["documents"] and results["documents"][0]:
            for doc, meta, dist in zip(
                results["documents"][0],
                results["metadatas"][0],
                results["distances"][0],
            ):
                chunks.append(
                    {
                        "text": doc,
                        "source": meta.get("source", "unknown"),
                        "relevance": round(1 - dist, 4),  # cosine similarity
                    }
                )

        return chunks

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    async def _extract_text(
        self, content: bytes, filename: str, mime_type: str
    ) -> str:
        """Extract text from a PDF or image."""

        if mime_type == "application/pdf":
            return await asyncio.to_thread(self._extract_pdf, content, filename)

        if mime_type.startswith("image/"):
            return await self._extract_image_gemini(content, filename, mime_type)

        # Unsupported type — use filename as placeholder so it still gets indexed
        return f"[Unsupported file type: {mime_type}] {filename}"

    # --- PDF -----------------------------------------------------------

    def _extract_pdf(self, content: bytes, filename: str) -> str:
        """Synchronous PDF extraction using pypdf."""
        try:
            import pypdf

            reader = pypdf.PdfReader(io.BytesIO(content))
            pages = []
            for page in reader.pages:
                page_text = page.extract_text() or ""
                pages.append(page_text)
            text = "\n".join(pages).strip()
            return text if text else f"[No extractable text in PDF: {filename}]"
        except Exception as exc:
            return f"[PDF extraction failed for {filename}: {exc}]"

    # --- Image / Gemini Vision ----------------------------------------

    async def _extract_image_gemini(
        self, content: bytes, filename: str, mime_type: str
    ) -> str:
        """Use Gemini Vision to OCR an image."""

        if not GEMINI_API_KEY:
            return f"[Image OCR skipped — GEMINI_API_KEY not set] {filename}"

        try:
            import google.generativeai as genai

            genai.configure(api_key=GEMINI_API_KEY)
            model = genai.GenerativeModel("gemini-2.5-flash")

            image_part = {
                "inline_data": {
                    "data": base64.b64encode(content).decode("utf-8"),
                    "mime_type": mime_type,
                }
            }
            prompt = (
                "Extract all handwritten and printed text from this image exactly "
                "as written. Return only the extracted text, nothing else."
            )

            # generate_content is blocking — run in thread
            response = await asyncio.to_thread(
                model.generate_content, [prompt, image_part]
            )
            return response.text.strip()

        except Exception as exc:
            return f"[Gemini OCR failed for {filename}: {exc}]"

    # --- Chunking ------------------------------------------------------

    def _chunk(self, text: str) -> list[str]:
        """Split text into overlapping chunks of CHUNK_SIZE characters."""
        if not text.strip():
            return ["(empty document)"]

        chunks = []
        start = 0
        while start < len(text):
            end = start + CHUNK_SIZE
            chunk = text[start:end].strip()
            if chunk:
                chunks.append(chunk)
            start += CHUNK_SIZE - CHUNK_OVERLAP

        return chunks if chunks else ["(empty document)"]
