// ============================================================
// Shared TypeScript contracts — ALL team members reference this
// ============================================================

// --- VLM Analysis (Person 3 + backend) ---

export interface AnnotationResponse {
  annotations: Annotation[];
  summary: string;       // spoken aloud via Gemini Live
  step_errors: string[]; // structured list of wrong steps
}

export interface Annotation {
  bbox: [x: number, y: number, w: number, h: number]; // image pixel coords
  type: "error" | "hint" | "praise";
  text: string;
  severity: 1 | 2 | 3; // 1=minor, 2=moderate, 3=critical
}

export interface AnalyzeRequest {
  image: string;          // base64 PNG (data URL or raw base64)
  subject: Subject;
  session_id: string;
  tutor_mode: TutorMode;
}

// --- ChromaDB / Notes (Person 1) ---

export interface ContextChunk {
  text: string;
  source: string;     // e.g. "Chapter 5 notes" | "Homework 3"
  relevance: number;  // 0-1 score
}

export interface IngestResponse {
  doc_id: string;
  chunks_created: number;
  source_name: string;
}

// --- Session state (shared across components) ---

export interface SessionState {
  session_id: string;
  subject: Subject;
  tutor_mode: TutorMode;
  lastCanvasSnapshot: string | null; // base64 PNG — Person 2 reads this
  annotations: Annotation[];         // current overlay annotations
  transcript: TranscriptEntry[];     // audio conversation history
  sessionEvents: SessionEvent[];     // for review screen (Person 4)
}

export interface TranscriptEntry {
  role: "tutor" | "student";
  text: string;
  timestamp: number;
}

export interface SessionEvent {
  timestamp: number;
  type: "annotation" | "audio_response" | "clear";
  annotation?: Annotation;
  text?: string;
}

// --- External integrations (Person 5) ---

export interface VerifyRequest {
  equation: string;
}

export interface VerifyResponse {
  correct: boolean;
  result: string;  // WolframAlpha answer
  steps?: string[];
}

export interface ResourcesResponse {
  topic: string;
  steps: string[];
  summary: string;
  source_url: string;
}

// --- Enums / literals ---

export type Subject = "math" | "physics" | "chemistry" | "english";
export type TutorMode = "hint" | "answer";

export const SUBJECTS: Subject[] = ["math", "physics", "chemistry", "english"];
