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

- `parse/` — code parsing (tree-sitter via `web-tree-sitter`)
- `explain/` — code explanation (Gemini via `@google/generative-ai`)
- `summary/` — repository summarization
- `issues/` — GitHub issues integration (`@octokit/rest`)
- `health/` — healthcheck endpoint (used by Railway deploy)

### Key Directories

- `lib/` — shared utilities and service clients
- `components/` — React components

### External Services

- **GitHub API** — via `@octokit/rest`, authenticated with `GITHUB_TOKEN`
- **Google Gemini** — via `@google/generative-ai`, authenticated with `GEMINI_API_KEY`
- **Mermaid** — diagram rendering

### Environment

Copy `.env.local.example` to `.env.local` and fill in real values. Required vars: `GITHUB_TOKEN`, `GEMINI_API_KEY`, `NEXT_PUBLIC_API_URL`.

### Path Aliases

`@/*` maps to the project root (configured in `tsconfig.json`).

### Deployment

Railway via Nixpacks (`railway.json`). Healthcheck at `/api/health`.

### Important: Next.js Version

This uses a recent Next.js with potential breaking changes from older versions. Consult `node_modules/next/dist/docs/` before using APIs that may have changed.
