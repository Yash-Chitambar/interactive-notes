"""
Migration script: copies existing data into Chroma Cloud with hybrid embeddings.

Usage:
    python -m db.migrate --user-id <user_id>

If you already have notes stored in an old Chroma collection, this script
will read them out and re-ingest them into the new per-user collection
with the dense (Qwen) + sparse (Splade) schema.
"""

import argparse
import sys

from db.chroma import get_client, get_collection, add_note


def migrate(user_id: str):
    client = get_client()

    # Try to read from the old default collection (no schema, default embeddings)
    try:
        old_collection = client.get_collection(name="notes")
    except Exception:
        print("No legacy 'notes' collection found. Nothing to migrate.")
        return

    # Fetch all documents from old collection
    old_data = old_collection.get(include=["documents", "metadatas"])

    if not old_data["ids"]:
        print("Legacy collection is empty. Nothing to migrate.")
        return

    print(f"Found {len(old_data['ids'])} documents to migrate.")

    new_collection = get_collection(client, user_id)
    migrated = 0

    for doc_id, document, metadata in zip(
        old_data["ids"],
        old_data["documents"],
        old_data["metadatas"] or [{}] * len(old_data["ids"]),
    ):
        if document is None:
            continue

        source = metadata.get("source", "text") if metadata else "text"
        tags_str = metadata.get("tags", "") if metadata else ""
        tags = [t.strip() for t in tags_str.split(",") if t.strip()] if tags_str else None

        add_note(
            client=client,
            user_id=user_id,
            text=document,
            source=source,
            tags=tags,
            note_id=doc_id,
        )
        migrated += 1
        print(f"  Migrated {migrated}/{len(old_data['ids'])}: {doc_id}")

    print(f"\nDone. Migrated {migrated} notes into collection 'notes_{user_id}'.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Migrate notes to Chroma Cloud hybrid search")
    parser.add_argument("--user-id", required=True, help="Target user ID for the new collection")
    args = parser.parse_args()
    migrate(args.user_id)
