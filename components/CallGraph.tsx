"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { DependencyGraph } from "@/lib/dependency-graph";

interface CallGraphEntry {
  imports: string[];
  exports: string[];
  functions: Record<string, { calls: string[] }>;
}

function sanitizeId(s: string): string {
  return s.replace(/[^a-zA-Z0-9_]/g, "_");
}

function sanitizeLabel(s: string): string {
  return s.replace(/["\[\](){}<>#]/g, "");
}

// ── Repo-level diagram ────────────────────────────────────────────────
function buildRepoDiagram(
  dependencyGraph: DependencyGraph,
  callGraph: Record<string, CallGraphEntry>
): string {
  const lines: string[] = ["flowchart TB"];

  const internalEdges = dependencyGraph.edges.filter(
    (e) => e.type === "internal"
  );

  // Collect files that have at least one internal edge
  const connectedFiles = new Set<string>();
  for (const edge of internalEdges) {
    connectedFiles.add(edge.from);
    connectedFiles.add(edge.to);
  }

  // If no connections, show all callGraph files (up to 30)
  const filesToShow =
    connectedFiles.size > 0
      ? connectedFiles
      : new Set(Object.keys(callGraph).slice(0, 30));

  // Group files by top-level directory
  const groups = new Map<string, string[]>();
  for (const file of filesToShow) {
    const slashIdx = file.indexOf("/");
    const group = slashIdx !== -1 ? file.slice(0, slashIdx) : "root";
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group)!.push(file);
  }

  // Render subgraphs
  for (const [group, files] of groups) {
    const groupId = sanitizeId(group);
    lines.push(`  subgraph ${groupId}["${sanitizeLabel(group)}"]`);
    for (const file of files) {
      const id = sanitizeId(file);
      const label = sanitizeLabel(file.split("/").pop() ?? file);
      lines.push(`    ${id}["${label}"]`);

      // Color by connection count (more = brighter blue)
      const info = dependencyGraph.fileInfo[file];
      const connectionCount = info
        ? info.dependsOn.length + info.dependedOnBy.length
        : 0;
      if (connectionCount >= 4) {
        lines.push(
          `    style ${id} fill:#2563eb,color:#fff,stroke:#1d4ed8`
        );
      } else if (connectionCount >= 2) {
        lines.push(
          `    style ${id} fill:#1e40af,color:#e0e7ff,stroke:#1d4ed8`
        );
      } else {
        lines.push(
          `    style ${id} fill:#1e1e2e,color:#a1a1aa,stroke:#3f3f46`
        );
      }
    }
    lines.push(`  end`);
    lines.push(
      `  style ${groupId} fill:transparent,stroke:#27272a,color:#71717a`
    );
  }

  // Render edges
  const edgeSet = new Set<string>();
  for (const edge of internalEdges) {
    const key = `${edge.from}→${edge.to}`;
    if (edgeSet.has(key)) continue;
    edgeSet.add(key);
    const fromId = sanitizeId(edge.from);
    const toId = sanitizeId(edge.to);
    const label =
      edge.symbols.length > 0
        ? edge.symbols.slice(0, 3).join(", ") +
          (edge.symbols.length > 3
            ? ` +${edge.symbols.length - 3}`
            : "")
        : "";
    if (label) {
      lines.push(`  ${fromId} -->|"${sanitizeLabel(label)}"| ${toId}`);
    } else {
      lines.push(`  ${fromId} --> ${toId}`);
    }
  }

  // Click callbacks for navigation
  for (const file of filesToShow) {
    const id = sanitizeId(file);
    lines.push(`  click ${id} callback "navigate:${file}"`);
  }

  return lines.join("\n");
}

// ── File-level diagram ────────────────────────────────────────────────
function buildFileDiagram(
  entry: CallGraphEntry,
  filePath: string,
  hideExternalImports: boolean
): string {
  const lines: string[] = ["flowchart LR"];
  const fileName = filePath.split("/").pop() ?? filePath;
  const fileId = sanitizeId(fileName);

  lines.push(`  ${fileId}["${sanitizeLabel(fileName)}"]`);
  lines.push(`  style ${fileId} fill:#3b82f6,color:#fff,stroke:#1d4ed8`);

  if (!hideExternalImports) {
    entry.imports.forEach((imp) => {
      const impId = sanitizeId(imp);
      const label = sanitizeLabel(imp.split("/").pop() ?? imp);
      lines.push(`  ${impId}["${label}"] --> ${fileId}`);
      lines.push(
        `  style ${impId} fill:#27272a,color:#a1a1aa,stroke:#3f3f46`
      );
    });
  }

  Object.entries(entry.functions).forEach(([fnName, { calls }]) => {
    const fnId = sanitizeId(fnName);
    lines.push(`  ${fileId} --> ${fnId}("${sanitizeLabel(fnName)}()")`);
    lines.push(`  style ${fnId} fill:#1e1e2e,color:#c084fc,stroke:#7c3aed`);

    calls.forEach((call) => {
      const callId = sanitizeId(call) + "_call";
      lines.push(`  ${fnId} --> ${callId}["${sanitizeLabel(call)}()"]`);
      lines.push(
        `  style ${callId} fill:#1e1e2e,color:#fbbf24,stroke:#a16207`
      );
    });
  });

  // Click callbacks
  lines.push(`  click ${fileId} callback "file:${sanitizeLabel(fileName)}"`);
  entry.imports.forEach((imp) => {
    const impId = sanitizeId(imp);
    lines.push(`  click ${impId} callback "import:${sanitizeLabel(imp)}"`);
  });
  Object.entries(entry.functions).forEach(([fnName, { calls }]) => {
    const fnId = sanitizeId(fnName);
    lines.push(
      `  click ${fnId} callback "function:${sanitizeLabel(fnName)}"`
    );
    calls.forEach((call) => {
      const callId = sanitizeId(call) + "_call";
      lines.push(`  click ${callId} callback "call:${sanitizeLabel(call)}"`);
    });
  });

  return lines.join("\n");
}

// ── Zoom/pan hook ──────────────────────────────────────────────────────
function useZoomPan() {
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const dragging = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setScale((s) => Math.min(Math.max(0.3, s + delta), 4));
  }, []);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 1 || !(e.target as HTMLElement).closest(".node")) {
      dragging.current = true;
      lastPos.current = { x: e.clientX, y: e.clientY };
      e.preventDefault();
    }
  }, []);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging.current) return;
    const dx = e.clientX - lastPos.current.x;
    const dy = e.clientY - lastPos.current.y;
    lastPos.current = { x: e.clientX, y: e.clientY };
    setTranslate((t) => ({ x: t.x + dx, y: t.y + dy }));
  }, []);

  const onMouseUp = useCallback(() => {
    dragging.current = false;
  }, []);

  const reset = useCallback(() => {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
  }, []);

  const zoomIn = useCallback(
    () => setScale((s) => Math.min(s + 0.25, 4)),
    []
  );
  const zoomOut = useCallback(
    () => setScale((s) => Math.max(s - 0.25, 0.3)),
    []
  );

  const style: React.CSSProperties = {
    transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
    transformOrigin: "center center",
    transition: dragging.current ? "none" : "transform 0.15s ease-out",
  };

  return {
    scale,
    style,
    handlers: {
      onWheel,
      onMouseDown,
      onMouseMove,
      onMouseUp,
      onMouseLeave: onMouseUp,
    },
    zoomIn,
    zoomOut,
    reset,
  };
}

// ── Tooltip for clicked nodes ──────────────────────────────────────────
interface NodeInfo {
  type: string;
  name: string;
  x: number;
  y: number;
}

// ── Main Component ────────────────────────────────────────────────────
export default function CallGraph({
  entry,
  filePath,
  dependencyGraph,
  callGraph,
  onFileNavigate,
}: {
  entry: CallGraphEntry | null;
  filePath: string | null;
  dependencyGraph?: DependencyGraph;
  callGraph?: Record<string, CallGraphEntry>;
  onFileNavigate?: (filePath: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fullscreenSvgRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [svgContent, setSvgContent] = useState<string>("");
  const [fullscreen, setFullscreen] = useState(false);
  const [selectedNode, setSelectedNode] = useState<NodeInfo | null>(null);
  const [viewMode, setViewMode] = useState<"repo" | "file">("repo");
  const [hideExternalImports, setHideExternalImports] = useState(false);

  const inlineZoom = useZoomPan();
  const fullscreenZoom = useZoomPan();

  // Switch to file view when a file is selected
  useEffect(() => {
    if (filePath && entry) {
      setViewMode("file");
    }
  }, [filePath, entry]);

  // Close on Escape
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setFullscreen(false);
        setSelectedNode(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  // Set up click handlers on Mermaid nodes
  const attachClickHandlers = useCallback(
    (container: HTMLElement) => {
      const nodes = container.querySelectorAll(".node");
      nodes.forEach((node) => {
        const el = node as HTMLElement;
        el.style.cursor = "pointer";
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          const rect = el.getBoundingClientRect();
          const label =
            el.querySelector(".nodeLabel")?.textContent ?? el.id;

          // Check if this is a navigation click (repo view → file)
          const nodeId = el.id;
          if (viewMode === "repo" && onFileNavigate) {
            // Find the file path from the node ID
            const allFiles = callGraph ? Object.keys(callGraph) : [];
            const matched = allFiles.find(
              (f) => sanitizeId(f) === nodeId.replace(/^flowchart-/, "").replace(/-\d+$/, "")
            );
            if (matched) {
              onFileNavigate(matched);
              return;
            }
          }

          // Determine node type from styling
          const fill =
            el
              .querySelector("rect, polygon, .label-container")
              ?.getAttribute("style") ?? "";
          let type = "node";
          if (fill.includes("#3b82f6") || fill.includes("#2563eb") || fill.includes("#1e40af"))
            type = viewMode === "repo" ? "File" : "Current File";
          else if (fill.includes("#27272a")) type = "Import";
          else if (fill.includes("#c084fc") || fill.includes("#7c3aed"))
            type = "Function";
          else if (fill.includes("#fbbf24") || fill.includes("#a16207"))
            type = "Called Function";

          setSelectedNode({
            type,
            name: label,
            x: rect.left + rect.width / 2,
            y: rect.top,
          });
        });
      });
    },
    [viewMode, callGraph, onFileNavigate]
  );

  // Render diagram
  useEffect(() => {
    let diagram: string | null = null;

    if (viewMode === "repo" && dependencyGraph && callGraph) {
      const hasEdges = dependencyGraph.edges.some(
        (e) => e.type === "internal"
      );
      if (!hasEdges && Object.keys(callGraph).length === 0) {
        setError("No dependency data available");
        setSvgContent("");
        return;
      }
      diagram = buildRepoDiagram(dependencyGraph, callGraph);
    } else if (viewMode === "file" && entry && filePath) {
      const isEmpty =
        entry.imports.length === 0 &&
        entry.exports.length === 0 &&
        Object.keys(entry.functions).length === 0;

      if (isEmpty) {
        const isJsTsFile = /\.(ts|tsx|js|jsx)$/.test(filePath);
        setError(
          isJsTsFile
            ? "No call graph data for this file"
            : "Structural analysis is available for JavaScript and TypeScript files"
        );
        setSvgContent("");
        return;
      }
      diagram = buildFileDiagram(entry, filePath, hideExternalImports);
    } else if (viewMode === "repo") {
      setError(null);
      setSvgContent("");
      return;
    } else {
      setError(null);
      setSvgContent("");
      return;
    }

    if (!diagram) return;

    setError(null);
    setSelectedNode(null);

    let cancelled = false;

    (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: "dark",
          securityLevel: "loose",
          themeVariables: {
            darkMode: true,
            background: "#09090b",
            primaryColor: "#3b82f6",
            primaryTextColor: "#fafafa",
            lineColor: "#3f3f46",
          },
        });

        if (cancelled) return;

        const id = `mermaid-${Date.now()}`;
        const { svg } = await mermaid.render(id, diagram);
        if (!cancelled) {
          setSvgContent(svg);
          if (containerRef.current) {
            containerRef.current.innerHTML = svg;
            attachClickHandlers(containerRef.current);
          }
        }
      } catch (err) {
        console.error("[CallGraph] Mermaid render error:", err);
        if (!cancelled) {
          setError("Failed to render graph");
          setSvgContent("");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    viewMode,
    entry,
    filePath,
    dependencyGraph,
    callGraph,
    hideExternalImports,
    attachClickHandlers,
  ]);

  // Sync fullscreen container
  useEffect(() => {
    if (fullscreen && fullscreenSvgRef.current && svgContent) {
      fullscreenSvgRef.current.innerHTML = svgContent;
      attachClickHandlers(fullscreenSvgRef.current);
      fullscreenZoom.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullscreen, svgContent, attachClickHandlers]);

  const openFullscreen = useCallback(() => {
    if (svgContent) {
      setFullscreen(true);
      setSelectedNode(null);
    }
  }, [svgContent]);

  // ── Zoom controls sub-component ──────────────────────────────────────
  const ZoomControls = ({
    zoom,
    className,
  }: {
    zoom: {
      scale: number;
      zoomIn: () => void;
      zoomOut: () => void;
      reset: () => void;
    };
    className?: string;
  }) => (
    <div className={`flex items-center gap-1 ${className ?? ""}`}>
      <button
        onClick={zoom.zoomOut}
        className="w-7 h-7 flex items-center justify-center rounded bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors text-sm font-bold"
        title="Zoom out"
      >
        &minus;
      </button>
      <button
        onClick={zoom.reset}
        className="h-7 px-2 flex items-center justify-center rounded bg-zinc-800 text-zinc-500 hover:text-white hover:bg-zinc-700 transition-colors text-xs tabular-nums"
        title="Reset zoom"
      >
        {Math.round(zoom.scale * 100)}%
      </button>
      <button
        onClick={zoom.zoomIn}
        className="w-7 h-7 flex items-center justify-center rounded bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors text-sm font-bold"
        title="Zoom in"
      >
        +
      </button>
    </div>
  );

  // ── No content states ─────────────────────────────────────────────────
  if (!filePath && viewMode === "file") {
    return (
      <div className="h-full flex items-center justify-center text-zinc-600 text-sm">
        Select a file to view its call graph
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex flex-col">
        <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-zinc-500 border-b border-zinc-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            {viewMode === "file" && (
              <button
                onClick={() => {
                  setViewMode("repo");
                  inlineZoom.reset();
                }}
                className="text-blue-400 hover:text-blue-300 transition-colors text-[10px]"
              >
                Repo
              </button>
            )}
            {viewMode === "file" && (
              <span className="text-zinc-700">/</span>
            )}
            <span>
              {viewMode === "repo" ? "Dependencies" : "Call Graph"}
            </span>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center text-zinc-600 text-sm px-4 text-center">
          {error}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="h-full flex flex-col overflow-hidden">
        {/* Header with breadcrumb, filters, zoom, fullscreen */}
        <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-zinc-500 border-b border-zinc-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            {/* Breadcrumb */}
            {viewMode === "file" && (
              <button
                onClick={() => {
                  setViewMode("repo");
                  inlineZoom.reset();
                }}
                className="text-blue-400 hover:text-blue-300 transition-colors text-[10px]"
              >
                Repo
              </button>
            )}
            {viewMode === "file" && (
              <span className="text-zinc-700">/</span>
            )}
            <span>
              {viewMode === "repo" ? "Dependencies" : "Call Graph"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {/* Filter toggle — file view only */}
            {viewMode === "file" && entry && entry.imports.length > 0 && (
              <button
                onClick={() => setHideExternalImports((h) => !h)}
                className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${
                  hideExternalImports
                    ? "bg-zinc-700 text-zinc-300"
                    : "bg-zinc-800/50 text-zinc-500 hover:text-zinc-300"
                }`}
                title="Toggle external imports"
              >
                Imports {hideExternalImports ? "off" : "on"}
              </button>
            )}
            {svgContent && <ZoomControls zoom={inlineZoom} />}
            {svgContent && (
              <button
                onClick={openFullscreen}
                className="text-zinc-500 hover:text-zinc-200 transition-colors ml-1"
                title="View fullscreen"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="15 3 21 3 21 9" />
                  <polyline points="9 21 3 21 3 15" />
                  <line x1="21" y1="3" x2="14" y2="10" />
                  <line x1="3" y1="21" x2="10" y2="14" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Zoomable diagram */}
        <div
          className="flex-1 overflow-hidden cursor-grab active:cursor-grabbing"
          {...inlineZoom.handlers}
        >
          <div style={inlineZoom.style}>
            <div
              ref={containerRef}
              className="p-4"
              onClick={(e) => {
                if (e.detail === 2) openFullscreen();
              }}
            />
          </div>
        </div>

        {/* Hint */}
        {svgContent && (
          <div className="text-center text-[10px] text-zinc-600 py-1 border-t border-zinc-800/50 shrink-0">
            {viewMode === "repo"
              ? "Click file to drill in · Scroll to zoom · Drag to pan"
              : "Scroll to zoom · Drag to pan · Click node for info · Double-click to expand"}
          </div>
        )}
      </div>

      {/* Node info tooltip */}
      {selectedNode && (
        <div
          className="fixed z-[110] bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl px-3 py-2 text-xs pointer-events-none"
          style={{
            left: selectedNode.x,
            top: selectedNode.y - 8,
            transform: "translate(-50%, -100%)",
          }}
        >
          <div className="text-zinc-400">{selectedNode.type}</div>
          <div className="text-zinc-100 font-mono font-medium">
            {selectedNode.name}
          </div>
        </div>
      )}

      {/* Fullscreen overlay */}
      {fullscreen && (
        <div
          className="fixed inset-0 z-[100] bg-zinc-950/95 flex flex-col"
          onClick={() => {
            setFullscreen(false);
            setSelectedNode(null);
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-6 py-3 border-b border-zinc-800 shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-zinc-300">
                {viewMode === "repo"
                  ? "Repository Dependencies"
                  : `Call Graph — ${filePath}`}
              </span>
              {/* Filter toggle in fullscreen */}
              {viewMode === "file" &&
                entry &&
                entry.imports.length > 0 && (
                  <button
                    onClick={() => setHideExternalImports((h) => !h)}
                    className={`text-xs px-2 py-0.5 rounded transition-colors ${
                      hideExternalImports
                        ? "bg-zinc-700 text-zinc-300"
                        : "bg-zinc-800 text-zinc-500 hover:text-zinc-300"
                    }`}
                  >
                    Imports {hideExternalImports ? "off" : "on"}
                  </button>
                )}
            </div>
            <div className="flex items-center gap-3">
              <ZoomControls zoom={fullscreenZoom} />
              <button
                onClick={() => {
                  setFullscreen(false);
                  setSelectedNode(null);
                }}
                className="text-zinc-400 hover:text-white text-xl leading-none transition-colors px-2"
              >
                &times;
              </button>
            </div>
          </div>

          {/* Zoomable area */}
          <div
            className="flex-1 overflow-hidden cursor-grab active:cursor-grabbing"
            onClick={(e) => e.stopPropagation()}
            {...fullscreenZoom.handlers}
          >
            <div
              className="w-full h-full flex items-center justify-center"
              style={fullscreenZoom.style}
            >
              <div ref={fullscreenSvgRef} className="p-8" />
            </div>
          </div>

          <div
            className="text-center text-xs text-zinc-600 py-2 border-t border-zinc-800/50"
            onClick={(e) => e.stopPropagation()}
          >
            Scroll to zoom · Drag to pan · Click nodes for info · Press
            Escape to close
          </div>
        </div>
      )}
    </>
  );
}
