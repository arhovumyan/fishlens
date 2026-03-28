import { Octokit } from "@octokit/rest";

export function parseGitHubUrl(url: string): { owner: string; repo: string } {
  const match = url.match(
    /(?:https?:\/\/)?github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/
  );
  if (!match) {
    throw new Error(`Invalid GitHub repository URL: ${url}`);
  }
  return { owner: match[1], repo: match[2].replace(/\.git$/, "") };
}

const BINARY_EXT = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".bmp", ".webp",
  ".woff", ".woff2", ".ttf", ".eot", ".otf",
  ".wasm", ".zip", ".tar", ".gz", ".tgz", ".bz2", ".7z", ".rar",
  ".pdf", ".exe", ".dll", ".so", ".dylib", ".o", ".a",
  ".pyc", ".pyo", ".class", ".jar",
  ".lock", ".map",
  ".mp3", ".mp4", ".wav", ".avi", ".mov",
  ".db", ".sqlite", ".sqlite3",
]);

const SKIP_DIRS = ["node_modules", ".next", "dist", "build", "coverage", ".git", "__pycache__", ".venv", "vendor"];
const MAX_FILES = 80;
const MAX_FILE_SIZE = 100_000; // 100KB — skip likely minified/generated files

function extOf(p: string): string {
  const dot = p.lastIndexOf(".");
  return dot === -1 ? "" : p.slice(dot).toLowerCase();
}

function langOf(p: string): string {
  const ext = extOf(p);
  const map: Record<string, string> = {
    ".ts": "typescript", ".tsx": "tsx", ".js": "javascript", ".jsx": "jsx",
    ".py": "python", ".go": "go", ".rs": "rust", ".rb": "ruby",
    ".java": "java", ".kt": "kotlin", ".swift": "swift",
    ".c": "c", ".h": "c", ".cpp": "cpp", ".hpp": "cpp", ".cc": "cpp",
    ".cs": "csharp", ".php": "php", ".r": "r",
    ".sh": "shell", ".bash": "shell", ".zsh": "shell",
    ".json": "json", ".yaml": "yaml", ".yml": "yaml", ".toml": "toml",
    ".xml": "xml", ".html": "html", ".css": "css", ".scss": "scss",
    ".sql": "sql", ".graphql": "graphql", ".gql": "graphql",
    ".md": "markdown", ".mdx": "markdown", ".txt": "text",
    ".dockerfile": "dockerfile", ".tf": "terraform", ".hcl": "hcl",
    ".proto": "protobuf", ".env": "env",
  };
  // Handle Dockerfile (no extension)
  if (p.toLowerCase().endsWith("dockerfile")) return "dockerfile";
  return map[ext] ?? "";
}

function shouldSkip(filePath: string): boolean {
  return SKIP_DIRS.some(
    (d) => filePath === d || filePath.startsWith(d + "/")
  );
}

export async function fetchRepoData(owner: string, repo: string) {
  const token = process.env.GITHUB_TOKEN;
  const hasRealToken = token && !token.startsWith("your_");
  const octokit = new Octokit(hasRealToken ? { auth: token } : {});

  // 1. Repo metadata
  const { data: meta } = await octokit.rest.repos.get({ owner, repo });

  const repoMeta = {
    name: meta.name,
    description: meta.description ?? "",
    language: meta.language ?? "",
    stars: meta.stargazers_count,
  };

  // 2. Recursive file tree
  const { data: refData } = await octokit.rest.git.getRef({
    owner,
    repo,
    ref: `heads/${meta.default_branch}`,
  });

  const { data: treeData } = await octokit.rest.git.getTree({
    owner,
    repo,
    tree_sha: refData.object.sha,
    recursive: "1",
  });

  // Full tree for structural overview (skip excluded dirs)
  const fileTree = treeData.tree
    .filter((item) => item.path && !shouldSkip(item.path))
    .map((item) => ({
      path: item.path!,
      type: (item.type === "tree" ? "dir" : "file") as "file" | "dir",
      language: langOf(item.path!),
    }));

  // 3. Filter to fetchable files — all non-binary text files
  const fetchableFiles = treeData.tree
    .filter(
      (item) =>
        item.type === "blob" &&
        item.path &&
        !shouldSkip(item.path) &&
        !BINARY_EXT.has(extOf(item.path)) &&
        extOf(item.path) !== "" // skip extensionless files
    )
    .sort((a, b) => a.path!.localeCompare(b.path!));

  if (fetchableFiles.length > MAX_FILES) {
    console.warn(
      `[github] Repo has ${fetchableFiles.length} text files — capping at ${MAX_FILES}`
    );
  }

  const toFetch = fetchableFiles.slice(0, MAX_FILES);

  // 4. Fetch raw content (parallel, base64 decode)
  const rawFiles: Record<string, string> = {};

  await Promise.all(
    toFetch.map(async (file) => {
      try {
        const { data } = await octokit.rest.repos.getContent({
          owner,
          repo,
          path: file.path!,
        });
        if (!Array.isArray(data) && "content" in data && data.encoding === "base64") {
          const content = Buffer.from(data.content, "base64").toString("utf-8");
          if (content.length <= MAX_FILE_SIZE) {
            rawFiles[file.path!] = content;
          } else {
            console.warn(`[github] Skipping large file: ${file.path} (${content.length} chars)`);
          }
        }
      } catch (err) {
        console.error(`[github] Failed to fetch ${file.path}:`, err);
      }
    })
  );

  return { repoMeta, fileTree, rawFiles };
}
