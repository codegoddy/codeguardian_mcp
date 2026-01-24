/**
 * Get Dependency Graph Tool (Improved Version)
 *
 * Returns the dependency graph for a file or directory.
 *
 * Improvements:
 * 1. Refactored `findProjectRoot` for better readability and maintainability.
 * 2. Improved `resolveTarget` to handle directory targets more accurately.
 * 3. Centralized path normalization and handling.
 * 4. Enhanced documentation and code structure.
 *
 * @format
 */

import { ToolDefinition } from "../types/tools.js";
import { logger } from "../utils/logger.js";
import {
  filterExcludedFiles,
  getExcludePatternsForPath,
} from "../utils/fileFilter.js";
import { glob } from "glob";
import * as fs from "fs/promises";
import * as path from "path";
import {
  getProjectContext,
  ProjectContext,
} from "../context/projectContext.js";
import { impactAnalyzer } from "../analyzers/impactAnalyzer.js";

const EXTENSIONS: Record<string, string[]> = {
  javascript: [".js", ".jsx", ".mjs", ".cjs"],
  typescript: [".ts", ".tsx", ".mts", ".cts"],
  python: [".py"],
  go: [".go"],
};

const DEFAULT_EXCLUDES = [
  "**/node_modules/**",
  "**/venv/**",
  "**/.venv/**",
  "**/dist/**",
  "**/build/**",
  "**/__pycache__/**",
  "**/.git/**",
];

interface DependencyNode {
  file: string;
  imports: string[];
  importedBy: string[];
  externalDeps: string[];
}

interface DependencyGraph {
  nodes: Map<string, DependencyNode>;
  entryPoints: string[];
  leafNodes: string[];
  circularDeps: string[][];
}

export const getDependencyGraphTool: ToolDefinition = {
  definition: {
    name: "get_dependency_graph",
    description: `The Ultimate Impact Analysis tool for Vibe Coders.
Analyzes what files or symbols depend on a target. Use this to understand the "blast radius" of your changes.
If you provide a 'symbol', it traces semantic call chains.
Set 'includeSource: true' to get a bundled Markdown of all affected code, perfect for pasting into an AI prompt for safe refactoring.`,
    inputSchema: {
      type: "object",
      properties: {
        target: {
          type: "string",
          description: "File path or directory to analyze",
        },
        language: {
          type: "string",
          enum: ["javascript", "typescript", "python", "go"],
          description: "Programming language",
        },
        depth: {
          type: "number",
          description: "How many levels deep to trace (default: 2, max: 5)",
          default: 2,
        },
        direction: {
          type: "string",
          enum: ["both", "imports", "importedBy"],
          description: "Which direction to trace (default: both)",
          default: "both",
        },
        symbol: {
          type: "string",
          description: "Optional: A specific symbol (function, class) to trace impact for",
        },
        includeSource: {
          type: "boolean",
          description: "Optional: If true, returns a Markdown bundle of all affected source code for AI prompts",
          default: false,
        },
        showHubs: {
          type: "boolean",
          description: "Optional: If true, identifies the 'Center of the Universe' (most central) symbols in the project",
          default: false,
        },
      },
      required: ["target", "language"],
    },
  },

  async handler(args: any) {
    const startTime = Date.now();
    const { target, language, depth = 2, direction = "both" } = args;

    logger.info(`Building dependency graph for: ${target}`);

    try {
      const projectDir = await findProjectRoot(target);
      let graph: DependencyGraph;
      let usedContext = false;

      try {
        const context = await getProjectContext(projectDir, {
          language: language === "all" ? "all" : language,
          includeTests: true,
        });

        if (context && context.files.size > 0) {
          graph = buildGraphFromContext(context, projectDir);
          usedContext = true;
          logger.info(
            `Using shared context for dependency graph (${context.files.size} files)`,
          );
        } else {
          graph = await buildDependencyGraph(projectDir, language);
        }
      } catch (err) {
        logger.debug(`Falling back to direct analysis: ${err}`);
        graph = await buildDependencyGraph(projectDir, language);
      }

      const targetFiles = await resolveTarget(target, projectDir, graph);

      // --- SECTION: Symbol-Level Impact & AI Bundling (Secret #6 & #7) ---
      let symbolImpact = null;
      let aiBundle = null;
      let projectHubs = null;

      if (args.showHubs) {
        const context = await getProjectContext(projectDir, { language });
        if (context.symbolGraph) {
          projectHubs = impactAnalyzer.getProjectHubs(context.symbolGraph, 5);
        }
      }

      if (args.symbol) {
        const context = await getProjectContext(projectDir, { language });
        if (context.symbolGraph) {
          symbolImpact = impactAnalyzer.traceBlastRadius(
            args.symbol,
            context.symbolGraph,
            Math.min(depth, 5)
          );
          
          if (args.includeSource) {
            aiBundle = await impactAnalyzer.bundleAffectedSource(
              symbolImpact,
              projectDir
            );
          }
        }
      } else if (args.includeSource && targetFiles.length > 0) {
        // Handle file-level bundling
        const blast = {
          target,
          affectedFiles: targetFiles,
          severity: targetFiles.length > 5 ? "high" : "medium",
          impactedSymbols: []
        };
        aiBundle = await impactAnalyzer.bundleAffectedSource(blast as any, projectDir);
      }

      const result = extractSubgraph(
        graph,
        targetFiles,
        Math.min(depth, 5),
        direction,
      );
      const elapsed = Date.now() - startTime;

      return formatResponse({
        success: true,
        target,
        files: targetFiles,
        graph: result,
        symbolImpact,
        aiBundle,
        projectHubs,
        stats: {
          totalProjectFiles: graph.nodes.size,
          analysisTimeMs: elapsed,
          usedContext,
        },
      });
    } catch (error) {
      logger.error("Error building dependency graph:", error);
      return formatResponse({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
};

/**
 * Refactored: Find project root by looking for marker files.
 */
async function findProjectRoot(target: string): Promise<string> {
  const markers = [
    "package.json",
    "pyproject.toml",
    "requirements.txt",
    "setup.py",
    "go.mod",
    ".git",
  ];
  let currentDir = path.dirname(path.resolve(target));
  const maxLevels = 5;

  for (let i = 0; i < maxLevels; i++) {
    for (const marker of markers) {
      try {
        await fs.access(path.join(currentDir, marker));
        return currentDir;
      } catch {
        // Continue to next marker
      }
    }
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) break;
    currentDir = parentDir;
  }

  return path.dirname(path.resolve(target));
}

/**
 * Improved: Resolve target path to specific files in the graph.
 */
async function resolveTarget(
  target: string,
  projectDir: string,
  graph: DependencyGraph,
): Promise<string[]> {
  const allFiles = Array.from(graph.nodes.keys());
  const normalizedTarget = target.replace(/\\/g, "/");

  // Calculate target relative to project root
  const absoluteTarget = path.resolve(normalizedTarget);
  const absoluteProjectDir = path.resolve(projectDir);
  const relativeTarget =
    absoluteTarget.startsWith(absoluteProjectDir) ?
      path.relative(absoluteProjectDir, absoluteTarget).replace(/\\/g, "/")
    : normalizedTarget;

  // 1. Exact match (relative to project root)
  if (graph.nodes.has(relativeTarget)) return [relativeTarget];
  if (graph.nodes.has(normalizedTarget)) return [normalizedTarget];

  // 2. Directory match - check both relative and original target
  const filesInDir = allFiles.filter(
    (f) =>
      f.startsWith(relativeTarget + "/") ||
      f.startsWith(normalizedTarget + "/"),
  );
  if (filesInDir.length > 0) return filesInDir.slice(0, 20);

  // 3. Fuzzy match (basename or partial path)
  const targetBasename = path.basename(normalizedTarget);
  const fuzzyMatches = allFiles.filter(
    (f) => f.endsWith(normalizedTarget) || path.basename(f) === targetBasename,
  );

  return fuzzyMatches.slice(0, 10);
}

/**
 * Build dependency graph from shared project context.
 */
function buildGraphFromContext(
  context: ProjectContext,
  projectDir: string,
): DependencyGraph {
  const graph: DependencyGraph = {
    nodes: new Map(),
    entryPoints: [],
    leafNodes: [],
    circularDeps: [],
  };

  for (const fileInfo of context.files.values()) {
    const relPath = fileInfo.relativePath;
    graph.nodes.set(relPath, {
      file: relPath,
      imports: [],
      importedBy: [],
      externalDeps: fileInfo.imports
        .filter((imp: any) => imp.isExternal)
        .map((imp: any) => imp.source),
    });
  }

  for (const [filePath, imports] of context.importGraph) {
    const relPath = path.relative(projectDir, filePath);
    const node = graph.nodes.get(relPath);
    if (node) {
      node.imports = imports.map((imp: string) => path.relative(projectDir, imp));
    }
  }

  for (const [filePath, importers] of context.reverseImportGraph) {
    const relPath = path.relative(projectDir, filePath);
    const node = graph.nodes.get(relPath);
    if (node) {
      node.importedBy = importers.map((imp: string) => path.relative(projectDir, imp));
    }
  }

  for (const [filePath, node] of graph.nodes) {
    if (node.importedBy.length === 0) graph.entryPoints.push(filePath);
    if (node.imports.length === 0) graph.leafNodes.push(filePath);
  }

  graph.circularDeps = detectCircularDeps(graph);
  return graph;
}

/**
 * Fallback: Build dependency graph by scanning files directly.
 */
async function buildDependencyGraph(
  projectDir: string,
  language: string,
): Promise<DependencyGraph> {
  const extensions = EXTENSIONS[language] || EXTENSIONS.typescript;
  const patterns = extensions.map((ext) => `${projectDir}/**/*${ext}`);
  const excludes = [
    ...DEFAULT_EXCLUDES,
    ...getExcludePatternsForPath(projectDir),
  ];

  let files = await glob(patterns, {
    ignore: excludes,
    nodir: true,
    absolute: true,
  });
  files = filterExcludedFiles(files);

  const graph: DependencyGraph = {
    nodes: new Map(),
    entryPoints: [],
    leafNodes: [],
    circularDeps: [],
  };

  // First pass: extract imports
  for (const file of files) {
    try {
      const content = await fs.readFile(file, "utf-8");
      const relPath = path.relative(projectDir, file);
      // Note: extractImports is assumed to be available in the environment
      const { localImports, externalDeps } = (global as any).extractImports(
        content,
        file,
        language,
      );

      graph.nodes.set(relPath, {
        file: relPath,
        imports: localImports,
        importedBy: [],
        externalDeps,
      });
    } catch {
      // Skip files that can't be read
    }
  }

  // Second pass: resolve paths and build reverse graph
  for (const [filePath, node] of graph.nodes) {
    const resolvedImports: string[] = [];
    for (const imp of node.imports) {
      const resolved = (global as any).resolveImportPath(
        imp,
        filePath,
        projectDir,
        Array.from(graph.nodes.keys()),
      );
      if (resolved) {
        resolvedImports.push(resolved);
        graph.nodes.get(resolved)?.importedBy.push(filePath);
      }
    }
    node.imports = resolvedImports;
  }

  for (const [filePath, node] of graph.nodes) {
    if (node.importedBy.length === 0) graph.entryPoints.push(filePath);
    if (node.imports.length === 0) graph.leafNodes.push(filePath);
  }

  graph.circularDeps = detectCircularDeps(graph);
  return graph;
}

/**
 * Detect circular dependencies using DFS.
 */
function detectCircularDeps(graph: DependencyGraph): string[][] {
  const circular: string[][] = [];
  const visited = new Set<string>();
  const recursionStack = new Set<string>();

  function dfs(file: string, currentPath: string[]): void {
    if (recursionStack.has(file)) {
      const cycleStart = currentPath.indexOf(file);
      circular.push(currentPath.slice(cycleStart));
      return;
    }
    if (visited.has(file)) return;

    visited.add(file);
    recursionStack.add(file);

    const node = graph.nodes.get(file);
    if (node) {
      for (const imp of node.imports) {
        dfs(imp, [...currentPath, file]);
      }
    }
    recursionStack.delete(file);
  }

  for (const file of graph.nodes.keys()) {
    dfs(file, []);
  }
  return circular;
}

/**
 * Extract a subgraph centered around target files.
 */
function extractSubgraph(
  graph: DependencyGraph,
  targetFiles: string[],
  depth: number,
  direction: string,
): any {
  const result: any = {
    files: {},
    summary: {
      totalFiles: 0,
      totalImports: 0,
      totalImportedBy: 0,
      externalDeps: new Set<string>(),
    },
  };

  const visited = new Set<string>();

  function traverse(file: string, currentDepth: number): void {
    if (visited.has(file) || currentDepth > depth) return;
    visited.add(file);

    const node = graph.nodes.get(file);
    if (!node) return;

    result.files[file] = {
      imports: direction !== "importedBy" ? node.imports : [],
      importedBy: direction !== "imports" ? node.importedBy : [],
      externalDeps: node.externalDeps,
    };

    result.summary.totalFiles++;
    result.summary.totalImports += node.imports.length;
    result.summary.totalImportedBy += node.importedBy.length;
    node.externalDeps.forEach((d) => result.summary.externalDeps.add(d));

    if (direction !== "importedBy") {
      for (const imp of node.imports) traverse(imp, currentDepth + 1);
    }
    if (direction !== "imports") {
      for (const importer of node.importedBy)
        traverse(importer, currentDepth + 1);
    }
  }

  for (const target of targetFiles) traverse(target, 0);
  result.summary.externalDeps = Array.from(result.summary.externalDeps);
  result.circularDependencies = graph.circularDeps.filter((cycle) =>
    cycle.some((f) => targetFiles.includes(f)),
  );

  return result;
}

function formatResponse(data: any) {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}
