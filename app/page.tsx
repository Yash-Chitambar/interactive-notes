"use client";

// ============================================================
// app/page.tsx — PERSON 3 OWNS THIS FILE (main canvas screen)
// Person 4 owns: layout chrome (header, subject selector)
// Person 2 owns: AudioBar integration
// ============================================================

import { useRef, useState, useCallback } from "react";
import { v4 as uuidv4 } from "uuid";
import Canvas, { CanvasHandle } from "@/components/Canvas";
import AIOverlay from "@/components/AIOverlay";
import NotesPanel from "@/components/NotesPanel";
import AudioBar from "@/components/AudioBar";
import SubjectSelector from "@/components/SubjectSelector";
import { useVLMAnalysis } from "@/hooks/useVLMAnalysis";
import { useAudioSession } from "@/hooks/useAudioSession";
import { Subject } from "@/types";
import Link from "next/link";

const SESSION_ID = uuidv4(); // one session per page load

export default function Home() {
  const [subject, setSubject] = useState<Subject>("math");
  const [tutorMode] = useState<"hint" | "answer">("hint");
  const [canvasSize] = useState({ width: 1200, height: 900 });

  // Uploaded docs (Person 4 wires this to real upload state)
  const [docs] = useState<Parameters<typeof NotesPanel>[0]["docs"]>([]);

  const canvasRef = useRef<CanvasHandle>(null);

  // Person 2: audio session
  const { isConnected, isListening, transcript, toggleMic, sendCanvasSnapshot } = useAudioSession();

  // Person 3: VLM analysis
  const { annotations, isAnalyzing, analyze, clearAnnotations } = useVLMAnalysis({
    subject,
    tutorMode,
    sessionId: SESSION_ID,
    onSnapshot: sendCanvasSnapshot, // give Person 2 the latest screenshot
  });

  const handleStrokeEnd = useCallback(() => {
    if (canvasRef.current) {
      analyze(canvasRef.current.getSnapshot);
    }
  }, [analyze]);

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2 bg-white border-b border-gray-200 flex-shrink-0">
        <div className="flex items-center gap-3">
          <SubjectSelector value={subject} onChange={setSubject} />
          <span className="text-lg font-bold text-gray-800">Study Buddy</span>
        </div>
        <div className="flex items-center gap-2">
          {isAnalyzing && (
            <span className="text-xs text-blue-500 animate-pulse">Analyzing...</span>
          )}
          <Link
            href="/settings"
            className="text-gray-400 hover:text-gray-700 text-sm px-2 py-1 rounded"
          >
            ⚙️
          </Link>
          <Link
            href="/review"
            className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded border border-gray-200"
          >
            Review
          </Link>
        </div>
      </header>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Notes panel (Person 4) */}
        <NotesPanel docs={docs} />

        {/* Center: Canvas + overlay */}
        <div className="flex-1 relative bg-white overflow-hidden">
          {/* Paper lines (decorative) */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage:
                "repeating-linear-gradient(transparent, transparent 31px, #e5e7eb 31px, #e5e7eb 32px)",
              backgroundPositionY: "8px",
            }}
          />

          {/* Student canvas (Person 3) */}
          <Canvas ref={canvasRef} onStrokeEnd={handleStrokeEnd} />

          {/* AI overlay (Person 3) */}
          <AIOverlay
            annotations={annotations}
            canvasWidth={canvasSize.width}
            canvasHeight={canvasSize.height}
          />

          {/* Clear AI overlay button */}
          {annotations.length > 0 && (
            <button
              onClick={clearAnnotations}
              className="absolute top-3 right-3 text-xs bg-white border border-gray-200 text-gray-500 hover:text-gray-800 px-3 py-1.5 rounded-lg shadow-sm"
            >
              Clear hints
            </button>
          )}
        </div>
      </div>

      {/* Bottom: Audio bar (Person 2) */}
      <AudioBar
        transcript={transcript}
        isListening={isListening}
        isConnected={isConnected}
        onToggleMic={toggleMic}
      />
    </div>
  );
}
