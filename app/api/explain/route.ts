import { NextRequest } from "next/server";
import { buildFileExplanationPrompt, buildGenericFilePrompt } from "@/lib/prompts";
import { generateExplanationStream } from "@/lib/gemini";
import { getAnalysis } from "@/lib/analyze";
import { getAICache, setAICache, aiCacheKey } from "@/lib/ai-cache";

export async function POST(req: NextRequest) {
  let body: { repoUrl?: string; filePath?: string; experienceLevel?: string };
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const { repoUrl, filePath, experienceLevel } = body;

  if (
    !repoUrl ||
    !filePath ||
    !experienceLevel ||
    !["junior", "mid", "senior"].includes(experienceLevel)
  ) {
    return new Response(
      JSON.stringify({
        error:
          "Missing or invalid repoUrl, filePath, or experienceLevel (junior | mid | senior)",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Check AI cache first
  const cacheKey = aiCacheKey("explain", repoUrl, filePath, experienceLevel);
  const cached = getAICache(cacheKey);
  if (cached) {
    return new Response(cached, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  let rawFiles: Record<string, string>;
  let callGraph: Record<
    string,
    { imports: string[]; exports: string[]; functions: Record<string, { calls: string[] }> }
  >;
  let dependencyGraph: import("@/lib/dependency-graph").DependencyGraph | undefined;

  try {
    const analysis = await getAnalysis(repoUrl);
    rawFiles = analysis.rawFiles;
    callGraph = analysis.callGraph;
    dependencyGraph = analysis.dependencyGraph;
  } catch (err) {
    console.error("[explain] Analysis failed:", err);
    return new Response(
      JSON.stringify({ error: "Failed to fetch or parse repository" }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }

  const fileSource = rawFiles[filePath];
  if (!fileSource) {
    return new Response(
      JSON.stringify({ error: `File not found in parsed sources: ${filePath}` }),
      { status: 404, headers: { "Content-Type": "application/json" } }
    );
  }

  const callGraphEntry = callGraph[filePath] ?? {
    imports: [],
    exports: [],
    functions: {},
  };

  const hasStructure =
    callGraphEntry.imports.length > 0 ||
    callGraphEntry.exports.length > 0 ||
    Object.keys(callGraphEntry.functions).length > 0;

  // Build cross-file context from dependency graph
  let crossFileContext: {
    dependsOn: Array<{ file: string; symbols: string[] }>;
    dependedOnBy: Array<{ file: string; symbols: string[] }>;
  } | undefined;

  if (dependencyGraph?.fileInfo[filePath]) {
    const info = dependencyGraph.fileInfo[filePath];
    crossFileContext = {
      dependsOn: info.edges
        .filter((e) => e.from === filePath && e.type === "internal")
        .map((e) => ({ file: e.to, symbols: e.symbols })),
      dependedOnBy: info.edges
        .filter((e) => e.to === filePath && e.type === "internal")
        .map((e) => ({ file: e.from, symbols: e.symbols })),
    };
  }

  const level = experienceLevel as "junior" | "mid" | "senior";
  const prompt = hasStructure
    ? buildFileExplanationPrompt(filePath, fileSource, callGraphEntry, level, crossFileContext)
    : buildGenericFilePrompt(filePath, fileSource, level);

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
        console.error("[explain] Stream error:", err);
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
