"use strict";

// ============================================================
// ws-relay/server.js
// WebSocket relay: browser <-> Gemini Live API
//
// Protocol (browser -> relay):
//   { type: "audio_chunk",     data: "<base64 PCM 16kHz mono int16>" }
//   { type: "text",            text: "..." }   ← Overshoot sends LaTeX here
//   { type: "set_subject",     subject: "math" | "physics" | ... }
//
// Protocol (relay -> browser):
//   { type: "connected" }
//   { type: "audio",           data: "<base64 PCM 24kHz mono int16>" }
//   { type: "transcript",      role: "tutor"|"student", text: "..." }
//   { type: "turn_complete" }
//   { type: "error",           message: "..." }
//
// Run: node ws-relay/server.js  (or: npm run ws)
// ============================================================

const { WebSocketServer } = require("ws");
const { GoogleGenAI, Modality } = require("@google/genai");

const PORT = parseInt(process.env.WS_PORT ?? "8080", 10);
const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? "";
const MODEL = "gemini-2.5-flash-native-audio-latest";

// Delay before reconnecting a dropped Gemini session
const GEMINI_RECONNECT_MS = 2_000;

const wss = new WebSocketServer({ port: PORT });
console.log(`[relay] Listening on ws://localhost:${PORT}`);

// Only one browser session at a time — each new connection evicts the previous.
let activeSession = null;

wss.on("connection", (ws) => {
  if (activeSession) {
    console.log("[relay] Evicting previous session");
    activeSession.destroy();
  }
  activeSession = new RelaySession(ws);
});

// ─────────────────────────────────────────────────────────────────────────────
// RelaySession
// Manages the lifecycle of one browser <-> Gemini connection pair.
// ─────────────────────────────────────────────────────────────────────────────

class RelaySession {
  constructor(ws) {
    this.ws = ws;
    this.destroyed = false;
    this.subject = "math";

    // Gemini Live session handle (null until connected)
    this.gemini = null;

    this.ai = GEMINI_API_KEY ? new GoogleGenAI({ apiKey: GEMINI_API_KEY }) : null;

    ws.on("message", (raw) => this._onClientMessage(raw));
    ws.on("close",   ()    => this._onClientClose());
    ws.on("error",   (err) => console.error("[relay] client ws error:", err.message));

    console.log("[relay] Browser connected");

    if (this.ai) {
      this._connectGemini();
    } else {
      console.warn("[relay] No GEMINI_API_KEY — running in echo mode");
    }
  }

  // ── Public: forcibly tear down this session ────────────────────────────────

  destroy() {
    this.destroyed = true;
    this._closeGemini();
    try { this.ws.close(); } catch {}
    if (activeSession === this) activeSession = null;
  }

  // ── Internal: Gemini session management ───────────────────────────────────

  async _connectGemini() {
    if (this.destroyed || !this.ai) return;

    const systemPrompt =
      `You are a friendly, patient Socratic tutor helping a student with ${this.subject}. ` +
      `Never give answers directly — guide with hints and clarifying questions. ` +
      `Keep every response to two sentences or fewer.`;

    try {
      this.gemini = await this.ai.live.connect({
        model: MODEL,
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: systemPrompt,
          thinkingConfig: { thinkingBudget: 0 },
        },
        callbacks: {
          onopen: () => {
            console.log("[relay] Gemini Live connected");
            this._send({ type: "connected" });
          },

          onmessage: (msg) => {
            // Guard: track whether we already forwarded audio for this message.
            // The SDK sometimes populates BOTH msg.data (shorthand) AND
            // serverContent.modelTurn.parts[].inlineData.data with the same
            // audio bytes. Sending both causes the browser to schedule each
            // chunk twice, producing overlapping / doubled audio (glitch).
            let audioForwarded = false;

            // Prefer the structured serverContent path (canonical format).
            const parts = msg.serverContent?.modelTurn?.parts ?? [];
            for (const part of parts) {
              if (part.inlineData?.data) {
                this._send({ type: "audio", data: part.inlineData.data });
                audioForwarded = true;
              }
            }

            // Only fall back to the top-level shorthand if nothing came
            // through the parts — avoids the double-send.
            if (!audioForwarded && msg.data) {
              this._send({ type: "audio", data: msg.data });
            }

            if (msg.serverContent?.turnComplete) {
              this._send({ type: "turn_complete" });
            }
          },

          onerror: (e) => {
            console.error("[relay] Gemini error:", e.message);
            this._send({ type: "error", message: e.message });
          },

          onclose: (e) => {
            console.log("[relay] Gemini disconnected:", e?.reason ?? e?.code ?? "unknown");
            this.gemini = null;
            if (!this.destroyed) {
              console.log(`[relay] Reconnecting Gemini in ${GEMINI_RECONNECT_MS}ms…`);
              setTimeout(() => this._connectGemini(), GEMINI_RECONNECT_MS);
            }
          },
        },
      });
    } catch (err) {
      console.error("[relay] Failed to open Gemini session:", err.message);
      if (!this.destroyed) {
        setTimeout(() => this._connectGemini(), GEMINI_RECONNECT_MS);
      }
    }
  }

  _closeGemini() {
    if (this.gemini) {
      try { this.gemini.close(); } catch {}
      this.gemini = null;
    }
  }

  // ── Internal: message routing ─────────────────────────────────────────────

  _onClientMessage(raw) {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    if (!this.ai) {
      this._handleEcho(msg);
      return;
    }

    switch (msg.type) {
      case "audio_chunk": {
        if (!this.gemini) {
          // Silently drop — Gemini not ready yet
          return;
        }
        try {
          this.gemini.sendRealtimeInput({
            audio: { data: msg.data, mimeType: "audio/pcm;rate=16000" },
          });
        } catch (err) {
          console.warn("[relay] audio_chunk send failed:", err.message);
        }

        break;
      }

      case "text": {
        if (!this.gemini) {
          this._send({ type: "error", message: "Not connected to Gemini yet." });
          return;
        }
        const text = (msg.text ?? "").trim();
        if (!text) return;
        try {
          this.gemini.sendClientContent({
            turns: [{ role: "user", parts: [{ text }] }],
            turnComplete: true,
          });
          this._send({ type: "transcript", role: "student", text });
        } catch (err) {
          console.warn("[relay] text send failed:", err.message);
        }
        break;
      }

      case "set_subject": {
        this.subject = msg.subject ?? "math";
        console.log(`[relay] Subject changed to "${this.subject}" — reconnecting Gemini`);
        this._closeGemini();
        this._connectGemini();
        break;
      }

      default:
        console.warn("[relay] Unrecognised message type:", msg.type);
    }
  }

  // ── Internal: echo mode (no API key) ─────────────────────────────────────

  _handleEcho(msg) {
    if (msg.type === "audio_chunk") {
      this._send({
        type: "transcript",
        role: "tutor",
        text: "[echo] Set GEMINI_API_KEY to enable voice tutoring.",
      });
    } else if (msg.type === "text") {
      this._send({
        type: "transcript",
        role: "tutor",
        text: `[echo] You said: "${msg.text}"`,
      });
    }
  }

  // ── Internal: send JSON to browser ────────────────────────────────────────

  _send(obj) {
    if (this.ws.readyState === 1 /* OPEN */) {
      this.ws.send(JSON.stringify(obj));
    }
  }

  // ── Internal: browser disconnected ────────────────────────────────────────

  _onClientClose() {
    console.log("[relay] Browser disconnected");
    this.destroyed = true;
    this._closeGemini();
    if (activeSession === this) activeSession = null;
  }
}
