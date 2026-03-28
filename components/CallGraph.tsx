"use client";

import { useEffect, useRef, useState, useCallback } from "react";

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

function buildMermaidDiagram(
  entry: CallGraphEntry,
  filePath: string
): string {
  const lines: string[] = ["flowchart LR"];
  const fileName = filePath.split("/").pop() ?? filePath;
  const fileId = sanitizeId(fileName);

  lines.push(`  ${fileId}["${sanitizeLabel(fileName)}"]`);
  lines.push(`  style ${fileId} fill:#3b82f6,color:#fff,stroke:#1d4ed8`);

  entry.imports.forEach((imp) => {
    const impId = sanitizeId(imp);
    const label = sanitizeLabel(imp.split("/").pop() ?? imp);
    lines.push(`  ${impId}["${label}"] --> ${fileId}`);
    lines.push(`  style ${impId} fill:#27272a,color:#a1a1aa,stroke:#3f3f46`);
  });

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

  // Add click callbacks — Mermaid supports click nodeId callback
  lines.push(`  click ${fileId} callback "file:${sanitizeLabel(fileName)}"`);
  entry.imports.forEach((imp) => {
    const impId = sanitizeId(imp);
    lines.push(`  click ${impId} callback "import:${sanitizeLabel(imp)}"`);
  });
  Object.entries(entry.functions).forEach(([fnName, { calls }]) => {
    const fnId = sanitizeId(fnName);
    lines.push(`  click ${fnId} callback "function:${sanitizeLabel(fnName)}"`);
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
    // Only start drag on middle click or when not clicking a node
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

  const zoomIn = useCallback(() => setScale((s) => Math.min(s + 0.25, 4)), []);
  const zoomOut = useCallback(() => setScale((s) => Math.max(s - 0.25, 0.3)), []);

  const style: React.CSSProperties = {
    transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
    transformOrigin: "center center",
    transition: dragging.current ? "none" : "transform 0.15s ease-out",
  };

  return {
    scale,
    style,
    handlers: { onWheel, onMouseDown, onMouseMove, onMouseUp, onMouseLeave: onMouseUp },
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

export default function CallGraph({
  entry,
  filePath,
}: {
  entry: CallGraphEntry | null;
  filePath: string | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fullscreenSvgRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [svgContent, setSvgContent] = useState<string>("");
  const [fullscreen, setFullscreen] = useState(false);
  const [selectedNode, setSelectedNode] = useState<NodeInfo | null>(null);

  const inlineZoom = useZoomPan();
  const fullscreenZoom = useZoomPan();

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
      // Mermaid renders click callbacks by adding click events
      // We intercept clicks on .node elements directly
      const nodes = container.querySelectorAll(".node");
      nodes.forEach((node) => {
        const el = node as HTMLElement;
        el.style.cursor = "pointer";
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          const rect = el.getBoundingClientRect();
          const label = el.querySelector(".nodeLabel")?.textContent ?? el.id;
          // Determine node type from styling
          const fill = el.querySelector("rect, polygon, .label-container")?.getAttribute("style") ?? "";
          let type = "node";
          if (fill.includes("#3b82f6")) type = "Current File";
          else if (fill.includes("#27272a")) type = "Import";
          else if (fill.includes("#c084fc") || fill.includes("#7c3aed")) type = "Function";
          else if (fill.includes("#fbbf24") || fill.includes("#a16207")) type = "Called Function";

          setSelectedNode({
            type,
            name: label,
            x: rect.left + rect.width / 2,
            y: rect.top,
          });
        });
      });
    },
    []
  );

  // Render diagram
  useEffect(() => {
    if (!entry || !filePath) return;

    const isEmpty =
      entry.imports.length === 0 &&
      entry.exports.length === 0 &&
      Object.keys(entry.functions).length === 0;

    if (isEmpty) {
      setError("No call graph available for this file");
      setSvgContent("");
      return;
    }

    setError(null);
    setSelectedNode(null);
    const diagram = buildMermaidDiagram(entry, filePath);

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
          setError("Failed to render call graph");
          setSvgContent("");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [entry, filePath, attachClickHandlers]);

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

  if (!filePath) {
    return (
      <div className="h-full flex items-center justify-center text-zinc-600 text-sm">
        Select a file to view its call graph
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center text-zinc-600 text-sm px-4 text-center">
        {error}
      </div>
    );
  }

  const ZoomControls = ({
    zoom,
    className,
  }: {
    zoom: { scale: number; zoomIn: () => void; zoomOut: () => void; reset: () => void };
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

  return (
    <>
      <div className="h-full flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-zinc-500 border-b border-zinc-800 flex items-center justify-between shrink-0">
          <span>Call Graph</span>
          <div className="flex items-center gap-2">
            {svgContent && <ZoomControls zoom={inlineZoom} />}
            {svgContent && (
              <button
                onClick={openFullscreen}
                className="text-zinc-500 hover:text-zinc-200 transition-colors ml-1"
                title="View fullscreen"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
                // Open fullscreen on double-click
                if (e.detail === 2) openFullscreen();
              }}
            />
          </div>
        </div>

        {/* Hint */}
        {svgContent && (
          <div className="text-center text-[10px] text-zinc-600 py-1 border-t border-zinc-800/50 shrink-0">
            Scroll to zoom · Drag to pan · Click node for info · Double-click to expand
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
          <div className="text-zinc-100 font-mono font-medium">{selectedNode.name}</div>
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
            <span className="text-sm font-semibold text-zinc-300">
              Call Graph — {filePath}
            </span>
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
            Scroll to zoom · Drag to pan · Click nodes for info · Press Escape to close
          </div>
        </div>
      )}
    </>
  );
}
