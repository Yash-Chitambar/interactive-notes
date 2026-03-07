"use client";

// ============================================================
// app/upload/page.tsx — PERSON 4 OWNS THIS FILE
// Upload notes/homework PDFs or images to ChromaDB.
// ============================================================

import { useState, useCallback } from "react";
import { IngestResponse } from "@/types";
import Link from "next/link";

export default function UploadPage() {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<IngestResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const upload = useCallback(async (file: File) => {
    setUploading(true);
    setError(null);
    setResult(null);

    try {
      const form = new FormData();
      form.append("file", file);
      form.append("session_id", "default"); // TODO Person 4: use real session ID

      const res = await fetch("/api/ingest", { method: "POST", body: form });
      if (!res.ok) throw new Error(await res.text());

      const data: IngestResponse = await res.json();
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) upload(file);
    },
    [upload]
  );

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200">
        <Link href="/" className="text-gray-400 hover:text-gray-700">
          ← Back
        </Link>
        <h1 className="font-semibold text-gray-800">Upload Notes</h1>
      </header>

      <main className="flex-1 max-w-xl mx-auto w-full p-6 flex flex-col gap-6">
        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
          className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors ${
            isDragging ? "border-blue-400 bg-blue-50" : "border-gray-300 bg-white"
          }`}
        >
          <p className="text-4xl mb-3">📄</p>
          <p className="font-medium text-gray-700">Drag &amp; drop your notes here</p>
          <p className="text-sm text-gray-400 mt-1">PDF, PNG, or JPG</p>
          <label className="mt-4 inline-block cursor-pointer">
            <input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
            />
            <span className="text-sm font-medium text-blue-600 hover:underline">
              or click to browse
            </span>
          </label>
        </div>

        {uploading && (
          <div className="text-center text-sm text-blue-600 animate-pulse">
            Processing your notes...
          </div>
        )}

        {result && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4">
            <p className="font-medium text-green-800">✓ Uploaded successfully</p>
            <p className="text-sm text-green-600 mt-1">
              {result.source_name} — {result.chunks_created} sections indexed
            </p>
            <Link href="/" className="mt-3 inline-block text-sm text-blue-600 hover:underline">
              Back to tutor →
            </Link>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
            {error}
          </div>
        )}
      </main>
    </div>
  );
}
