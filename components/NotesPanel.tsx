"use client";

// ============================================================
// NotesPanel.tsx — PERSON 4 OWNS THIS FILE
// Left collapsible panel: list of uploaded notes/homework docs.
// ============================================================

import { useState } from "react";
import Link from "next/link";

interface UploadedDoc {
  doc_id: string;
  source_name: string;
  chunks_created: number;
  uploaded_at: number;
}

interface NotesPanelProps {
  docs: UploadedDoc[];
  onDelete?: (doc_id: string) => void;
}

export default function NotesPanel({ docs, onDelete }: NotesPanelProps) {
  const [collapsed, setCollapsed] = useState(false);

  if (collapsed) {
    return (
      <div className="w-10 flex flex-col items-center pt-3 border-r border-gray-200 bg-white">
        <button
          onClick={() => setCollapsed(false)}
          className="text-gray-400 hover:text-gray-700"
          title="Expand notes panel"
        >
          ▶
        </button>
      </div>
    );
  }

  return (
    <div className="w-56 flex flex-col border-r border-gray-200 bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Notes</span>
        <button
          onClick={() => setCollapsed(true)}
          className="text-gray-400 hover:text-gray-700 text-xs"
        >
          ◀
        </button>
      </div>

      {/* Doc list */}
      <div className="flex-1 overflow-y-auto">
        {docs.length === 0 ? (
          <p className="text-xs text-gray-400 italic text-center mt-6 px-3">
            No notes uploaded yet
          </p>
        ) : (
          docs.map((doc) => (
            <div
              key={doc.doc_id}
              className="flex items-start gap-2 px-3 py-2 hover:bg-gray-50 group"
            >
              <span className="text-base mt-0.5">📄</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-800 truncate">{doc.source_name}</p>
                <p className="text-xs text-gray-400">{doc.chunks_created} sections</p>
              </div>
              {onDelete && (
                <button
                  onClick={() => onDelete(doc.doc_id)}
                  className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 text-xs"
                >
                  ✕
                </button>
              )}
            </div>
          ))
        )}
      </div>

      {/* Upload button */}
      <div className="p-3 border-t border-gray-100">
        <Link
          href="/upload"
          className="block w-full text-center text-xs font-medium bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg py-2 transition-colors"
        >
          + Upload Notes
        </Link>
      </div>
    </div>
  );
}
