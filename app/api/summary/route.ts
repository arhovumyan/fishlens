import { NextRequest } from "next/server";
import { buildRepoSummaryPrompt } from "@/lib/prompts";
import { generateExplanationStream } from "@/lib/gemini";
import { getAnalysis } from "@/lib/analyze";
import { getAICache, setAICache, aiCacheKey } from "@/lib/ai-cache";

export async function POST(req: NextRequest) {
  let body: { repoUrl?: string; experienceLevel?: string };
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const { repoUrl, experienceLevel } = body;

  if (
    !repoUrl ||
    !experienceLevel ||
    !["junior", "mid", "senior"].includes(experienceLevel)
  ) {
    return new Response(
      JSON.stringify({
        error:
          "Missing or invalid repoUrl or experienceLevel (junior | mid | senior)",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Check AI cache first
  const cacheKey = aiCacheKey("summary", repoUrl, experienceLevel);
  const cached = getAICache(cacheKey);
  if (cached) {
    return new Response(cached, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  let fileTree: Array<{ path: string }>;
  let callGraph: Record<string, { imports: string[]; exports: string[] }>;
  let repoMeta: { name: string; description: string };
  let dependencyEdges: import("@/lib/dependency-graph").DependencyEdge[] | undefined;

  try {
    const analysis = await getAnalysis(repoUrl);
    fileTree = analysis.fileTree;
    callGraph = analysis.callGraph;
    repoMeta = analysis.repoMeta;
    dependencyEdges = analysis.dependencyGraph?.edges;
  } catch (err) {
    console.error("[summary] Analysis failed:", err);
    return new Response(
      JSON.stringify({ error: "Failed to fetch or parse repository" }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }

  const prompt = buildRepoSummaryPrompt(
    fileTree,
    callGraph,
    repoMeta,
    experienceLevel as "junior" | "mid" | "senior",
    dependencyEdges
  );

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let accumulated = "";
      try {
        for await (const chunk of generateExplanationStream(prompt)) {
          accumulated += chunk;
          controller.enqueue(encoder.encode(chunk));
        }
        setAICache(cacheKey, accumulated);
      } catch (err) {
        console.error("[summary] Stream error:", err);
        controller.enqueue(
          encoder.encode("Explanation unavailable. Please try again.")
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
