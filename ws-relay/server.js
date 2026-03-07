// ============================================================
// ws-relay/server.js
// Node.js WebSocket relay: browser <-> this server <-> Gemini Live
// Uses @google/genai SDK for Gemini 2.5 Flash Live Preview
// Run with: node ws-relay/server.js  (or: npm run ws)
// ============================================================

"use strict";

const { WebSocketServer } = require("ws");
const { GoogleGenAI, Modality } = require("@google/genai");

const PORT = process.env.WS_PORT ?? 8080;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const LIVE_MODEL = "gemini-2.5-flash-native-audio-latest";

const CANVAS_THROTTLE_MS = 10_000;

const wss = new WebSocketServer({ port: PORT });
console.log(`[ws-relay] WebSocket server running on ws://localhost:${PORT}`);

// Track active clients so we can evict stale ones
let activeClients = new Set();

wss.on("connection", (clientWs) => {
  // Close all previous connections — only one active session at a time
  for (const old of activeClients) {
    console.log("[ws-relay] Evicting stale client connection");
    old.close();
  }
  activeClients.clear();
  activeClients.add(clientWs);
  console.log("[ws-relay] Browser client connected");

  let session = null;
  let subject = "math";
  let lastCanvasSentAt = 0;
  let pendingCanvasBase64 = null;
  let closed = false;

  const ai = GEMINI_API_KEY ? new GoogleGenAI({ apiKey: GEMINI_API_KEY }) : null;

  // ---- helpers ----

  function sendToClient(obj) {
    if (clientWs.readyState === 1 /* OPEN */) {
      clientWs.send(JSON.stringify(obj));
    }
  }

  // ---- echo mode (no API key) ----

  function handleEchoMode(msg) {
    if (msg.type === "audio_chunk") {
      sendToClient({ type: "transcript", role: "tutor", text: "[echo] Set GEMINI_API_KEY to enable voice." });
    } else if (msg.type === "text") {
      sendToClient({ type: "transcript", role: "tutor", text: `[echo] You said: "${msg.text}"` });
    }
  }

  // ---- canvas flush ----

  function flushCanvas(base64Png) {
    if (!session) { pendingCanvasBase64 = base64Png; return; }
    const now = Date.now();
    if (now - lastCanvasSentAt < CANVAS_THROTTLE_MS) { pendingCanvasBase64 = base64Png; return; }
    lastCanvasSentAt = now;
    pendingCanvasBase64 = null;
    try {
      session.sendRealtimeInput({ media: { data: base64Png, mimeType: "image/png" } });
      console.log("[ws-relay] Canvas snapshot sent to Gemini");
    } catch (e) {
      console.warn("[ws-relay] Failed to send canvas:", e.message);
    }
  }

  // ---- connect to Gemini Live ----

  async function connectGemini() {
    if (!ai || closed) return;

    const systemPrompt =
      `You are a friendly, patient Socratic tutor helping a student with ${subject}. ` +
      `Never give answers directly — guide with a clarifying question or a hint. ` +
      `Keep every response to two sentences or fewer.`;

    try {
      session = await ai.live.connect({
        model: LIVE_MODEL,
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: systemPrompt,
          thinkingConfig: { thinkingBudget: 0 },
        },
        callbacks: {
          onopen: () => {
            console.log("[ws-relay] Gemini Live connected");
            sendToClient({ type: "connected" });
            if (pendingCanvasBase64) { flushCanvas(pendingCanvasBase64); }
          },
          onmessage: (msg) => {
            // Audio (top-level shorthand from SDK)
            if (msg.data) {
              sendToClient({ type: "audio", data: msg.data, mimeType: "audio/pcm;rate=24000" });
            }
            // Server content (nested parts) — skip thinking text, forward audio only
            const parts = msg.serverContent?.modelTurn?.parts ?? [];
            for (const part of parts) {
              if (part.inlineData?.data) {
                sendToClient({ type: "audio", data: part.inlineData.data, mimeType: part.inlineData.mimeType ?? "audio/pcm;rate=24000" });
              }
            }
            if (msg.serverContent?.turnComplete) {
              sendToClient({ type: "turn_complete" });
            }
          },
          onerror: (e) => {
            console.error("[ws-relay] Gemini error:", e.message);
            sendToClient({ type: "error", message: e.message });
          },
          onclose: (e) => {
            console.log("[ws-relay] Gemini disconnected:", e.reason ?? e.code ?? "");
            session = null;
            if (!closed) {
              console.log("[ws-relay] Reconnecting in 2s...");
              setTimeout(connectGemini, 2000);
            }
          },
        },
      });
    } catch (e) {
      console.error("[ws-relay] Failed to connect to Gemini:", e.message);
      if (!closed) setTimeout(connectGemini, 3000);
    }
  }

  // ---- start connection ----
  if (ai) {
    connectGemini();
  } else {
    console.warn("[ws-relay] No GEMINI_API_KEY — echo mode active");
  }

  // ---- handle messages from browser ----

  clientWs.on("message", (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    if (!ai) { handleEchoMode(msg); return; }

    switch (msg.type) {
      case "audio_chunk": {
        if (!session) { console.warn("[ws-relay] Gemini not ready, dropping audio"); return; }
        try {
          session.sendRealtimeInput({ audio: { data: msg.data, mimeType: "audio/pcm;rate=16000" } });
        } catch (e) { console.warn("[ws-relay] audio send failed:", e.message); }

        // opportunistically flush pending canvas
        if (pendingCanvasBase64 && Date.now() - lastCanvasSentAt >= CANVAS_THROTTLE_MS) {
          flushCanvas(pendingCanvasBase64);
        }
        break;
      }

      case "canvas_snapshot": {
        const dataUrl = msg.image ?? "";
        const idx = dataUrl.indexOf(",");
        const b64 = idx !== -1 ? dataUrl.slice(idx + 1) : dataUrl;
        flushCanvas(b64);
        break;
      }

      case "text": {
        if (!session) { sendToClient({ type: "error", message: "Not connected to Gemini." }); return; }
        try {
          session.sendClientContent({ turns: [{ role: "user", parts: [{ text: msg.text }] }], turnComplete: true });
          sendToClient({ type: "transcript", role: "student", text: msg.text });
        } catch (e) { console.warn("[ws-relay] text send failed:", e.message); }
        break;
      }

      case "set_subject": {
        subject = msg.subject ?? "math";
        console.log(`[ws-relay] Subject → "${subject}", reconnecting...`);
        if (session) {
          try { session.close(); } catch {}
          session = null;
        }
        connectGemini();
        break;
      }

      default:
        console.warn(`[ws-relay] Unknown message type: ${msg.type}`);
    }
  });

  // ---- cleanup on browser disconnect ----

  clientWs.on("close", () => {
    console.log("[ws-relay] Browser client disconnected");
    closed = true;
    activeClients.delete(clientWs);
    if (session) { try { session.close(); } catch {} session = null; }
  });

  clientWs.on("error", (err) => {
    console.error("[ws-relay] Client error:", err.message);
  });
});
