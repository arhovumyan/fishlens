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

export function buildFileExplanationPrompt(
  filePath: string,
  fileSource: string,
  callGraphEntry: {
    imports: string[];
    exports: string[];
    functions: Record<string, { calls: string[] }>;
  },
  experienceLevel: ExperienceLevel
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

  return `${LEVEL_INSTRUCTIONS[experienceLevel]}

${FORMAT_RULES}

Keep your response under 250 words. Cover:
1. **Purpose** — what this file does in one sentence
2. **Key functions** — what the important functions do (skip trivial ones)
3. **Data flow** — how data moves through this file

File: ${filePath}
${imports}
${exports}

Functions:
${functions || "No functions detected."}

Source code:
\`\`\`
${fileSource}
\`\`\``;
}

export function buildRepoSummaryPrompt(
  fileTree: Array<{ path: string }>,
  callGraph: Record<string, { imports: string[]; exports: string[] }>,
  repoMeta: { name: string; description: string },
  experienceLevel: ExperienceLevel
): string {
  const fileList = fileTree.map((f) => f.path).join("\n");

  const moduleSummary = Object.entries(callGraph)
    .map(
      ([file, { imports, exports }]) =>
        `- ${file}: imports [${imports.join(", ")}], exports [${exports.join(", ")}]`
    )
    .join("\n");

  return `${LEVEL_INSTRUCTIONS[experienceLevel]}

${FORMAT_RULES}

Keep your response under 200 words. Provide a tight summary covering:
1. **What it does** — one sentence
2. **Architecture** — key directories and their roles (3-5 bullets max)
3. **Tech stack** — frameworks and key dependencies

Repository: ${repoMeta.name}
Description: ${repoMeta.description || "No description provided."}

File tree:
${fileList}

Module dependency overview:
${moduleSummary || "No module data available."}`;
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
