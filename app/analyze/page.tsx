"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
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

const SAMPLE_REPOS = [
  "https://github.com/vercel/next.js",
  "https://github.com/facebook/react",
  "https://github.com/tailwindlabs/tailwindcss",
  "https://github.com/microsoft/TypeScript",
];

const TICKER_TEXT =
  "WELCOME TO GLITCH.EXE // DROP A GITHUB URL // PICK YOUR SKILL LEVEL // WATCH THE CODEBASE UNFOLD LIVE // BEEP BOOP ANALYSIS ONLINE";

export default function Home() {
  const [repoUrl, setRepoUrl] = useState("");
  const [experienceLevel, setExperienceLevel] =
    useState<ExperienceLevel>("junior");
  const [loading, setLoading] = useState(false);
  const [analyzed, setAnalyzed] = useState(false);

  // Data from /api/parse
  const [repoMeta, setRepoMeta] = useState<RepoMeta | null>(null);
  const [fileTree, setFileTree] = useState<FileTreeEntry[]>([]);
  const [callGraph, setCallGraph] = useState<Record<string, CallGraphEntry>>(
    {}
  );
  const [dependencyGraph, setDependencyGraph] = useState<
    import("@/lib/dependency-graph").DependencyGraph | undefined
  >(undefined);

  // Summary streaming
  const [summary, setSummary] = useState("");
  const [summaryStreaming, setSummaryStreaming] = useState(false);

  // File explanation streaming
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [explanation, setExplanation] = useState("");
  const [explanationStreaming, setExplanationStreaming] = useState(false);

  // Visual vibe states
  const [now, setNow] = useState(() => new Date());

  // Abort controllers for cancellation
  const summaryAbort = useRef<AbortController | null>(null);
  const explainAbort = useRef<AbortController | null>(null);

  const currentRepoUrl = useRef(repoUrl);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

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
  const fetchSummary = useCallback(async (url: string, level: ExperienceLevel) => {
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
  }, []);

  // Fetch file explanation (streaming)
  const fetchExplanation = useCallback(
    async (url: string, filePath: string, level: ExperienceLevel) => {
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
        throw new Error((err as { error?: string }).error ?? `HTTP ${parseRes.status}`);
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
      setSummary(`Error: ${(err as Error).message}. Check the repo URL and try again.`);
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
      fetchExplanation(currentRepoUrl.current, selectedFile, experienceLevel);
    }
  }, [experienceLevel, analyzed, selectedFile, fetchSummary, fetchExplanation]);

  const levels: ExperienceLevel[] = ["junior", "mid", "senior"];

  const totalFunctions = useMemo(
    () =>
      Object.values(callGraph).reduce(
        (sum, entry) => sum + Object.keys(entry.functions).length,
        0
      ),
    [callGraph]
  );

  const totalConnections = useMemo(
    () => dependencyGraph?.edges.filter((edge) => edge.type === "internal").length ?? 0,
    [dependencyGraph]
  );

  const fileCount = useMemo(() => Object.keys(callGraph).length, [callGraph]);

  return (
    <div className="retro-desktop min-h-screen pb-14">
      <div className="retro-shell sticky top-0 z-50 border-b-2 border-black/50">
        <div className="retro-titlebar px-3 py-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="retro-led" />
            <span className="font-bold tracking-wide uppercase truncate">
              GLITCH.EXE :: Codebase Brain Scanner
            </span>
          </div>
          <div className="text-xs font-bold shrink-0">
            {now.toLocaleDateString()} {now.toLocaleTimeString()}
          </div>
        </div>
      </div>

      <div className="retro-marquee-wrap mx-auto max-w-[1500px] mt-3 px-4">
        <div className="retro-marquee">
          <div className="retro-marquee-track" aria-hidden="true">
            {TICKER_TEXT} {"\u00A0\u00A0\u00A0"} {TICKER_TEXT}
          </div>
        </div>
      </div>

      <main className="max-w-[1500px] w-full mx-auto px-4 py-4 space-y-4">
        <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
          <section className="retro-window">
            <div className="retro-titlebar px-3 py-1.5 flex items-center justify-between">
              <span className="font-bold">Mission Console</span>
              <span className="text-[11px] uppercase tracking-wide blink">Ready</span>
            </div>

            <div className="retro-window-body space-y-4">
              <p className="text-sm leading-relaxed">
                Drop a public GitHub repo and GLITCH breaks it down like a classic hacker toy:
                repo map, cross-file connections, live AI explainers, and starter issues.
                It is intentionally loud, and still fast enough to be useful.
              </p>

              <div className="retro-panel-inset p-3 space-y-3">
                <label className="block text-xs font-bold uppercase tracking-wide">
                  Repository URL
                </label>
                <div className="grid gap-2 md:grid-cols-[1fr_auto]">
                  <input
                    type="text"
                    value={repoUrl}
                    onChange={(e) => setRepoUrl(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAnalyze()}
                    placeholder="https://github.com/owner/repo"
                    className="retro-input"
                  />
                  <button
                    type="button"
                    onClick={handleAnalyze}
                    disabled={loading || !repoUrl.trim()}
                    className="retro-button retro-button-primary"
                  >
                    {loading ? "Booting Parser..." : "Analyze Repo"}
                  </button>
                </div>
              </div>

              <div className="retro-panel-inset p-3 space-y-3">
                <div className="text-xs font-bold uppercase tracking-wide">Select Experience Mode</div>
                <div className="flex flex-wrap gap-2">
                  {levels.map((level) => (
                    <button
                      key={level}
                      type="button"
                      onClick={() => handleLevelChange(level)}
                      className={`retro-button ${
                        experienceLevel === level
                          ? "retro-button-alert"
                          : "retro-button-neutral"
                      }`}
                    >
                      {level.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              <div className="retro-panel-inset p-3 space-y-3">
                <div className="text-xs font-bold uppercase tracking-wide">Instant Demo Repos</div>
                <div className="flex flex-wrap gap-2">
                  {SAMPLE_REPOS.map((sample) => (
                    <button
                      key={sample}
                      type="button"
                      onClick={() => setRepoUrl(sample)}
                      className="retro-chip"
                    >
                      {sample.replace("https://github.com/", "")}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <div className="retro-stat-card bg-[#ffffe1]">
                  <span className="retro-stat-label">Repo</span>
                  <span className="retro-stat-value">{repoMeta?.name ?? "N/A"}</span>
                </div>
                <div className="retro-stat-card bg-[#e3f0ff]">
                  <span className="retro-stat-label">Files Parsed</span>
                  <span className="retro-stat-value">{fileCount}</span>
                </div>
                <div className="retro-stat-card bg-[#ffe4ef]">
                  <span className="retro-stat-label">Functions</span>
                  <span className="retro-stat-value">{totalFunctions}</span>
                </div>
                <div className="retro-stat-card bg-[#e2ffec]">
                  <span className="retro-stat-label">Connections</span>
                  <span className="retro-stat-value">{totalConnections}</span>
                </div>
              </div>
            </div>
          </section>

          <div className="space-y-4">
            <section className="retro-window">
              <div className="retro-titlebar retro-titlebar-hot px-3 py-1.5 flex items-center justify-between">
                <span className="font-bold">How This Works</span>
                <span className="text-[11px]">v95.1</span>
              </div>
              <div className="retro-window-body">
                <ol className="retro-list">
                  <li>Paste any public GitHub URL.</li>
                  <li>We parse imports, exports, and function calls.</li>
                  <li>You get live summary + per-file explanations.</li>
                  <li>The dependency tree shows who calls what.</li>
                  <li>Open issues are ranked by onboarding difficulty.</li>
                </ol>
              </div>
            </section>

            <section className="retro-window">
              <div className="retro-titlebar retro-titlebar-green px-3 py-1.5 flex items-center justify-between">
                <span className="font-bold">Operator Feed</span>
                <span className="text-[11px]">ONLINE</span>
              </div>
              <div className="retro-window-body space-y-2 text-sm">
                <p>
                  <strong>Now Running:</strong> architecture scanner + issue triage + AI explain stream.
                </p>
                <p>
                  <strong>Best For:</strong> onboarding to unknown repos in minutes instead of hours.
                </p>
                <p>
                  <strong>Current Target:</strong> {currentRepoUrl.current || "Awaiting URL"}
                </p>
                <div className="retro-panel-inset p-2 text-xs">
                  Tip: switch between <strong>JUNIOR / MID / SENIOR</strong> to tune explanation depth instantly.
                </div>
              </div>
            </section>
          </div>
        </div>

        {!analyzed && (
          <section className="retro-window">
            <div className="retro-titlebar px-3 py-1.5 flex items-center justify-between">
              <span className="font-bold">Welcome to the Chaos</span>
              <span className="text-[11px]">Press Analyze to Start</span>
            </div>
            <div className="retro-window-body grid gap-3 md:grid-cols-3">
              <div className="retro-poster bg-[#ffe5ad]">
                <h3>Why People Use It</h3>
                <p>
                  It converts a giant codebase into a map you can actually navigate. This is the
                  shortest path from confusion to contribution.
                </p>
              </div>
              <div className="retro-poster bg-[#c9f2ff]">
                <h3>Live Output</h3>
                <p>
                  Summary stream, file explanations, dependency map, and issue guidance all appear
                  in one workflow.
                </p>
              </div>
              <div className="retro-poster bg-[#ffd6ec]">
                <h3>90s Bonus</h3>
                <p>
                  Beveled windows, marquee ticker, bright blocks, and deliberate visual noise,
                  without breaking the core UX.
                </p>
              </div>
            </div>
          </section>
        )}

        {(summary || summaryStreaming) && (
          <section className="retro-window">
            <div className="retro-titlebar retro-titlebar-purple px-3 py-1.5 flex items-center justify-between">
              <span className="font-bold">Repo Broadcast</span>
              <span className="text-[11px]">{summaryStreaming ? "STREAMING..." : "COMPLETE"}</span>
            </div>
            <div className="retro-window-body">
              <SummaryPanel summary={summary} streaming={summaryStreaming} />
            </div>
          </section>
        )}

        {analyzed && (
          <>
            <section className="retro-window">
              <div className="retro-titlebar px-3 py-1.5 flex items-center justify-between">
                <span className="font-bold">File Explorer + Explanation Deck</span>
                <span className="text-[11px]">Click file for deep dive</span>
              </div>
              <div className="retro-window-body p-0">
                <div className="grid md:grid-cols-[35%_65%]" style={{ minHeight: "420px" }}>
                  <div className="min-h-[220px] md:min-h-[420px]">
                    <FileExplorer
                      fileTree={fileTree}
                      selectedFile={selectedFile}
                      onFileSelect={handleFileSelect}
                    />
                  </div>
                  <div className="border-t-2 border-black md:border-l-2 md:border-t-0 border-black/50 min-h-[220px] md:min-h-[420px]">
                    <ExplanationPanel
                      text={explanation}
                      isStreaming={explanationStreaming}
                      experienceLevel={experienceLevel}
                      filePath={selectedFile}
                    />
                  </div>
                </div>
              </div>
            </section>

            <section className="retro-window">
              <div className="retro-titlebar retro-titlebar-green px-3 py-1.5 flex items-center justify-between">
                <span className="font-bold">Dependency Tree Navigator</span>
                <span className="text-[11px]">Repo-wide graph</span>
              </div>
              <div className="retro-window-body p-0" style={{ minHeight: "450px" }}>
                <CallGraph
                  entry={selectedFile ? callGraph[selectedFile] ?? null : null}
                  filePath={selectedFile}
                  dependencyGraph={dependencyGraph}
                  callGraph={callGraph}
                  onFileNavigate={handleFileSelect}
                />
              </div>
            </section>

            <section className="retro-window">
              <div className="retro-titlebar retro-titlebar-hot px-3 py-1.5 flex items-center justify-between">
                <span className="font-bold">Open Issue Radar</span>
                <span className="text-[11px]">Find starter tasks</span>
              </div>
              <div className="retro-window-body p-0">
                <IssuesPanel
                  repoUrl={currentRepoUrl.current}
                  experienceLevel={experienceLevel}
                />
              </div>
            </section>
          </>
        )}
      </main>

      <footer className="retro-taskbar">
        <div className="retro-task-start">Start</div>
        <div className="retro-task-item">GLITCH.EXE</div>
        <div className="retro-task-item">Analyzer</div>
        <div className="retro-task-clock">
          {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </div>
      </footer>
    </div>
  );
}
