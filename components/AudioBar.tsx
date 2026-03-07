"use client";

// ============================================================
// AudioBar.tsx — PERSON 2 OWNS THIS FILE
// Bottom strip showing audio transcript + mic button.
// Connects to useAudioSession hook.
// ============================================================

import { TranscriptEntry } from "@/types";

interface AudioBarProps {
  transcript: TranscriptEntry[];
  isListening: boolean;
  isConnected: boolean;
  isMuted: boolean;
  onToggleMic: () => void;
  onToggleMute: () => void;
}

export default function AudioBar({
  transcript,
  isListening,
  isConnected,
  isMuted,
  onToggleMic,
  onToggleMute,
}: AudioBarProps) {
  const lastEntry = transcript[transcript.length - 1];

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-white border-t border-gray-200 h-14">
      {/* Mic toggle button */}
      <button
        onClick={onToggleMic}
        className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
          isListening
            ? "bg-red-500 text-white animate-pulse"
            : "bg-gray-100 text-gray-600 hover:bg-gray-200"
        }`}
        title={isListening ? "Stop listening" : "Start listening"}
      >
        {isListening ? "🔴" : "🎤"}
      </button>

      {/* Mute button */}
      <button
        onClick={onToggleMute}
        className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
          isMuted
            ? "bg-amber-100 text-amber-600 hover:bg-amber-200"
            : "bg-gray-100 text-gray-600 hover:bg-gray-200"
        }`}
        title={isMuted ? "Unmute tutor" : "Mute tutor"}
      >
        {isMuted ? "🔇" : "🔊"}
      </button>

      {/* Connection status dot */}
      <span
        className={`flex-shrink-0 w-2 h-2 rounded-full ${
          isConnected ? "bg-green-400" : "bg-gray-300"
        }`}
        title={isConnected ? "Connected to tutor" : "Disconnected"}
      />

      {/* Transcript */}
      <div className="flex-1 text-sm text-gray-600 truncate">
        {lastEntry ? (
          <span>
            <span className="font-medium text-gray-900">
              {lastEntry.role === "tutor" ? "Tutor: " : "You: "}
            </span>
            {lastEntry.text}
          </span>
        ) : (
          <span className="text-gray-400 italic">
            {isConnected ? "Listening for your questions..." : "Tap mic to start voice session"}
          </span>
        )}
      </div>
    </div>
  );
}
