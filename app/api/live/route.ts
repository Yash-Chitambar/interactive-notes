// ============================================================
// /api/live — PERSON 2 OWNS THIS FILE
// NOTE: Next.js serverless doesn't support persistent WebSockets.
// For hackathon: Person 2 runs ws-relay/server.js separately.
// This route is a placeholder / health check.
// The real WS relay is ws://localhost:8080 (see ws-relay/server.js)
// ============================================================

import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    message: "WebSocket relay is running separately at ws://localhost:8080",
    status: "use ws-relay/server.js",
  });
}
