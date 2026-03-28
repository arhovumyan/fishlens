import { NextRequest, NextResponse } from "next/server";
import { parseGitHubUrl } from "@/lib/github";
import { getCache } from "@/lib/cache";
import { getAnalysis } from "@/lib/analyze";

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
    try {
      parseGitHubUrl(repoUrl);
    } catch {
      return NextResponse.json(
        { error: "Not a valid GitHub repository URL" },
        { status: 400 }
      );
    }

    const cached = getCache(repoUrl);
    const result = await getAnalysis(repoUrl);

    return NextResponse.json({
      cache: cached ? "hit" : "miss",
      ...result,
    });
  } catch (err: unknown) {
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
