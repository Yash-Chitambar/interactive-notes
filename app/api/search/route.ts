// ============================================================
// /api/search — PERSON 1 OWNS THIS FILE
// Proxies semantic search queries to ChromaDB backend.
// ============================================================

import { NextRequest, NextResponse } from "next/server";

const CHROMA_BACKEND = process.env.CHROMA_BACKEND_URL ?? "http://localhost:8001";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q");
  const k = searchParams.get("k") ?? "5";

  if (!q) {
    return NextResponse.json({ error: "q is required" }, { status: 400 });
  }

  try {
    const chromaRes = await fetch(
      `${CHROMA_BACKEND}/search?q=${encodeURIComponent(q)}&k=${k}`
    );

    if (!chromaRes.ok) {
      return NextResponse.json({ error: "Search failed" }, { status: chromaRes.status });
    }

    const data = await chromaRes.json();
    return NextResponse.json(data);
  } catch {
    // ChromaDB not running — return empty (graceful degradation)
    return NextResponse.json([]);
  }
}
