// ============================================================
// /api/external/verify — PERSON 5 OWNS THIS FILE
// Verifies a math equation/answer using WolframAlpha.
// Called by /api/analyze before annotating to reduce false positives.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { VerifyRequest, VerifyResponse } from "@/types";

const WOLFRAM_APP_ID = process.env.WOLFRAM_APP_ID;

export async function POST(req: NextRequest) {
  try {
    const { equation }: VerifyRequest = await req.json();

    if (!equation) {
      return NextResponse.json({ error: "equation is required" }, { status: 400 });
    }

    if (!WOLFRAM_APP_ID) {
      // Graceful degradation: no API key, return inconclusive
      return NextResponse.json<VerifyResponse>({
        correct: false,
        result: "verification unavailable (no WOLFRAM_APP_ID)",
      });
    }

    // TODO Person 5: call WolframAlpha API
    const url = new URL("http://api.wolframalpha.com/v2/query");
    url.searchParams.set("input", equation);
    url.searchParams.set("appid", WOLFRAM_APP_ID);
    url.searchParams.set("output", "json");
    url.searchParams.set("podstate", "Result__Step-by-step solution");

    const res = await fetch(url.toString());
    const data = await res.json();

    // TODO Person 5: parse WolframAlpha response into VerifyResponse
    // For now: stub
    return NextResponse.json<VerifyResponse>({
      correct: false,
      result: JSON.stringify(data?.queryresult?.pods?.[0]?.subpods?.[0]?.plaintext ?? "unknown"),
    });
  } catch (err) {
    console.error("[/api/external/verify]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
