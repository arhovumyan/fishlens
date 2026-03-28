import { NextRequest } from "next/server";
import { buildFileExplanationPrompt } from "@/lib/prompts";
import { generateExplanationStream } from "@/lib/gemini";
import { getAnalysis } from "@/lib/analyze";

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

  let rawFiles: Record<string, string>;
  let callGraph: Record<
    string,
    { imports: string[]; exports: string[]; functions: Record<string, { calls: string[] }> }
  >;

  try {
    const analysis = await getAnalysis(repoUrl);
    rawFiles = analysis.rawFiles;
    callGraph = analysis.callGraph;
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

  const prompt = buildFileExplanationPrompt(
    filePath,
    fileSource,
    callGraphEntry,
    experienceLevel as "junior" | "mid" | "senior"
  );

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      try {
        for await (const chunk of generateExplanationStream(prompt)) {
          controller.enqueue(encoder.encode(chunk));
        }
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
