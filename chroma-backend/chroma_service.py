# ============================================================
# chroma-backend/chroma_service.py — PERSON 1 OWNS THIS FILE
# ChromaDB ingestion + search logic.
# ============================================================

import uuid
import os
import chromadb
from chromadb.utils import embedding_functions
import google.generativeai as genai

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
CHUNK_SIZE = 500  # characters per chunk
CHUNK_OVERLAP = 50

genai.configure(api_key=GEMINI_API_KEY)


class ChromaService:
    def __init__(self):
        # In-process ChromaDB (no server needed)
        self.client = chromadb.PersistentClient(path="./chroma_data")

        # Use Gemini embeddings
        # TODO Person 1: switch to Gemini embedding model
        # For now: use default sentence-transformers (no API key needed)
        self.embedding_fn = embedding_functions.DefaultEmbeddingFunction()

        self.collection = self.client.get_or_create_collection(
            name="study_notes",
            embedding_function=self.embedding_fn,
            metadata={"hnsw:space": "cosine"},
        )

    async def ingest(self, content: bytes, filename: str, mime_type: str, session_id: str) -> dict:
        """
        OCR the file (if image/PDF), chunk the text, embed, store.
        """
        # --- Step 1: Extract text ---
        text = await self._extract_text(content, filename, mime_type)

        # --- Step 2: Chunk ---
        chunks = self._chunk(text)

        # --- Step 3: Store in ChromaDB ---
        doc_id = str(uuid.uuid4())
        ids = [f"{doc_id}_{i}" for i in range(len(chunks))]
        metadatas = [{"source": filename, "session_id": session_id, "chunk_index": i} for i in range(len(chunks))]

        self.collection.add(
            ids=ids,
            documents=chunks,
            metadatas=metadatas,
        )

        return {
            "doc_id": doc_id,
            "chunks_created": len(chunks),
            "source_name": filename,
        }

    async def search(self, query: str, k: int = 5, session_id: str = None) -> list:
        """
        Semantic search, optionally filtered by session_id.
        """
        where = {"session_id": session_id} if session_id else None

        results = self.collection.query(
            query_texts=[query],
            n_results=min(k, self.collection.count() or 1),
            where=where,
        )

        chunks = []
        if results["documents"]:
            for doc, meta, dist in zip(
                results["documents"][0],
                results["metadatas"][0],
                results["distances"][0],
            ):
                chunks.append({
                    "text": doc,
                    "source": meta.get("source", "unknown"),
                    "relevance": 1 - dist,  # cosine similarity
                })

        return chunks

    async def _extract_text(self, content: bytes, filename: str, mime_type: str) -> str:
        """
        Use Gemini Vision to OCR the file, or pypdf for PDFs.
        TODO Person 1: implement full Gemini OCR pipeline.
        """
        if mime_type == "application/pdf":
            # TODO Person 1: use pypdf2 to extract text, fallback to Gemini OCR
            import io
            try:
                import pypdf
                reader = pypdf.PdfReader(io.BytesIO(content))
                return "\n".join(page.extract_text() or "" for page in reader.pages)
            except Exception:
                return f"[PDF content from {filename} — OCR TODO]"

        elif mime_type.startswith("image/"):
            # TODO Person 1: send to Gemini Vision for OCR
            # import google.generativeai as genai
            # model = genai.GenerativeModel("gemini-2.0-flash")
            # img_part = {"inline_data": {"data": base64.b64encode(content).decode(), "mime_type": mime_type}}
            # result = model.generate_content(["Extract all text from this image:", img_part])
            # return result.text
            return f"[Image content from {filename} — OCR TODO]"

        return f"[Unsupported file type: {mime_type}]"

    def _chunk(self, text: str) -> list[str]:
        """Split text into overlapping chunks."""
        if not text.strip():
            return ["(empty document)"]

        chunks = []
        start = 0
        while start < len(text):
            end = start + CHUNK_SIZE
            chunks.append(text[start:end].strip())
            start += CHUNK_SIZE - CHUNK_OVERLAP

        return [c for c in chunks if c]
