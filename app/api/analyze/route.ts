// ============================================================
// /api/analyze — PERSON 3 OWNS THIS FILE
// Receives canvas screenshot → Gemini 2.0 Flash Vision →
// returns structured JSON annotations for the overlay.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import type { Schema } from "@google/generative-ai";
import { AnalyzeRequest, AnnotationResponse } from "@/types";
import { CloudClient, Collection } from "chromadb";
import { ChromaCloudQwenEmbeddingFunction, ChromaCloudQwenEmbeddingModel } from "@chroma-core/chroma-cloud-qwen";
import { ChromaCloudSpladeEmbeddingFunction, ChromaCloudSpladeEmbeddingModel } from "@chroma-core/chroma-cloud-splade";

const CHROMA_BACKEND = process.env.CHROMA_BACKEND_URL ?? "http://localhost:8001";

async function ragSearch(userPrompt: string) {

  const client = new CloudClient(
    {
      tenant: process.env.CHROMA_TENANT ?? "",
      database: process.env.CHROMA_DATABASE ?? "",
      apiKey: process.env.CHROME_API_KEY ?? "",
    }
  );

  const qwenEf = new ChromaCloudQwenEmbeddingFunction({
    model: ChromaCloudQwenEmbeddingModel.QWEN3_EMBEDDING_0p6B,
    task: null,
    apiKeyEnvVar: "CHROMA_API_KEY",  // name of your env var, not the value itself
  });

  const spladeEf = new ChromaCloudSpladeEmbeddingFunction({
    model: ChromaCloudSpladeEmbeddingModel.SPLADE_PP_EN_V1,
    apiKeyEnvVar: "CHROMA_API_KEY",  // name of your env var, not the value itself
  });

  // Step 1: Retrieve relevant chunks from ChromaDB
  const collection = await client.getCollection({ 
    name: "notes_general-data",
    embeddingFunction: qwenEf
  });
  const { docs, metas } = await hybridSearch(collection, userPrompt);

  return buildContext(docs)
}

function buildContext(docs: string[]): string {
  return docs
    .map((doc, i) => `[Source ${i + 1}]:\n${doc}`)
    .join("\n\n---\n\n");
}

async function hybridSearch(
  collection: Collection,
  query: string,
  nResults: number = 5
): Promise<{ docs: string[]; metas: Record<string, any>[] }> {
  const results = await collection.query({
    queryTexts: [query],
    nResults,
    include: ["documents", "metadatas", "distances"],
  });

  const docs = results.documents[0] as string[];
  const metas = results.metadatas[0] as Record<string, any>[];

  return { docs, metas };
}

// Enforce structured JSON output — no parsing guesswork
const ANNOTATION_SCHEMA: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    annotations: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          bbox: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.NUMBER },
          },
          type: { type: SchemaType.STRING, format: "enum", enum: ["error", "hint", "praise"] },
          text: { type: SchemaType.STRING },
          severity: { type: SchemaType.NUMBER },
        },
        required: ["bbox", "type", "text", "severity"],
      },
    },
    summary: { type: SchemaType.STRING },
    step_errors: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
    },
  },
  required: ["annotations", "summary", "step_errors"],
};

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "GEMINI_API_KEY not configured" }, { status: 503 });
  }

  let body: AnalyzeRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { image, subject, session_id, tutor_mode, question } = body;
  if (!image) {
    return NextResponse.json({ error: "image is required" }, { status: 400 });
  }

  // Strip data URL prefix → raw base64
  const base64Data = image.includes(",") ? image.split(",")[1] : image;

  // ── Step 1: ChromaDB context (non-blocking, fail gracefully) ──────────
  let contextText = "";
  try {
    const chromaRes = await fetch(
      `${CHROMA_BACKEND}/search?q=${encodeURIComponent(subject)}&k=3${session_id ? `&session_id=${session_id}` : ""}`,
      { signal: AbortSignal.timeout(2000) }
    );
    if (chromaRes.ok) {
      const chunks: Array<{ text: string; source: string }> = await chromaRes.json();
      contextText = chunks.map((c) => `[${c.source}]: ${c.text}`).join("\n\n");
    }
  } catch {
    // ChromaDB not available — continue without context
  }

  // ── Step 2: Call Gemini 2.0 Flash Vision ─────────────────────────────
  try {
    const RAG_supplement_text = await ragSearch(subject);

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: ANNOTATION_SCHEMA,
        temperature: 0.3,
        maxOutputTokens: 1024,
      },
    });

    const result = await model.generateContent([
      { text: buildPrompt(subject, contextText, tutor_mode, RAG_supplement_text) },
      { inlineData: { data: base64Data, mimeType: "image/png" } },
    ]);

    let parsed: AnnotationResponse;
    try {
      parsed = JSON.parse(result.response.text());
    } catch {
      return NextResponse.json<AnnotationResponse>({
        annotations: [],
        summary: "Keep going — you're doing great!",
        step_errors: [],
      });
    }

    // Sanitize annotations
    parsed.annotations = (parsed.annotations ?? [])
      .filter(
        (a) =>
          Array.isArray(a.bbox) &&
          a.bbox.length === 4 &&
          a.bbox.every((v) => typeof v === "number")
      )
      .map((a) => ({
        ...a,
        severity: Math.max(1, Math.min(3, Math.round(a.severity))) as 1 | 2 | 3,
        text: String(a.text ?? "").slice(0, 80),
      }));

    return NextResponse.json<AnnotationResponse>(parsed);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[/api/analyze] Gemini error:", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

// ── Prompt ────────────────────────────────────────────────────────────────

function buildPrompt(subject: string, context: string, mode: string, RAGResponse: string): string {
  const guides: Record<string, string> = {
    math:      "Look for arithmetic errors, wrong signs, incorrect algebra, missing simplification.",
    physics:   "Look for wrong formulas, unit errors, incorrect vector directions, sign mistakes.",
    chemistry: "Look for unbalanced equations, wrong valences, incorrect stoichiometry.",
    english:   "Look for grammar errors, unclear thesis, weak evidence, run-on sentences.",
  };
  const guide = guides[subject] ?? "Look for factual or logical errors.";

  return `You are a patient, encouraging ${subject} tutor reviewing a student's handwritten work on a digital canvas.

${context ? `Student's uploaded notes for context:\n${context}\n\n` : ""}${guide}
Tutor mode: "${mode}"
${mode === "hint"
  ? "NEVER reveal the correct answer — point to where the error is and ask a guiding question."
  : "You may show the correct answer when there is a clear error."}

Rules:
- bbox: tight bounding box [x, y, width, height] in IMAGE pixels around the specific symbol/step with the issue
- type "error": wrong step or answer (severity 2-3)
- type "hint": student is close but needs a nudge (severity 1-2)
- type "praise": clearly correct work (severity 1)
- text: max 60 chars, specific ("Wrong sign here", "Check exponent", "x = -1 not +1")
- If canvas is blank or nearly empty: return annotations=[], summary="Go ahead — start writing!"
- Only annotate what you can clearly see — ignore illegible marks
- summary: one short, encouraging sentence spoken aloud to the student

RAG from relevant database (additional context):
${RAGResponse}
`;
}
