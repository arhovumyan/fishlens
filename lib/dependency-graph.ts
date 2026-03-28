import type { FileAnalysis } from "@/lib/parser";

export interface DependencyEdge {
  from: string;
  to: string;
  symbols: string[];
  type: "internal" | "external";
}

export interface FileDependencyInfo {
  dependsOn: string[];
  dependedOnBy: string[];
  edges: DependencyEdge[];
}

export interface DependencyGraph {
  edges: DependencyEdge[];
  fileInfo: Record<string, FileDependencyInfo>;
}

/**
 * Try to resolve an import path to an actual file in the repo.
 * Returns the resolved path or null if unresolvable.
 */
function resolveImport(
  importPath: string,
  importingFile: string,
  knownFiles: Set<string>
): string | null {
  const extensions = [".ts", ".tsx", ".js", ".jsx"];
  const indexFiles = extensions.map((ext) => `/index${ext}`);

  let basePath: string;

  if (importPath.startsWith("@/")) {
    // Alias: @/ maps to project root
    basePath = importPath.slice(2);
  } else if (importPath.startsWith("./") || importPath.startsWith("../")) {
    // Relative import: resolve from importing file's directory
    const dir = importingFile.includes("/")
      ? importingFile.slice(0, importingFile.lastIndexOf("/"))
      : "";
    basePath = normalizePath(dir ? `${dir}/${importPath}` : importPath);
  } else {
    // Bare specifier (npm package) — cannot resolve to internal file
    return null;
  }

  // Try exact match
  if (knownFiles.has(basePath)) return basePath;

  // Try with extensions
  for (const ext of extensions) {
    if (knownFiles.has(basePath + ext)) return basePath + ext;
  }

  // Try as directory with index file
  for (const idx of indexFiles) {
    if (knownFiles.has(basePath + idx)) return basePath + idx;
  }

  return null;
}

/**
 * Normalize a path by resolving ../ and ./ segments.
 */
function normalizePath(p: string): string {
  const parts = p.split("/");
  const out: string[] = [];
  for (const part of parts) {
    if (part === "." || part === "") continue;
    if (part === "..") {
      out.pop();
    } else {
      out.push(part);
    }
  }
  return out.join("/");
}

/**
 * Find which symbols from a target file are used in the source file.
 */
function findUsedSymbols(
  sourceAnalysis: FileAnalysis,
  targetAnalysis: FileAnalysis
): string[] {
  const targetExports = new Set(targetAnalysis.exports);
  if (targetExports.size === 0) return [];

  // Collect all call names from all functions in the source file
  const allCalls = new Set<string>();
  for (const fn of Object.values(sourceAnalysis.functions)) {
    for (const call of fn.calls) {
      // Handle dotted calls: "utils.format" → try "format" too
      allCalls.add(call);
      const lastDot = call.lastIndexOf(".");
      if (lastDot !== -1) allCalls.add(call.slice(lastDot + 1));
    }
  }

  const used: string[] = [];
  for (const exp of targetExports) {
    if (allCalls.has(exp)) used.push(exp);
  }
  return used;
}

export function buildDependencyGraph(
  callGraph: Record<string, FileAnalysis>,
  allFilePaths: string[]
): DependencyGraph {
  const knownFiles = new Set(allFilePaths);
  const edges: DependencyEdge[] = [];
  const fileInfo: Record<string, FileDependencyInfo> = {};

  // Initialize fileInfo for all files in callGraph
  for (const filePath of Object.keys(callGraph)) {
    fileInfo[filePath] = { dependsOn: [], dependedOnBy: [], edges: [] };
  }

  // Process each file's imports
  for (const [filePath, analysis] of Object.entries(callGraph)) {
    for (const importPath of analysis.imports) {
      const resolved = resolveImport(importPath, filePath, knownFiles);

      if (resolved && callGraph[resolved]) {
        // Internal dependency — resolve symbols
        const symbols = findUsedSymbols(analysis, callGraph[resolved]);
        const edge: DependencyEdge = {
          from: filePath,
          to: resolved,
          symbols,
          type: "internal",
        };
        edges.push(edge);

        // Update fileInfo
        if (!fileInfo[filePath]) {
          fileInfo[filePath] = { dependsOn: [], dependedOnBy: [], edges: [] };
        }
        if (!fileInfo[resolved]) {
          fileInfo[resolved] = { dependsOn: [], dependedOnBy: [], edges: [] };
        }

        fileInfo[filePath].dependsOn.push(resolved);
        fileInfo[filePath].edges.push(edge);
        fileInfo[resolved].dependedOnBy.push(filePath);
        fileInfo[resolved].edges.push(edge);
      } else if (!resolved) {
        // External dependency (npm package)
        const edge: DependencyEdge = {
          from: filePath,
          to: importPath,
          symbols: [],
          type: "external",
        };
        edges.push(edge);

        if (!fileInfo[filePath]) {
          fileInfo[filePath] = { dependsOn: [], dependedOnBy: [], edges: [] };
        }
        fileInfo[filePath].edges.push(edge);
      }
    }
  }

  return { edges, fileInfo };
}
