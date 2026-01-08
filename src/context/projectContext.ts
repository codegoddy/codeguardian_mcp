/**
 * Shared Project Context
 *
 * A centralized context system that builds a comprehensive project map once
 * and shares it across all CodeGuardian tools. This enables:
 *
 * 1. Faster subsequent tool calls (no re-indexing)
 * 2. Cross-tool insights (e.g., dead code + test coverage)
 * 3. Smarter validation (knows what symbols exist in project)
 * 4. Better relevance scoring (understands project structure)
 *
 * @format
 */

import { glob } from "glob";
import * as fs from "fs/promises";
import * as path from "path";
import { logger } from "../utils/logger.js";
import {
  filterExcludedFiles,
  getExcludePatternsForPath,
} from "../utils/fileFilter.js";

// ============================================================================
// Types
// ============================================================================

export interface FileInfo {
  path: string;
  relativePath: string;
  language: string;
  size: number;
  symbols: SymbolInfo[];
  imports: ImportInfo[];
  exports: ExportInfo[];
  keywords: string[];
  isTest: boolean;
  isConfig: boolean;
  isEntryPoint: boolean;
  lastModified?: number;
}

export interface SymbolInfo {
  name: string;
  kind:
    | "function"
    | "class"
    | "interface"
    | "type"
    | "variable"
    | "enum"
    | "component"
    | "hook";
  line: number;
  exported: boolean;
  async?: boolean;
  returnType?: string;
  params?: Array<{ name: string; type?: string }>;
}

export interface ImportInfo {
  source: string;
  isRelative: boolean;
  isExternal: boolean;
  namedImports: string[];
  defaultImport?: string;
  line: number;
}

export interface ExportInfo {
  name: string;
  kind: string;
  isDefault: boolean;
  line: number;
}

export interface DependencyEdge {
  from: string;
  to: string;
  importedSymbols: string[];
}

export interface ProjectContext {
  // Metadata
  projectPath: string;
  language: string;
  buildTime: string;
  totalFiles: number;

  // File index
  files: Map<string, FileInfo>;

  // Symbol lookups (symbol name -> files defining it)
  symbolIndex: Map<string, Array<{ file: string; symbol: SymbolInfo }>>;

  // Dependency graph
  dependencies: DependencyEdge[];
  importGraph: Map<string, string[]>; // file -> files it imports
  reverseImportGraph: Map<string, string[]>; // file -> files that import it

  // Keyword index for semantic search
  keywordIndex: Map<string, string[]>;

  // External dependencies (npm packages, pip packages)
  externalDependencies: Set<string>;

  // Entry points (main files, index files, pages)
  entryPoints: string[];

  // Framework detection
  framework?: {
    name: string;
    version?: string;
    patterns: string[];
  };
}

// ============================================================================
// Context Cache
// ============================================================================

interface CachedContext {
  context: ProjectContext;
  timestamp: number;
  fileHashes: Map<string, number>; // file -> mtime for invalidation
  fileCount: number; // Track file count for quick change detection
}

const contextCache = new Map<string, CachedContext>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const QUICK_CHECK_SAMPLE_SIZE = 20; // Number of files to sample for quick staleness check

// ============================================================================
// Main API
// ============================================================================

/**
 * Get or build project context
 * Automatically builds context if not cached, and validates freshness
 * Uses smart invalidation based on file modification times
 */
export async function getProjectContext(
  projectPath: string,
  options: {
    language?: string;
    forceRebuild?: boolean;
    includeTests?: boolean;
    maxFiles?: number;
  } = {}
): Promise<ProjectContext> {
  const {
    language = "all",
    forceRebuild = false,
    includeTests = true,
    maxFiles = 1000,
  } = options;

  const cacheKey = `${projectPath}:${language}:${includeTests}`;
  const cached = contextCache.get(cacheKey);

  // Check if cache exists and is potentially valid
  if (!forceRebuild && cached) {
    const age = Date.now() - cached.timestamp;

    // If cache is very fresh (< 30 seconds), use it without checking
    if (age < 30000) {
      logger.debug(
        `Using fresh cached context for ${projectPath} (age: ${age}ms)`
      );
      return cached.context;
    }

    // If cache is within TTL, do a quick staleness check
    if (age < CACHE_TTL_MS) {
      const isStale = await isContextStale(cached, projectPath);
      if (!isStale) {
        logger.info(
          `Using cached context for ${projectPath} (validated fresh, age: ${age}ms)`
        );
        return cached.context;
      }
      logger.info(`Cache is stale for ${projectPath}, rebuilding...`);
    }
  }

  // Build fresh context (auto-build if not exists)
  logger.info(
    `Building project context for ${projectPath}${cached ? " (cache invalidated)" : " (first build)"}`
  );
  const startTime = Date.now();

  const context = await buildProjectContext(projectPath, {
    language,
    includeTests,
    maxFiles,
  });

  // Build file hash map for smart invalidation
  const fileHashes = new Map<string, number>();
  for (const [filePath, fileInfo] of context.files) {
    if (fileInfo.lastModified) {
      fileHashes.set(filePath, fileInfo.lastModified);
    }
  }

  // Cache it
  contextCache.set(cacheKey, {
    context,
    timestamp: Date.now(),
    fileHashes,
    fileCount: context.files.size,
  });

  logger.info(
    `Context built in ${Date.now() - startTime}ms (${context.files.size} files)`
  );
  return context;
}

/**
 * Check if cached context is stale by sampling file modification times
 * This is a quick check that doesn't require reading all files
 */
async function isContextStale(
  cached: CachedContext,
  projectPath: string
): Promise<boolean> {
  try {
    // Quick check 1: See if file count changed significantly
    const currentFiles = await glob(`${projectPath}/**/*.{ts,tsx,js,jsx,py}`, {
      ignore: ["**/node_modules/**", "**/dist/**", "**/.git/**"],
      nodir: true,
    });

    const countDiff = Math.abs(currentFiles.length - cached.fileCount);
    if (countDiff > 5) {
      logger.debug(
        `File count changed: ${cached.fileCount} -> ${currentFiles.length}`
      );
      return true;
    }

    // Quick check 2: Sample some files and check their modification times
    const filesToCheck = Array.from(cached.fileHashes.keys())
      .sort(() => Math.random() - 0.5) // Shuffle
      .slice(0, QUICK_CHECK_SAMPLE_SIZE);

    for (const filePath of filesToCheck) {
      try {
        const stats = await fs.stat(filePath);
        const cachedMtime = cached.fileHashes.get(filePath);
        if (cachedMtime && stats.mtimeMs > cachedMtime) {
          logger.debug(`File modified: ${filePath}`);
          return true;
        }
      } catch {
        // File was deleted
        logger.debug(`File deleted: ${filePath}`);
        return true;
      }
    }

    // Quick check 3: Check for new files in common directories
    const commonDirs = [
      "src",
      "lib",
      "app",
      "components",
      "pages",
      "hooks",
      "utils",
    ];
    for (const dir of commonDirs) {
      const dirPath = path.join(projectPath, dir);
      try {
        const dirStats = await fs.stat(dirPath);
        // If directory was modified after cache, might have new files
        if (dirStats.mtimeMs > cached.timestamp) {
          const dirFiles = await glob(`${dirPath}/**/*.{ts,tsx,js,jsx}`, {
            nodir: true,
          });
          for (const file of dirFiles.slice(0, 5)) {
            if (!cached.fileHashes.has(file)) {
              logger.debug(`New file detected: ${file}`);
              return true;
            }
          }
        }
      } catch {
        // Directory doesn't exist, that's fine
      }
    }

    return false;
  } catch (error) {
    logger.warn(`Error checking cache staleness: ${error}`);
    return true; // Assume stale on error
  }
}

/**
 * Invalidate context cache for a project
 */
export function invalidateContext(projectPath: string): void {
  for (const key of contextCache.keys()) {
    if (key.startsWith(projectPath)) {
      contextCache.delete(key);
    }
  }
}

/**
 * Clear all cached contexts
 */
export function clearContextCache(): void {
  contextCache.clear();
}

/**
 * Check if context exists and is fresh (without building)
 */
export function hasValidContext(
  projectPath: string,
  language: string = "all"
): boolean {
  const cacheKey = `${projectPath}:${language}:true`;
  const cached = contextCache.get(cacheKey);
  if (!cached) return false;

  const age = Date.now() - cached.timestamp;
  return age < CACHE_TTL_MS;
}

/**
 * Get context status for debugging/info
 */
export function getContextStatus(projectPath: string): {
  exists: boolean;
  age?: number;
  fileCount?: number;
  framework?: string;
} {
  for (const [key, cached] of contextCache.entries()) {
    if (key.startsWith(projectPath)) {
      return {
        exists: true,
        age: Date.now() - cached.timestamp,
        fileCount: cached.context.totalFiles,
        framework: cached.context.framework?.name,
      };
    }
  }
  return { exists: false };
}

// ============================================================================
// Context Building
// ============================================================================

async function buildProjectContext(
  projectPath: string,
  options: {
    language: string;
    includeTests: boolean;
    maxFiles: number;
  }
): Promise<ProjectContext> {
  const { language, includeTests, maxFiles } = options;

  // Initialize context
  const context: ProjectContext = {
    projectPath,
    language,
    buildTime: new Date().toISOString(),
    totalFiles: 0,
    files: new Map(),
    symbolIndex: new Map(),
    dependencies: [],
    importGraph: new Map(),
    reverseImportGraph: new Map(),
    keywordIndex: new Map(),
    externalDependencies: new Set(),
    entryPoints: [],
  };

  // Find files
  const files = await findProjectFiles(projectPath, language, includeTests);
  const filesToProcess = files.slice(0, maxFiles);

  // Detect framework
  context.framework = await detectFramework(projectPath, filesToProcess);

  // Process each file
  for (const filePath of filesToProcess) {
    try {
      const content = await fs.readFile(filePath, "utf-8");
      const stats = await fs.stat(filePath);
      const fileInfo = analyzeFile(
        filePath,
        content,
        projectPath,
        context.framework
      );
      fileInfo.lastModified = stats.mtimeMs;

      context.files.set(filePath, fileInfo);

      // Build symbol index
      for (const symbol of fileInfo.symbols) {
        if (!context.symbolIndex.has(symbol.name)) {
          context.symbolIndex.set(symbol.name, []);
        }
        context.symbolIndex.get(symbol.name)!.push({ file: filePath, symbol });
      }

      // Build keyword index
      for (const keyword of fileInfo.keywords) {
        if (!context.keywordIndex.has(keyword)) {
          context.keywordIndex.set(keyword, []);
        }
        context.keywordIndex.get(keyword)!.push(filePath);
      }

      // Track external dependencies
      for (const imp of fileInfo.imports) {
        if (imp.isExternal) {
          context.externalDependencies.add(imp.source);
        }
      }

      // Track entry points
      if (fileInfo.isEntryPoint) {
        context.entryPoints.push(filePath);
      }
    } catch (err) {
      // Skip unreadable files
    }
  }

  // Build dependency graph (second pass after all files indexed)
  buildDependencyGraph(context);

  context.totalFiles = context.files.size;
  return context;
}

async function findProjectFiles(
  projectPath: string,
  language: string,
  includeTests: boolean
): Promise<string[]> {
  const extensions: Record<string, string[]> = {
    javascript: [".js", ".jsx", ".mjs", ".cjs"],
    typescript: [".ts", ".tsx", ".mts", ".cts"],
    python: [".py"],
    go: [".go"],
    java: [".java"],
    all: [".js", ".jsx", ".ts", ".tsx", ".py", ".go", ".java"],
  };

  const exts = extensions[language] || extensions.all;
  const patterns = exts.map((ext) => `${projectPath}/**/*${ext}`);

  let excludes = [
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
    ...getExcludePatternsForPath(projectPath),
  ];

  if (!includeTests) {
    excludes.push(
      "**/*.test.*",
      "**/*.spec.*",
      "**/test/**",
      "**/__tests__/**"
    );
  }

  let files = await glob(patterns, {
    ignore: excludes,
    nodir: true,
    absolute: true,
  });

  return filterExcludedFiles(files);
}

// ============================================================================
// File Analysis
// ============================================================================

function analyzeFile(
  filePath: string,
  content: string,
  projectPath: string,
  framework?: { name: string; patterns: string[] }
): FileInfo {
  const ext = path.extname(filePath);
  const language = getLanguageFromExt(ext);
  const relativePath = path.relative(projectPath, filePath);
  const fileName = path.basename(filePath);

  const fileInfo: FileInfo = {
    path: filePath,
    relativePath,
    language,
    size: content.length,
    symbols: [],
    imports: [],
    exports: [],
    keywords: [],
    isTest: isTestFile(filePath),
    isConfig: isConfigFile(fileName),
    isEntryPoint: isEntryPointFile(filePath, framework),
  };

  // Extract based on language
  if (language === "typescript" || language === "javascript") {
    extractJSSymbols(content, fileInfo);
    extractJSImports(content, fileInfo);
    extractJSExports(content, fileInfo);
  } else if (language === "python") {
    extractPythonSymbols(content, fileInfo);
    extractPythonImports(content, fileInfo);
  }

  // Extract keywords from path and content
  fileInfo.keywords = extractKeywords(filePath, content);

  return fileInfo;
}

function extractJSSymbols(content: string, fileInfo: FileInfo): void {
  const lines = content.split("\n");

  lines.forEach((line, idx) => {
    const lineNum = idx + 1;

    // Functions
    const funcMatch = line.match(
      /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*(?:<[^>]+>)?\s*\(([^)]*)\)(?:\s*:\s*([^{]+))?/
    );
    if (funcMatch) {
      fileInfo.symbols.push({
        name: funcMatch[1],
        kind: "function",
        line: lineNum,
        exported: line.includes("export"),
        async: line.includes("async"),
        returnType: funcMatch[3]?.trim(),
        params: parseParams(funcMatch[2]),
      });
    }

    // Arrow functions
    const arrowMatch = line.match(
      /(?:export\s+)?const\s+(\w+)\s*(?::\s*[^=]+)?\s*=\s*(?:async\s*)?\(/
    );
    if (arrowMatch && !fileInfo.symbols.find((s) => s.name === arrowMatch[1])) {
      const isHook =
        arrowMatch[1].startsWith("use") &&
        arrowMatch[1][3]?.toUpperCase() === arrowMatch[1][3];
      const isComponent = /^[A-Z]/.test(arrowMatch[1]);

      fileInfo.symbols.push({
        name: arrowMatch[1],
        kind:
          isHook ? "hook"
          : isComponent ? "component"
          : "function",
        line: lineNum,
        exported: line.includes("export"),
        async: line.includes("async"),
      });
    }

    // Classes
    const classMatch = line.match(/(?:export\s+)?class\s+(\w+)/);
    if (classMatch) {
      fileInfo.symbols.push({
        name: classMatch[1],
        kind: "class",
        line: lineNum,
        exported: line.includes("export"),
      });
    }

    // Interfaces
    const interfaceMatch = line.match(/(?:export\s+)?interface\s+(\w+)/);
    if (interfaceMatch) {
      fileInfo.symbols.push({
        name: interfaceMatch[1],
        kind: "interface",
        line: lineNum,
        exported: line.includes("export"),
      });
    }

    // Types
    const typeMatch = line.match(
      /(?:export\s+)?type\s+(\w+)\s*(?:<[^>]+>)?\s*=/
    );
    if (typeMatch) {
      fileInfo.symbols.push({
        name: typeMatch[1],
        kind: "type",
        line: lineNum,
        exported: line.includes("export"),
      });
    }

    // Enums
    const enumMatch = line.match(/(?:export\s+)?enum\s+(\w+)/);
    if (enumMatch) {
      fileInfo.symbols.push({
        name: enumMatch[1],
        kind: "enum",
        line: lineNum,
        exported: line.includes("export"),
      });
    }

    // Exported variables/constants
    const varMatch = line.match(/export\s+(?:const|let|var)\s+(\w+)/);
    if (varMatch && !fileInfo.symbols.find((s) => s.name === varMatch[1])) {
      fileInfo.symbols.push({
        name: varMatch[1],
        kind: "variable",
        line: lineNum,
        exported: true,
      });
    }
  });
}

function extractJSImports(content: string, fileInfo: FileInfo): void {
  const lines = content.split("\n");

  lines.forEach((line, idx) => {
    // ES imports
    const importMatch = line.match(
      /import\s+(?:(\w+)(?:\s*,\s*)?)?(?:\{([^}]+)\})?\s*from\s*['"]([^'"]+)['"]/
    );
    if (importMatch) {
      const source = importMatch[3];
      const isRelative = source.startsWith(".");
      const isExternal = !isRelative && !source.startsWith("/");

      fileInfo.imports.push({
        source,
        isRelative,
        isExternal,
        defaultImport: importMatch[1],
        namedImports:
          importMatch[2] ?
            importMatch[2].split(",").map((s) => s.trim().split(" ")[0])
          : [],
        line: idx + 1,
      });
    }

    // Require
    const requireMatch = line.match(
      /(?:const|let|var)\s+(?:(\w+)|\{([^}]+)\})\s*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/
    );
    if (requireMatch) {
      const source = requireMatch[3];
      const isRelative = source.startsWith(".");
      const isExternal = !isRelative && !source.startsWith("/");

      fileInfo.imports.push({
        source,
        isRelative,
        isExternal,
        defaultImport: requireMatch[1],
        namedImports:
          requireMatch[2] ?
            requireMatch[2].split(",").map((s) => s.trim())
          : [],
        line: idx + 1,
      });
    }
  });
}

function extractJSExports(content: string, fileInfo: FileInfo): void {
  const lines = content.split("\n");

  lines.forEach((line, idx) => {
    // Named exports
    const namedMatch = line.match(
      /export\s+(?:const|let|var|function|class|interface|type|enum)\s+(\w+)/
    );
    if (namedMatch) {
      fileInfo.exports.push({
        name: namedMatch[1],
        kind: "named",
        isDefault: false,
        line: idx + 1,
      });
    }

    // Default export
    const defaultMatch = line.match(
      /export\s+default\s+(?:function\s+)?(\w+)?/
    );
    if (defaultMatch) {
      fileInfo.exports.push({
        name: defaultMatch[1] || "default",
        kind: "default",
        isDefault: true,
        line: idx + 1,
      });
    }
  });
}

function extractPythonSymbols(content: string, fileInfo: FileInfo): void {
  const lines = content.split("\n");

  lines.forEach((line, idx) => {
    // Functions
    const funcMatch = line.match(/^(?:async\s+)?def\s+(\w+)\s*\(/);
    if (funcMatch) {
      fileInfo.symbols.push({
        name: funcMatch[1],
        kind: "function",
        line: idx + 1,
        exported: !funcMatch[1].startsWith("_"),
        async: line.includes("async"),
      });
    }

    // Classes
    const classMatch = line.match(/^class\s+(\w+)/);
    if (classMatch) {
      fileInfo.symbols.push({
        name: classMatch[1],
        kind: "class",
        line: idx + 1,
        exported: !classMatch[1].startsWith("_"),
      });
    }
  });
}

function extractPythonImports(content: string, fileInfo: FileInfo): void {
  const lines = content.split("\n");

  lines.forEach((line, idx) => {
    // from X import Y
    const fromMatch = line.match(/from\s+([\w.]+)\s+import\s+(.+)/);
    if (fromMatch) {
      const source = fromMatch[1];
      const isRelative = source.startsWith(".");
      const isExternal = !isRelative && !source.includes(".");

      fileInfo.imports.push({
        source,
        isRelative,
        isExternal,
        namedImports: fromMatch[2]
          .split(",")
          .map((s) => s.trim().split(" ")[0]),
        line: idx + 1,
      });
    }

    // import X
    const importMatch = line.match(/^import\s+([\w.]+)/);
    if (importMatch) {
      const source = importMatch[1];
      fileInfo.imports.push({
        source,
        isRelative: false,
        isExternal: !source.includes("."),
        namedImports: [],
        defaultImport: source.split(".")[0],
        line: idx + 1,
      });
    }
  });
}

// ============================================================================
// Dependency Graph
// ============================================================================

function buildDependencyGraph(context: ProjectContext): void {
  const allFiles = Array.from(context.files.keys());

  for (const [filePath, fileInfo] of context.files) {
    const imports: string[] = [];

    for (const imp of fileInfo.imports) {
      if (imp.isRelative) {
        const resolved = resolveImport(imp.source, filePath, allFiles);
        if (resolved) {
          imports.push(resolved);

          // Add dependency edge
          context.dependencies.push({
            from: filePath,
            to: resolved,
            importedSymbols: [...imp.namedImports, imp.defaultImport].filter(
              Boolean
            ) as string[],
          });

          // Update reverse graph
          if (!context.reverseImportGraph.has(resolved)) {
            context.reverseImportGraph.set(resolved, []);
          }
          context.reverseImportGraph.get(resolved)!.push(filePath);
        }
      }
    }

    context.importGraph.set(filePath, imports);
  }
}

function resolveImport(
  importPath: string,
  fromFile: string,
  allFiles: string[]
): string | null {
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
  for (const indexFile of [
    "index.ts",
    "index.tsx",
    "index.js",
    "__init__.py",
  ]) {
    const withIndex = path.join(resolved, indexFile);
    if (allFiles.includes(withIndex)) return withIndex;
  }

  return null;
}

// ============================================================================
// Helpers
// ============================================================================

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

function parseParams(paramStr: string): Array<{ name: string; type?: string }> {
  if (!paramStr.trim()) return [];
  return paramStr.split(",").map((p) => {
    const parts = p.trim().split(":");
    return {
      name: parts[0].replace(/[?]$/, "").trim(),
      type: parts[1]?.trim(),
    };
  });
}

function isTestFile(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return (
    lower.includes(".test.") ||
    lower.includes(".spec.") ||
    lower.includes("__tests__") ||
    lower.includes("/test/") ||
    lower.includes("/tests/")
  );
}

function isConfigFile(fileName: string): boolean {
  const configPatterns = [
    /^\..*rc$/,
    /config\./,
    /\.config\./,
    /settings\./,
    /\.env/,
    /package\.json/,
    /tsconfig/,
    /jest\.config/,
    /webpack\.config/,
    /vite\.config/,
    /next\.config/,
  ];
  return configPatterns.some((p) => p.test(fileName.toLowerCase()));
}

function isEntryPointFile(
  filePath: string,
  framework?: { name: string; patterns: string[] }
): boolean {
  const fileName = path.basename(filePath).toLowerCase();
  const relativePath = filePath.toLowerCase();

  // Common entry points
  if (["index", "main", "app", "server"].some((n) => fileName.startsWith(n))) {
    return true;
  }

  // Framework-specific
  if (framework?.name === "nextjs") {
    if (
      relativePath.includes("/app/") &&
      (fileName === "page.tsx" ||
        fileName === "page.ts" ||
        fileName === "layout.tsx")
    ) {
      return true;
    }
    if (relativePath.includes("/pages/") && !fileName.startsWith("_")) {
      return true;
    }
  }

  return false;
}

async function detectFramework(
  projectPath: string,
  files: string[]
): Promise<{ name: string; version?: string; patterns: string[] } | undefined> {
  // Check for Next.js
  const hasNextConfig = files.some((f) => f.includes("next.config"));
  const hasAppDir = files.some((f) => f.includes("/app/page."));
  const hasPagesDir = files.some((f) => f.includes("/pages/"));

  if (hasNextConfig || hasAppDir || hasPagesDir) {
    return {
      name: "nextjs",
      patterns: ["app/", "pages/", "components/", "lib/"],
    };
  }

  // Check for React (without Next)
  const hasReact = files.some(
    (f) => f.includes("App.tsx") || f.includes("App.jsx")
  );
  if (hasReact) {
    return {
      name: "react",
      patterns: ["src/", "components/"],
    };
  }

  // Check for FastAPI/Flask
  const hasFastAPI = files.some((f) => {
    const name = path.basename(f);
    return name === "main.py" || name === "app.py";
  });
  if (hasFastAPI) {
    return {
      name: "fastapi",
      patterns: ["app/", "api/", "routers/", "services/"],
    };
  }

  return undefined;
}

function extractKeywords(filePath: string, content: string): string[] {
  const keywords: string[] = [];

  // From path
  const pathParts = filePath
    .split(/[\/\\]/)
    .filter((p) => p && !p.startsWith("."));
  keywords.push(
    ...pathParts.map((p) => p.toLowerCase().replace(/\.[^.]+$/, ""))
  );

  // From content (top words by frequency)
  const words = content.match(/\b[a-zA-Z][a-zA-Z0-9_]{2,}\b/g) || [];
  const wordFreq = new Map<string, number>();
  const stopWords = new Set([
    "the",
    "and",
    "for",
    "from",
    "import",
    "export",
    "const",
    "let",
    "var",
    "function",
    "return",
    "this",
    "that",
    "with",
    "async",
    "await",
    "true",
    "false",
  ]);

  for (const word of words) {
    const lower = word.toLowerCase();
    if (!stopWords.has(lower) && lower.length > 3) {
      wordFreq.set(lower, (wordFreq.get(lower) || 0) + 1);
    }
  }

  const topKeywords = Array.from(wordFreq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([word]) => word);

  keywords.push(...topKeywords);
  return [...new Set(keywords)];
}

// ============================================================================
// Query Helpers (for tools to use)
// ============================================================================

/**
 * Find files that define a symbol
 */
export function findSymbolDefinitions(
  context: ProjectContext,
  symbolName: string
): Array<{ file: string; symbol: SymbolInfo }> {
  return context.symbolIndex.get(symbolName) || [];
}

/**
 * Find files matching keywords
 */
export function findFilesByKeywords(
  context: ProjectContext,
  keywords: string[]
): Map<string, number> {
  const scores = new Map<string, number>();

  for (const keyword of keywords) {
    const files = context.keywordIndex.get(keyword.toLowerCase()) || [];
    for (const file of files) {
      scores.set(file, (scores.get(file) || 0) + 1);
    }
  }

  return scores;
}

/**
 * Get files that import a given file
 */
export function getImporters(
  context: ProjectContext,
  filePath: string
): string[] {
  return context.reverseImportGraph.get(filePath) || [];
}

/**
 * Get files that a given file imports
 */
export function getImports(
  context: ProjectContext,
  filePath: string
): string[] {
  return context.importGraph.get(filePath) || [];
}

/**
 * Check if a symbol exists in the project
 */
export function symbolExists(
  context: ProjectContext,
  symbolName: string
): boolean {
  return context.symbolIndex.has(symbolName);
}

/**
 * Get all exported symbols from the project
 */
export function getAllExportedSymbols(context: ProjectContext): string[] {
  const symbols: string[] = [];
  for (const [name, definitions] of context.symbolIndex) {
    if (definitions.some((d) => d.symbol.exported)) {
      symbols.push(name);
    }
  }
  return symbols;
}
