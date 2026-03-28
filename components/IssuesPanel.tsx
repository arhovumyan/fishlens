"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Issue {
  id: number;
  number: number;
  title: string;
  url: string;
  difficulty: "easy" | "medium" | "hard";
  labels: string[];
  explanation: string;
}

const DIFFICULTY_STYLES: Record<
  string,
  { bg: string; text: string; label: string }
> = {
  easy: { bg: "bg-green-500/20", text: "text-green-400", label: "Easy" },
  medium: {
    bg: "bg-yellow-500/20",
    text: "text-yellow-400",
    label: "Medium",
  },
  hard: { bg: "bg-red-500/20", text: "text-red-400", label: "Hard" },
};

export default function IssuesPanel({
  repoUrl,
  experienceLevel,
}: {
  repoUrl: string;
  experienceLevel: "junior" | "mid" | "senior";
}) {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    if (!repoUrl) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({ repoUrl, experienceLevel });
    fetch(`/api/issues?${params}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setIssues(data.issues ?? []);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [repoUrl, experienceLevel]);

  return (
    <div className="border-t border-zinc-800">
      <div className="px-4 py-3 flex items-center gap-2 border-b border-zinc-800">
        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Open Issues
        </span>
        {!loading && issues.length > 0 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-800 text-zinc-400">
            {issues.length}
          </span>
        )}
      </div>

      {loading && (
        <div className="p-4 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-zinc-800/50 rounded-lg skeleton-pulse" />
          ))}
        </div>
      )}

      {error && (
        <div className="p-4 text-sm text-red-400">
          Failed to load issues: {error}
        </div>
      )}

      {!loading && !error && issues.length === 0 && (
        <div className="p-4 text-sm text-zinc-600">No open issues found.</div>
      )}

      {!loading && !error && issues.length > 0 && (
        <div className="p-3 space-y-2 max-h-[400px] overflow-y-auto">
          {issues.map((issue) => {
            const style = DIFFICULTY_STYLES[issue.difficulty];
            const isExpanded = expandedId === issue.id;

            return (
              <div
                key={issue.id}
                className="rounded-lg border border-zinc-800 bg-zinc-900/50 overflow-hidden"
              >
                <button
                  onClick={() =>
                    setExpandedId(isExpanded ? null : issue.id)
                  }
                  className="w-full px-4 py-3 flex items-start gap-3 text-left hover:bg-zinc-800/30 transition-colors"
                >
                  <span
                    className={`shrink-0 text-[10px] px-2 py-0.5 rounded-full font-semibold ${style.bg} ${style.text}`}
                  >
                    {style.label}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-zinc-200 leading-tight">
                      #{issue.number} {issue.title}
                    </div>
                    {issue.labels.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {issue.labels.map((label) => (
                          <span
                            key={label}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500"
                          >
                            {label}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <a
                    href={issue.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="shrink-0 text-xs text-zinc-500 hover:text-blue-400 transition-colors"
                  >
                    View →
                  </a>
                </button>

                {isExpanded && issue.explanation && (
                  <div className="px-4 pb-4 border-t border-zinc-800/50 bg-zinc-950/20">
                    <div className="mt-3 prose-glitch text-[13px] leading-relaxed">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {issue.explanation}
                      </ReactMarkdown>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
