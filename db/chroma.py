"""
Chroma Cloud integration for Interactive Notes.

Provides hybrid search (dense + sparse via RRF), document chunking,
per-user collection sharding, and CRUD operations for notes.
"""

import os
import uuid
from datetime import datetime, timezone
from typing import Optional

from pathlib import Path

from dotenv import load_dotenv

import chromadb
from chromadb import K, Knn, Rrf, Search, Schema, SparseVectorIndexConfig, VectorIndexConfig
from chromadb.api import GroupBy, MinK
from chromadb.utils.embedding_functions import (
    ChromaCloudQwenEmbeddingFunction,
    ChromaCloudSpladeEmbeddingFunction,
)
from chromadb.utils.embedding_functions.chroma_cloud_qwen_embedding_function import (
    ChromaCloudQwenEmbeddingModel,
)
from chromadb.utils.embedding_functions.chroma_cloud_splade_embedding_function import (
    ChromaCloudSpladeEmbeddingModel,
)

load_dotenv(Path(__file__).resolve().parent / ".env")

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

CHROMA_MAX_DOC_BYTES = 16 * 1024  # 16 KiB per document limit
CHUNK_SIZE_CHARS = 12_000  # ~12 KB to stay safely under 16 KiB
CHUNK_OVERLAP_CHARS = 200  # overlap between chunks for continuity


# ---------------------------------------------------------------------------
# Client
# ---------------------------------------------------------------------------

def get_client() -> chromadb.CloudClient:
    """Return a configured Chroma Cloud client."""
    return chromadb.CloudClient(
        tenant=os.environ["CHROMA_TENANT"],
        database=os.environ["CHROMA_DATABASE"],
        api_key=os.environ["CHROMA_API_KEY"],
    )


# ---------------------------------------------------------------------------
# Embedding functions (run on Chroma Cloud servers)
# ---------------------------------------------------------------------------

def _qwen_ef() -> ChromaCloudQwenEmbeddingFunction:
    return ChromaCloudQwenEmbeddingFunction(
        model=ChromaCloudQwenEmbeddingModel.QWEN3_EMBEDDING_0p6B,
        task="nl_to_code",
    )


def _splade_ef() -> ChromaCloudSpladeEmbeddingFunction:
    return ChromaCloudSpladeEmbeddingFunction(
        model=ChromaCloudSpladeEmbeddingModel.SPLADE_PP_EN_V1,
    )


# ---------------------------------------------------------------------------
# Schema  (dense Qwen + sparse Splade)
# ---------------------------------------------------------------------------

def _build_schema() -> Schema:
    """Build a collection schema with dense and sparse embedding indexes."""
    schema = Schema()
    # Dense embedding index (Qwen) on the default #embedding key
    schema.create_index(
        config=VectorIndexConfig(
            embedding_function=_qwen_ef(),
        ),
    )
    # Sparse embedding index (Splade) for keyword matching
    schema.create_index(
        config=SparseVectorIndexConfig(
            source_key=K.DOCUMENT,
            embedding_function=_splade_ef(),
        ),
        key="sparse_embedding",
    )
    return schema


# ---------------------------------------------------------------------------
# Collection helpers  (one collection per user for sharding)
# ---------------------------------------------------------------------------

def get_collection(client: chromadb.CloudClient, user_id: str):
    """Get or create a user-scoped collection with hybrid search schema."""
    name = f"notes_{user_id}"
    return client.get_or_create_collection(
        name=name,
        schema=_build_schema(),
    )


# ---------------------------------------------------------------------------
# Chunking
# ---------------------------------------------------------------------------

def chunk_text(text: str) -> list[str]:
    """Split text into line-based chunks that fit within Chroma's 16 KiB limit.

    Strategy: split on newlines first, then accumulate lines into chunks
    up to CHUNK_SIZE_CHARS. If a single line exceeds the limit, split it
    by character count.
    """
    if len(text.encode("utf-8")) <= CHROMA_MAX_DOC_BYTES:
        return [text]

    lines = text.split("\n")
    chunks: list[str] = []
    current: list[str] = []
    current_len = 0

    for line in lines:
        line_len = len(line) + 1  # +1 for the newline we'll rejoin with
        if current_len + line_len > CHUNK_SIZE_CHARS and current:
            chunks.append("\n".join(current))
            # keep last few lines as overlap
            overlap_lines: list[str] = []
            overlap_len = 0
            for prev_line in reversed(current):
                if overlap_len + len(prev_line) + 1 > CHUNK_OVERLAP_CHARS:
                    break
                overlap_lines.insert(0, prev_line)
                overlap_len += len(prev_line) + 1
            current = overlap_lines
            current_len = overlap_len

        # Handle single lines that exceed chunk size
        if line_len > CHUNK_SIZE_CHARS:
            if current:
                chunks.append("\n".join(current))
                current = []
                current_len = 0
            for i in range(0, len(line), CHUNK_SIZE_CHARS):
                chunks.append(line[i : i + CHUNK_SIZE_CHARS])
        else:
            current.append(line)
            current_len += line_len

    if current:
        chunks.append("\n".join(current))

    return chunks


# ---------------------------------------------------------------------------
# CRUD operations
# ---------------------------------------------------------------------------

def add_note(
    client: chromadb.CloudClient,
    user_id: str,
    text: str,
    source: str = "text",
    tags: Optional[list[str]] = None,
    note_id: Optional[str] = None,
    filename: Optional[str] = None,
):
    """Add a note (with automatic chunking if needed).

    Args:
        client: Chroma CloudClient
        user_id: User identifier for collection sharding
        text: The note content
        source: Source type — "text", "voice", "camera", "pdf"
        tags: Optional list of tags
        note_id: Optional note ID (generated if omitted)
        filename: Optional source filename for dedup tracking
    """
    collection = get_collection(client, user_id)
    note_id = note_id or str(uuid.uuid4())
    chunks = chunk_text(text)
    now = datetime.now(timezone.utc).isoformat()

    ids = []
    documents = []
    metadatas = []

    for i, chunk in enumerate(chunks):
        chunk_id = f"{note_id}__chunk_{i}" if len(chunks) > 1 else note_id
        ids.append(chunk_id)
        documents.append(chunk)
        meta = {
            "note_id": note_id,
            "chunk_index": i,
            "total_chunks": len(chunks),
            "source": source,
            "tags": ",".join(tags) if tags else "",
            "created_at": now,
        }
        if filename:
            meta["filename"] = filename
        metadatas.append(meta)

    collection.add(ids=ids, documents=documents, metadatas=metadatas)
    return note_id


def get_note(client: chromadb.CloudClient, user_id: str, note_id: str) -> Optional[dict]:
    """Retrieve a note by ID, reassembling chunks if needed."""
    collection = get_collection(client, user_id)

    # Try single-chunk note first
    result = collection.get(ids=[note_id], include=["documents", "metadatas"])
    if result["ids"]:
        return {
            "id": note_id,
            "text": result["documents"][0],
            "metadata": result["metadatas"][0],
        }

    # Try multi-chunk note
    search = (
        Search()
        .where(K("note_id") == note_id)
        .limit(100)
        .select(K.DOCUMENT, "note_id", "chunk_index", "total_chunks", "source", "tags", "created_at")
    )
    results = collection.search(search)
    rows = results.rows()[0] if results.rows() else []
    if not rows:
        return None

    rows.sort(key=lambda r: r["metadata"]["chunk_index"])
    full_text = "\n".join(r["document"] for r in rows)
    return {
        "id": note_id,
        "text": full_text,
        "metadata": rows[0]["metadata"],
    }


def update_note(
    client: chromadb.CloudClient,
    user_id: str,
    note_id: str,
    text: str,
    source: Optional[str] = None,
    tags: Optional[list[str]] = None,
):
    """Update a note by deleting old chunks and re-adding."""
    delete_note(client, user_id, note_id)
    add_note(client, user_id, text, source=source or "text", tags=tags, note_id=note_id)


def delete_note(client: chromadb.CloudClient, user_id: str, note_id: str):
    """Delete a note and all its chunks."""
    collection = get_collection(client, user_id)

    # Delete single-chunk note
    try:
        collection.delete(ids=[note_id])
    except Exception:
        pass

    # Delete multi-chunk note by metadata filter
    collection.delete(where={"note_id": note_id})


# ---------------------------------------------------------------------------
# Search
# ---------------------------------------------------------------------------

def _embed_query(query: str):
    """Pre-embed a query into dense and sparse vectors.

    Pre-embedding avoids a numpy truthiness bug in chromadb's Search API
    when passing raw string queries to Knn.
    """
    dense = list(_qwen_ef()([query])[0])
    sparse = _splade_ef()([query])[0]
    return dense, sparse


def hybrid_search(
    client: chromadb.CloudClient,
    user_id: str,
    query: str,
    limit: int = 10,
    source_filter: Optional[str] = None,
    tag_filter: Optional[str] = None,
    deduplicate: bool = True,
) -> list[dict]:
    """Hybrid search using dense (Qwen) + sparse (Splade) with RRF.

    Args:
        client: Chroma CloudClient
        user_id: User identifier for collection sharding
        query: Search query text
        limit: Max results to return
        source_filter: Optional filter by source type
        tag_filter: Optional filter by tag (substring match via metadata)
        deduplicate: If True, use GroupBy to deduplicate across chunks
            from the same note

    Returns:
        List of result dicts with keys: id, document, metadata, score
    """
    collection = get_collection(client, user_id)
    dense_vec, sparse_vec = _embed_query(query)

    # Build RRF ranking over dense + sparse
    dense_rank = Knn(query=dense_vec, return_rank=True, limit=200)
    sparse_rank = Knn(query=sparse_vec, key="sparse_embedding", return_rank=True, limit=200)
    hybrid_rank = Rrf(
        ranks=[dense_rank, sparse_rank],
        weights=[0.7, 0.3],
        k=60,
    )

    search = Search().rank(hybrid_rank).limit(limit).select(
        K.DOCUMENT, K.SCORE, "note_id", "chunk_index", "total_chunks",
        "source", "tags", "created_at",
    )

    # Apply optional filters
    conditions = []
    if source_filter:
        conditions.append(K("source") == source_filter)
    if tag_filter:
        conditions.append(K("tags") == tag_filter)
    if conditions:
        where = conditions[0]
        for c in conditions[1:]:
            where = where & c
        search = search.where(where)

    # Deduplicate chunks from the same note
    if deduplicate:
        search = search.group_by(
            GroupBy(
                keys=K("note_id"),
                aggregate=MinK(keys=K.SCORE, k=1),
            )
        )

    results = collection.search(search)
    rows = results.rows()[0] if results.rows() else []

    return [
        {
            "id": row["metadata"]["note_id"],
            "document": row["document"],
            "metadata": row["metadata"],
            "score": row["score"],
        }
        for row in rows
    ]


def dense_search(
    client: chromadb.CloudClient,
    user_id: str,
    query: str,
    limit: int = 10,
) -> list[dict]:
    """Semantic-only search using dense Qwen embeddings."""
    collection = get_collection(client, user_id)
    dense_vec, _ = _embed_query(query)
    search = (
        Search()
        .rank(Knn(query=dense_vec, limit=limit))
        .limit(limit)
        .select(K.DOCUMENT, K.SCORE, "note_id", "source", "tags", "created_at")
        .group_by(GroupBy(keys=K("note_id"), aggregate=MinK(keys=K.SCORE, k=1)))
    )
    results = collection.search(search)
    rows = results.rows()[0] if results.rows() else []
    return [
        {
            "id": row["metadata"]["note_id"],
            "document": row["document"],
            "metadata": row["metadata"],
            "score": row["score"],
        }
        for row in rows
    ]
