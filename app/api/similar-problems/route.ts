// ============================================================
// /api/similar-problems — Find similar practice problems
// Uses Stagehand + BrowserBase to discover exam PDF links from
// CS70's Previous Exams page, then unpdf to extract text,
// then Gemini picks the most similar problem and generates an image.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { Stagehand } from "@browserbasehq/stagehand";
import { z } from "zod";
import { extractText } from "unpdf";
import { GoogleGenAI } from "@google/genai";

const BROWSERBASE_API_KEY = process.env.BROWSERBASE_API_KEY!;
const BROWSERBASE_PROJECT_ID = process.env.BROWSERBASE_PROJECT_ID!;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;

const MAX_EXAMS = 4;

// Fallback if Stagehand can't find PDF links
const FALLBACK_EXAM_LINKS: ExamLink[] = [
  { semester: "Fall 2025", examType: "Final", url: "https://www.eecs70.org/resources/final/final_fa25.pdf" },
  { semester: "Spring 2025", examType: "Final", url: "https://www.eecs70.org/resources/final/final_sp25.pdf" },
  { semester: "Fall 2024", examType: "Final", url: "https://www.eecs70.org/resources/final/final_fa24.pdf" },
  { semester: "Fall 2025", examType: "Midterm", url: "https://www.eecs70.org/resources/mt1/midterm_fa25.pdf" },
];

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { problem_description } = body as { problem_description: string };

  if (!problem_description) {
    return NextResponse.json({ error: "problem_description is required" }, { status: 400 });
  }

  try {
    // Step 1: Use Stagehand to discover exam PDF links from CS70 website
    const examLinks = await discoverExamLinks();

    // Step 2: Download PDFs and extract text with unpdf
    const examTexts = await extractExamTexts(examLinks);

    // Step 3: Gemini finds the most similar problem
    const matched = await findSimilarProblem(problem_description, examTexts);
    if (!matched) {
      return NextResponse.json({
        similar_problem: null,
        source: null,
        image: null,
        error: "Could not find a similar problem",
      });
    }

    // Step 4: Generate an image of the problem
    const image = await generateProblemImage(matched);

    return NextResponse.json({
      similar_problem: matched.problem_text,
      source: matched.source,
      topic: matched.topic,
      why_similar: matched.why_similar,
      source_url: "https://www.eecs70.org/resources/previous-exams",
      image,
    });
  } catch (err) {
    console.error("[/api/similar-problems]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}

// ---- Step 1: Stagehand discovers exam PDF links ----

interface ExamLink {
  semester: string;
  examType: string;
  url: string;
}

async function discoverExamLinks(): Promise<ExamLink[]> {
  const stagehand = new Stagehand({
    env: "BROWSERBASE",
    apiKey: BROWSERBASE_API_KEY,
    projectId: BROWSERBASE_PROJECT_ID,
    model: {
      modelName: "google/gemini-2.5-flash",
      apiKey: GEMINI_API_KEY,
    },
  });

  await stagehand.init();
  const page = stagehand.context.pages()[0];

  try {
    // Navigate to CS70 → Resources → Previous Exams
    console.log("[stagehand] Navigating to cs70.org");
    await page.goto("https://cs70.org/");

    console.log("[stagehand] Clicking Resources link");
    await stagehand.act("click the Resources link");

    console.log("[stagehand] Clicking Previous Exams link");
    await stagehand.act("click the Previous Exams link");

    // Extract all exam links
    console.log("[stagehand] Extracting exam links");
    const links = await stagehand.extract(
      `Extract all exam links from this page. For each exam get the semester (e.g. "Fall 2025"), the exam type (e.g. "Midterm" or "Final"), and the full URL. Only include the actual exams, NOT the solutions.`,
      z.array(
        z.object({
          semester: z.string(),
          examType: z.string(),
          url: z.string(),
        })
      )
    );

    console.log(`[stagehand] Found ${links.length} exam links`);
    console.log("[stagehand] Raw links:", JSON.stringify(links, null, 2));

    // Make URLs absolute and ensure they end with .pdf
    const pdfLinks = links
      .filter((l) => l.url)
      .map((l) => {
        let url = l.url.startsWith("http")
          ? l.url
          : `https://www.eecs70.org${l.url.startsWith("/") ? "" : "/"}${l.url}`;
        // Append .pdf if the URL looks like an exam path but lacks the extension
        if (!url.includes(".pdf") && /\/(final|midterm|mt\d?)[\w_-]*\/?$/i.test(url)) {
          url = url.replace(/\/$/, "") + ".pdf";
        }
        return { ...l, url };
      })
      .filter((l) => l.url.includes(".pdf"));

    console.log(`[stagehand] PDF links after filtering: ${pdfLinks.length}`);
    if (pdfLinks.length > 0) {
      console.log("[stagehand] Sample URLs:", pdfLinks.slice(0, 3).map((l) => l.url));
    }

    // If Stagehand didn't find PDF links, fall back to known URLs
    if (pdfLinks.length === 0) {
      console.log("[stagehand] No PDF links found, using fallback URLs");
      return FALLBACK_EXAM_LINKS;
    }

    return pdfLinks;
  } finally {
    await stagehand.close();
  }
}

// ---- Step 2: Download PDFs and extract text with unpdf ----

interface ExamText {
  source: string;
  text: string;
}

async function extractExamTexts(examLinks: ExamLink[]): Promise<ExamText[]> {
  const toFetch = examLinks.slice(0, MAX_EXAMS);

  console.log(`[pdf] Extracting text from ${toFetch.length} exams`);

  const fetches = toFetch.map(async (exam) => {
    try {
      console.log(`[pdf] Fetching ${exam.semester} ${exam.examType}: ${exam.url}`);
      const res = await fetch(exam.url);
      if (!res.ok) {
        console.warn(`[pdf] Failed to fetch: ${res.status}`);
        return null;
      }
      const buf = new Uint8Array(await res.arrayBuffer());
      const { text } = await extractText(buf);
      const fullText = Array.isArray(text) ? text.join("\n\n") : String(text);
      console.log(`[pdf] Extracted ${fullText.length} chars from ${exam.semester} ${exam.examType}`);
      return { source: `${exam.semester} ${exam.examType}`, text: fullText };
    } catch (e) {
      console.warn(`[pdf] Error extracting ${exam.semester} ${exam.examType}:`, e);
      return null;
    }
  });

  const results = await Promise.all(fetches);
  return results.filter((r): r is ExamText => r !== null && r.text.length > 100);
}

// ---- Step 3: Gemini finds the most similar problem ----

interface MatchedProblem {
  source: string;
  problem_text: string;
  topic: string;
  why_similar: string;
}

async function findSimilarProblem(
  problemDescription: string,
  examTexts: ExamText[]
): Promise<MatchedProblem | null> {
  if (examTexts.length === 0) return null;

  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

  const combinedText = examTexts
    .map((e) => `=== ${e.source} ===\n${e.text}`)
    .join("\n\n");

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: `You are a CS70 teaching assistant. A student is working on this problem:

"${problemDescription}"

Below is the full text of ${examTexts.length} recent CS70 exams:

${combinedText}

Find the SINGLE most similar exam problem to what the student is working on. Consider:
- Same topic area (probability, graphs, proofs, modular arithmetic, counting, etc.)
- Similar problem structure or technique required
- Similar difficulty level

Return JSON (no markdown fences):
{
  "source": "which exam it came from (e.g. Fall 2025 Final)",
  "problem_text": "the COMPLETE problem text including all sub-parts, copied exactly from the exam",
  "topic": "the topic area (e.g. conditional probability, graph coloring)",
  "why_similar": "one sentence explaining why this is similar to the student's problem"
}`,
  });

  try {
    const text =
      response.text?.replace(/```json\n?|\n?```/g, "").trim() || "{}";
    const parsed = JSON.parse(text);
    return {
      source: parsed.source || "CS70 Exam",
      problem_text: parsed.problem_text || "",
      topic: parsed.topic || "",
      why_similar: parsed.why_similar || "",
    };
  } catch {
    return null;
  }
}

// ---- Step 4: Generate an image of the problem ----

async function generateProblemImage(
  problem: MatchedProblem
): Promise<string | null> {
  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-image-preview",
      contents: `Generate a clean, well-formatted image of this CS70 practice problem.
It should look like a printed exam/homework problem with clear mathematical notation.
White background, black text, properly formatted math symbols and notation.

Source: CS70 — ${problem.source}
Topic: ${problem.topic}

${problem.problem_text}`,
      config: {
        responseModalities: ["TEXT", "IMAGE"],
      },
    });

    const parts = response.candidates?.[0]?.content?.parts || [];
    for (const part of parts) {
      if (part.inlineData?.data) {
        return part.inlineData.data;
      }
    }
  } catch (e) {
    console.warn("[similar-problems] Image generation failed:", e);
  }

  return null;
}
