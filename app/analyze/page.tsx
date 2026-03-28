"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import RepoTree from "@/components/RepoTree";
import SummaryPanel from "@/components/SummaryPanel";
import IssuesPanel from "@/components/IssuesPanel";
import FishIcon from "@/components/FishIcon";
import Link from "next/link";

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
  "WELCOME TO FISHLENS // DROP A GITHUB URL // PICK YOUR SKILL LEVEL // WATCH THE CODEBASE UNFOLD LIVE // WIDE-ANGLE SCANNING ONLINE";

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

  // Image gen
  const [bannerImage, setBannerImage] = useState<string | null>(null);
  const [bannerLoading, setBannerLoading] = useState(false);
  const [fileIcons, setFileIcons] = useState<Record<string, string>>({});

  // Visual vibe states
  const [now, setNow] = useState<Date | null>(null);

  // Abort controllers for cancellation
  const summaryAbort = useRef<AbortController | null>(null);
  const explainAbort = useRef<AbortController | null>(null);

  const currentRepoUrl = useRef(repoUrl);

  useEffect(() => {
    const fakeDate = () => {
      const real = new Date();
      return new Date(1999, 11, 31, real.getHours(), real.getMinutes(), real.getSeconds());
    };
    setNow(fakeDate());
    const id = setInterval(() => setNow(fakeDate()), 1000);
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

  // Generate repo banner image
  const generateBanner = useCallback(async (name: string, description: string, language: string) => {
    setBannerLoading(true);
    setBannerImage(null);
    try {
      const res = await fetch("/api/imagegen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: `Create a retro Windows 95/98 pixel art banner (wide, 4:1 aspect ratio) for a software project called "${name}". Language: ${language || "various"}. Description: ${description || "A code repository"}. Use chunky pixels, limited palette (teals, navy, silver, hot pink), beveled edges, old-school computer vibes. Include the project name as pixel text. No modern gradients.`,
        }),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.image) setBannerImage(`data:${data.mimeType};base64,${data.image}`);
    } catch (err) {
      console.error("[page] Banner gen failed:", err);
    } finally {
      setBannerLoading(false);
    }
  }, []);

  // Generate pixel art icons for file types
  const generateFileIcons = useCallback(async (extensions: string[]) => {
    // Generate top 6 unique extensions
    const toGenerate = extensions.slice(0, 6);
    for (const ext of toGenerate) {
      try {
        const res = await fetch("/api/imagegen", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: `Create a tiny 32x32 pixel art icon for a .${ext} file. Retro Windows 95 style, simple, recognizable, chunky pixels, limited color palette. Just the icon, no text, no background, transparent.`,
          }),
        });
        if (!res.ok) continue;
        const data = await res.json();
        if (data.image) {
          setFileIcons((prev) => ({ ...prev, [ext]: `data:${data.mimeType};base64,${data.image}` }));
        }
      } catch {
        // Skip failed icons
      }
    }
  }, []);

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

      // Start streaming summary
      fetchSummary(repoUrl, experienceLevel);

      // Generate banner + file icons in background
      const meta = parsed.repoMeta;
      generateBanner(meta.name, meta.description, meta.language);
      const exts = [...new Set(
        (parsed.fileTree as FileTreeEntry[])
          .filter((f: FileTreeEntry) => f.type === "file")
          .map((f: FileTreeEntry) => f.path.split(".").pop()?.toLowerCase())
          .filter(Boolean)
      )] as string[];
      generateFileIcons(exts);
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

  // Effect: when experienceLevel changes and we're already analyzed, re-fetch (debounced)
  const prevLevel = useRef(experienceLevel);
  const levelDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (prevLevel.current === experienceLevel) return;
    prevLevel.current = experienceLevel;

    if (!analyzed) return;

    if (levelDebounce.current) clearTimeout(levelDebounce.current);
    levelDebounce.current = setTimeout(() => {
      fetchSummary(currentRepoUrl.current, experienceLevel);
      if (selectedFile) {
        fetchExplanation(currentRepoUrl.current, selectedFile, experienceLevel);
      }
    }, 500);

    return () => {
      if (levelDebounce.current) clearTimeout(levelDebounce.current);
    };
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
            <Link href="/" className="shrink-0 hover:opacity-80 transition-opacity" title="Home">
              <FishIcon size={18} />
            </Link>
            <span className="font-bold tracking-wide uppercase truncate">
              FISHLENS :: Codebase Wide-Angle Scanner
            </span>
          </div>
          <div className="text-xs font-bold shrink-0">
            {now ? `${now.toLocaleDateString()} ${now.toLocaleTimeString()}` : "\u00A0"}
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
                Drop a public GitHub repo and FISHLENS breaks it down like a classic hacker toy:
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

              {repoMeta && (
                <div className="flex flex-wrap gap-3 mt-2">
                  {[
                    { icon: "\u2B50", label: "Stars", value: repoMeta.stars, bg: "bg-[#fff8dc]", hover: "hover:bg-[#fff0a0]" },
                    { icon: "\uD83C\uDF74", label: "Forks", value: repoMeta.forks, bg: "bg-[#e8f4fd]", hover: "hover:bg-[#c8e4fd]" },
                    { icon: "\uD83C\uDF3F", label: "Branches", value: repoMeta.branches, bg: "bg-[#e8fde8]", hover: "hover:bg-[#c0f0c0]" },
                    { icon: "\uD83D\uDC65", label: "Contributors", value: repoMeta.contributors, bg: "bg-[#f3e8fd]", hover: "hover:bg-[#e0c8fd]" },
                    { icon: "\uD83D\uDCBB", label: "Language", value: repoMeta.language || "N/A", bg: "bg-[#fde8e8]", hover: "hover:bg-[#fdc8c8]" },
                  ].map((stat) => (
                    <div
                      key={stat.label}
                      className={`retro-badge-stat ${stat.bg} ${stat.hover}`}
                      title={stat.label}
                    >
                      <span className="text-sm">{stat.icon}</span>
                      <span className="font-bold text-xs">{typeof stat.value === "number" ? stat.value.toLocaleString() : stat.value}</span>
                      <span className="retro-badge-tooltip">{stat.label}</span>
                    </div>
                  ))}
                </div>
              )}
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

            {/* AI-generated repo banner */}
            {(bannerImage || bannerLoading) && (
              <section className="retro-window">
                <div className="retro-titlebar retro-titlebar-purple px-3 py-1.5 flex items-center justify-between">
                  <span className="font-bold">AI Generated Banner</span>
                  <span className="text-[11px]">{bannerLoading && !bannerImage ? "GENERATING..." : "COMPLETE"}</span>
                </div>
                <div className="retro-window-body p-1">
                  {bannerLoading && !bannerImage ? (
                    <div className="p-6 text-center text-xs text-black/50 animate-pulse">
                      Generating retro pixel art banner...
                    </div>
                  ) : bannerImage ? (
                    <img
                      src={bannerImage}
                      alt="AI-generated repo banner"
                      className="w-full h-auto"
                      style={{ imageRendering: "pixelated" }}
                    />
                  ) : null}
                </div>
              </section>
            )}
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
                <span className="font-bold">File Explorer</span>
                <span className="text-[11px]">Click file for deep dive</span>
              </div>
              <div className="retro-window-body p-0">
                <div style={{ minHeight: "420px" }}>
                  <RepoTree
                    fileTree={fileTree}
                    repoName={repoMeta?.name ?? "repo"}
                    onExplainRequest={handleFileSelect}
                    explanation={explanation}
                    explanationStreaming={explanationStreaming}
                    experienceLevel={experienceLevel}
                    fileIcons={fileIcons}
                  />
                </div>
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
        <div className="retro-task-item flex items-center gap-1.5"><FishIcon size={14} /> FISHLENS</div>
        <div className="retro-task-item">Analyzer</div>
        <div className="retro-task-clock">
          {now ? now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "\u00A0"}
        </div>
      </footer>
    </div>
  );
}
