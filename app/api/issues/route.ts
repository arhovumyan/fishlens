import { NextRequest, NextResponse } from "next/server";
import { Octokit } from "@octokit/rest";
import { parseGitHubUrl } from "@/lib/github";
import { buildIssueExplanationPrompt } from "@/lib/prompts";
import { generateExplanation } from "@/lib/gemini";
import { getAICache, setAICache, aiCacheKey } from "@/lib/ai-cache";

type Difficulty = "easy" | "medium" | "hard";
const DIFFICULTY_ORDER: Record<Difficulty, number> = {
  easy: 0,
  medium: 1,
  hard: 2,
};
const MAX_GEMINI_CALLS = 10;

function classifyDifficulty(
  labels: Array<{ name?: string }>
): Difficulty {
  for (const label of labels) {
    if (label.name === "good first issue") return "easy";
  }
  for (const label of labels) {
    if (label.name === "help wanted") return "medium";
  }
  return "hard";
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const repoUrl = searchParams.get("repoUrl");
  const experienceLevel = searchParams.get("experienceLevel");

  if (
    !repoUrl ||
    !experienceLevel ||
    !["junior", "mid", "senior"].includes(experienceLevel)
  ) {
    return NextResponse.json(
      {
        error:
          "Missing or invalid repoUrl or experienceLevel query param (junior | mid | senior)",
      },
      { status: 400 }
    );
  }

  let owner: string;
  let repo: string;
  try {
    ({ owner, repo } = parseGitHubUrl(repoUrl));
  } catch {
    return NextResponse.json(
      { error: "Invalid GitHub repository URL" },
      { status: 400 }
    );
  }

  const token = process.env.GITHUB_TOKEN;
  const hasRealToken = token && !token.startsWith("your_");
  const octokit = new Octokit(hasRealToken ? { auth: token } : {});

  let rawIssues;
  try {
    const res = await octokit.rest.issues.listForRepo({
      owner,
      repo,
      state: "open",
      per_page: 20,
    });
    rawIssues = res.data;
  } catch (err) {
    console.error("[issues] Failed to fetch issues:", err);
    return NextResponse.json(
      { error: "Failed to fetch issues from GitHub" },
      { status: 500 }
    );
  }

  // Filter out pull requests (GitHub API returns PRs as issues)
  const issuesOnly = rawIssues.filter((i) => !i.pull_request);

  const mapped = issuesOnly.map((issue) => {
    const labels = issue.labels.map((l) =>
      typeof l === "string" ? { name: l } : l
    );
    return {
      id: issue.id,
      number: issue.number,
      title: issue.title,
      url: issue.html_url,
      difficulty: classifyDifficulty(labels),
      labels: labels.map((l) => l.name ?? "").filter(Boolean),
      body: issue.body ?? "",
    };
  });

  // Sort: easy → medium → hard
  mapped.sort(
    (a, b) => DIFFICULTY_ORDER[a.difficulty] - DIFFICULTY_ORDER[b.difficulty]
  );

  // Generate AI explanations — cap at MAX_GEMINI_CALLS, use cache
  const issues = await Promise.all(
    mapped.map(async (issue, idx) => {
      let explanation = "";
      if (idx < MAX_GEMINI_CALLS) {
        const cacheKey = aiCacheKey("issue", String(issue.id), experienceLevel);
        const cached = getAICache(cacheKey);
        if (cached) {
          explanation = cached;
        } else {
          const prompt = buildIssueExplanationPrompt(
            { title: issue.title, body: issue.body, labels: issue.labels },
            experienceLevel as "junior" | "mid" | "senior"
          );
          explanation = await generateExplanation(prompt);
          setAICache(cacheKey, explanation);
        }
      }
      return {
        id: issue.id,
        number: issue.number,
        title: issue.title,
        url: issue.url,
        difficulty: issue.difficulty,
        labels: issue.labels,
        explanation,
      };
    })
  );

  return NextResponse.json({ issues });
}
