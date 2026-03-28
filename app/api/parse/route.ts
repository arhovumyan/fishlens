import { NextRequest, NextResponse } from "next/server";
import { parseGitHubUrl, fetchRepoData } from "@/lib/github";
import { parseCodebase } from "@/lib/parser";
import { getCache, setCache } from "@/lib/cache";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { repoUrl } = body as { repoUrl?: string };

    if (!repoUrl || typeof repoUrl !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid repoUrl in request body" },
        { status: 400 }
      );
    }

    // Validate URL
    let owner: string;
    let repo: string;
    try {
      ({ owner, repo } = parseGitHubUrl(repoUrl));
    } catch {
      return NextResponse.json(
        { error: "Not a valid GitHub repository URL" },
        { status: 400 }
      );
    }

    // Cache check
    const cached = getCache(repoUrl);
    if (cached) {
      console.log(`[parse] Cache hit for ${owner}/${repo}`);
      return NextResponse.json({ cache: "hit", ...(cached as object) });
    }

    // Fetch repo data
    console.log(`[parse] Fetching ${owner}/${repo}…`);
    const t0 = performance.now();
    const { repoMeta, fileTree, rawFiles } = await fetchRepoData(owner, repo);
    const t1 = performance.now();
    console.log(`[parse] fetchRepoData: ${Math.round(t1 - t0)}ms`);

    // Parse codebase
    const callGraph = await parseCodebase(rawFiles);
    const t2 = performance.now();
    console.log(`[parse] parseCodebase: ${Math.round(t2 - t1)}ms`);
    console.log(`[parse] Total: ${Math.round(t2 - t0)}ms — ${Object.keys(rawFiles).length} files`);

    const payload = { repoMeta, fileTree, callGraph, rawFiles };
    setCache(repoUrl, payload);

    return NextResponse.json({ cache: "miss", ...payload });
  } catch (err: unknown) {
    // Octokit errors carry a .status property
    const status =
      err && typeof err === "object" && "status" in err
        ? (err as { status: number }).status
        : 0;

    if (status === 404) {
      return NextResponse.json(
        { error: "Repository not found (404). Is it private?" },
        { status: 404 }
      );
    }
    if (status === 403 || status === 429) {
      return NextResponse.json(
        { error: "GitHub API rate limit exceeded. Try again later." },
        { status: 429 }
      );
    }

    console.error("[parse] Unhandled error:", err);
    const message =
      err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
