# GEMINI.md

This file provides foundational mandates and contextual guidance for Gemini CLI when working in this repository. These instructions take precedence over general workflows.

## Project Overview

**GLITCH** is an AI-powered codebase explainer that analyzes public GitHub repositories. It generates interactive explanations, visual call graphs, and issue breakdowns using AST analysis and Large Language Models.

- **Main Technologies:** Next.js 15+ (App Router), TypeScript, Tailwind CSS, Google Gemini 2.0 Flash, Octokit, web-tree-sitter (WASM), Mermaid.js.
- **Key Features:**
    - AST-based parsing of TypeScript/JavaScript for dependency mapping.
    - Streaming AI explanations tailored to experience levels (Junior, Mid, Senior).
    - Interactive Mermaid call graphs with zoom/pan.
    - GitHub Issue difficulty classification and AI-assisted explanations.
    - In-memory caching for optimized performance.

## Architecture

The project follows a standard Next.js App Router structure without a `src/` directory.

- `app/api/`: Contains all backend logic.
    - `parse/`: Entry point for repository ingestion and AST parsing.
    - `explain/`: Streams file-specific explanations.
    - `summary/`: Streams repository-wide summaries.
    - `issues/`: Fetches and classifies GitHub issues.
- `lib/`: Core utility modules.
    - `analyze.ts`: Orchestrates the analysis flow (GitHub -> Parser -> Cache).
    - `parser.ts`: Uses `web-tree-sitter` for AST traversal and call graph extraction.
    - `gemini.ts`: Wrapper for Google Generative AI with streaming support.
    - `github.ts`: Handles repository cloning (virtual) and file fetching via Octokit.
    - `cache.ts`: Simple in-memory TTL cache for analysis results.
- `components/`: UI layer using React and Tailwind CSS.

## Building and Running

### Development
- **Start Dev Server:** `npm run dev` (runs on `localhost:3000`)
- **Linting:** `npm run lint`

### Production
- **Build:** `npm run build`
- **Start:** `npm run start`

### Configuration
- Required environment variables (see `.env.local.example`):
    - `GITHUB_TOKEN`: For GitHub API access.
    - `GEMINI_API_KEY`: For Google Gemini 2.0 Flash access.
    - `NEXT_PUBLIC_API_URL`: Base URL for API calls.

## Development Conventions

### Code Style & Standards
- **TypeScript:** Strict typing is preferred. Use interfaces for data structures (e.g., `RepoMeta`, `CallGraphEntry`).
- **Next.js:** Use Server Components where possible, but UI-heavy components (FileExplorer, CallGraph, etc.) must be `'use client'`.
- **Styling:** Tailwind CSS with modern utilities. Custom prose styling in `globals.css` (`.prose-glitch`).

### Tree-sitter Usage (Critical)
- We use `web-tree-sitter` (WASM) to ensure compatibility across environments.
- **Do not** use native `tree-sitter` bindings.
- When adding new languages, update `next.config.ts`'s `serverExternalPackages` and ensure `.wasm` files are available in `node_modules`.

### AI & Streaming
- Gemini explanations must be streamed to the client using `ReadableStream` and `TextEncoder`.
- Prompts are managed in `lib/prompts.ts` and must respect word limits and experience levels.

### UI/UX
- Mermaid diagrams must be sanitized using `sanitizeLabel()` to prevent syntax errors.
- Use `react-markdown` with `remark-gfm` for all AI-generated content.
- Components should handle loading states (skeletons) and errors gracefully.

## Testing Strategy
- *Currently, no automated test suite is configured.*
- For manual verification: Ensure `POST /api/parse` returns a valid call graph and that streaming endpoints (`/api/explain`, `/api/summary`) deliver incremental text chunks.
