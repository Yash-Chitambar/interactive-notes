"use client";

// ============================================================
// useAudioSession.ts — PERSON 2 OWNS THIS FILE
// Manages mic capture, WebSocket relay to Gemini Live,
// and audio playback. Receives canvas snapshots from Person 3.
// ============================================================

import { useState, useRef, useCallback, useEffect } from "react";
import { TranscriptEntry } from "@/types";

const WS_URL = process.env.NEXT_PUBLIC_WS_RELAY_URL ?? "ws://localhost:8080";

export function useAudioSession() {
  const [isConnected, setIsConnected] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Inject a new canvas snapshot into the live session (called by Person 3)
  const sendCanvasSnapshot = useCallback((base64Image: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "canvas_snapshot", image: base64Image }));
    }
  }, []);

  const connect = useCallback(async () => {
    if (wsRef.current) return;

    // TODO Person 2: implement WebSocket → Gemini Live relay
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => setIsConnected(true);
    ws.onclose = () => {
      setIsConnected(false);
      setIsListening(false);
      wsRef.current = null;
    };

    ws.onmessage = async (event) => {
      const msg = JSON.parse(event.data);

      if (msg.type === "transcript") {
        setTranscript((prev) => [
          ...prev,
          { role: "tutor", text: msg.text, timestamp: Date.now() },
        ]);
      }

      if (msg.type === "audio") {
        // TODO Person 2: decode and play audio buffer
        // const buf = await audioCtxRef.current?.decodeAudioData(msg.data);
        // const src = audioCtxRef.current!.createBufferSource();
        // src.buffer = buf!; src.connect(audioCtxRef.current!.destination); src.start();
      }
    };
  }, []);

  const toggleMic = useCallback(async () => {
    if (!isConnected) await connect();

    if (isListening) {
      mediaRecorderRef.current?.stop();
      setIsListening(false);
    } else {
      // TODO Person 2: capture mic and stream to WS
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioCtxRef.current = new AudioContext();
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: "audio_chunk", data: e.data }));
        }
      };
      recorder.start(250); // 250ms chunks
      setIsListening(true);
    }
  }, [isListening, isConnected, connect]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      wsRef.current?.close();
      mediaRecorderRef.current?.stop();
    };
  }, []);

  return { isConnected, isListening, transcript, toggleMic, sendCanvasSnapshot };
}
