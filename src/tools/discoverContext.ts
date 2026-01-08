/**
 * Discover Context Tool
 *
 * WINNING FEATURE: Intelligently find relevant files for a given task
 * without reading the entire codebase. This is how AI assistants "know"
 * which files to look at.
 *
 * Key capabilities:
 * - Build lightweight project index (symbols, imports, keywords)
 * - Find files related to new code being added
 * - Semantic search by task description
 * - Follow dependency graph to find connected files
 *
 * Now integrates with shared ProjectContext for faster subsequent calls.
 *
 * @format
 */

import { ToolDefinition } from "../types/tools.js";
import { logger } from "../utils/logger.js";
import {
  filterExcludedFiles,
  getExcludePatternsForPath,
} from "../utils/fileFilter.js";
import {
  getProjectContext,
  ProjectContext,
  findFilesByKeywords,
  findSymbolDefinitions,
} from "../context/projectContext.js";
import { glob } from "glob";
import * as fs from "fs/promises";
import * as path from "path";

// File extensions by language
const EXTENSIONS: Record<string, string[]> = {
  javascript: [".js", ".jsx", ".mjs", ".cjs"],
  typescript: [".ts", ".tsx", ".mts", ".cts"],
  python: [".py"],
  go: [".go"],
  java: [".java"],
  all: [".js", ".jsx", ".ts", ".tsx", ".py", ".go", ".java"],
};

// Default exclusion patterns
const DEFAULT_EXCLUDES = [
  "**/node_modules/**",
  "**/venv/**",
  "**/.venv/**",
  "**/env/**",
  "**/__pycache__/**",
  "**/dist/**",
  "**/build/**",
  "**/.next/**",
  "**/coverage/**",
  "**/.git/**",
  "**/vendor/**",
  "**/*.min.js",
];

/**
 * Lightweight file index entry
 */
interface FileIndexEntry {
  path: string;
  language: string;
  symbols: string[]; // function/class/variable names
  imports: string[]; // modules this file imports
  exports: string[]; // what this file exports
  keywords: string[]; // extracted terms from path + content
  size: number;
}

/**
 * Project index for fast lookups
 */
interface ProjectIndex {
  files: Map<string, FileIndexEntry>;
  symbolToFiles: Map<string, string[]>; // symbol -> files defining it
  importGraph: Map<string, string[]>; // file -> files it imports
  reverseImportGraph: Map<string, string[]>; // file -> files that import it
  keywordIndex: Map<string, string[]>; // keyword -> files containing it
  totalFiles: number;
  indexTime: string;
}

/**
 * Context discovery result
 */
interface DiscoveryResult {
  relevantFiles: Array<{
    path: string;
    relevanceScore: number;
    reason: string;
    symbols: string[];
  }>;
  dependencyChain: string[];
  suggestedReadOrder: string[];
  summary: {
    totalFilesIndexed: number;
    relevantFilesFound: number;
    indexTime: string;
    searchTime: string;
  };
}

export const discoverContextTool: ToolDefinition = {
  definition: {
    name: "discover_context",
    description: `Intelligently find relevant files for a task without reading the entire codebase. 
Use this BEFORE writing code to understand what files are related to your changes.
Returns ranked list of files with relevance scores and suggested read order.`,
    inputSchema: {
      type: "object",
      properties: {
        projectPath: {
          type: "string",
          description: "Root path of the project to analyze",
        },
        query: {
          type: "string",
          description:
            'What you want to do (e.g., "add authentication", "fix login bug", "update user API")',
        },
        newCode: {
          type: "string",
          description:
            "Optional: new code being added - will find files that define symbols used in this code",
        },
        language: {
          type: "string",
          enum: ["javascript", "typescript", "python", "go", "java", "all"],
          description: "Programming language to focus on (default: all)",
        },
        maxResults: {
          type: "number",
          description:
            "Maximum number of relevant files to return (default: 10)",
        },
        includeTests: {
          type: "boolean",
          description: "Include test files in results (default: false)",
        },
        followImports: {
          type: "boolean",
          description:
            "Follow import chain to find related files (default: true)",
        },
      },
      required: ["projectPath"],
    },
  },

  async handler(args: any) {
    const startTime = Date.now();

    const {
      projectPath,
      query,
      newCode,
      language = "all",
      maxResults = 10,
      includeTests = false,
      followImports = true,
    } = args;

    logger.info(`Discovering context for: ${projectPath}`);

    try {
      // Try to use shared context first (much faster for subsequent calls)
      let index: ProjectIndex;
      let usedSharedContext = false;
      const indexStartTime = Date.now();

      try {
        const sharedContext = await getProjectContext(projectPath, {
          language,
          includeTests,
          forceRebuild: false,
        });

        // Convert shared context to our ProjectIndex format
        index = convertFromSharedContext(sharedContext);
        usedSharedContext = true;
        logger.info(`Using shared context with ${index.totalFiles} files`);
      } catch (err) {
        // Fall back to building our own index
        logger.info("Building local index (shared context not available)");
        index = await buildProjectIndex(projectPath, language, includeTests);
      }

      const indexTime = Date.now() - indexStartTime;

      if (index.totalFiles === 0) {
        return formatResponse({
          success: true,
          message: "No source files found in project",
          relevantFiles: [],
        });
      }

      // Step 2: Find relevant files based on query and/or newCode
      const searchStartTime = Date.now();
      let relevantFiles: Array<{
        path: string;
        score: number;
        reason: string;
        symbols: string[];
      }> = [];

      // Strategy 1: If newCode provided, find files defining used symbols
      if (newCode) {
        const codeBasedResults = findFilesForCode(newCode, index, language);
        relevantFiles.push(...codeBasedResults);
      }

      // Strategy 2: If query provided, semantic keyword matching
      if (query) {
        const queryBasedResults = findFilesForQuery(query, index);
        relevantFiles.push(...queryBasedResults);
      }

      // Strategy 3: If neither, return most connected files (entry points)
      if (!newCode && !query) {
        const entryPoints = findEntryPoints(index);
        relevantFiles.push(...entryPoints);
      }

      // Deduplicate and merge scores
      relevantFiles = deduplicateAndMerge(relevantFiles);

      // Step 3: Follow import graph if enabled
      let dependencyChain: string[] = [];
      if (followImports && relevantFiles.length > 0) {
        dependencyChain = buildDependencyChain(
          relevantFiles.slice(0, 3).map((f) => f.path),
          index
        );
      }

      // Sort by score and limit results
      relevantFiles.sort((a, b) => b.score - a.score);
      relevantFiles = relevantFiles.slice(0, maxResults);

      // Generate suggested read order (most foundational first)
      const suggestedReadOrder = generateReadOrder(relevantFiles, index);

      const searchTime = Date.now() - searchStartTime;

      const result: DiscoveryResult = {
        relevantFiles: relevantFiles.map((f) => ({
          path: f.path,
          relevanceScore: Math.round(f.score * 100) / 100,
          reason: f.reason,
          symbols: f.symbols.slice(0, 10), // Limit symbols shown
        })),
        dependencyChain,
        suggestedReadOrder,
        summary: {
          totalFilesIndexed: index.totalFiles,
          relevantFilesFound: relevantFiles.length,
          indexTime: `${indexTime}ms`,
          searchTime: `${searchTime}ms`,
        },
      };

      return formatResponse({
        success: true,
        ...result,
        usedSharedContext,
      });
    } catch (error) {
      logger.error("Error in context discovery:", error);
      return formatResponse({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
};

/**
 * Convert shared ProjectContext to local ProjectIndex format
 */
function convertFromSharedContext(context: ProjectContext): ProjectIndex {
  const index: ProjectIndex = {
    files: new Map(),
    symbolToFiles: new Map(),
    importGraph: context.importGraph,
    reverseImportGraph: context.reverseImportGraph,
    keywordIndex: context.keywordIndex,
    totalFiles: context.totalFiles,
    indexTime: context.buildTime,
  };

  // Convert file info
  for (const [filePath, fileInfo] of context.files) {
    index.files.set(filePath, {
      path: filePath,
      language: fileInfo.language,
      symbols: fileInfo.symbols.map((s) => s.name),
      imports: fileInfo.imports.map((i) => i.source),
      exports: fileInfo.exports.map((e) => e.name),
      keywords: fileInfo.keywords,
      size: fileInfo.size,
    });
  }

  // Convert symbol index
  for (const [symbolName, definitions] of context.symbolIndex) {
    index.symbolToFiles.set(
      symbolName,
      definitions.map((d) => d.file)
    );
  }

  return index;
}

/**
 * Build a lightweight index of the project
 */
async function buildProjectIndex(
  projectPath: string,
  language: string,
  includeTests: boolean
): Promise<ProjectIndex> {
  const extensions = EXTENSIONS[language] || EXTENSIONS.all;
  const patterns = extensions.map((ext) => `${projectPath}/**/*${ext}`);

  let excludes = [...DEFAULT_EXCLUDES];
  if (!includeTests) {
    excludes.push(
      "**/*.test.*",
      "**/*.spec.*",
      "**/test/**",
      "**/__tests__/**"
    );
  }

  // Get exclude patterns adjusted for absolute paths
  const adjustedExcludes = getExcludePatternsForPath(projectPath);
  excludes = [...excludes, ...adjustedExcludes];

  let files = await glob(patterns, {
    ignore: excludes,
    nodir: true,
    absolute: true, // Use absolute paths for better ignore matching
  });

  // Additional filtering to catch any excluded directories that glob missed
  // This is critical because glob ignore patterns can be unreliable with certain path formats
  files = filterExcludedFiles(files);

  const index: ProjectIndex = {
    files: new Map(),
    symbolToFiles: new Map(),
    importGraph: new Map(),
    reverseImportGraph: new Map(),
    keywordIndex: new Map(),
    totalFiles: 0,
    indexTime: "",
  };

  // Process each file (lightweight - just extract key info)
  for (const filePath of files.slice(0, 1000)) {
    // Limit to 1000 files
    try {
      const content = await fs.readFile(filePath, "utf-8");
      const entry = indexFile(filePath, content);
      index.files.set(filePath, entry);

      // Build symbol index
      for (const symbol of entry.symbols) {
        if (!index.symbolToFiles.has(symbol)) {
          index.symbolToFiles.set(symbol, []);
        }
        index.symbolToFiles.get(symbol)!.push(filePath);
      }

      // Build keyword index
      for (const keyword of entry.keywords) {
        if (!index.keywordIndex.has(keyword)) {
          index.keywordIndex.set(keyword, []);
        }
        index.keywordIndex.get(keyword)!.push(filePath);
      }

      // Build import graph
      index.importGraph.set(filePath, entry.imports);
      for (const imp of entry.imports) {
        // Try to resolve import to actual file
        const resolvedImport = resolveImport(
          imp,
          filePath,
          Array.from(index.files.keys())
        );
        if (resolvedImport) {
          if (!index.reverseImportGraph.has(resolvedImport)) {
            index.reverseImportGraph.set(resolvedImport, []);
          }
          index.reverseImportGraph.get(resolvedImport)!.push(filePath);
        }
      }
    } catch (err) {
      // Skip files that can't be read
    }
  }

  index.totalFiles = index.files.size;
  return index;
}

/**
 * Index a single file - extract symbols, imports, keywords
 */
function indexFile(filePath: string, content: string): FileIndexEntry {
  const ext = path.extname(filePath);
  const language = getLanguageFromExt(ext);

  const symbols: string[] = [];
  const imports: string[] = [];
  const exports: string[] = [];
  const keywords: string[] = [];

  // Extract keywords from file path
  const pathParts = filePath
    .split(/[\/\\]/)
    .filter((p) => p && !p.startsWith("."));
  keywords.push(
    ...pathParts.map((p) => p.toLowerCase().replace(/\.[^.]+$/, ""))
  );

  // Language-specific extraction
  if (language === "javascript" || language === "typescript") {
    // Functions
    const funcMatches = content.matchAll(
      /(?:function\s+(\w+)|const\s+(\w+)\s*=\s*(?:async\s*)?\(|(\w+)\s*:\s*function)/g
    );
    for (const match of funcMatches) {
      const name = match[1] || match[2] || match[3];
      if (name && !isCommonKeyword(name)) symbols.push(name);
    }

    // Classes
    const classMatches = content.matchAll(/class\s+(\w+)/g);
    for (const match of classMatches) symbols.push(match[1]);

    // Interfaces/Types (TS)
    const typeMatches = content.matchAll(/(?:interface|type)\s+(\w+)/g);
    for (const match of typeMatches) symbols.push(match[1]);

    // React components (PascalCase arrow functions that likely return JSX)
    const reactComponentMatches = content.matchAll(
      /(?:export\s+)?(?:const|function)\s+([A-Z][a-zA-Z0-9]*)\s*(?:=|:|\()/g
    );
    for (const match of reactComponentMatches) {
      if (!symbols.includes(match[1])) symbols.push(match[1]);
    }

    // React hooks (functions starting with 'use')
    const hookMatches = content.matchAll(
      /(?:export\s+)?(?:const|function)\s+(use[A-Z][a-zA-Z0-9]*)/g
    );
    for (const match of hookMatches) {
      if (!symbols.includes(match[1])) symbols.push(match[1]);
    }

    // forwardRef and memo wrapped components
    const wrappedComponentMatches = content.matchAll(
      /(?:const|let|var)\s+(\w+)\s*=\s*(?:React\.)?(?:forwardRef|memo)\s*\(/g
    );
    for (const match of wrappedComponentMatches) {
      if (!symbols.includes(match[1])) symbols.push(match[1]);
    }

    // Imports
    const importMatches = content.matchAll(
      /import\s+.*?from\s+['"]([^'"]+)['"]/g
    );
    for (const match of importMatches) imports.push(match[1]);

    const requireMatches = content.matchAll(
      /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g
    );
    for (const match of requireMatches) imports.push(match[1]);

    // Exports
    const exportMatches = content.matchAll(
      /export\s+(?:default\s+)?(?:function|class|const|let|var)\s+(\w+)/g
    );
    for (const match of exportMatches) exports.push(match[1]);
  } else if (language === "python") {
    // Functions
    const funcMatches = content.matchAll(/def\s+(\w+)\s*\(/g);
    for (const match of funcMatches) {
      if (!match[1].startsWith("_") || match[1].startsWith("__"))
        symbols.push(match[1]);
    }

    // Classes
    const classMatches = content.matchAll(/class\s+(\w+)/g);
    for (const match of classMatches) symbols.push(match[1]);

    // Imports
    const fromImports = content.matchAll(/from\s+([\w.]+)\s+import/g);
    for (const match of fromImports) imports.push(match[1]);

    const directImports = content.matchAll(/^import\s+([\w.]+)/gm);
    for (const match of directImports) imports.push(match[1]);
  }

  // Extract meaningful words from content for keyword search
  const words = content.match(/\b[a-zA-Z][a-zA-Z0-9_]{2,}\b/g) || [];
  const wordFreq = new Map<string, number>();
  for (const word of words) {
    const lower = word.toLowerCase();
    if (!isCommonKeyword(lower) && lower.length > 3) {
      wordFreq.set(lower, (wordFreq.get(lower) || 0) + 1);
    }
  }
  // Keep top keywords by frequency
  const topKeywords = Array.from(wordFreq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([word]) => word);
  keywords.push(...topKeywords);

  return {
    path: filePath,
    language,
    symbols: [...new Set(symbols)],
    imports: [...new Set(imports)],
    exports: [...new Set(exports)],
    keywords: [...new Set(keywords)],
    size: content.length,
  };
}

/**
 * Find files that define symbols used in the new code
 */
function findFilesForCode(
  newCode: string,
  index: ProjectIndex,
  language: string
): Array<{ path: string; score: number; reason: string; symbols: string[] }> {
  const results: Array<{
    path: string;
    score: number;
    reason: string;
    symbols: string[];
  }> = [];

  // Extract function/method calls from new code
  const callMatches = newCode.matchAll(/(?:^|[^\w.])(\w+)\s*\(/gm);
  const usedSymbols = new Set<string>();

  for (const match of callMatches) {
    const symbol = match[1];
    if (symbol && !isCommonKeyword(symbol) && symbol.length > 1) {
      usedSymbols.add(symbol);
    }
  }

  // Extract class instantiations
  const newMatches = newCode.matchAll(/new\s+(\w+)\s*\(/g);
  for (const match of newMatches) usedSymbols.add(match[1]);

  // Extract imports (to find source files)
  const importMatches = newCode.matchAll(
    /(?:import|from)\s+['"]?([^'";\s]+)['"]?/g
  );
  for (const match of importMatches) {
    const imp = match[1].replace(/^\.+\//, "");
    usedSymbols.add(imp);
    // Also add the last part of the path as a keyword
    const parts = imp.split("/");
    if (parts.length > 0) {
      usedSymbols.add(parts[parts.length - 1]);
    }
  }

  // Also extract imported symbols like { login, register }
  const namedImportMatches = newCode.matchAll(/import\s*\{([^}]+)\}\s*from/g);
  for (const match of namedImportMatches) {
    const names = match[1].split(",").map((n) => n.trim().split(" ")[0]);
    names.forEach((name) => {
      if (name && !isCommonKeyword(name)) {
        usedSymbols.add(name);
      }
    });
  }

  // Find files that define these symbols
  for (const symbol of usedSymbols) {
    const definingFiles = index.symbolToFiles.get(symbol) || [];
    for (const file of definingFiles) {
      const existing = results.find((r) => r.path === file);
      if (existing) {
        existing.score += 10;
        existing.symbols.push(symbol);
      } else {
        results.push({
          path: file,
          score: 10,
          reason: `Defines symbol '${symbol}' used in your code`,
          symbols: [symbol],
        });
      }
    }
  }

  return results;
}

/**
 * Find files matching a natural language query
 */
function findFilesForQuery(
  query: string,
  index: ProjectIndex
): Array<{ path: string; score: number; reason: string; symbols: string[] }> {
  const results: Array<{
    path: string;
    score: number;
    reason: string;
    symbols: string[];
  }> = [];

  // Extract keywords from query
  const queryWords = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2 && !isStopWord(w));

  // Expand query words with synonyms and stems
  const expandedWords = new Set<string>();
  for (const word of queryWords) {
    expandedWords.add(word);
    // Add synonyms and common abbreviations
    const synonyms = getSynonymsAndStems(word);
    synonyms.forEach((s) => expandedWords.add(s));
  }

  // Also extract potential symbol names (camelCase, snake_case)
  const potentialSymbols = query.match(/\b[a-zA-Z][a-zA-Z0-9_]+\b/g) || [];

  // Search keyword index
  const fileScores = new Map<
    string,
    { score: number; matchedKeywords: string[] }
  >();

  for (const word of expandedWords) {
    // Direct keyword match
    const matchingFiles = index.keywordIndex.get(word) || [];
    for (const file of matchingFiles) {
      if (!fileScores.has(file)) {
        fileScores.set(file, { score: 0, matchedKeywords: [] });
      }
      const entry = fileScores.get(file)!;
      entry.score += 5;
      entry.matchedKeywords.push(word);
    }

    // Partial match in file paths
    for (const [filePath, fileEntry] of index.files) {
      if (filePath.toLowerCase().includes(word)) {
        if (!fileScores.has(filePath)) {
          fileScores.set(filePath, { score: 0, matchedKeywords: [] });
        }
        const entry = fileScores.get(filePath)!;
        entry.score += 8; // Path match is strong signal
        entry.matchedKeywords.push(`path:${word}`);
      }
    }
  }

  // Check for symbol matches
  for (const symbol of potentialSymbols) {
    const definingFiles = index.symbolToFiles.get(symbol) || [];
    for (const file of definingFiles) {
      if (!fileScores.has(file)) {
        fileScores.set(file, { score: 0, matchedKeywords: [] });
      }
      const entry = fileScores.get(file)!;
      entry.score += 15; // Symbol match is very strong
      entry.matchedKeywords.push(`symbol:${symbol}`);
    }
  }

  // Convert to results
  for (const [filePath, { score, matchedKeywords }] of fileScores) {
    const fileEntry = index.files.get(filePath);
    results.push({
      path: filePath,
      score,
      reason: `Matches: ${matchedKeywords.slice(0, 3).join(", ")}`,
      symbols: fileEntry?.symbols.slice(0, 5) || [],
    });
  }

  return results;
}

/**
 * Find entry point files (most imported, main files)
 */
function findEntryPoints(
  index: ProjectIndex
): Array<{ path: string; score: number; reason: string; symbols: string[] }> {
  const results: Array<{
    path: string;
    score: number;
    reason: string;
    symbols: string[];
  }> = [];

  // Score by how many files import this file
  for (const [filePath, importers] of index.reverseImportGraph) {
    const fileEntry = index.files.get(filePath);
    results.push({
      path: filePath,
      score: importers.length * 5,
      reason: `Imported by ${importers.length} files`,
      symbols: fileEntry?.symbols.slice(0, 5) || [],
    });
  }

  // Also include common entry point patterns
  for (const [filePath, entry] of index.files) {
    const fileName = path.basename(filePath).toLowerCase();
    if (
      ["index", "main", "app", "server", "init"].some((n) =>
        fileName.includes(n)
      )
    ) {
      const existing = results.find((r) => r.path === filePath);
      if (existing) {
        existing.score += 10;
        existing.reason += ", entry point file";
      } else {
        results.push({
          path: filePath,
          score: 10,
          reason: "Entry point file",
          symbols: entry.symbols.slice(0, 5),
        });
      }
    }
  }

  return results;
}

/**
 * Build dependency chain from starting files
 */
function buildDependencyChain(
  startFiles: string[],
  index: ProjectIndex,
  maxDepth: number = 2
): string[] {
  const chain: string[] = [];
  const visited = new Set<string>();

  function traverse(files: string[], depth: number) {
    if (depth > maxDepth) return;

    for (const file of files) {
      if (visited.has(file)) continue;
      visited.add(file);

      // Add files this file imports
      const imports = index.importGraph.get(file) || [];
      for (const imp of imports) {
        const resolved = resolveImport(
          imp,
          file,
          Array.from(index.files.keys())
        );
        if (resolved && !visited.has(resolved)) {
          chain.push(resolved);
        }
      }

      // Add files that import this file
      const importers = index.reverseImportGraph.get(file) || [];
      for (const importer of importers) {
        if (!visited.has(importer)) {
          chain.push(importer);
        }
      }

      // Recurse
      traverse(
        [
          ...(imports
            .map((i) => resolveImport(i, file, Array.from(index.files.keys())))
            .filter(Boolean) as string[]),
        ],
        depth + 1
      );
    }
  }

  traverse(startFiles, 0);
  return [...new Set(chain)].slice(0, 10);
}

/**
 * Generate optimal read order (dependencies first)
 */
function generateReadOrder(
  relevantFiles: Array<{ path: string; score: number }>,
  index: ProjectIndex
): string[] {
  // Topological sort based on import graph
  const files = relevantFiles.map((f) => f.path);
  const sorted: string[] = [];
  const visited = new Set<string>();

  function visit(file: string) {
    if (visited.has(file)) return;
    visited.add(file);

    // Visit dependencies first
    const imports = index.importGraph.get(file) || [];
    for (const imp of imports) {
      const resolved = resolveImport(imp, file, files);
      if (resolved && files.includes(resolved)) {
        visit(resolved);
      }
    }

    sorted.push(file);
  }

  for (const file of files) {
    visit(file);
  }

  return sorted;
}

/**
 * Deduplicate results and merge scores
 */
function deduplicateAndMerge(
  results: Array<{
    path: string;
    score: number;
    reason: string;
    symbols: string[];
  }>
): Array<{ path: string; score: number; reason: string; symbols: string[] }> {
  const merged = new Map<
    string,
    { path: string; score: number; reasons: string[]; symbols: Set<string> }
  >();

  for (const result of results) {
    if (merged.has(result.path)) {
      const existing = merged.get(result.path)!;
      existing.score += result.score;
      existing.reasons.push(result.reason);
      result.symbols.forEach((s) => existing.symbols.add(s));
    } else {
      merged.set(result.path, {
        path: result.path,
        score: result.score,
        reasons: [result.reason],
        symbols: new Set(result.symbols),
      });
    }
  }

  return Array.from(merged.values()).map((m) => ({
    path: m.path,
    score: m.score,
    reason: m.reasons.slice(0, 2).join("; "),
    symbols: Array.from(m.symbols),
  }));
}

/**
 * Try to resolve an import path to an actual file
 */
function resolveImport(
  importPath: string,
  fromFile: string,
  allFiles: string[]
): string | null {
  // Skip external packages
  if (!importPath.startsWith(".") && !importPath.startsWith("/")) {
    return null;
  }

  const dir = path.dirname(fromFile);
  const resolved = path.normalize(path.join(dir, importPath));

  // Try exact match
  if (allFiles.includes(resolved)) return resolved;

  // Try with extensions
  for (const ext of [".ts", ".tsx", ".js", ".jsx", ".py"]) {
    const withExt = resolved + ext;
    if (allFiles.includes(withExt)) return withExt;
  }

  // Try index files
  for (const indexFile of ["index.ts", "index.js", "__init__.py"]) {
    const withIndex = path.join(resolved, indexFile);
    if (allFiles.includes(withIndex)) return withIndex;
  }

  return null;
}

/**
 * Get language from file extension
 */
function getLanguageFromExt(ext: string): string {
  const map: Record<string, string> = {
    ".js": "javascript",
    ".jsx": "javascript",
    ".mjs": "javascript",
    ".ts": "typescript",
    ".tsx": "typescript",
    ".mts": "typescript",
    ".py": "python",
    ".go": "go",
    ".java": "java",
  };
  return map[ext] || "unknown";
}

/**
 * Check if word is a common keyword to filter out
 */
function isCommonKeyword(word: string): boolean {
  const keywords = new Set([
    "if",
    "else",
    "for",
    "while",
    "return",
    "function",
    "const",
    "let",
    "var",
    "class",
    "new",
    "this",
    "import",
    "export",
    "from",
    "async",
    "await",
    "try",
    "catch",
    "throw",
    "true",
    "false",
    "null",
    "undefined",
    "def",
    "self",
    "none",
    "and",
    "or",
    "not",
    "in",
    "is",
    "lambda",
    "with",
    "to",
    "of",
    "as",
    "on",
    "at",
    "by",
    "id",
    "key",
    "get",
    "set",
    "map",
    "log",
    "err",
    "res",
    "req",
    "ctx",
    "db",
  ]);
  return keywords.has(word.toLowerCase()) || word.length <= 2;
}

/**
 * Check if word is a stop word
 */
function isStopWord(word: string): boolean {
  const stopWords = new Set([
    "the",
    "a",
    "an",
    "and",
    "or",
    "but",
    "in",
    "on",
    "at",
    "to",
    "for",
    "of",
    "with",
    "by",
    "from",
    "as",
    "is",
    "was",
    "are",
    "were",
    "been",
    "be",
    "have",
    "has",
    "had",
    "do",
    "does",
    "did",
    "will",
    "would",
    "could",
    "should",
    "may",
    "might",
    "must",
    "shall",
    "can",
    "need",
    "dare",
    "ought",
    "used",
    "get",
    "got",
    "getting",
    "new",
    "want",
    "like",
    "how",
  ]);
  return stopWords.has(word.toLowerCase());
}

/**
 * Format response for MCP
 */
function formatResponse(data: any) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

/**
 * Get synonyms and stems for a word
 * Maps common programming terms to their abbreviations and related words
 */
function getSynonymsAndStems(word: string): string[] {
  const synonymMap: Record<string, string[]> = {
    // Authentication & Security
    authentication: [
      "auth",
      "login",
      "signin",
      "session",
      "jwt",
      "token",
      "oauth",
      "sso",
      "credential",
    ],
    auth: [
      "authentication",
      "login",
      "signin",
      "session",
      "authorize",
      "authorization",
    ],
    login: ["auth", "signin", "authentication", "session", "logon"],
    signin: ["auth", "login", "authentication", "signon"],
    logout: ["signout", "auth", "logoff"],
    signout: ["logout", "auth", "signoff"],
    password: ["pwd", "pass", "secret", "credential"],
    token: ["jwt", "auth", "bearer", "access"],
    permission: ["permissions", "perm", "perms", "access", "role", "acl"],
    role: ["roles", "permission", "access", "rbac"],
    security: ["secure", "auth", "protection", "guard"],

    // User & Account
    user: ["users", "account", "profile", "member", "usr"],
    users: ["user", "accounts", "profiles", "members"],
    account: ["user", "profile", "acct"],
    profile: ["user", "account", "bio"],
    member: ["user", "membership"],
    customer: ["client", "user", "buyer"],
    admin: ["administrator", "superuser", "root"],

    // Database & Storage
    database: [
      "db",
      "sql",
      "postgres",
      "mysql",
      "mongo",
      "storage",
      "datastore",
    ],
    db: ["database", "sql", "datastore"],
    query: ["queries", "sql", "find", "search", "select"],
    schema: ["model", "table", "entity", "structure"],
    model: ["schema", "entity", "orm"],
    table: ["tables", "schema", "collection"],
    collection: ["collections", "table", "documents"],
    repository: ["repo", "repos", "dal", "dao"],
    repo: ["repository", "repositories"],
    migration: ["migrations", "migrate", "schema"],
    seed: ["seeds", "seeder", "fixture"],

    // API & HTTP
    api: ["endpoint", "route", "handler", "controller", "rest", "graphql"],
    endpoint: ["api", "route", "handler", "url"],
    route: ["api", "endpoint", "router", "path", "url"],
    router: ["route", "routes", "routing"],
    controller: ["api", "handler", "ctrl"],
    handler: ["controller", "handle", "processor"],
    request: ["req", "http", "call"],
    response: ["res", "resp", "reply"],
    middleware: ["middlewares", "interceptor", "filter", "pipe"],
    rest: ["api", "restful", "http"],
    graphql: ["gql", "query", "mutation", "resolver"],
    resolver: ["resolvers", "graphql", "handler"],
    mutation: ["mutations", "graphql", "update"],
    webhook: ["webhooks", "hook", "callback"],

    // Configuration & Environment
    configuration: ["config", "settings", "options", "env", "conf"],
    config: ["configuration", "settings", "options", "cfg", "conf"],
    settings: ["config", "configuration", "options", "preferences", "prefs"],
    environment: ["env", "config", "vars"],
    env: ["environment", "config", "dotenv"],
    options: ["opts", "config", "settings", "params"],

    // Testing
    test: ["tests", "spec", "testing", "unittest"],
    tests: ["test", "spec", "testing", "specs"],
    testing: ["test", "tests", "spec", "qa"],
    spec: ["specs", "test", "specification"],
    mock: ["mocks", "stub", "fake", "spy"],
    fixture: ["fixtures", "seed", "testdata"],
    assert: ["assertion", "expect", "should"],

    // Error & Exception
    error: ["errors", "exception", "err", "failure"],
    errors: ["error", "exceptions", "failures"],
    exception: ["error", "errors", "throw", "catch"],
    validation: ["validate", "validator", "validators", "valid"],
    validate: ["validation", "validator", "check", "verify"],
    validator: ["validation", "validate", "validators"],

    // Payment & Commerce
    payment: ["payments", "pay", "billing", "invoice", "stripe", "checkout"],
    payments: ["payment", "billing", "invoices", "transactions"],
    billing: ["payment", "invoice", "subscription", "charge"],
    invoice: ["invoices", "bill", "receipt"],
    order: ["orders", "purchase", "checkout", "cart"],
    cart: ["basket", "checkout", "order"],
    checkout: ["payment", "cart", "purchase"],
    subscription: ["subscriptions", "sub", "recurring", "plan"],
    price: ["pricing", "cost", "amount", "rate"],
    product: ["products", "item", "goods", "sku"],

    // UI Components
    component: ["components", "widget", "ui", "comp"],
    components: ["component", "widgets", "ui"],
    button: ["btn", "buttons", "click"],
    modal: ["modals", "dialog", "popup", "overlay"],
    dialog: ["modal", "popup", "alert"],
    form: ["forms", "input", "field"],
    input: ["inputs", "field", "textbox"],
    datatable: ["table", "grid", "datagrid", "list"],
    list: ["lists", "table", "items", "collection"],
    card: ["cards", "tile", "panel"],
    header: ["headers", "navbar", "topbar", "head"],
    footer: ["footers", "bottom"],
    sidebar: ["sidenav", "drawer", "menu", "nav"],
    navigation: ["nav", "menu", "navbar", "routing"],
    nav: ["navigation", "navbar", "menu"],
    menu: ["menus", "nav", "dropdown"],
    dropdown: ["select", "menu", "combobox"],
    tab: ["tabs", "tabpanel", "tablist"],
    tooltip: ["tooltips", "hint", "popover"],
    toast: ["toasts", "notification", "snackbar", "alert"],
    alert: ["alerts", "notification", "warning", "message"],
    icon: ["icons", "glyph", "symbol"],
    image: ["images", "img", "picture", "photo", "avatar"],
    avatar: ["image", "profile", "picture"],
    chart: ["charts", "graph", "visualization", "plot"],
    graph: ["charts", "visualization", "diagram"],

    // Service & Provider
    service: ["services", "provider", "svc"],
    services: ["service", "providers"],
    provider: ["providers", "service", "adapter"],
    client: ["clients", "consumer", "sdk"],
    adapter: ["adapters", "connector", "bridge"],
    connector: ["connectors", "adapter", "integration"],

    // State Management
    state: ["store", "redux", "zustand", "context", "atom"],
    store: ["state", "redux", "zustand", "storage"],
    redux: ["state", "store", "reducer", "action"],
    reducer: ["reducers", "redux", "state"],
    action: ["actions", "dispatch", "event"],
    dispatch: ["action", "emit", "trigger"],
    context: ["ctx", "provider", "state"],
    hook: ["hooks", "use", "custom"],
    hooks: ["hook", "custom"],

    // Async & Events
    async: ["asynchronous", "await", "promise"],
    promise: ["promises", "async", "await", "then"],
    callback: ["callbacks", "cb", "handler"],
    event: ["events", "emit", "listener", "handler"],
    events: ["event", "emitter", "listener"],
    listener: ["listeners", "handler", "subscriber"],
    emit: ["emitter", "dispatch", "trigger", "publish"],
    subscribe: ["subscription", "subscriber", "listen"],
    publish: ["pub", "emit", "broadcast"],
    queue: ["queues", "job", "worker", "task"],
    job: ["jobs", "task", "worker", "queue", "background"],
    worker: ["workers", "job", "background", "thread"],
    task: ["tasks", "job", "todo"],
    scheduler: ["schedule", "cron", "timer", "job"],
    cron: ["scheduler", "schedule", "timer"],

    // Logging & Monitoring
    log: ["logs", "logger", "logging", "debug"],
    logger: ["log", "logging", "winston", "pino"],
    logging: ["log", "logger", "trace"],
    debug: ["debugging", "log", "trace", "inspect"],
    trace: ["tracing", "log", "span"],
    monitor: ["monitoring", "metrics", "health"],
    metrics: ["metric", "stats", "analytics", "monitor"],
    analytics: ["analytics", "tracking", "metrics", "stats"],

    // Cache & Performance
    cache: ["caching", "cached", "redis", "memcache", "store"],
    caching: ["cache", "memoize", "store"],
    redis: ["cache", "store", "session"],
    memory: ["mem", "ram", "heap"],
    performance: ["perf", "optimize", "speed"],
    optimize: ["optimization", "perf", "improve"],

    // Email & Communication
    email: ["mail", "smtp", "sendgrid", "mailgun", "message"],
    mail: ["email", "smtp", "mailer"],
    message: ["messages", "msg", "chat", "notification"],
    chat: ["messaging", "message", "conversation"],
    notification: ["notifications", "notify", "alert", "push", "toast"],
    sms: ["text", "twilio", "message"],

    // WebSocket & Realtime
    websocket: ["ws", "socket", "realtime", "socketio"],
    socket: ["websocket", "ws", "connection"],
    realtime: ["websocket", "live", "streaming"],

    // File & Upload
    file: ["files", "upload", "download", "document"],
    upload: ["uploads", "file", "attachment"],
    download: ["downloads", "file", "export"],
    attachment: ["attachments", "file", "upload"],
    document: ["documents", "doc", "file"],
    storage: ["store", "file", "bucket", "s3"],

    // Search & Filter
    search: ["find", "query", "filter", "lookup"],
    filter: ["filters", "search", "query", "where"],
    sort: ["sorting", "order", "orderby"],
    pagination: ["paginate", "page", "paging", "limit", "offset"],
    page: ["pages", "pagination", "paging"],

    // Common verbs
    create: ["add", "new", "insert", "make", "post"],
    read: ["get", "fetch", "retrieve", "load", "find"],
    update: ["edit", "modify", "patch", "put", "change"],
    delete: ["remove", "destroy", "del", "drop", "erase"],
    fetch: ["get", "retrieve", "load", "request"],
    save: ["store", "persist", "write", "commit"],
    load: ["fetch", "get", "retrieve", "read"],
    submit: ["send", "post", "save"],
    cancel: ["abort", "stop", "close"],
    reset: ["clear", "init", "initialize"],
    init: ["initialize", "setup", "bootstrap"],
    setup: ["init", "configure", "install"],

    // Utility
    util: ["utils", "utility", "utilities", "helper"],
    utils: ["util", "utilities", "helpers"],
    helper: ["helpers", "util", "utility"],
    common: ["shared", "base", "core"],
    shared: ["common", "base", "lib"],
    core: ["base", "common", "main"],
    lib: ["library", "libs", "shared"],
    constant: ["constants", "const", "enum"],
    type: ["types", "typedef", "interface"],
    interface: ["interfaces", "type", "contract"],
    enum: ["enums", "constant", "type"],
  };

  const lower = word.toLowerCase();
  const results: string[] = [];

  // Direct synonym lookup
  if (synonymMap[lower]) {
    results.push(...synonymMap[lower]);
  }

  // Check if word starts with or contains a known term
  for (const [key, synonyms] of Object.entries(synonymMap)) {
    if (lower.includes(key) && lower !== key) {
      results.push(key, ...synonyms);
    }
  }

  // Simple stemming: remove common suffixes
  const stems = [
    lower.replace(/ing$/, ""),
    lower.replace(/tion$/, ""),
    lower.replace(/ment$/, ""),
    lower.replace(/er$/, ""),
    lower.replace(/or$/, ""),
    lower.replace(/s$/, ""),
    lower.replace(/ed$/, ""),
    lower.replace(/ly$/, ""),
    lower.replace(/ies$/, "y"),
    lower.replace(/ness$/, ""),
  ].filter((s) => s.length > 2 && s !== lower);

  results.push(...stems);

  return [...new Set(results)];
}
