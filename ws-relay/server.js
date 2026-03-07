// ============================================================
// ws-relay/server.js — PERSON 2 OWNS THIS FILE
// Node.js WebSocket relay: browser ↔ this server ↔ Gemini Live
// Run with: node ws-relay/server.js (or npm run ws)
// ============================================================

const { WebSocketServer, WebSocket } = require("ws");

const PORT = process.env.WS_PORT ?? 8080;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_LIVE_URL = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent";

const wss = new WebSocketServer({ port: PORT });

console.log(`[ws-relay] WebSocket server running on ws://localhost:${PORT}`);

wss.on("connection", (clientWs) => {
  console.log("[ws-relay] Client connected");

  let geminiWs = null;
  let canvasSnapshot = null;
  let subject = "math";

  // --- Connect to Gemini Live ---
  function connectGemini() {
    if (!GEMINI_API_KEY) {
      console.warn("[ws-relay] No GEMINI_API_KEY — running in echo mode");
      return;
    }

    const url = `${GEMINI_LIVE_URL}?key=${GEMINI_API_KEY}`;
    geminiWs = new WebSocket(url);

    geminiWs.on("open", () => {
      console.log("[ws-relay] Connected to Gemini Live");

      // Send setup message
      // TODO Person 2: customize system prompt with subject + notes context
      geminiWs.send(JSON.stringify({
        setup: {
          model: "models/gemini-2.0-flash-live-001",
          generationConfig: {
            responseModalities: ["AUDIO", "TEXT"],
          },
          systemInstruction: {
            parts: [{
              text: `You are a friendly, patient tutor helping with ${subject}.
Guide students with questions, not answers.
Keep responses under 2 sentences.
If asked for the answer, give a Socratic hint instead.`
            }]
          }
        }
      }));
    });

    geminiWs.on("message", (data) => {
      // Forward Gemini response to browser
      if (clientWs.readyState === WebSocket.OPEN) {
        // TODO Person 2: parse Gemini response format and extract audio/text
        // For now: forward raw
        clientWs.send(data);
      }
    });

    geminiWs.on("close", () => console.log("[ws-relay] Gemini disconnected"));
    geminiWs.on("error", (err) => console.error("[ws-relay] Gemini error:", err.message));
  }

  connectGemini();

  // --- Handle messages from browser ---
  clientWs.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString());

      if (msg.type === "canvas_snapshot") {
        // Store latest snapshot — inject into Gemini context periodically
        canvasSnapshot = msg.image;
        // TODO Person 2: send image to Gemini Live as realtime_input image part
      }

      if (msg.type === "audio_chunk") {
        // Forward audio to Gemini Live
        if (geminiWs?.readyState === WebSocket.OPEN) {
          // TODO Person 2: format correctly for Gemini Live API
          // geminiWs.send(JSON.stringify({ realtime_input: { media_chunks: [{ data: msg.data, mime_type: "audio/webm" }] } }));
        } else {
          // Echo mode: send stub response back to browser
          clientWs.send(JSON.stringify({
            type: "transcript",
            text: "[echo mode] Gemini Live not connected. Set GEMINI_API_KEY.",
          }));
        }
      }

      if (msg.type === "text") {
        // Student typed a message
        if (geminiWs?.readyState === WebSocket.OPEN) {
          geminiWs.send(JSON.stringify({
            client_content: {
              turns: [{ role: "user", parts: [{ text: msg.text }] }],
              turn_complete: true,
            }
          }));
        }
      }
    } catch (err) {
      console.error("[ws-relay] parse error:", err.message);
    }
  });

  clientWs.on("close", () => {
    console.log("[ws-relay] Client disconnected");
    geminiWs?.close();
  });
});
