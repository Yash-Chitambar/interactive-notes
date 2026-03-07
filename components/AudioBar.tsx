"use client";

// ============================================================
// components/AudioBar.tsx
// Bottom strip: mic toggle, mute, camera, connection status,
// and live transcript display.
// ============================================================

import { TranscriptEntry } from "@/types";

interface AudioBarProps {
  transcript:    TranscriptEntry[];
  isConnected:   boolean;
  isListening:   boolean;
  isMuted:       boolean;
  isSpeaking:    boolean;
  isCameraActive: boolean;
  onToggleMic:    () => void;
  onToggleMute:   () => void;
  onToggleCamera: () => void;
}

// ── SVG icon components ───────────────────────────────────────────────────────

function IconMicOn() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
      <path d="M12 1a4 4 0 0 0-4 4v7a4 4 0 0 0 8 0V5a4 4 0 0 0-4-4Z" />
      <path d="M19 10a1 1 0 1 0-2 0 5 5 0 0 1-10 0 1 1 0 1 0-2 0 7 7 0 0 0 6 6.93V20H8a1 1 0 1 0 0 2h8a1 1 0 1 0 0-2h-3v-3.07A7 7 0 0 0 19 10Z" />
    </svg>
  );
}

function IconMicOff() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <line x1="2" y1="2" x2="22" y2="22" />
      <path d="M18.89 13.23A7 7 0 0 0 19 12v-2" />
      <path d="M5 10v2a7 7 0 0 0 11.93 5.09" />
      <path d="M15 9.34V5a3 3 0 0 0-5.68-1.33" />
      <path d="M9 9v3a3 3 0 0 0 5.12 2.12" />
      <line x1="12" y1="19" x2="12" y2="22" />
    </svg>
  );
}

function IconVolumeOn() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
      <path d="M11.553 3.064A.75.75 0 0 1 12 3.75v16.5a.75.75 0 0 1-1.255.555L5.46 16H2.75A1.75 1.75 0 0 1 1 14.25v-4.5C1 8.784 1.784 8 2.75 8H5.46l5.285-4.805a.75.75 0 0 1 .808-.131ZM18 5.408a.75.75 0 0 1 1.21-.59 9.961 9.961 0 0 1 0 14.364.75.75 0 0 1-1.21-.59V5.408Zm-2.04 2.492a.75.75 0 0 1 .958 1.154 5.97 5.97 0 0 1 0 8.088.75.75 0 0 1-.958-1.154 4.47 4.47 0 0 0 0-5.934.75.75 0 0 1 0-2.154Z" />
    </svg>
  );
}

function IconVolumeOff() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
      <path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 0 0 1.5 12c0 .898.121 1.768.35 2.595.341 1.24 1.518 1.905 2.659 1.905h1.93l4.5 4.5c.945.945 2.561.276 2.561-1.06V4.06ZM17.78 9.22a.75.75 0 1 0-1.06 1.06L18.44 12l-1.72 1.72a.75.75 0 1 0 1.06 1.06l1.72-1.72 1.72 1.72a.75.75 0 1 0 1.06-1.06L20.56 12l1.72-1.72a.75.75 0 1 0-1.06-1.06L19.5 10.94l-1.72-1.72Z" />
    </svg>
  );
}

function IconCamera() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
      <path d="M12 9a3.75 3.75 0 1 0 0 7.5A3.75 3.75 0 0 0 12 9Z" />
      <path fillRule="evenodd" d="M9.344 3.071a49.52 49.52 0 0 1 5.312 0c.967.052 1.83.512 2.398 1.257l.922 1.233c.07.093.18.148.297.148H19.5a3 3 0 0 1 3 3v8.25a3 3 0 0 1-3 3H4.5a3 3 0 0 1-3-3V8.709c0-1.093.64-2.054 1.69-2.497L4.5 5.578l.027-.035A4.5 4.5 0 0 1 8 3.855l1.104-.63c.06-.034.13-.055.24-.055ZM12 7.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9Z" clipRule="evenodd" />
    </svg>
  );
}

// ── Animated waveform shown while tutor is speaking ───────────────────────────

function SpeakingWave() {
  return (
    <span className="inline-flex items-end gap-px h-4" aria-label="Tutor is speaking">
      {[0, 1, 2, 3].map(i => (
        <span
          key={i}
          className="w-0.5 rounded-full bg-indigo-500"
          style={{
            animation: `speakBar 0.9s ease-in-out ${i * 0.15}s infinite alternate`,
            height: "40%",
          }}
        />
      ))}
      <style>{`
        @keyframes speakBar {
          from { height: 20%; }
          to   { height: 100%; }
        }
      `}</style>
    </span>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AudioBar({
  transcript,
  isConnected,
  isListening,
  isMuted,
  isSpeaking,
  isCameraActive,
  onToggleMic,
  onToggleMute,
  onToggleCamera,
}: AudioBarProps) {
  const lastEntry = transcript[transcript.length - 1];

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-white border-t border-gray-200 h-14 flex-shrink-0">

      {/* Mic button */}
      <button
        onClick={onToggleMic}
        title={isListening ? "Stop mic" : isConnected ? "Start mic" : "Connect first, then tap again"}
        aria-label={isListening ? "Stop microphone" : "Start microphone"}
        aria-pressed={isListening}
        className={[
          "flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-all",
          isListening
            ? "bg-red-500 text-white shadow-md shadow-red-200 animate-pulse"
            : "bg-gray-100 text-gray-500 hover:bg-gray-200",
        ].join(" ")}
      >
        {isListening ? <IconMicOn /> : <IconMicOff />}
      </button>

      {/* Mute button */}
      <button
        onClick={onToggleMute}
        title={isMuted ? "Unmute tutor" : "Mute tutor audio"}
        aria-label={isMuted ? "Unmute tutor" : "Mute tutor audio"}
        aria-pressed={isMuted}
        className={[
          "flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-all",
          isMuted
            ? "bg-amber-100 text-amber-600 hover:bg-amber-200"
            : "bg-gray-100 text-gray-500 hover:bg-gray-200",
        ].join(" ")}
      >
        {isMuted ? <IconVolumeOff /> : <IconVolumeOn />}
      </button>

      {/* Camera button */}
      <button
        onClick={onToggleCamera}
        title={isCameraActive ? "Stop camera vision" : "Start camera vision"}
        aria-label={isCameraActive ? "Stop camera" : "Start camera"}
        aria-pressed={isCameraActive}
        className={[
          "flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-all",
          isCameraActive
            ? "bg-violet-500 text-white shadow-md shadow-violet-200 animate-pulse"
            : "bg-gray-100 text-gray-500 hover:bg-gray-200",
        ].join(" ")}
      >
        <IconCamera />
      </button>

      {/* Connection dot */}
      <span
        className={[
          "flex-shrink-0 w-2 h-2 rounded-full transition-colors",
          isConnected ? "bg-emerald-400" : "bg-gray-300",
        ].join(" ")}
        title={isConnected ? "Connected" : "Not connected"}
      />

      {/* Speaking wave + transcript */}
      <div className="flex flex-1 items-center gap-2 min-w-0 text-sm text-gray-600">
        {isSpeaking && !isMuted && <SpeakingWave />}

        <span className="truncate">
          {lastEntry ? (
            <>
              <span className="font-medium text-gray-900">
                {lastEntry.role === "tutor" ? "Tutor: " : "You: "}
              </span>
              {lastEntry.text}
            </>
          ) : (
            <span className="italic text-gray-400">
              {isConnected
                ? isListening
                  ? "Listening…"
                  : "Tap the mic to ask a question"
                : "Connecting…"}
            </span>
          )}
        </span>
      </div>
    </div>
  );
}
