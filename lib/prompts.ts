import type { DependencyEdge } from "@/lib/dependency-graph";

type ExperienceLevel = "junior" | "mid" | "senior";

const LEVEL_INSTRUCTIONS: Record<ExperienceLevel, string> = {
  junior:
    "Explain to a developer who knows basic programming but is new to this codebase. Be clear and practical. Explain what each key function does in one sentence.",
  mid:
    "Explain to a developer comfortable with TypeScript and React but unfamiliar with this codebase. Focus on design decisions and data flow.",
  senior:
    "Explain to a senior engineer. Focus on architecture, tradeoffs, and coupling. Skip syntax explanation. Be terse.",
};

const FORMAT_RULES =
  "Format with markdown. Use **bold** for key terms, `code` for identifiers, and short bullet lists. No filler sentences. No greetings. Start directly with the content.";

const MAX_SOURCE_CHARS = 30_000;

function truncateSource(source: string): string {
  if (source.length <= MAX_SOURCE_CHARS) return source;
  return (
    source.slice(0, MAX_SOURCE_CHARS) +
    `\n\n[Truncated at ${MAX_SOURCE_CHARS.toLocaleString()} characters. Total: ${source.length.toLocaleString()} characters.]`
  );
}

export function buildFileExplanationPrompt(
  filePath: string,
  fileSource: string,
  callGraphEntry: {
    imports: string[];
    exports: string[];
    functions: Record<string, { calls: string[] }>;
  },
  experienceLevel: ExperienceLevel,
  crossFileContext?: {
    dependsOn: Array<{ file: string; symbols: string[] }>;
    dependedOnBy: Array<{ file: string; symbols: string[] }>;
  }
): string {
  const imports = callGraphEntry.imports.length
    ? `Imports: ${callGraphEntry.imports.join(", ")}`
    : "No imports.";
  const exports = callGraphEntry.exports.length
    ? `Exports: ${callGraphEntry.exports.join(", ")}`
    : "No exports.";

  const functions = Object.entries(callGraphEntry.functions)
    .map(
      ([name, { calls }]) =>
        `- ${name}()${calls.length ? ` → calls: ${calls.join(", ")}` : ""}`
    )
    .join("\n");

  let crossFileSection = "";
  if (crossFileContext) {
    const deps = crossFileContext.dependsOn;
    const consumers = crossFileContext.dependedOnBy;
    if (deps.length > 0 || consumers.length > 0) {
      crossFileSection = "\n\nCross-file relationships:";
      if (deps.length > 0) {
        crossFileSection += "\nThis file imports from:";
        for (const d of deps) {
          crossFileSection += `\n- ${d.file}${d.symbols.length ? ` (uses: ${d.symbols.join(", ")})` : ""}`;
        }
      }
      if (consumers.length > 0) {
        crossFileSection += "\nThis file is imported by:";
        for (const c of consumers) {
          crossFileSection += `\n- ${c.file}${c.symbols.length ? ` (uses: ${c.symbols.join(", ")})` : ""}`;
        }
      }
    }
  }

  return `${LEVEL_INSTRUCTIONS[experienceLevel]}

${FORMAT_RULES}

Keep your response under 250 words. Cover:
1. **Purpose** — what this file does in one sentence
2. **Key functions** — what the important functions do (skip trivial ones)
3. **Data flow** — how data moves through this file
${crossFileContext ? "4. **Connections** — how this file connects to the rest of the codebase" : ""}

File: ${filePath}
${imports}
${exports}

Functions:
${functions || "No functions detected."}
${crossFileSection}

Source code:
\`\`\`
${truncateSource(fileSource)}
\`\`\``;
}

export function buildGenericFilePrompt(
  filePath: string,
  fileSource: string,
  experienceLevel: ExperienceLevel
): string {
  return `${LEVEL_INSTRUCTIONS[experienceLevel]}

${FORMAT_RULES}

Keep your response under 250 words. Cover:
1. **Purpose** — what this file does in one sentence
2. **Key sections** — the important parts and what they configure or define
3. **Context** — how this file likely fits in the project

File: ${filePath}

Source:
\`\`\`
${truncateSource(fileSource)}
\`\`\``;
}

export function buildRepoSummaryPrompt(
  fileTree: Array<{ path: string }>,
  callGraph: Record<string, { imports: string[]; exports: string[] }>,
  repoMeta: { name: string; description: string },
  experienceLevel: ExperienceLevel,
  dependencyEdges?: DependencyEdge[]
): string {
  const fileList = fileTree.map((f) => f.path).join("\n");

  const moduleSummary = Object.entries(callGraph)
    .map(
      ([file, { imports, exports }]) =>
        `- ${file}: imports [${imports.join(", ")}], exports [${exports.join(", ")}]`
    )
    .join("\n");

  let depSection = "";
  if (dependencyEdges && dependencyEdges.length > 0) {
    const internal = dependencyEdges.filter((e) => e.type === "internal");
    if (internal.length > 0) {
      depSection = "\n\nResolved file dependencies:";
      for (const edge of internal.slice(0, 40)) {
        depSection += `\n- ${edge.from} → ${edge.to}${edge.symbols.length ? ` (${edge.symbols.join(", ")})` : ""}`;
      }
      if (internal.length > 40) {
        depSection += `\n... and ${internal.length - 40} more connections`;
      }
    }
  }

  return `${LEVEL_INSTRUCTIONS[experienceLevel]}

${FORMAT_RULES}

Keep your response under 200 words. Provide a tight summary covering:
1. **What it does** — one sentence
2. **Architecture** — key directories and their roles (3-5 bullets max)
3. **Tech stack** — frameworks and key dependencies
4. **Key connections** — how the main modules connect to each other

Repository: ${repoMeta.name}
Description: ${repoMeta.description || "No description provided."}

File tree:
${fileList}

Module dependency overview:
${moduleSummary || "No module data available."}
${depSection}`;
}

export function buildIssueExplanationPrompt(
  issue: { title: string; body: string; labels: string[] },
  experienceLevel: ExperienceLevel
): string {
  return `${LEVEL_INSTRUCTIONS[experienceLevel]}

${FORMAT_RULES}

Keep your response under 100 words. Explain what this issue is about and where to start.

Title: ${issue.title}
Labels: ${issue.labels.length ? issue.labels.join(", ") : "none"}

Body:
${issue.body || "No description provided."}`;
}
