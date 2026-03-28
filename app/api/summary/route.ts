import { NextRequest } from "next/server";
import { buildRepoSummaryPrompt } from "@/lib/prompts";
import { generateExplanationStream } from "@/lib/gemini";

const INTERNAL_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

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

  // Call /api/parse to get parsed data
  const parseRes = await fetch(`${INTERNAL_URL}/api/parse`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ repoUrl }),
  });

  if (!parseRes.ok) {
    const err = await parseRes.text();
    return new Response(err, { status: parseRes.status });
  }

  const parsed = await parseRes.json();
  const { fileTree, callGraph, repoMeta } = parsed;

  const prompt = buildRepoSummaryPrompt(
    fileTree,
    callGraph,
    repoMeta,
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
