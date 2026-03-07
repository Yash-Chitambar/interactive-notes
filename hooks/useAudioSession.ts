"use client";

// ============================================================
// hooks/useAudioSession.ts
// Manages the browser side of the Gemini Live voice session:
//   - WebSocket connection to ws-relay/server.js
//   - Microphone capture via AudioWorklet (mic-processor)
//   - PCM audio playback with a scheduling queue (no overlapping chunks)
//   - Mute / isSpeaking state
// ============================================================

import { useState, useRef, useCallback, useEffect } from "react";
import { TranscriptEntry } from "@/types";

const WS_URL = process.env.NEXT_PUBLIC_WS_RELAY_URL ?? "ws://localhost:8080";

// Gemini returns 24 kHz mono 16-bit little-endian PCM
const GEMINI_SAMPLE_RATE = 24_000;
// We send 16 kHz mono 16-bit little-endian PCM to Gemini
const MIC_SAMPLE_RATE = 16_000;

const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_BASE_MS = 1_000;

// ─────────────────────────────────────────────────────────────────────────────
// Utility helpers (module-level — no React deps)
// ─────────────────────────────────────────────────────────────────────────────

function float32ToInt16(f32: Float32Array): ArrayBuffer {
  const out = new Int16Array(f32.length);
  for (let i = 0; i < f32.length; i++) {
    const v = Math.max(-1, Math.min(1, f32[i]));
    out[i] = v < 0 ? v * 32768 : v * 32767;
  }
  return out.buffer;
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function base64ToPCMBuffer(base64: string, ctx: AudioContext): AudioBuffer {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

  const int16 = new Int16Array(bytes.buffer);
  const audioBuffer = ctx.createBuffer(1, int16.length, GEMINI_SAMPLE_RATE);
  const ch = audioBuffer.getChannelData(0);
  for (let i = 0; i < int16.length; i++) {
    ch[i] = int16[i] / (int16[i] < 0 ? 32768 : 32767);
  }
  return audioBuffer;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export function useAudioSession() {
  const [isConnected, setIsConnected]   = useState(false);
  const [isListening, setIsListening]   = useState(false);
  const [isMuted,     setIsMuted]       = useState(false);
  const [isSpeaking,  setIsSpeaking]    = useState(false);
  const [transcript,  setTranscript]    = useState<TranscriptEntry[]>([]);

  // Ref mirrors for values needed inside non-reactive callbacks
  const isMutedRef    = useRef(false);
  const isSpeakingRef = useRef(false);

  const wsRef              = useRef<WebSocket | null>(null);
  const audioCtxRef        = useRef<AudioContext | null>(null);
  const workletNodeRef     = useRef<AudioWorkletNode | null>(null);
  const silentGainRef      = useRef<GainNode | null>(null);
  const micStreamRef       = useRef<MediaStream | null>(null);

  // Playback scheduling: next available start time in AudioContext seconds
  const nextPlayAtRef      = useRef(0);
  // Debounce timer to clear isSpeaking after playback drains
  const speakTimerRef      = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reconnectCountRef  = useRef(0);
  const reconnectTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const manuallyClosedRef  = useRef(false);

  // ── Playback ──────────────────────────────────────────────────────────────

  function scheduleAudio(base64: string) {
    const ctx = audioCtxRef.current;
    if (!ctx || isMutedRef.current) return;

    // Resume the AudioContext if the browser suspended it (autoplay policy).
    // Creating an AudioContext on mount (without a user gesture) leaves it in
    // "suspended" state; source.start() silently queues but nothing plays.
    if (ctx.state === "suspended") {
      ctx.resume().catch(err => console.warn("[useAudioSession] ctx.resume failed:", err));
    }

    let audioBuffer: AudioBuffer;
    try {
      audioBuffer = base64ToPCMBuffer(base64, ctx);
    } catch (err) {
      console.error("[useAudioSession] Failed to decode audio chunk:", err);
      return;
    }

    // Keep chunks sequential even if they arrive faster than they play
    const now = ctx.currentTime;
    if (nextPlayAtRef.current < now) nextPlayAtRef.current = now;

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);
    source.start(nextPlayAtRef.current);
    nextPlayAtRef.current += audioBuffer.duration;

    // Mark tutor as speaking
    if (!isSpeakingRef.current) {
      isSpeakingRef.current = true;
      setIsSpeaking(true);
    }

    // Schedule a timer to clear isSpeaking once the queue drains
    if (speakTimerRef.current) clearTimeout(speakTimerRef.current);
    const msUntilDone = Math.max(0, (nextPlayAtRef.current - ctx.currentTime) * 1000) + 200;
    speakTimerRef.current = setTimeout(() => {
      isSpeakingRef.current = false;
      setIsSpeaking(false);
    }, msUntilDone);
  }

  // ── WebSocket ─────────────────────────────────────────────────────────────

  function sendWs(obj: unknown) {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(obj));
    }
  }

  function onWsMessage(event: MessageEvent) {
    let msg: { type: string; [k: string]: unknown };
    try { msg = JSON.parse(event.data as string); } catch { return; }

    switch (msg.type) {
      case "connected":
        // Relay confirmed Gemini handshake — nothing to do in UI
        break;

      case "audio":
        if (msg.data) scheduleAudio(msg.data as string);
        break;

      case "transcript": {
        const role = (msg.role as TranscriptEntry["role"]) ?? "tutor";
        const text = (msg.text as string) ?? "";
        if (text) setTranscript(prev => [...prev, { role, text, timestamp: Date.now() }]);
        break;
      }

      case "turn_complete":
        // Could be used to trigger UI feedback — reserved for future use
        break;

      case "error":
        console.error("[useAudioSession] Relay error:", msg.message);
        break;

      default:
        break;
    }
  }

  const connect = useCallback(() => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN || ws?.readyState === WebSocket.CONNECTING) return;

    manuallyClosedRef.current = false;

    if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
      audioCtxRef.current = new AudioContext();
    }

    console.log("[useAudioSession] Connecting to", WS_URL);
    const newWs = new WebSocket(WS_URL);
    wsRef.current = newWs;

    newWs.onopen = () => {
      reconnectCountRef.current = 0;
      setIsConnected(true);
      console.log("[useAudioSession] Connected");
    };

    newWs.onmessage = onWsMessage;
    newWs.onerror   = (e) => console.error("[useAudioSession] WS error:", e);

    newWs.onclose = () => {
      // Ignore stale close events from a superseded WebSocket instance.
      // React StrictMode unmounts+remounts in dev: cleanup closes ws1 while
      // the remount has already assigned ws2 to wsRef. When ws1's onclose
      // fires asynchronously it must not schedule another reconnect.
      if (wsRef.current !== newWs) return;

      wsRef.current = null;
      setIsConnected(false);
      console.log("[useAudioSession] WS closed");

      if (manuallyClosedRef.current || reconnectCountRef.current >= MAX_RECONNECT_ATTEMPTS) {
        setIsListening(false);
        stopMic();
        return;
      }

      const delay = RECONNECT_BASE_MS * 2 ** reconnectCountRef.current;
      reconnectCountRef.current++;
      console.log(`[useAudioSession] Reconnecting in ${delay}ms (attempt ${reconnectCountRef.current})`);
      reconnectTimerRef.current = setTimeout(connect, delay);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Mic capture via AudioWorklet ─────────────────────────────────────────

  function stopMic() {
    workletNodeRef.current?.disconnect();
    workletNodeRef.current = null;
    silentGainRef.current?.disconnect();
    silentGainRef.current = null;
    micStreamRef.current?.getTracks().forEach(t => t.stop());
    micStreamRef.current = null;
  }

  async function startMic() {
    const ctx = audioCtxRef.current;
    if (!ctx) throw new Error("AudioContext not initialised");

    if (ctx.state === "suspended") await ctx.resume();

    // Load the worklet module (served from public/worklets/)
    await ctx.audioWorklet.addModule("/worklets/mic-processor.js");

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
    });
    micStreamRef.current = stream;

    // Stop listening cleanly if the track ends unexpectedly (e.g. device unplugged)
    stream.getAudioTracks().forEach(track => {
      track.onended = () => {
        console.warn("[useAudioSession] Mic track ended unexpectedly");
        stopMic();
        setIsListening(false);
      };
    });

    const source  = ctx.createMediaStreamSource(stream);
    const worklet = new AudioWorkletNode(ctx, "mic-processor");
    workletNodeRef.current = worklet;

    // The AudioWorklet node MUST be in the audio rendering graph — i.e. there
    // must be a path to ctx.destination — otherwise browsers (especially Safari)
    // won't invoke process() and the mic sends nothing.  We route through a
    // gain=0 node so no mic audio reaches the speakers (prevents feedback).
    const silentGain = ctx.createGain();
    silentGain.gain.value = 0;
    worklet.connect(silentGain);
    silentGain.connect(ctx.destination);
    silentGainRef.current = silentGain;

    worklet.port.onmessage = (e: MessageEvent<Float32Array>) => {
      if (wsRef.current?.readyState !== WebSocket.OPEN) return;

      let samples: Float32Array = e.data;

      // Downsample to 16 kHz if the AudioContext runs at a different rate
      if (ctx.sampleRate !== MIC_SAMPLE_RATE) {
        const ratio    = ctx.sampleRate / MIC_SAMPLE_RATE;
        const outLen   = Math.round(samples.length / ratio);
        const resampled = new Float32Array(outLen);
        for (let i = 0; i < outLen; i++) {
          resampled[i] = samples[Math.min(Math.round(i * ratio), samples.length - 1)];
        }
        samples = resampled;
      }

      const pcm    = float32ToInt16(samples);
      const base64 = toBase64(pcm);
      wsRef.current!.send(JSON.stringify({ type: "audio_chunk", data: base64 }));
    };

    // Connect source → worklet (worklet doesn't need to reach destination)
    source.connect(worklet);
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /** Toggle microphone capture on/off. Initiates a WS connection if not yet connected. */
  const toggleMic = useCallback(async () => {
    if (isListening) {
      stopMic();
      setIsListening(false);
      return;
    }

    if (!isConnected) {
      connect();
      // Relay connecting — user needs to tap again once connected
      return;
    }

    try {
      await startMic();
      setIsListening(true);
    } catch (err) {
      console.error("[useAudioSession] Failed to start mic:", err);
    }
  }, [isListening, isConnected, connect]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Mute/unmute Gemini audio output. Does not affect mic capture. */
  const toggleMute = useCallback(() => {
    isMutedRef.current = !isMutedRef.current;
    setIsMuted(isMutedRef.current);

    // If muting while the tutor is mid-speech, clear isSpeaking immediately
    if (isMutedRef.current) {
      if (speakTimerRef.current) clearTimeout(speakTimerRef.current);
      isSpeakingRef.current = false;
      setIsSpeaking(false);
    }
  }, []);

  /** Forward the current canvas frame to Gemini (throttled server-side). */
  const sendCanvasSnapshot = useCallback((dataUrl: string) => {
    sendWs({ type: "canvas_snapshot", image: dataUrl });
  }, []);

  /** Inject a text message into the Gemini conversation. */
  const sendTextMessage = useCallback((text: string) => {
    if (text.trim()) sendWs({ type: "text", text: text.trim() });
  }, []);

  /** Change the active subject — causes the relay to reconnect Gemini with a new system prompt. */
  const setSubject = useCallback((subject: string) => {
    sendWs({ type: "set_subject", subject });
  }, []);

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  useEffect(() => {
    connect();
    return () => {
      manuallyClosedRef.current = true;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (speakTimerRef.current)     clearTimeout(speakTimerRef.current);
      stopMic();
      wsRef.current?.close();
      audioCtxRef.current?.close();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    isConnected,
    isListening,
    isMuted,
    isSpeaking,
    transcript,
    toggleMic,
    toggleMute,
    sendCanvasSnapshot,
    sendTextMessage,
    setSubject,
  };
}
