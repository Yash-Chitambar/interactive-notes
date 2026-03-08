"use client";

import { useState } from "react";
import { useSimilarProblems } from "@/hooks/useSimilarProblems";
import SimilarProblemPanel from "@/components/SimilarProblemPanel";

export default function TestSimilarPage() {
  const [input, setInput] = useState("");
  const { result, isSearching, error, findSimilar, clear } = useSimilarProblems();
  const [showPanel, setShowPanel] = useState(false);

  const handleSearch = () => {
    if (!input.trim()) return;
    setShowPanel(true);
    findSimilar(input);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold text-gray-800">Find Similar CS70 Problems</h1>
        <p className="text-sm text-gray-500">
          Describe a problem you&apos;re working on and we&apos;ll search CS70 practice tests for something similar.
        </p>

        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="e.g. Prove that for any graph G with n vertices and m edges, if every vertex has degree at least 3, then m >= 3n/2"
          rows={4}
          className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
        />

        <div className="flex gap-3">
          <button
            onClick={handleSearch}
            disabled={isSearching || !input.trim()}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSearching ? "Searching..." : "Find Similar"}
          </button>

          {(result || error) && (
            <button
              onClick={() => { clear(); setShowPanel(false); }}
              className="px-4 py-2 border border-gray-300 text-gray-600 text-sm rounded-lg hover:bg-gray-100 transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <SimilarProblemPanel
        result={result}
        isSearching={isSearching}
        error={error}
        onClose={() => { clear(); setShowPanel(false); }}
      />
    </div>
  );
}
