"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import FileExplorer from "@/components/FileExplorer";
import ExplanationPanel from "@/components/ExplanationPanel";
import CallGraph from "@/components/CallGraph";
import SummaryPanel from "@/components/SummaryPanel";
import IssuesPanel from "@/components/IssuesPanel";

type ExperienceLevel = "junior" | "mid" | "senior";

interface RepoMeta {
  name: string;
  description: string;
  language: string;
  stars: number;
  forks: number;
  branches: number;
  contributors: number;
}

interface FileTreeEntry {
  path: string;
  type: string;
  language: string;
}

interface CallGraphEntry {
  imports: string[];
  exports: string[];
  functions: Record<string, { calls: string[] }>;
}

export default function Home() {
  const [repoUrl, setRepoUrl] = useState("");
  const [experienceLevel, setExperienceLevel] =
    useState<ExperienceLevel>("junior");
  const [loading, setLoading] = useState(false);
  const [analyzed, setAnalyzed] = useState(false);

  // Data from /api/parse
  const [repoMeta, setRepoMeta] = useState<RepoMeta | null>(null);
  const [fileTree, setFileTree] = useState<FileTreeEntry[]>([]);
  const [callGraph, setCallGraph] = useState<
    Record<string, CallGraphEntry>
  >({});
  const [dependencyGraph, setDependencyGraph] = useState<import("@/lib/dependency-graph").DependencyGraph | undefined>(undefined);

  // Summary streaming
  const [summary, setSummary] = useState("");
  const [summaryStreaming, setSummaryStreaming] = useState(false);

  // File explanation streaming
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [explanation, setExplanation] = useState("");
  const [explanationStreaming, setExplanationStreaming] = useState(false);


  // Abort controllers for cancellation
  const summaryAbort = useRef<AbortController | null>(null);
  const explainAbort = useRef<AbortController | null>(null);

  const currentRepoUrl = useRef(repoUrl);

  // Stream a fetch response into a setter
  async function streamResponse(
    res: Response,
    setter: (update: (prev: string) => string) => void,
    signal: AbortSignal
  ) {
    const reader = res.body?.getReader();
    if (!reader) return;
    const decoder = new TextDecoder();
    while (true) {
      if (signal.aborted) break;
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value, { stream: true });
      setter((prev) => prev + text);
    }
  }

  // Fetch summary (streaming)
  const fetchSummary = useCallback(
    async (url: string, level: ExperienceLevel) => {
      summaryAbort.current?.abort();
      const controller = new AbortController();
      summaryAbort.current = controller;

      setSummary("");
      setSummaryStreaming(true);

      try {
        const res = await fetch("/api/summary", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            repoUrl: url,
            experienceLevel: level,
          }),
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await streamResponse(res, setSummary, controller.signal);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          console.error("[page] Summary fetch failed:", err);
          setSummary("Failed to load summary. Please try again.");
        }
      } finally {
        setSummaryStreaming(false);
      }
    },
    []
  );

  // Fetch file explanation (streaming)
  const fetchExplanation = useCallback(
    async (
      url: string,
      filePath: string,
      level: ExperienceLevel
    ) => {
      explainAbort.current?.abort();
      const controller = new AbortController();
      explainAbort.current = controller;

      setExplanation("");
      setExplanationStreaming(true);

      try {
        const res = await fetch("/api/explain", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            repoUrl: url,
            filePath,
            experienceLevel: level,
          }),
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await streamResponse(res, setExplanation, controller.signal);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          console.error("[page] Explain fetch failed:", err);
          setExplanation("Failed to load explanation. Please try again.");
        }
      } finally {
        setExplanationStreaming(false);
      }
    },
    []
  );

  // Analyze button handler
  const handleAnalyze = async () => {
    if (!repoUrl.trim()) return;
    setLoading(true);
    setAnalyzed(false);
    setSelectedFile(null);
    setExplanation("");
    currentRepoUrl.current = repoUrl;

    try {
      // First, call /api/parse to get structured data
      const parseRes = await fetch("/api/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoUrl }),
      });

      if (!parseRes.ok) {
        const err = await parseRes.json().catch(() => ({}));
        throw new Error(
          (err as { error?: string }).error ?? `HTTP ${parseRes.status}`
        );
      }

      const parsed = await parseRes.json();
      setRepoMeta(parsed.repoMeta);
      setFileTree(parsed.fileTree);
      setCallGraph(parsed.callGraph);
      setDependencyGraph(parsed.dependencyGraph);
      setAnalyzed(true);

      // Then start streaming summary
      fetchSummary(repoUrl, experienceLevel);
    } catch (err) {
      console.error("[page] Analyze failed:", err);
      setSummary(
        `Error: ${(err as Error).message}. Check the repo URL and try again.`
      );
    } finally {
      setLoading(false);
    }
  };

  // File selection handler — fetch explanation for any file
  const handleFileSelect = (filePath: string) => {
    setSelectedFile(filePath);
    fetchExplanation(currentRepoUrl.current, filePath, experienceLevel);
  };

  // Re-fetch on experience level change
  const handleLevelChange = (level: ExperienceLevel) => {
    setExperienceLevel(level);
  };

  // Effect: when experienceLevel changes and we're already analyzed, re-fetch
  const prevLevel = useRef(experienceLevel);
  useEffect(() => {
    if (prevLevel.current === experienceLevel) return;
    prevLevel.current = experienceLevel;

    if (!analyzed) return;

    fetchSummary(currentRepoUrl.current, experienceLevel);
    if (selectedFile) {
      fetchExplanation(
        currentRepoUrl.current,
        selectedFile,
        experienceLevel
      );
    }
  }, [experienceLevel, analyzed, selectedFile, fetchSummary, fetchExplanation]);

  const levels: ExperienceLevel[] = ["junior", "mid", "senior"];

  return (
    <div className="flex flex-col min-h-screen bg-zinc-950">
      {/* Navbar */}
      <nav className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-[1400px] mx-auto px-4 h-12 flex items-center justify-between">
          <span className="font-mono text-lg font-bold tracking-tight text-white">
            GLITCH
          </span>
          {repoMeta && (
            <div className="flex items-center gap-4 text-sm text-zinc-500">
              <span className="text-zinc-200 font-semibold">{repoMeta.name}</span>
              <span>·</span>
              <span className="flex items-center gap-1.5">
                <span className="text-zinc-400 text-base">★</span> {repoMeta.stars}
              </span>
              <span>·</span>
              <span className="flex items-center gap-1.5">
                <span className="text-zinc-400 text-base">⑂</span> {repoMeta.forks}
              </span>
              <span>·</span>
              <span className="flex items-center gap-1.5">
                <span className="text-zinc-400 text-base">⌥</span> {repoMeta.branches}
              </span>
            </div>
          )}
        </div>
      </nav>

      {/* Input Section */}
      <div className="max-w-[1400px] w-full mx-auto px-4 py-6">
        <div className="flex flex-col gap-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAnalyze()}
              placeholder="https://github.com/owner/repo"
              className="flex-1 h-10 px-3 rounded-lg bg-zinc-900 border border-zinc-800 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-600 font-mono"
            />
            <button
              onClick={handleAnalyze}
              disabled={loading || !repoUrl.trim()}
              className="h-10 px-5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? "Parsing…" : "Analyze"}
            </button>
          </div>

          {/* Experience Level Toggle */}
          <div className="flex items-center gap-1">
            <span className="text-xs text-zinc-500 mr-2">Level:</span>
            {levels.map((level) => (
              <button
                key={level}
                onClick={() => handleLevelChange(level)}
                className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${
                  experienceLevel === level
                    ? "bg-zinc-700 text-white"
                    : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
                }`}
              >
                {level.charAt(0).toUpperCase() + level.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Summary Panel */}
        <SummaryPanel summary={summary} streaming={summaryStreaming} />

        {/* Panels Layout */}
        {analyzed && (
          <div className="mt-6 flex flex-col gap-4">
            {/* Top Row: File Explorer & Explanation */}
            <div className="flex rounded-lg border border-zinc-800 overflow-hidden bg-zinc-900/30" style={{ height: "400px" }}>
              {/* File Explorer — 35% */}
              <div className="w-[35%] shrink-0">
                <FileExplorer
                  fileTree={fileTree}
                  selectedFile={selectedFile}
                  onFileSelect={handleFileSelect}
                />
              </div>

              {/* Explanation Panel — 65% */}
              <div className="w-[65%] border-l border-zinc-800">
                <ExplanationPanel
                  text={explanation}
                  isStreaming={explanationStreaming}
                  experienceLevel={experienceLevel}
                  filePath={selectedFile}
                />
              </div>
            </div>

            {/* Bottom Row: Call Graph (Full Width) */}
            <div className="rounded-lg border border-zinc-800 overflow-hidden bg-zinc-900/30" style={{ height: "450px" }}>
              <CallGraph
                entry={selectedFile ? callGraph[selectedFile] ?? null : null}
                filePath={selectedFile}
                dependencyGraph={dependencyGraph}
                callGraph={callGraph}
                onFileNavigate={handleFileSelect}
              />
            </div>
          </div>
        )}

        {/* Issues Panel */}
        {analyzed && (
          <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-900/30 overflow-hidden">
            <IssuesPanel
              repoUrl={currentRepoUrl.current}
              experienceLevel={experienceLevel}
            />
          </div>
        )}
      </div>
    </div>
  );
}
der-zinc-800 overflow-hidden bg-zinc-900/30" style={{ height: "500px" }}>
            {/* File Explorer — 30% */}
            <div className="w-[30%] shrink-0">
              <FileExplorer
                fileTree={fileTree}
                selectedFile={selectedFile}
                onFileSelect={handleFileSelect}
              />
            </div>

            {/* Explanation Panel — 45% */}
            <div className="w-[45%] border-l border-zinc-800">
              <ExplanationPanel
                text={explanation}
                isStreaming={explanationStreaming}
                experienceLevel={experienceLevel}
                filePath={selectedFile}
              />
            </div>

            {/* Call Graph — 25% */}
            <div className="w-[25%] border-l border-zinc-800">
              <CallGraph
                entry={selectedFile ? callGraph[selectedFile] ?? null : null}
                filePath={selectedFile}
                dependencyGraph={dependencyGraph}
                callGraph={callGraph}
                onFileNavigate={handleFileSelect}
              />
            </div>
          </div>
        )}

        {/* Issues Panel */}
        {analyzed && (
          <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-900/30 overflow-hidden">
            <IssuesPanel
              repoUrl={currentRepoUrl.current}
              experienceLevel={experienceLevel}
            />
          </div>
        )}
      </div>
    </div>
  );
}
