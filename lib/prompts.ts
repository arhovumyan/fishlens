type ExperienceLevel = "junior" | "mid" | "senior";

const LEVEL_INSTRUCTIONS: Record<ExperienceLevel, string> = {
  junior:
    "You are explaining this to a developer who understands basic programming but is brand new to this codebase. Name every function involved. Explain what each function does in one plain English sentence. Walk through the data flow step by step. Explain what each import is for. Do not assume knowledge of any framework.",
  mid:
    "You are explaining this to a developer comfortable with TypeScript and common Node.js/React patterns but unfamiliar with this specific codebase. Focus on design decisions, data flow, and why things are structured this way.",
  senior:
    "You are explaining this to a senior engineer. Focus on architecture, module boundaries, coupling, cohesion, and tradeoffs. Skip all syntax explanation. Be concise. Flag technical debt or areas of concern if you see any.",
};

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

Explain the following file: ${filePath}

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

Summarize this repository.

Repository: ${repoMeta.name}
Description: ${repoMeta.description || "No description provided."}

File tree:
${fileList}

Module dependency overview:
${moduleSummary || "No module data available."}

Provide a clear summary of what this codebase does, how it is organized, and the key modules and their responsibilities.`;
}

export function buildIssueExplanationPrompt(
  issue: { title: string; body: string; labels: string[] },
  experienceLevel: ExperienceLevel
): string {
  return `${LEVEL_INSTRUCTIONS[experienceLevel]}

Explain the following GitHub issue to a developer so they can understand what needs to be done and where to start.

Title: ${issue.title}
Labels: ${issue.labels.length ? issue.labels.join(", ") : "none"}

Body:
${issue.body || "No description provided."}

Provide a concise explanation of what the issue is about, what changes are likely needed, and any relevant context.`;
}
