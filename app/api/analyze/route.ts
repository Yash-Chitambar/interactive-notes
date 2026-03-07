// ============================================================
// /api/analyze — PERSON 3 OWNS THIS FILE
// Receives canvas screenshot, calls Gemini Vision, returns annotations.
// ChromaDB context is injected by Person 1's chroma_service.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { AnalyzeRequest, AnnotationResponse } from "@/types";

const CHROMA_BACKEND = process.env.CHROMA_BACKEND_URL ?? "http://localhost:8001";

export async function POST(req: NextRequest) {
  try {
    const body: AnalyzeRequest = await req.json();
    const { image, subject, session_id, tutor_mode } = body;

    if (!image) {
      return NextResponse.json({ error: "image is required" }, { status: 400 });
    }

    // --- Step 1: Fetch ChromaDB context (Person 1's service) ---
    // TODO Person 1: make sure /search is running on CHROMA_BACKEND
    let contextText = "";
    try {
      const chromaRes = await fetch(
        `${CHROMA_BACKEND}/search?q=${encodeURIComponent(subject)}&k=3&session_id=${session_id}`
      );
      if (chromaRes.ok) {
        const chunks = await chromaRes.json();
        contextText = chunks.map((c: { text: string; source: string }) => `[${c.source}]: ${c.text}`).join("\n");
      }
    } catch {
      // ChromaDB not available — continue without context
      contextText = "";
    }

    // --- Step 2: Call Gemini Vision ---
    // TODO Person 3: replace stub with real Gemini API call
    // import { GoogleGenerativeAI } from "@google/generative-ai";
    // const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    // const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    // const prompt = buildPrompt(subject, contextText, tutor_mode);
    // const result = await model.generateContent([prompt, { inlineData: { data: image.split(",")[1], mimeType: "image/png" } }]);
    // const parsed = JSON.parse(result.response.text());

    // --- STUB RESPONSE (replace with real Gemini call above) ---
    const stub: AnnotationResponse = {
      annotations: [
        {
          bbox: [80, 120, 100, 30],
          type: "error",
          text: "Check your sign here",
          severity: 2,
        },
      ],
      summary: "I noticed a potential error in your solution. Let me guide you through it.",
      step_errors: ["Incorrect sign when solving for x"],
    };

    return NextResponse.json(stub);
  } catch (err) {
    console.error("[/api/analyze]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Prompt template for Person 3 to fill in when connecting real Gemini
function buildPrompt(subject: string, context: string, mode: string) {
  return `You are a patient ${subject} tutor reviewing a student's handwritten work.
${context ? `Student's relevant notes:\n${context}\n` : ""}
Tutor mode: ${mode} — ${mode === "hint" ? "never reveal the answer directly" : "you may show the correct answer"}.

Return JSON ONLY (no markdown):
{
  "annotations": [{"bbox": [x, y, width, height], "type": "error|hint|praise", "text": "...", "severity": 1-3}],
  "summary": "one encouraging sentence",
  "step_errors": ["..."]
}

Rules:
- Only annotate if there is something meaningful to say
- Be encouraging and Socratic, never harsh
- bbox coordinates are in image pixels`;
}
