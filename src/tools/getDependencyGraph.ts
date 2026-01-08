/**
 * Get Dependency Graph Tool
 *
 * Returns the dependency graph for a file or directory.
 * This is something LLMs cannot efficiently do - tracing imports
 * across an entire codebase to understand what depends on what.
 *
 * Now integrates with shared project context for faster analysis.
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
  imports: string[]; // Files this file imports
  importedBy: string[]; // Files that import this file
  externalDeps: string[]; // External packages used
}

interface DependencyGraph {
  nodes: Map<string, DependencyNode>;
  entryPoints: string[]; // Files with no importers
  leafNodes: string[]; // Files with no imports
  circularDeps: string[][]; // Circular dependency chains
}

export const getDependencyGraphTool: ToolDefinition = {
  definition: {
    name: "get_dependency_graph",
    description: `Get the dependency graph for a file or directory. Shows what files depend on what.
Use this to understand impact of changes - "if I modify this file, what else might break?"

Returns:
- imports: files this file/module imports
- importedBy: files that import this file/module  
- externalDeps: npm/pip packages used
- circularDeps: any circular dependency chains detected`,
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
        },
        direction: {
          type: "string",
          enum: ["both", "imports", "importedBy"],
          description: "Which direction to trace (default: both)",
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
      // Try to use shared project context first
      const projectDir = await findProjectRoot(target);
      let graph: DependencyGraph;
      let usedContext = false;

      try {
        const context = await getProjectContext(projectDir, {
          language: language === "all" ? "all" : language,
          includeTests: true,
        });

        if (context && context.files.size > 0) {
          // Build graph from context (much faster)
          graph = buildGraphFromContext(context, projectDir);
          usedContext = true;
          logger.info(
            `Using shared context for dependency graph (${context.files.size} files)`
          );
        } else {
          graph = await buildDependencyGraph(projectDir, language);
        }
      } catch (err) {
        logger.debug(
          `Could not use context, falling back to direct analysis: ${err}`
        );
        graph = await buildDependencyGraph(projectDir, language);
      }

      // Find the target file(s)
      const targetFiles = await resolveTarget(target, language, graph);

      if (targetFiles.length === 0) {
        return formatResponse({
          success: false,
          error: `No matching files found for: ${target}`,
        });
      }

      // Extract subgraph for target
      const result = extractSubgraph(
        graph,
        targetFiles,
        Math.min(depth, 5),
        direction
      );

      const elapsed = Date.now() - startTime;

      return formatResponse({
        success: true,
        target,
        files: targetFiles,
        graph: result,
        stats: {
          totalProjectFiles: graph.nodes.size,
          analysisTime: `${elapsed}ms`,
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
 * Build dependency graph from shared project context
 */
function buildGraphFromContext(
  context: ProjectContext,
  projectDir: string
): DependencyGraph {
  const graph: DependencyGraph = {
    nodes: new Map(),
    entryPoints: [],
    leafNodes: [],
    circularDeps: [],
  };

  // Build nodes from context files
  for (const [filePath, fileInfo] of context.files) {
    const relPath = fileInfo.relativePath;

    graph.nodes.set(relPath, {
      file: relPath,
      imports: [], // Will be filled from import graph
      importedBy: [], // Will be filled from reverse import graph
      externalDeps: fileInfo.imports
        .filter((imp) => imp.isExternal)
        .map((imp) => imp.source),
    });
  }

  // Fill imports from context's import graph
  for (const [filePath, imports] of context.importGraph) {
    const relPath = path.relative(projectDir, filePath);
    const node = graph.nodes.get(relPath);
    if (node) {
      node.imports = imports.map((imp) => path.relative(projectDir, imp));
    }
  }

  // Fill importedBy from context's reverse import graph
  for (const [filePath, importers] of context.reverseImportGraph) {
    const relPath = path.relative(projectDir, filePath);
    const node = graph.nodes.get(relPath);
    if (node) {
      node.importedBy = importers.map((imp) => path.relative(projectDir, imp));
    }
  }

  // Find entry points and leaf nodes
  for (const [filePath, node] of graph.nodes) {
    if (node.importedBy.length === 0) {
      graph.entryPoints.push(filePath);
    }
    if (node.imports.length === 0) {
      graph.leafNodes.push(filePath);
    }
  }

  // Detect circular dependencies
  graph.circularDeps = detectCircularDeps(graph);

  return graph;
}

async function findProjectRoot(target: string): Promise<string> {
  let dir = path.dirname(path.resolve(target));
  const startDir = dir;
  let levelsUp = 0;
  const maxLevels = 5; // Don't go more than 5 levels up

  while (dir !== path.dirname(dir) && levelsUp < maxLevels) {
    try {
      await fs.access(path.join(dir, "package.json"));
      return dir;
    } catch {
      try {
        await fs.access(path.join(dir, "pyproject.toml"));
        return dir;
      } catch {
        try {
          await fs.access(path.join(dir, "requirements.txt"));
          return dir;
        } catch {
          try {
            await fs.access(path.join(dir, "setup.py"));
            return dir;
          } catch {
            try {
              await fs.access(path.join(dir, "go.mod"));
              return dir;
            } catch {
              dir = path.dirname(dir);
              levelsUp++;
            }
          }
        }
      }
    }
  }

  // If no project root found, use the starting directory
  return startDir;
}

async function buildDependencyGraph(
  projectDir: string,
  language: string
): Promise<DependencyGraph> {
  const extensions = EXTENSIONS[language] || EXTENSIONS.typescript;
  const patterns = extensions.map((ext) => `${projectDir}/**/*${ext}`);

  // Get exclude patterns adjusted for absolute paths
  const excludes = [
    ...DEFAULT_EXCLUDES,
    ...getExcludePatternsForPath(projectDir),
  ];

  let files = await glob(patterns, {
    ignore: excludes,
    nodir: true,
    absolute: true, // Use absolute paths for better ignore matching
  });

  // Additional filtering to catch any excluded directories that glob missed
  files = filterExcludedFiles(files);

  const graph: DependencyGraph = {
    nodes: new Map(),
    entryPoints: [],
    leafNodes: [],
    circularDeps: [],
  };

  // First pass: extract imports from each file
  for (const file of files) {
    try {
      const content = await fs.readFile(file, "utf-8");
      const relPath = path.relative(projectDir, file);
      const { localImports, externalDeps } = extractImports(
        content,
        file,
        language
      );

      graph.nodes.set(relPath, {
        file: relPath,
        imports: localImports,
        importedBy: [],
        externalDeps,
      });
    } catch (err) {
      // Skip unreadable files
    }
  }

  // Second pass: resolve import paths and build reverse graph
  for (const [filePath, node] of graph.nodes) {
    const resolvedImports: string[] = [];

    for (const imp of node.imports) {
      const resolved = resolveImportPath(
        imp,
        filePath,
        projectDir,
        Array.from(graph.nodes.keys())
      );
      if (resolved) {
        resolvedImports.push(resolved);
        const importedNode = graph.nodes.get(resolved);
        if (importedNode) {
          importedNode.importedBy.push(filePath);
        }
      }
    }

    node.imports = resolvedImports;
  }

  // Find entry points (files nothing imports)
  for (const [filePath, node] of graph.nodes) {
    if (node.importedBy.length === 0) {
      graph.entryPoints.push(filePath);
    }
    if (node.imports.length === 0) {
      graph.leafNodes.push(filePath);
    }
  }

  // Detect circular dependencies
  graph.circularDeps = detectCircularDeps(graph);

  return graph;
}

function extractImports(
  content: string,
  filePath: string,
  language: string
): { localImports: string[]; externalDeps: string[] } {
  const localImports: string[] = [];
  const externalDeps: string[] = [];

  if (language === "javascript" || language === "typescript") {
    // ES imports: import x from 'path'
    const esImports = content.matchAll(
      /import\s+(?:[\w\s{},*]+\s+from\s+)?['"]([^'"]+)['"]/g
    );
    for (const match of esImports) {
      categorizeImport(match[1], localImports, externalDeps);
    }

    // require(): const x = require('path')
    const requires = content.matchAll(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/g);
    for (const match of requires) {
      categorizeImport(match[1], localImports, externalDeps);
    }

    // Dynamic imports: import('path')
    const dynamicImports = content.matchAll(
      /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g
    );
    for (const match of dynamicImports) {
      categorizeImport(match[1], localImports, externalDeps);
    }
  } else if (language === "python") {
    // from x import y
    const fromImports = content.matchAll(/from\s+([\w.]+)\s+import/g);
    for (const match of fromImports) {
      categorizeImport(match[1], localImports, externalDeps, true);
    }

    // import x
    const directImports = content.matchAll(/^import\s+([\w.]+)/gm);
    for (const match of directImports) {
      categorizeImport(match[1], localImports, externalDeps, true);
    }
  }

  return {
    localImports: [...new Set(localImports)],
    externalDeps: [...new Set(externalDeps)],
  };
}

function categorizeImport(
  importPath: string,
  localImports: string[],
  externalDeps: string[],
  isPython = false
): void {
  // Skip invalid import paths (likely false positives from regex)
  if (
    !importPath ||
    importPath.includes("\n") ||
    importPath.includes("(") ||
    importPath.includes(")")
  ) {
    return;
  }

  if (isPython) {
    // Python: relative imports start with .
    if (importPath.startsWith(".")) {
      localImports.push(importPath);
    } else {
      externalDeps.push(importPath.split(".")[0]);
    }
  } else {
    // JS/TS: relative imports start with . or /
    if (importPath.startsWith(".") || importPath.startsWith("/")) {
      localImports.push(importPath);
    } else {
      // External package - get package name
      const pkgName =
        importPath.startsWith("@") ?
          importPath.split("/").slice(0, 2).join("/")
        : importPath.split("/")[0];

      // Validate package name (should be alphanumeric with hyphens/underscores)
      if (/^[@a-zA-Z][\w\-./]*$/.test(pkgName)) {
        externalDeps.push(pkgName);
      }
    }
  }
}

function resolveImportPath(
  importPath: string,
  fromFile: string,
  projectDir: string,
  allFiles: string[]
): string | null {
  if (!importPath.startsWith(".")) return null;

  const fromDir = path.dirname(fromFile);
  let resolved = path.normalize(path.join(fromDir, importPath));

  // Try exact match
  if (allFiles.includes(resolved)) return resolved;

  // Handle ESM .js imports that actually point to .ts files
  // (TypeScript convention: import from './foo.js' resolves to './foo.ts')
  if (resolved.endsWith(".js")) {
    const tsVersion = resolved.replace(/\.js$/, ".ts");
    if (allFiles.includes(tsVersion)) return tsVersion;

    const tsxVersion = resolved.replace(/\.js$/, ".tsx");
    if (allFiles.includes(tsxVersion)) return tsxVersion;
  }

  // Handle .mjs -> .mts, .cjs -> .cts
  if (resolved.endsWith(".mjs")) {
    const mtsVersion = resolved.replace(/\.mjs$/, ".mts");
    if (allFiles.includes(mtsVersion)) return mtsVersion;
  }
  if (resolved.endsWith(".cjs")) {
    const ctsVersion = resolved.replace(/\.cjs$/, ".cts");
    if (allFiles.includes(ctsVersion)) return ctsVersion;
  }

  // Remove extension and try with different extensions
  const withoutExt = resolved.replace(/\.(js|jsx|ts|tsx|mjs|cjs|mts|cts)$/, "");

  // Try with extensions
  for (const ext of [
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".mts",
    ".cts",
    ".mjs",
    ".cjs",
    ".py",
  ]) {
    const withExt = withoutExt + ext;
    if (allFiles.includes(withExt)) return withExt;
  }

  // Try index files
  for (const indexFile of [
    "index.ts",
    "index.tsx",
    "index.js",
    "__init__.py",
  ]) {
    const withIndex = path.join(withoutExt, indexFile);
    if (allFiles.includes(withIndex)) return withIndex;
  }

  return null;
}

function detectCircularDeps(graph: DependencyGraph): string[][] {
  const circular: string[][] = [];
  const visited = new Set<string>();
  const recursionStack = new Set<string>();

  function dfs(file: string, path: string[]): void {
    if (recursionStack.has(file)) {
      const cycleStart = path.indexOf(file);
      circular.push(path.slice(cycleStart));
      return;
    }

    if (visited.has(file)) return;

    visited.add(file);
    recursionStack.add(file);

    const node = graph.nodes.get(file);
    if (node) {
      for (const imp of node.imports) {
        dfs(imp, [...path, file]);
      }
    }

    recursionStack.delete(file);
  }

  for (const file of graph.nodes.keys()) {
    dfs(file, []);
  }

  return circular;
}

function extractSubgraph(
  graph: DependencyGraph,
  targetFiles: string[],
  depth: number,
  direction: string
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

    // Traverse deeper
    if (direction !== "importedBy") {
      for (const imp of node.imports) {
        traverse(imp, currentDepth + 1);
      }
    }
    if (direction !== "imports") {
      for (const importer of node.importedBy) {
        traverse(importer, currentDepth + 1);
      }
    }
  }

  for (const target of targetFiles) {
    traverse(target, 0);
  }

  result.summary.externalDeps = Array.from(result.summary.externalDeps);

  // Add circular deps if any involve target files
  result.circularDependencies = graph.circularDeps.filter((cycle) =>
    cycle.some((f) => targetFiles.includes(f))
  );

  return result;
}

async function resolveTarget(
  target: string,
  language: string,
  graph: DependencyGraph
): Promise<string[]> {
  const allFiles = Array.from(graph.nodes.keys());

  // Normalize target path
  const normalizedTarget = target.replace(/\\/g, "/");
  const targetBasename = path.basename(normalizedTarget);

  // Exact match
  if (allFiles.includes(normalizedTarget)) return [normalizedTarget];

  // Check if target looks like a directory (no file extension)
  const hasExtension = /\.\w+$/.test(normalizedTarget);
  if (!hasExtension) {
    // Target is likely a directory - return all files that could be in it
    const filesInDir = allFiles.filter((f) => {
      const normalizedFile = f.replace(/\\/g, "/");
      return (
        normalizedFile.startsWith("src/") || normalizedFile.includes("/src/")
      );
    });
    if (filesInDir.length > 0) {
      return filesInDir.slice(0, 10); // Limit to avoid overwhelming results
    }
  }

  // Try matching by relative path from end
  const matches = allFiles.filter((f) => {
    const normalizedFile = f.replace(/\\/g, "/");
    return (
      normalizedFile === normalizedTarget ||
      normalizedFile.endsWith(normalizedTarget) ||
      normalizedTarget.endsWith(normalizedFile) ||
      normalizedFile.includes(normalizedTarget) ||
      path.basename(normalizedFile) === targetBasename
    );
  });

  if (matches.length > 0) return matches;

  return [];
}

function formatResponse(data: any) {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };
}
