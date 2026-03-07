"use client";

// ============================================================
// SubjectSelector.tsx — PERSON 4 OWNS THIS FILE
// Dropdown to select the current subject.
// Changing subject updates the system prompt persona.
// ============================================================

import { Subject, SUBJECTS } from "@/types";

interface SubjectSelectorProps {
  value: Subject;
  onChange: (subject: Subject) => void;
}

const SUBJECT_LABELS: Record<Subject, string> = {
  math: "📐 Math",
  physics: "⚡ Physics",
  chemistry: "⚗️ Chemistry",
  english: "📝 English",
};

export default function SubjectSelector({ value, onChange }: SubjectSelectorProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as Subject)}
      className="text-sm font-medium bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700 hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
      {SUBJECTS.map((s) => (
        <option key={s} value={s}>
          {SUBJECT_LABELS[s]}
        </option>
      ))}
    </select>
  );
}
