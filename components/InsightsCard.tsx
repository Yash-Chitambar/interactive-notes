"use client";

// ============================================================
// InsightsCard.tsx — PERSON 5 OWNS THIS FILE
// Shows mistake pattern insights from AfterQuery analytics.
// ============================================================

interface Insight {
  type: string;
  count: number;
  description: string;
}

interface InsightsCardProps {
  insights: Insight[];
  sessionId: string;
}

export default function InsightsCard({ insights }: InsightsCardProps) {
  if (insights.length === 0) return null;

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
      <p className="font-semibold text-amber-800 mb-2">📊 Session Insights</p>
      <ul className="space-y-1">
        {insights.map((insight, i) => (
          <li key={i} className="text-amber-700 flex items-center gap-2">
            <span className="bg-amber-200 text-amber-900 text-xs font-bold px-1.5 rounded">
              {insight.count}x
            </span>
            {insight.description}
          </li>
        ))}
      </ul>
    </div>
  );
}
