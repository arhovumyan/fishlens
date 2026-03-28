# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — start dev server (Turbopack) on localhost:3000
- `npm run build` — production build
- `npm run start` — serve production build
- `npm run lint` — run ESLint (flat config, `eslint.config.mjs`)

No test framework is configured yet.

## Architecture

Next.js App Router project (no `src/` directory). All routing lives under `app/`.

### API Routes (all under `app/api/`)

- `parse/` — POST: accepts `{ repoUrl }`, returns repo metadata, file tree, call graph, dependency graph, raw source files
- `explain/` — POST: accepts `{ repoUrl, filePath, experienceLevel }`, streams Gemini explanation for any file type. Uses cross-file context from dependency graph when available.
- `summary/` — POST: accepts `{ repoUrl, experienceLevel }`, streams Gemini repo summary with resolved dependency edges
- `issues/` — GET: `?repoUrl=...&experienceLevel=...`, returns GitHub issues with AI explanations and difficulty classification
- `health/` — GET: returns `{ status, timestamp }`

All explain/summary/parse routes share `lib/analyze.ts` → `getAnalysis()` which caches parsed results in-memory. They do NOT call each other over HTTP.

### Key Libraries (all under `lib/`)

- `github.ts` — `parseGitHubUrl(url)` and `fetchRepoData(owner, repo)` using Octokit. Fetches repo metadata, recursive file tree, and raw content of up to 80 non-binary text files (uses BINARY_EXT blacklist, not whitelist). Skips files over 100KB. Octokit auth is conditional — only passed when `GITHUB_TOKEN` is truthy and not a placeholder.
- `parser.ts` — `parseCodebase(rawFiles)` using web-tree-sitter. Extracts imports, exports, and function-level call graph from JS/TS files via AST traversal. Non-JS/TS files get empty call graph entries.
- `cache.ts` — `getCache(key)` / `setCache(key, value)`. In-memory, 50 entries max, 15-minute TTL, evicts oldest on overflow.
- `ai-cache.ts` — `getAICache(key)` / `setAICache(key, value)` / `aiCacheKey(...parts)`. Dedicated cache for Gemini AI responses. 200 entries max, 60-minute TTL. Keys include endpoint type + repo URL + file path + experience level. All explain/summary/issues routes check this cache before calling Gemini.
- `analyze.ts` — `getAnalysis(repoUrl)` — shared entry point that calls github → parser → dependency-graph → cache. Returns `AnalysisResult` including `dependencyGraph`.
- `dependency-graph.ts` — `buildDependencyGraph(callGraph, allFilePaths)`. Resolves import paths to actual files (relative, `@/` alias, npm externals). Tracks which symbols are used across file boundaries. Produces `DependencyGraph` with edges and per-file `FileDependencyInfo` (dependsOn, dependedOnBy).
- `gemini.ts` — `generateExplanation(prompt)` and `generateExplanationStream(prompt)`. Uses Gemini 2.5 Flash. Has `friendlyError()` for rate limit / auth issues.
- `prompts.ts` — `buildFileExplanationPrompt()` (with optional cross-file context), `buildGenericFilePrompt()` (for non-JS/TS files), `buildRepoSummaryPrompt()` (with optional dependency edges), `buildIssueExplanationPrompt()`. Experience-level-aware (junior/mid/senior). Word limits: 200 (summary), 250 (file), 100 (issue). Source truncation at 30K chars.

### Components

- `FileExplorer.tsx` — tree view of repo files, highlights selected file
- `ExplanationPanel.tsx` — renders AI file explanation as markdown (`react-markdown` + `remark-gfm`), experience-level badge, skeleton loading state
- `CallGraph.tsx` — Two-level Mermaid visualization:
  - **Repo view**: files as nodes grouped by directory via `subgraph`, dependency edges between them, color intensity by connection count. Click a file to drill in.
  - **File view**: per-file function diagram with imports, functions, and calls. Toggle to hide external imports.
  - Breadcrumb navigation between views. Zoom/pan, fullscreen overlay, clickable nodes with tooltips.
- `IssuesPanel.tsx` — GitHub issues list with difficulty badges and AI explanations

### Caching Strategy

Two separate in-memory caches:
1. **Repo data cache** (`lib/cache.ts`): Caches `AnalysisResult` (GitHub data + parsed call graph + dependency graph) by repo URL. 50 entries, 15-min TTL.
2. **AI response cache** (`lib/ai-cache.ts`): Caches Gemini responses by composite key (endpoint::repoUrl::filePath::level). 200 entries, 60-min TTL. Streaming responses are accumulated during delivery and cached after completion.

If 10 users analyze the same repo: GitHub API called once (cached), Gemini called once per unique file+level combo (cached).

### Markdown Rendering

Uses `react-markdown` + `remark-gfm`. Styled via `.prose-glitch` CSS class in `app/globals.css`. Applied in both `ExplanationPanel` and the summary section of `app/page.tsx`. The summary panel is collapsible.

### POST /api/parse Response Shape

```
{
  cache: "hit" | "miss",
  repoMeta: { name, description, language, stars },
  fileTree: [{ path, type: "file"|"dir", language }],
  callGraph: { [filePath]: { imports, exports, functions } },
  rawFiles: { [filePath]: rawSourceString },
  dependencyGraph: { edges: DependencyEdge[], fileInfo: { [filePath]: FileDependencyInfo } }
}
```

Error codes: 400 (bad URL), 404 (repo not found), 429 (rate limit), 500 (other).

### External Services

- **GitHub API** — via `@octokit/rest`, authenticated with `GITHUB_TOKEN` (conditional — skipped when missing/placeholder)
- **Google Gemini** — via `@google/generative-ai`, model `gemini-2.5-flash`, authenticated with `GEMINI_API_KEY`
- **Mermaid** — client-side diagram rendering with `securityLevel: "loose"` for click callbacks

### Tree-sitter Setup (IMPORTANT)

Uses `web-tree-sitter` (WASM) instead of native `tree-sitter` (won't compile on Node 25). Key config:
- `next.config.ts` must have `serverExternalPackages: ["web-tree-sitter", "tree-sitter-typescript", "tree-sitter-javascript"]`
- `tree-sitter-javascript` and `tree-sitter-typescript` installed with `--ignore-scripts` (only .wasm files are used)
- Import as named exports: `import { Parser, Language } from "web-tree-sitter"` (NOT default)

### Environment

Copy `.env.local.example` to `.env.local` and fill in real values. Required vars: `GITHUB_TOKEN`, `GEMINI_API_KEY`, `NEXT_PUBLIC_API_URL`.

### Path Aliases

`@/*` maps to the project root (configured in `tsconfig.json`).

### Deployment

Railway via Nixpacks (`railway.json`). Healthcheck at `/api/health`.

### Important: Next.js Version

This uses a recent Next.js with potential breaking changes from older versions. Consult `node_modules/next/dist/docs/` before using APIs that may have changed.

### Known Patterns & Gotchas

- Mermaid labels must be sanitized — chars like `[ ] " ( ) { } < > #` break diagram syntax. Use `sanitizeLabel()` in CallGraph.tsx.
- Fullscreen overlays need `e.stopPropagation()` on interactive children to prevent backdrop clicks from closing the modal.
- Any file type can be explained — JS/TS files use `buildFileExplanationPrompt()` (with call graph data), others use `buildGenericFilePrompt()` (source only).
- Gemini streaming responses are accumulated and cached after completion via `ai-cache.ts`.
- Dependency graph resolves imports to actual files: relative (`./`, `../`), alias (`@/`), and bare specifiers (npm → marked external).
- CallGraph has two view modes: "repo" (dependency overview) and "file" (function-level detail). The component switches automatically when a file is selected.
