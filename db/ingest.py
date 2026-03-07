"""
Ingest PDFs and text files from the uploads/ folder into Chroma Cloud.

Usage:
    python -m db.ingest --user-id <user_id>
    python -m db.ingest --user-id <user_id> --file uploads/specific.pdf
"""

import argparse
import os
from pathlib import Path

import fitz  # PyMuPDF

from db.chroma import get_client, get_collection, add_note

UPLOADS_DIR = Path(__file__).resolve().parent.parent / "uploads"


def extract_text_from_pdf(path: Path) -> str:
    doc = fitz.open(path)
    pages = []
    for page in doc:
        pages.append(page.get_text())
    doc.close()
    return "\n".join(pages)


def extract_text_from_file(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def ingest_file(client, user_id: str, path: Path):
    ext = path.suffix.lower()
    if ext == ".pdf":
        text = extract_text_from_pdf(path)
    elif ext in (".txt", ".md"):
        text = extract_text_from_file(path)
    else:
        print(f"  Skipping unsupported file: {path.name}")
        return None

    if not text.strip():
        print(f"  Skipping empty file: {path.name}")
        return None

    note_id = add_note(
        client=client,
        user_id=user_id,
        text=text,
        source="pdf" if ext == ".pdf" else "text",
        tags=[path.stem],
        filename=path.name,
    )
    print(f"  Ingested {path.name} -> note {note_id} ({len(text)} chars)")
    return note_id


def get_ingested_filenames(client, user_id: str) -> set[str]:
    """Return the set of filenames already ingested into Chroma."""
    collection = get_collection(client, user_id)
    results = collection.get(include=["metadatas"])
    filenames = set()
    for meta in results["metadatas"] or []:
        if meta and "filename" in meta:
            filenames.add(meta["filename"])
    return filenames


def sync(user_id: str = "general-data"):
    """Ingest any files in uploads/ that aren't already in Chroma."""
    client = get_client()

    files = sorted(UPLOADS_DIR.iterdir())
    supported = [f for f in files if f.suffix.lower() in (".pdf", ".txt", ".md")]
    if not supported:
        print(f"No PDF/text files found in {UPLOADS_DIR}")
        return

    already_ingested = get_ingested_filenames(client, user_id)
    new_files = [f for f in supported if f.name not in already_ingested]

    if not new_files:
        print(f"All {len(supported)} file(s) already ingested. Nothing to do.")
        return

    print(f"Found {len(new_files)} new file(s) to ingest ({len(already_ingested)} already in Chroma)")
    for path in new_files:
        ingest_file(client, user_id, path)

    print("Done.")


def main():
    parser = argparse.ArgumentParser(description="Ingest files into Chroma Cloud")
    parser.add_argument("--user-id", default="general-data", help="User ID for collection sharding (default: general-data)")
    parser.add_argument("--file", type=str, help="Ingest a specific file instead of the whole uploads/ folder")
    parser.add_argument("--sync", action="store_true", help="Only ingest files not already in Chroma")
    args = parser.parse_args()

    if args.sync:
        sync(args.user_id)
        return

    client = get_client()

    if args.file:
        path = Path(args.file)
        if not path.exists():
            print(f"File not found: {path}")
            return
        ingest_file(client, args.user_id, path)
    else:
        files = sorted(UPLOADS_DIR.iterdir())
        supported = [f for f in files if f.suffix.lower() in (".pdf", ".txt", ".md")]
        if not supported:
            print(f"No PDF/text files found in {UPLOADS_DIR}")
            return
        print(f"Found {len(supported)} file(s) in {UPLOADS_DIR}")
        for path in supported:
            ingest_file(client, args.user_id, path)

    print("Done.")


if __name__ == "__main__":
    main()
