"use client";

// ============================================================
// hooks/useAudioSession.ts
// Manages mic capture, WebSocket relay to Gemini Live,
// and audio playback. Receives canvas snapshots from Person 3.
// ============================================================

import { useState, useRef, useCallback, useEffect } from "react";
import { TranscriptEntry } from "@/types";

const WS_URL = process.env.NEXT_PUBLIC_WS_RELAY_URL ?? "ws://localhost:8080";

// Gemini returns PCM at 24 000 Hz, mono, 16-bit little-endian.
const GEMINI_AUDIO_SAMPLE_RATE = 24_000;

// We capture mic at 16 000 Hz PCM for Gemini.
const MIC_SAMPLE_RATE = 16_000;

// Reconnect back-off: attempt up to this many times before giving up.
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_BASE_DELAY_MS = 1_000;

export function useAudioSession() {
  const [isConnected, setIsConnected] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);

  const isMutedRef = useRef(false);

  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isManuallyClosed = useRef(false); // true when the user explicitly disconnects

  // ------------------------------------------------------------------
  // Audio utilities
  // ------------------------------------------------------------------

  /** Convert a Float32 PCM sample array to a 16-bit little-endian Int16 ArrayBuffer. */
  function float32ToInt16(float32Buf: Float32Array): ArrayBuffer {
    const int16 = new Int16Array(float32Buf.length);
    for (let i = 0; i < float32Buf.length; i++) {
      const clamped = Math.max(-1, Math.min(1, float32Buf[i]));
      int16[i] = clamped < 0 ? clamped * 32768 : clamped * 32767;
    }
    return int16.buffer;
  }

  /** Convert an ArrayBuffer to a base64 string. */
  function arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /** Decode base64 PCM (16-bit LE, 24 kHz mono) and play it via Web Audio. */
  async function playPcmBase64(base64: string) {
    const ctx = audioCtxRef.current;
    if (!ctx) return;

    try {
      // Decode base64 -> raw bytes
      const binaryStr = atob(base64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }

      // Interpret as 16-bit little-endian PCM
      const int16 = new Int16Array(bytes.buffer);
      const numSamples = int16.length;

      // Build a Web Audio AudioBuffer (1 channel, 24 000 Hz)
      const audioBuf = ctx.createBuffer(1, numSamples, GEMINI_AUDIO_SAMPLE_RATE);
      const channelData = audioBuf.getChannelData(0);
      for (let i = 0; i < numSamples; i++) {
        // Normalise to -1..1
        channelData[i] = int16[i] / (int16[i] < 0 ? 32768 : 32767);
      }

      const source = ctx.createBufferSource();
      source.buffer = audioBuf;
      source.connect(ctx.destination);
      source.start();
    } catch (err) {
      console.error("[useAudioSession] Audio playback error:", err);
    }
  }

  // ------------------------------------------------------------------
  // WebSocket helpers
  // ------------------------------------------------------------------

  function sendJson(obj: unknown) {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(obj));
    }
  }

  // ------------------------------------------------------------------
  // Message handler
  // ------------------------------------------------------------------

  function handleMessage(event: MessageEvent) {
    let msg: { type: string; [key: string]: unknown };
    try {
      msg = JSON.parse(event.data as string);
    } catch {
      return;
    }

    switch (msg.type) {
      case "connected":
        // Gemini handshake confirmed by relay
        break;

      case "transcript": {
        const role = (msg.role as TranscriptEntry["role"]) ?? "tutor";
        const text = (msg.text as string) ?? "";
        setTranscript((prev) => [
          ...prev,
          { role, text, timestamp: Date.now() },
        ]);
        break;
      }

      case "audio": {
        // Relay sends { type: "audio", data: "<base64 PCM>", mimeType: "audio/pcm;rate=24000" }
        const base64 = msg.data as string;
        if (base64 && !isMutedRef.current) {
          playPcmBase64(base64);
        }
        break;
      }

      case "turn_complete":
        // Gemini finished its turn — nothing extra needed in UI currently
        break;

      case "error":
        console.error("[useAudioSession] Relay error:", msg.message);
        break;

      default:
        break;
    }
  }

  // ------------------------------------------------------------------
  // Connect / reconnect
  // ------------------------------------------------------------------

  const connect = useCallback(() => {
    // Don't open a second connection if one is alive
    if (
      wsRef.current &&
      (wsRef.current.readyState === WebSocket.OPEN ||
        wsRef.current.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    isManuallyClosed.current = false;

    // Ensure we have an AudioContext
    if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
      audioCtxRef.current = new AudioContext();
    }

    console.log("[useAudioSession] Connecting to relay:", WS_URL);
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("[useAudioSession] WS open");
      reconnectAttemptsRef.current = 0;
      setIsConnected(true);
    };

    ws.onmessage = handleMessage;

    ws.onerror = (err) => {
      console.error("[useAudioSession] WS error:", err);
    };

    ws.onclose = () => {
      console.log("[useAudioSession] WS closed");
      wsRef.current = null;
      setIsConnected(false);
      // Stop mic only if we won't reconnect (manually closed or max retries)
      // so a brief relay hiccup doesn't kill an active mic session
      if (isManuallyClosed.current || reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
        setIsListening(false);
        stopMicCapture();
      }

      if (
        !isManuallyClosed.current &&
        reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS
      ) {
        const delay =
          RECONNECT_BASE_DELAY_MS * 2 ** reconnectAttemptsRef.current;
        reconnectAttemptsRef.current++;
        console.log(
          `[useAudioSession] Reconnecting in ${delay} ms (attempt ${reconnectAttemptsRef.current})`
        );
        reconnectTimerRef.current = setTimeout(connect, delay);
      } else if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
        console.error("[useAudioSession] Max reconnect attempts reached");
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ------------------------------------------------------------------
  // Mic capture via ScriptProcessorNode (works everywhere, no worklet needed)
  // ------------------------------------------------------------------

  function stopMicCapture() {
    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.disconnect();
      scriptProcessorRef.current.onaudioprocess = null;
      scriptProcessorRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
  }

  async function startMicCapture() {
    const ctx = audioCtxRef.current;
    if (!ctx) {
      console.error("[useAudioSession] AudioContext not available");
      return;
    }

    console.log("[useAudioSession] AudioContext state:", ctx.state, "sampleRate:", ctx.sampleRate);

    // Resume suspended context (required after user gesture)
    if (ctx.state === "suspended") {
      await ctx.resume();
      console.log("[useAudioSession] AudioContext resumed, state:", ctx.state);
    }

    // Don't request sampleRate — Chrome on macOS ignores/rejects it.
    // We resample to 16kHz manually below.
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });
    micStreamRef.current = stream;
    console.log("[useAudioSession] Got mic stream, tracks:", stream.getAudioTracks().map(t => `${t.label} (${t.readyState})`));

    // Stop mic cleanly if the track ends unexpectedly
    stream.getAudioTracks().forEach(track => {
      track.onended = () => {
        console.warn("[useAudioSession] Mic track ended unexpectedly");
        stopMicCapture();
        setIsListening(false);
      };
    });

    const source = ctx.createMediaStreamSource(stream);

    const processor = ctx.createScriptProcessor(4096, 1, 1);
    scriptProcessorRef.current = processor;

    let chunkCount = 0;
    processor.onaudioprocess = (e) => {
      if (wsRef.current?.readyState !== WebSocket.OPEN) return;
      chunkCount++;
      if (chunkCount <= 3) console.log("[useAudioSession] onaudioprocess firing, chunk", chunkCount);

      // Get mono float32 samples from the mic
      const float32 = e.inputBuffer.getChannelData(0);

      // Resample if the AudioContext sample rate differs from 16 kHz.
      // Most browsers will honour the sampleRate constraint, but this is a
      // simple linear-interpolation fallback just in case.
      let samples = float32;
      const ctxRate = ctx.sampleRate;
      if (ctxRate !== MIC_SAMPLE_RATE) {
        const ratio = ctxRate / MIC_SAMPLE_RATE;
        const outLength = Math.round(float32.length / ratio);
        const resampled = new Float32Array(outLength);
        for (let i = 0; i < outLength; i++) {
          resampled[i] = float32[Math.min(Math.round(i * ratio), float32.length - 1)];
        }
        samples = resampled;
      }

      const pcmBuffer = float32ToInt16(samples);
      const base64 = arrayBufferToBase64(pcmBuffer);

      wsRef.current!.send(
        JSON.stringify({ type: "audio_chunk", data: base64 })
      );
    };

    source.connect(processor);
    // Connect to destination with silent gain=0 so the browser doesn't echo
    const silentGain = ctx.createGain();
    silentGain.gain.value = 0;
    processor.connect(silentGain);
    silentGain.connect(ctx.destination);
  }

  // ------------------------------------------------------------------
  // Public API
  // ------------------------------------------------------------------

  /** Toggle microphone capture on/off. Auto-connects WS if needed. */
  const toggleMic = useCallback(async () => {
    if (isListening) {
      stopMicCapture();
      setIsListening(false);
      return;
    }

    // Must be connected to relay before mic can stream
    if (!isConnected) {
      connect();
      console.warn("[useAudioSession] Relay not connected yet — try mic again once connected");
      return;
    }

    try {
      await startMicCapture();
      setIsListening(true);
    } catch (err) {
      console.error("[useAudioSession] Mic access error:", err);
    }
  }, [isConnected, isListening, connect]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Send the latest canvas frame to the relay (throttled server-side too). */
  const sendCanvasSnapshot = useCallback((dataUrl: string) => {
    sendJson({ type: "canvas_snapshot", image: dataUrl });
  }, []);

  /** Send a typed student message. */
  const sendTextMessage = useCallback((text: string) => {
    if (!text.trim()) return;
    sendJson({ type: "text", text: text.trim() });
  }, []);

  /** Change the active subject — relay will reconnect Gemini with new system prompt. */
  const setSubject = useCallback((subject: string) => {
    sendJson({ type: "set_subject", subject });
  }, []);

  /** Manually disconnect. */
  const disconnect = useCallback(() => {
    isManuallyClosed.current = true;
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
    }
    stopMicCapture();
    wsRef.current?.close();
    wsRef.current = null;
    setIsConnected(false);
    setIsListening(false);
  }, []);

  // Auto-connect on mount, clean up on unmount
  useEffect(() => {
    connect();
    return () => {
      isManuallyClosed.current = true;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      stopMicCapture();
      wsRef.current?.close();
      audioCtxRef.current?.close();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleMute = useCallback(() => {
    isMutedRef.current = !isMutedRef.current;
    setIsMuted(isMutedRef.current);
  }, []);

  return {
    isConnected,
    isListening,
    isMuted,
    transcript,
    toggleMic,
    toggleMute,
    sendCanvasSnapshot,
    sendTextMessage,
    setSubject,
    disconnect,
  };
}
