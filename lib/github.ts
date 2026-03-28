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

const ALLOWED_EXT = new Set([".ts", ".tsx", ".js", ".jsx"]);
const SKIP_DIRS = ["node_modules", ".next", "dist", "build", "coverage"];
const MAX_FILES = 50;

function extOf(p: string): string {
  const dot = p.lastIndexOf(".");
  return dot === -1 ? "" : p.slice(dot);
}

function langOf(p: string): string {
  const ext = extOf(p);
  if (ext === ".ts") return "typescript";
  if (ext === ".tsx") return "tsx";
  if (ext === ".js") return "javascript";
  if (ext === ".jsx") return "jsx";
  if (ext === ".json") return "json";
  if (ext === ".css") return "css";
  if (ext === ".md") return "markdown";
  return "";
}

function shouldSkip(filePath: string): boolean {
  return SKIP_DIRS.some(
    (d) => filePath === d || filePath.startsWith(d + "/")
  );
}

export async function fetchRepoData(owner: string, repo: string) {
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

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

  // 3. Filter to code files we care about
  const codeFiles = treeData.tree
    .filter(
      (item) =>
        item.type === "blob" &&
        item.path &&
        !shouldSkip(item.path) &&
        ALLOWED_EXT.has(extOf(item.path))
    )
    .sort((a, b) => a.path!.localeCompare(b.path!));

  if (codeFiles.length > MAX_FILES) {
    console.warn(
      `[github] Repo has ${codeFiles.length} code files — capping at ${MAX_FILES}`
    );
  }

  const toFetch = codeFiles.slice(0, MAX_FILES);

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
          rawFiles[file.path!] = Buffer.from(data.content, "base64").toString(
            "utf-8"
          );
        }
      } catch (err) {
        console.error(`[github] Failed to fetch ${file.path}:`, err);
      }
    })
  );

  return { repoMeta, fileTree, rawFiles };
}
