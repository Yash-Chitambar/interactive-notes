// ============================================================
// /api/external/resources — PERSON 5 OWNS THIS FILE
// Scrapes learning resources (Khan Academy, etc.) for a topic
// using BrowserBase. Returns structured steps/explanations.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { ResourcesResponse } from "@/types";

const BROWSERBASE_API_KEY = process.env.BROWSERBASE_API_KEY;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const topic = searchParams.get("topic");

  if (!topic) {
    return NextResponse.json({ error: "topic is required" }, { status: 400 });
  }

  if (!BROWSERBASE_API_KEY) {
    return NextResponse.json<ResourcesResponse>({
      topic,
      steps: [],
      summary: "Resource fetching unavailable (no BROWSERBASE_API_KEY)",
      source_url: "",
    });
  }

  try {
    // TODO Person 5: implement BrowserBase scraping
    // const browser = await connect({ apiKey: BROWSERBASE_API_KEY });
    // const page = await browser.newPage();
    // await page.goto(`https://www.khanacademy.org/search?page_search_query=${encodeURIComponent(topic)}`);
    // ...parse steps...

    // Stub response
    return NextResponse.json<ResourcesResponse>({
      topic,
      steps: [
        `Step 1: Review the definition of ${topic}`,
        "Step 2: Identify the key variables",
        "Step 3: Apply the relevant formula",
        "Step 4: Check your work",
      ],
      summary: `Here are the key steps for solving ${topic} problems.`,
      source_url: `https://www.khanacademy.org/search?page_search_query=${encodeURIComponent(topic)}`,
    });
  } catch (err) {
    console.error("[/api/external/resources]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
