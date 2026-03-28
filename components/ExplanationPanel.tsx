"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface ExplanationPanelProps {
  text: string;
  isStreaming: boolean;
  experienceLevel: "junior" | "mid" | "senior";
  filePath: string | null;
}

export default function ExplanationPanel({
  text,
  isStreaming,
  experienceLevel,
  filePath,
}: ExplanationPanelProps) {
  if (!filePath && !text) {
    return (
      <div className="h-full flex items-center justify-center text-zinc-600 text-sm">
        Select a file to view its explanation
      </div>
    );
  }

  // Skeleton placeholder
  if (!text && isStreaming) {
    return (
      <div className="p-4 space-y-3">
        <div className="h-4 w-48 bg-zinc-800 rounded skeleton-pulse" />
        <div className="h-3 w-full bg-zinc-800 rounded skeleton-pulse" />
        <div className="h-3 w-5/6 bg-zinc-800 rounded skeleton-pulse" />
        <div className="h-3 w-4/6 bg-zinc-800 rounded skeleton-pulse" />
        <div className="h-3 w-full bg-zinc-800 rounded skeleton-pulse" />
        <div className="h-3 w-3/6 bg-zinc-800 rounded skeleton-pulse" />
      </div>
    );
  }

  const levelConfig = {
    junior: {
      badge: "Junior",
      badgeColor: "bg-blue-500/20 text-blue-400",
      borderColor: "border-blue-500/50",
    },
    mid: {
      badge: "Mid-Level",
      badgeColor: "bg-emerald-500/20 text-emerald-400",
      borderColor: "border-emerald-500/50",
    },
    senior: {
      badge: "Senior",
      badgeColor: "bg-zinc-500/20 text-zinc-400",
      borderColor: "border-zinc-600",
    },
  };

  const config = levelConfig[experienceLevel];

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-3 py-2 border-b border-zinc-800 flex items-center gap-2 shrink-0">
        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Explanation
        </span>
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${config.badgeColor}`}
        >
          {config.badge}
        </span>
        {filePath && (
          <span className="text-xs text-zinc-600 font-mono ml-auto truncate max-w-[200px]">
            {filePath}
          </span>
        )}
      </div>
      <div
        className={`p-4 border-l-2 ${config.borderColor} m-2`}
      >
        <div className="prose-glitch text-sm leading-relaxed text-zinc-300">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
          {isStreaming && <span className="cursor-blink" />}
        </div>
      </div>
    </div>
  );
}
