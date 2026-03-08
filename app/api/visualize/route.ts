// ============================================================
// /api/visualize — Generate an image from a text prompt using
// Gemini 3.1 Flash Image (generateContent with responseModalities: IMAGE).
// ============================================================

import { NextRequest, NextResponse } from "next/server";

const GEMINI_IMAGE_MODEL = "gemini-3.1-flash-image-preview";

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "GEMINI_API_KEY not configured" }, { status: 503 });
  }

  let body: { prompt?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: `Generate an image: ${prompt}` }],
          },
        ],
        generationConfig: {
          responseModalities: ["IMAGE", "TEXT"],
          responseMimeType: "text/plain",
        },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("[/api/visualize] Gemini image error:", res.status, errText);
      return NextResponse.json(
        { error: `Image generation failed: ${res.status}` },
        { status: 502 }
      );
    }

    const data = (await res.json()) as {
      candidates?: Array<{
        content?: {
          parts?: Array<{ inlineData?: { mimeType?: string; data?: string } }>;
        };
      }>;
    };

    const parts = data.candidates?.[0]?.content?.parts ?? [];
    const imagePart = parts.find((p) => p.inlineData?.data);
    const b64 = imagePart?.inlineData?.data;
    if (!b64) {
      console.error("[/api/visualize] No image in response:", JSON.stringify(data).slice(0, 500));
      return NextResponse.json(
        { error: "No image returned from model" },
        { status: 502 }
      );
    }

    const mimeType = imagePart.inlineData?.mimeType ?? "image/png";
    return NextResponse.json({
      image: `data:${mimeType};base64,${b64}`,
      mimeType,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[/api/visualize]", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
