// ============================================================
// /api/ingest — PERSON 1 OWNS THIS FILE
// Accepts PDF or image file, forwards to ChromaDB backend for
// OCR + embedding + storage.
// ============================================================

import { NextRequest, NextResponse } from "next/server";

const CHROMA_BACKEND = process.env.CHROMA_BACKEND_URL ?? "http://localhost:8001";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const sessionId = formData.get("session_id") as string | null;

    if (!file) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }

    // Forward multipart to ChromaDB backend (Person 1's Python service)
    const proxyForm = new FormData();
    proxyForm.append("file", file);
    if (sessionId) proxyForm.append("session_id", sessionId);

    const chromaRes = await fetch(`${CHROMA_BACKEND}/ingest`, {
      method: "POST",
      body: proxyForm,
    });

    if (!chromaRes.ok) {
      const err = await chromaRes.text();
      return NextResponse.json({ error: err }, { status: chromaRes.status });
    }

    const data = await chromaRes.json();
    return NextResponse.json(data);
  } catch (err) {
    console.error("[/api/ingest]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
