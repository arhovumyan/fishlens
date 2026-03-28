"use client";

import { useEffect, useRef, useState } from "react";

interface CallGraphEntry {
  imports: string[];
  exports: string[];
  functions: Record<string, { calls: string[] }>;
}

function sanitizeId(s: string): string {
  return s.replace(/[^a-zA-Z0-9_]/g, "_");
}

function sanitizeLabel(s: string): string {
  // Escape characters that break Mermaid label syntax: " [ ] ( ) { } < > #
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

  // Imports → current file
  entry.imports.forEach((imp) => {
    const impId = sanitizeId(imp);
    const label = sanitizeLabel(imp.split("/").pop() ?? imp);
    lines.push(`  ${impId}["${label}"] --> ${fileId}`);
    lines.push(`  style ${impId} fill:#27272a,color:#a1a1aa,stroke:#3f3f46`);
  });

  // Functions in this file
  Object.entries(entry.functions).forEach(([fnName, { calls }]) => {
    const fnId = sanitizeId(fnName);
    lines.push(`  ${fileId} --> ${fnId}("${sanitizeLabel(fnName)}()")`);
    lines.push(`  style ${fnId} fill:#1e1e2e,color:#c084fc,stroke:#7c3aed`);

    // Calls from function
    calls.forEach((call) => {
      const callId = sanitizeId(call) + "_call";
      lines.push(`  ${fnId} --> ${callId}["${sanitizeLabel(call)}()"]`);
      lines.push(
        `  style ${callId} fill:#1e1e2e,color:#fbbf24,stroke:#a16207`
      );
    });
  });

  return lines.join("\n");
}

export default function CallGraph({
  entry,
  filePath,
}: {
  entry: CallGraphEntry | null;
  filePath: string | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!entry || !filePath || !containerRef.current) return;

    const isEmpty =
      entry.imports.length === 0 &&
      entry.exports.length === 0 &&
      Object.keys(entry.functions).length === 0;

    if (isEmpty) {
      setError("No call graph available for this file");
      return;
    }

    setError(null);
    const diagram = buildMermaidDiagram(entry, filePath);

    let cancelled = false;

    (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: "dark",
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
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg;
        }
      } catch (err) {
        console.error("[CallGraph] Mermaid render error:", err);
        if (!cancelled) {
          setError("Failed to render call graph");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [entry, filePath]);

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

  return (
    <div className="h-full overflow-auto">
      <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-zinc-500 border-b border-zinc-800">
        Call Graph
      </div>
      <div ref={containerRef} className="p-4" />
    </div>
  );
}
