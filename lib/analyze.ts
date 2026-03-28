import { parseGitHubUrl, fetchRepoData } from "@/lib/github";
import { parseCodebase } from "@/lib/parser";
import { getCache, setCache } from "@/lib/cache";

export interface AnalysisResult {
  repoMeta: { name: string; description: string; language: string; stars: number };
  fileTree: Array<{ path: string; type: "file" | "dir"; language: string }>;
  callGraph: Record<
    string,
    {
      imports: string[];
      exports: string[];
      functions: Record<string, { calls: string[] }>;
    }
  >;
  rawFiles: Record<string, string>;
}

/**
 * Shared analysis function used by /api/parse, /api/explain, and /api/summary.
 * Checks in-memory cache first. Returns structured repo data.
 */
export async function getAnalysis(repoUrl: string): Promise<AnalysisResult> {
  const cached = getCache(repoUrl) as AnalysisResult | null;
  if (cached) return cached;

  const { owner, repo } = parseGitHubUrl(repoUrl);

  const t0 = performance.now();
  const { repoMeta, fileTree, rawFiles } = await fetchRepoData(owner, repo);
  const t1 = performance.now();
  console.log(`[analyze] fetchRepoData: ${Math.round(t1 - t0)}ms`);

  const callGraph = await parseCodebase(rawFiles);
  const t2 = performance.now();
  console.log(`[analyze] parseCodebase: ${Math.round(t2 - t1)}ms`);

  const result: AnalysisResult = { repoMeta, fileTree, callGraph, rawFiles };
  setCache(repoUrl, result);
  return result;
}
