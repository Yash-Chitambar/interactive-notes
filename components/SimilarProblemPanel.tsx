"use client";

import { SimilarProblemResult } from "@/hooks/useSimilarProblems";

interface Props {
  result: SimilarProblemResult | null;
  isSearching: boolean;
  error: string | null;
  onClose: () => void;
}

export default function SimilarProblemPanel({ result, isSearching, error, onClose }: Props) {
  if (!isSearching && !result && !error) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-[420px] bg-white border-l border-gray-200 shadow-xl z-30 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
        <h2 className="text-sm font-semibold text-gray-800">Similar Problem</h2>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 text-lg leading-none"
          title="Close"
        >
          &times;
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4">
        {isSearching && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-500">
            <svg
              className="animate-spin h-8 w-8 text-blue-500"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
            <p className="text-sm">Searching CS70 practice problems...</p>
            <p className="text-xs text-gray-400">Scraping course website via BrowserBase</p>
          </div>
        )}

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {result && result.similar_problem && (
          <div className="space-y-4">
            {/* Topic + source badge */}
            <div className="flex items-center gap-2 flex-wrap">
              {result.topic && (
                <span className="inline-block px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 rounded-full">
                  {result.topic}
                </span>
              )}
              {result.source && (
                <span className="inline-block px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-600 rounded-full">
                  {result.source}
                </span>
              )}
            </div>

            {/* Why similar */}
            {result.why_similar && (
              <p className="text-xs text-gray-500 italic">{result.why_similar}</p>
            )}

            {/* Generated image */}
            {result.image && (
              <div className="rounded-lg border border-gray-200 overflow-hidden">
                <img
                  src={`data:image/png;base64,${result.image}`}
                  alt="Similar problem"
                  className="w-full"
                />
              </div>
            )}

            {/* Problem text (always shown as fallback or alongside image) */}
            <div className="rounded-lg bg-gray-50 border border-gray-200 p-4">
              <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed font-mono">
                {result.similar_problem}
              </p>
            </div>

            {/* Link to source */}
            {result.source_url && (
              <a
                href={result.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 hover:underline"
              >
                View original PDF
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
                  <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
                </svg>
              </a>
            )}
          </div>
        )}

        {result && !result.similar_problem && (
          <div className="rounded-lg bg-yellow-50 border border-yellow-200 p-3 text-sm text-yellow-700">
            {result.error || "No similar problems found. Try a different description."}
          </div>
        )}
      </div>
    </div>
  );
}
