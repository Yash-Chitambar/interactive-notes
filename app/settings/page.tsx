"use client";

// ============================================================
// app/settings/page.tsx — PERSON 4 OWNS THIS FILE
// Tutor settings: intervention frequency, tutor mode, etc.
// ============================================================

import Link from "next/link";

export default function SettingsPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200">
        <Link href="/" className="text-gray-400 hover:text-gray-700">← Back</Link>
        <h1 className="font-semibold text-gray-800">Settings</h1>
      </header>

      <main className="max-w-xl mx-auto p-6 flex flex-col gap-6">
        {/* TODO Person 4: implement settings */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col gap-4">
          <h2 className="font-semibold text-gray-700">Tutor Behavior</h2>

          <label className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700">Tutor Mode</p>
              <p className="text-xs text-gray-400">Hint: guide without answers. Answer: show correct solution.</p>
            </div>
            <select className="text-sm border border-gray-200 rounded-lg px-3 py-1.5">
              <option value="hint">Hint only</option>
              <option value="answer">Show answers</option>
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <p className="text-sm font-medium text-gray-700">Intervention Sensitivity</p>
            <p className="text-xs text-gray-400">How quickly the AI chimes in</p>
            <input type="range" min="1" max="5" defaultValue="3" className="w-full" />
            <div className="flex justify-between text-xs text-gray-400">
              <span>Gentle</span><span>Aggressive</span>
            </div>
          </label>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-700 mb-4">Audio</h2>
          <label className="flex items-center justify-between">
            <p className="text-sm text-gray-700">Always-on listening</p>
            <input type="checkbox" className="w-4 h-4" />
          </label>
        </div>
      </main>
    </div>
  );
}
