"use client";

// ============================================================
// app/review/page.tsx — PERSON 4 OWNS THIS FILE
// Session review: shows all annotations and errors caught.
// ============================================================

import Link from "next/link";

export default function ReviewPage() {
  // TODO Person 4: load session events from localStorage / context
  const events: Array<{ timestamp: number; type: string; text: string }> = [];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200">
        <Link href="/" className="text-gray-400 hover:text-gray-700">← Back</Link>
        <h1 className="font-semibold text-gray-800">Session Review</h1>
      </header>

      <main className="max-w-2xl mx-auto p-6">
        {events.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-4xl mb-3">📋</p>
            <p className="font-medium">No session data yet</p>
            <p className="text-sm mt-1">Start a tutoring session to see your review here</p>
            <Link href="/" className="mt-4 inline-block text-sm text-blue-600 hover:underline">
              Start studying →
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {events.map((event, i) => (
              <div key={i} className="bg-white border border-gray-200 rounded-xl p-4">
                <p className="text-xs text-gray-400">
                  {new Date(event.timestamp).toLocaleTimeString()}
                </p>
                <p className="text-sm text-gray-800 mt-1">{event.text}</p>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
