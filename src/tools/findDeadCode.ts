/**
 * Find Dead Code Tool
 *
 * Identifies unused exports, unreachable functions, and orphaned files.
 * LLMs cannot efficiently determine what code is actually used without
 * tracing the entire codebase.
 *
 * Now integrates with shared project context for faster, more accurate analysis.
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
};

const DEFAULT_EXCLUDES = [
  "**/node_modules/**",
  "**/venv/**",
  "**/.venv/**",
  "**/dist/**",
  "**/build/**",
  "**/__pycache__/**",
  "**/.git/**",
  "**/*.test.*",
  "**/*.spec.*",
  "**/__tests__/**",
];

interface ExportedSymbol {
  name: string;
  file: string;
  line: number;
  type: "function" | "class" | "variable" | "type" | "default";
}

interface DeadCodeResult {
  unusedExports: Array<{
    symbol: string;
    file: string;
    line: number;
    type: string;
  }>;
  orphanedFiles: string[];
  possiblyDead: Array<{
    symbol: string;
    file: string;
    reason: string;
  }>;
}

export const findDeadCodeTool: ToolDefinition = {
  definition: {
    name: "find_dead_code",
    description: `Find unused exports, orphaned files, and potentially dead code.

Features:
- Auto-builds project context (no need to call build_context first)
- Uses pre-built dependency graph for accurate detection
- Framework-aware: excludes Next.js pages, layouts, API routes from false positives
- Smart caching: context auto-refreshes when files change

Returns:
- unusedExports: exported symbols that nothing imports
- orphanedFiles: files that nothing imports (entry points excluded)
- possiblyDead: code that might be unused (lower confidence)
- categorized: results grouped by confidence level`,
    inputSchema: {
      type: "object",
      properties: {
        directory: {
          type: "string",
          description: "Directory to analyze",
        },
        language: {
          type: "string",
          enum: ["javascript", "typescript", "python"],
          description: "Programming language",
        },
        entryPoints: {
          type: "array",
          items: { type: "string" },
          description: "Known entry point files (won't be marked as orphaned)",
        },
        includeTypes: {
          type: "boolean",
          description: "Include TypeScript types in analysis (default: false)",
        },
      },
      required: ["directory", "language"],
    },
  },

  async handler(args: any) {
    const startTime = Date.now();
    const {
      directory,
      language,
      entryPoints = [],
      includeTypes = false,
    } = args;

    logger.info(`Finding dead code in: ${directory}`);

    try {
      // Try to use shared project context for faster analysis
      let projectContext: ProjectContext | null = null;
      try {
        projectContext = await getProjectContext(directory, {
          language: language === "all" ? "all" : language,
          includeTests: false, // Don't include tests in dead code analysis
          maxFiles: 1000,
        });
        logger.info(
          `Using shared project context (${projectContext.totalFiles} files indexed)`
        );
      } catch (err) {
        logger.debug(
          `Could not get project context, falling back to direct analysis: ${err}`
        );
      }

      // If we have context, use it for faster analysis
      if (projectContext && projectContext.files.size > 0) {
        return await analyzeWithContext(
          projectContext,
          directory,
          entryPoints,
          includeTypes,
          startTime
        );
      }

      // Fallback to original analysis
      const extensions = EXTENSIONS[language] || EXTENSIONS.typescript;
      const patterns = extensions.map((ext) => `${directory}/**/*${ext}`);

      // Get exclude patterns adjusted for absolute paths
      const excludes = [
        ...DEFAULT_EXCLUDES,
        ...getExcludePatternsForPath(directory),
      ];

      let files = await glob(patterns, {
        ignore: excludes,
        nodir: true,
        absolute: true, // Use absolute paths for better ignore matching
      });

      // Additional filtering to catch any excluded directories that glob missed
      files = filterExcludedFiles(files);

      if (files.length === 0) {
        return formatResponse({
          success: true,
          message: `No ${language} files found in ${directory}`,
          unusedExports: [],
          orphanedFiles: [],
        });
      }

      // Step 1: Collect all exports
      const allExports: ExportedSymbol[] = [];
      const fileContents = new Map<string, string>();

      for (const file of files) {
        try {
          const content = await fs.readFile(file, "utf-8");
          fileContents.set(file, content);
          const exports = extractExports(content, file, language, includeTypes);
          allExports.push(...exports);
        } catch (err) {
          // Skip unreadable files
        }
      }

      // Step 2: Find all imports/usages across the codebase
      const usedSymbols = new Set<string>();
      const importedFiles = new Set<string>();

      for (const [file, content] of fileContents) {
        const { symbols, files: importedPaths } = extractUsages(
          content,
          file,
          language,
          directory,
          files // Pass all files for better resolution
        );
        symbols.forEach((s) => usedSymbols.add(s));
        importedPaths.forEach((f) => importedFiles.add(f));
      }

      // Framework entry point patterns - exports from these files are used by frameworks
      const frameworkEntryPatterns = [
        // Next.js App Router conventions (match anywhere in path)
        /[\/\\]app[\/\\].*page\.[jt]sx?$/,
        /[\/\\]app[\/\\].*layout\.[jt]sx?$/,
        /[\/\\]app[\/\\].*loading\.[jt]sx?$/,
        /[\/\\]app[\/\\].*error\.[jt]sx?$/,
        /[\/\\]app[\/\\].*not-found\.[jt]sx?$/,
        /[\/\\]app[\/\\].*template\.[jt]sx?$/,
        /[\/\\]app[\/\\].*default\.[jt]sx?$/,
        /[\/\\]app[\/\\].*route\.[jt]sx?$/,
        // Next.js Pages Router conventions
        /[\/\\]pages[\/\\].*\.[jt]sx?$/,
        /_app\.[jt]sx?$/,
        /_document\.[jt]sx?$/,
        // Next.js config files
        /next\.config\.[jt]s$/,
        /middleware\.[jt]s$/,
        // Config files
        /\.config\.[jt]s$/,
      ];

      // Step 3: Find unused exports
      const unusedExports = allExports.filter((exp) => {
        // Skip exports from framework entry point files (Next.js pages, layouts, etc.)
        if (frameworkEntryPatterns.some((p) => p.test(exp.file))) {
          return false;
        }

        // Default exports are tracked by file
        if (exp.type === "default") {
          // Check if file is imported OR if the default export name is used as a JSX component
          const isFileImported = importedFiles.has(exp.file);
          const isUsedAsComponent = usedSymbols.has(exp.name);
          return !isFileImported && !isUsedAsComponent;
        }
        // Named exports tracked by name
        return !usedSymbols.has(exp.name);
      });

      // Step 4: Find orphaned files
      // Framework entry point patterns - these files are used by frameworks, not imported directly
      const knownEntryPatterns = [
        // General entry points
        /index\.[jt]sx?$/,
        /main\.[jt]sx?$/,
        /server\.[jt]sx?$/,
        // Next.js App Router conventions
        /\/app\/.*page\.[jt]sx?$/,
        /\/app\/.*layout\.[jt]sx?$/,
        /\/app\/.*loading\.[jt]sx?$/,
        /\/app\/.*error\.[jt]sx?$/,
        /\/app\/.*not-found\.[jt]sx?$/,
        /\/app\/.*template\.[jt]sx?$/,
        /\/app\/.*default\.[jt]sx?$/,
        /\/app\/.*route\.[jt]sx?$/,
        /\/app\/.*middleware\.[jt]sx?$/,
        // Next.js Pages Router conventions
        /\/pages\/.*\.[jt]sx?$/,
        /\/_app\.[jt]sx?$/,
        /\/_document\.[jt]sx?$/,
        // Next.js config files
        /next\.config\.[jt]s$/,
        /next-env\.d\.ts$/,
        /middleware\.[jt]s$/,
        // Config files
        /\.config\.[jt]s$/,
        /tailwind\.config\.[jt]s$/,
        /postcss\.config\.[jt]s$/,
        /jest\.config\.[jt]s$/,
        /vitest\.config\.[jt]s$/,
        /playwright\.config\.[jt]s$/,
        /tsconfig\.json$/,
        // Test files (e2e, spec, test)
        /\.spec\.[jt]sx?$/,
        /\.test\.[jt]sx?$/,
        /\/e2e\/.*\.[jt]sx?$/,
        /\/__tests__\/.*\.[jt]sx?$/,
        // Python
        /__init__\.py$/,
        /setup\.py$/,
        /conftest\.py$/,
        /test_.*\.py$/,
        /.*_test\.py$/,
        // Supabase/middleware utilities
        /\/utils\/supabase\/.*\.[jt]sx?$/,
      ];

      const orphanedFiles = files.filter((file) => {
        const relPath = path.relative(directory, file);

        // Skip known entry points
        if (entryPoints.some((ep: string) => relPath.includes(ep)))
          return false;
        if (knownEntryPatterns.some((p) => p.test(file))) return false;

        // Check if any file imports this one
        return !importedFiles.has(file) && !importedFiles.has(relPath);
      });

      // Step 5: Find possibly dead code (lower confidence)
      const possiblyDead = findPossiblyDeadCode(fileContents, language);

      // Step 6: VALIDATION - Verify findings to reduce false positives
      const validatedOrphanedFiles = await validateOrphanedFiles(
        orphanedFiles,
        fileContents,
        directory,
        language
      );

      const validatedUnusedExports = validateUnusedExports(
        unusedExports,
        fileContents,
        usedSymbols
      );

      const elapsed = Date.now() - startTime;

      const result: DeadCodeResult = {
        unusedExports: validatedUnusedExports.map((e) => ({
          symbol: e.name,
          file: path.relative(directory, e.file),
          line: e.line,
          type: e.type,
        })),
        orphanedFiles: validatedOrphanedFiles.map((f) =>
          path.relative(directory, f)
        ),
        possiblyDead,
      };

      // Calculate confidence based on validation
      const originalOrphanedCount = orphanedFiles.length;
      const validatedOrphanedCount = validatedOrphanedFiles.length;
      const falsePositiveRate =
        originalOrphanedCount > 0 ?
          Math.round(
            ((originalOrphanedCount - validatedOrphanedCount) /
              originalOrphanedCount) *
              100
          )
        : 0;

      // Step 7: Categorize results by confidence level
      const categorizedResults = categorizeDeadCode(
        validatedOrphanedFiles,
        validatedUnusedExports,
        fileContents,
        importedFiles,
        directory
      );

      return formatResponse({
        success: true,
        // Categorized results (most useful for users)
        categorized: categorizedResults,
        // Raw results for backward compatibility
        ...result,
        summary: {
          totalFiles: files.length,
          totalExports: allExports.length,
          completelyDead: categorizedResults.completelyDead.length,
          partiallyDead: categorizedResults.partiallyDead.length,
          unusedExportsInActiveFiles:
            categorizedResults.unusedExportsInActiveFiles.length,
          likelyIntentional: categorizedResults.likelyIntentional.length,
          orphanedFiles: validatedOrphanedFiles.length,
          possiblyDead: possiblyDead.length,
        },
        validation: {
          originalOrphanedCount,
          validatedOrphanedCount,
          falsePositivesRemoved: originalOrphanedCount - validatedOrphanedCount,
          confidence:
            falsePositiveRate < 20 ? "high"
            : falsePositiveRate < 50 ? "medium"
            : "low",
        },
        stats: {
          analysisTime: `${elapsed}ms`,
        },
        recommendation:
          categorizedResults.likelyIntentional.length > 0 ?
            `⚠️ ${categorizedResults.likelyIntentional.length} files appear intentionally unused (migration/future use) - review recommendations`
          : categorizedResults.completelyDead.length > 0 ?
            `🗑️ ${categorizedResults.completelyDead.length} files are completely dead - safe to remove`
          : categorizedResults.unusedExportsInActiveFiles.length > 0 ?
            `⚠️ ${categorizedResults.unusedExportsInActiveFiles.length} unused exports in active files - review before removing`
          : "✅ No obvious dead code found",
      });
    } catch (error) {
      logger.error("Error finding dead code:", error);
      return formatResponse({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
};

function extractExports(
  content: string,
  file: string,
  language: string,
  includeTypes: boolean
): ExportedSymbol[] {
  const exports: ExportedSymbol[] = [];
  const lines = content.split("\n");

  if (language === "javascript" || language === "typescript") {
    lines.forEach((line, idx) => {
      const lineNum = idx + 1;

      // export default
      if (/export\s+default/.test(line)) {
        const match = line.match(
          /export\s+default\s+(?:class|function)?\s*(\w+)?/
        );
        exports.push({
          name: match?.[1] || "default",
          file,
          line: lineNum,
          type: "default",
        });
      }

      // export const/let/var/function/class
      const namedMatch = line.match(
        /export\s+(?:const|let|var|function|class|async\s+function)\s+(\w+)/
      );
      if (namedMatch) {
        exports.push({
          name: namedMatch[1],
          file,
          line: lineNum,
          type:
            line.includes("function") ? "function"
            : line.includes("class") ? "class"
            : "variable",
        });
      }

      // export type/interface (TypeScript)
      if (includeTypes) {
        const typeMatch = line.match(/export\s+(?:type|interface)\s+(\w+)/);
        if (typeMatch) {
          exports.push({
            name: typeMatch[1],
            file,
            line: lineNum,
            type: "type",
          });
        }
      }

      // export { name1, name2 }
      const bracketMatch = line.match(/export\s*\{([^}]+)\}/);
      if (bracketMatch) {
        const names = bracketMatch[1].split(",").map((n) => {
          const parts = n.trim().split(/\s+as\s+/);
          return parts[parts.length - 1].trim();
        });
        names.forEach((name) => {
          if (name) {
            exports.push({ name, file, line: lineNum, type: "variable" });
          }
        });
      }
    });
  } else if (language === "python") {
    // Python: look for __all__ or top-level definitions
    const allMatch = content.match(/__all__\s*=\s*\[([^\]]+)\]/);
    if (allMatch) {
      const names = allMatch[1].match(/['"](\w+)['"]/g) || [];
      names.forEach((n) => {
        exports.push({
          name: n.replace(/['"]/g, ""),
          file,
          line: 1,
          type: "variable",
        });
      });
    } else {
      // All top-level non-private definitions are potential exports
      lines.forEach((line, idx) => {
        const funcMatch = line.match(/^(?:async\s+)?def\s+([a-zA-Z]\w*)\s*\(/);
        if (funcMatch && !funcMatch[1].startsWith("_")) {
          exports.push({
            name: funcMatch[1],
            file,
            line: idx + 1,
            type: "function",
          });
        }

        const classMatch = line.match(/^class\s+([a-zA-Z]\w*)/);
        if (classMatch && !classMatch[1].startsWith("_")) {
          exports.push({
            name: classMatch[1],
            file,
            line: idx + 1,
            type: "class",
          });
        }
      });
    }
  }

  return exports;
}

function extractUsages(
  content: string,
  file: string,
  language: string,
  projectDir: string,
  allFiles: string[] = []
): { symbols: string[]; files: string[] } {
  const symbols: string[] = [];
  const files: string[] = [];

  if (language === "javascript" || language === "typescript") {
    // import { name1, name2 } from 'path'
    const namedImports = content.matchAll(
      /import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g
    );
    for (const match of namedImports) {
      const names = match[1].split(",").map((n) => {
        const parts = n.trim().split(/\s+as\s+/);
        return parts[0].trim().replace(/^type\s+/, ""); // Handle "type X" imports
      });
      symbols.push(...names.filter((n) => n));

      const importPath = match[2];
      const resolved = resolveImportPathEnhanced(
        importPath,
        file,
        projectDir,
        allFiles
      );
      if (resolved) {
        files.push(resolved);
        files.push(path.relative(projectDir, resolved));
        // Also add the basename without extension for matching
        const baseName = path.basename(resolved).replace(/\.[^.]+$/, "");
        files.push(baseName);
      }
    }

    // import name from 'path' (default import)
    const defaultImports = content.matchAll(
      /import\s+(\w+)\s+from\s*['"]([^'"]+)['"]/g
    );
    for (const match of defaultImports) {
      const importedName = match[1];
      const importPath = match[2];
      symbols.push(importedName); // Track the imported name as a used symbol

      const resolved = resolveImportPathEnhanced(
        importPath,
        file,
        projectDir,
        allFiles
      );
      if (resolved) {
        files.push(resolved);
        files.push(path.relative(projectDir, resolved));
        const baseName = path.basename(resolved).replace(/\.[^.]+$/, "");
        files.push(baseName);
      }
    }

    // import * as name from 'path'
    const namespaceImports = content.matchAll(
      /import\s*\*\s*as\s*(\w+)\s*from\s*['"]([^'"]+)['"]/g
    );
    for (const match of namespaceImports) {
      const importPath = match[2];
      const resolved = resolveImportPathEnhanced(
        importPath,
        file,
        projectDir,
        allFiles
      );
      if (resolved) {
        files.push(resolved);
        files.push(path.relative(projectDir, resolved));
      }
    }

    // require('path')
    const requires = content.matchAll(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/g);
    for (const match of requires) {
      const importPath = match[1];
      const resolved = resolveImportPathEnhanced(
        importPath,
        file,
        projectDir,
        allFiles
      );
      if (resolved) {
        files.push(resolved);
        files.push(path.relative(projectDir, resolved));
      }
    }

    // JSX component usage: <ComponentName ... />
    const jsxComponents = content.matchAll(/<([A-Z][a-zA-Z0-9]*)/g);
    for (const match of jsxComponents) {
      symbols.push(match[1]);
    }

    // Function calls that might be exported functions
    const functionCalls = content.matchAll(
      /(?:^|[^\w.])([a-z][a-zA-Z0-9]*)\s*\(/gm
    );
    for (const match of functionCalls) {
      const name = match[1];
      if (name && !isCommonKeyword(name)) {
        symbols.push(name);
      }
    }
  } else if (language === "python") {
    // from module import name1, name2
    const fromImports = content.matchAll(
      /from\s+([\w.]+)\s+import\s+([^#\n]+)/g
    );
    for (const match of fromImports) {
      const moduleName = match[1];
      const names = match[2]
        .split(",")
        .map((n) => n.trim().split(/\s+as\s+/)[0]);
      symbols.push(...names.filter((n) => n && n !== "*"));

      // Handle both relative and local module imports
      if (moduleName.startsWith(".")) {
        const resolved = resolvePythonImport(moduleName, file, projectDir);
        if (resolved) {
          files.push(resolved);
          files.push(path.relative(projectDir, resolved));
        }
      } else {
        // Try to resolve as local module (e.g., "from utils import x")
        const resolved = resolvePythonLocalImport(moduleName, file, projectDir);
        if (resolved) {
          files.push(resolved);
          files.push(path.relative(projectDir, resolved));
        }
      }
    }

    // import module
    const directImports = content.matchAll(/^import\s+([\w.]+)/gm);
    for (const match of directImports) {
      const moduleName = match[1];
      if (moduleName.startsWith(".")) {
        const resolved = resolvePythonImport(moduleName, file, projectDir);
        if (resolved) {
          files.push(resolved);
          files.push(path.relative(projectDir, resolved));
        }
      } else {
        const resolved = resolvePythonLocalImport(moduleName, file, projectDir);
        if (resolved) {
          files.push(resolved);
          files.push(path.relative(projectDir, resolved));
        }
      }
    }
  }

  return { symbols, files };
}

function resolveImportPath(
  importPath: string,
  fromFile: string,
  projectDir: string
): string | null {
  const fromDir = path.dirname(fromFile);
  let resolved = path.normalize(path.join(fromDir, importPath));

  // Try with extensions
  for (const ext of [".ts", ".tsx", ".js", ".jsx", ""]) {
    const withExt = resolved + ext;
    if (withExt.includes(projectDir)) return withExt;
  }

  // Try index files
  for (const indexFile of ["index.ts", "index.tsx", "index.js"]) {
    const withIndex = path.join(resolved, indexFile);
    return withIndex;
  }

  return resolved;
}

/**
 * Enhanced import path resolution that handles:
 * - Relative imports (./Sidebar, ../utils)
 * - Path aliases (@/, ~/)
 * - Node module resolution
 */
function resolveImportPathEnhanced(
  importPath: string,
  fromFile: string,
  projectDir: string,
  allFiles: string[]
): string | null {
  // Handle relative imports
  if (importPath.startsWith(".")) {
    const fromDir = path.dirname(fromFile);
    const basePath = path.normalize(path.join(fromDir, importPath));

    // Try exact match with extensions
    for (const ext of [".ts", ".tsx", ".js", ".jsx", ".mts", ".mjs"]) {
      const withExt = basePath + ext;
      if (allFiles.includes(withExt)) return withExt;
    }

    // Try index files
    for (const indexFile of [
      "index.ts",
      "index.tsx",
      "index.js",
      "index.jsx",
    ]) {
      const withIndex = path.join(basePath, indexFile);
      if (allFiles.includes(withIndex)) return withIndex;
    }

    // Fuzzy match - find file that ends with the import path
    const importBasename = path.basename(importPath);
    const matchingFile = allFiles.find((f) => {
      const fBasename = path.basename(f).replace(/\.[^.]+$/, "");
      return fBasename === importBasename && f.includes(path.dirname(basePath));
    });
    if (matchingFile) return matchingFile;

    return basePath;
  }

  // Handle path aliases (@/, ~/, etc.)
  if (importPath.startsWith("@/") || importPath.startsWith("~/")) {
    const aliasPath = importPath.slice(2); // Remove @/ or ~/

    // Common src directory patterns
    const srcDirs = ["src", "app", "lib", ""];

    for (const srcDir of srcDirs) {
      const basePath = path.join(projectDir, srcDir, aliasPath);

      // Try exact match with extensions
      for (const ext of [".ts", ".tsx", ".js", ".jsx"]) {
        const withExt = basePath + ext;
        if (allFiles.includes(withExt)) return withExt;
      }

      // Try index files
      for (const indexFile of ["index.ts", "index.tsx", "index.js"]) {
        const withIndex = path.join(basePath, indexFile);
        if (allFiles.includes(withIndex)) return withIndex;
      }
    }

    // Fuzzy match for alias imports
    const importBasename = path.basename(aliasPath);
    const matchingFile = allFiles.find((f) => {
      const fBasename = path.basename(f).replace(/\.[^.]+$/, "");
      return fBasename === importBasename;
    });
    if (matchingFile) return matchingFile;
  }

  // External package - return null
  return null;
}

/**
 * Check if a word is a common keyword to filter out
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
    "console",
    "log",
    "error",
    "warn",
    "map",
    "filter",
    "reduce",
    "forEach",
    "push",
    "pop",
    "slice",
    "splice",
    "join",
    "split",
    "then",
    "catch",
    "finally",
    "resolve",
    "reject",
    "get",
    "set",
    "has",
    "delete",
  ]);
  return keywords.has(word.toLowerCase());
}

function resolvePythonImport(
  importPath: string,
  fromFile: string,
  projectDir: string
): string | null {
  const fromDir = path.dirname(fromFile);
  const dots = importPath.match(/^\.+/)?.[0].length || 0;
  let targetDir = fromDir;

  for (let i = 1; i < dots; i++) {
    targetDir = path.dirname(targetDir);
  }

  const modulePath = importPath.slice(dots).replace(/\./g, "/");
  return path.join(targetDir, modulePath + ".py");
}

function resolvePythonLocalImport(
  moduleName: string,
  fromFile: string,
  projectDir: string
): string | null {
  // Try to find the module in the same directory or project
  const fromDir = path.dirname(fromFile);
  const modulePath = moduleName.replace(/\./g, "/");

  // Try same directory first
  const sameDirPath = path.join(fromDir, modulePath + ".py");

  // Try project directory
  const projectPath = path.join(projectDir, modulePath + ".py");

  // Return the most likely path
  return sameDirPath;
}

function findPossiblyDeadCode(
  fileContents: Map<string, string>,
  language: string
): Array<{ symbol: string; file: string; reason: string }> {
  const possiblyDead: Array<{ symbol: string; file: string; reason: string }> =
    [];

  for (const [file, content] of fileContents) {
    const lines = content.split("\n");

    lines.forEach((line, idx) => {
      // Functions with TODO/FIXME that are never called
      if (/TODO|FIXME|DEPRECATED|HACK/.test(line)) {
        const funcMatch = lines[idx + 1]?.match(
          /(?:function|def|const|let)\s+(\w+)/
        );
        if (funcMatch) {
          possiblyDead.push({
            symbol: funcMatch[1],
            file: path.basename(file),
            reason: "Has TODO/FIXME/DEPRECATED comment",
          });
        }
      }

      // Commented out code blocks
      if (
        language !== "python" &&
        /^\s*\/\/\s*(function|const|class)/.test(line)
      ) {
        possiblyDead.push({
          symbol: `Line ${idx + 1}`,
          file: path.basename(file),
          reason: "Commented out code",
        });
      }
    });
  }

  return possiblyDead.slice(0, 20); // Limit results
}

/**
 * Validate orphaned files by checking if they're actually imported
 * using various import patterns (relative, alias, etc.)
 */
async function validateOrphanedFiles(
  orphanedFiles: string[],
  fileContents: Map<string, string>,
  projectDir: string,
  language: string
): Promise<string[]> {
  const validatedOrphaned: string[] = [];

  for (const orphanedFile of orphanedFiles) {
    const fileName = path.basename(orphanedFile);
    const fileNameNoExt = fileName.replace(/\.[^.]+$/, "");
    const relPath = path.relative(projectDir, orphanedFile);

    let isActuallyUsed = false;

    // Check all files for any reference to this file
    for (const [checkFile, content] of fileContents) {
      if (checkFile === orphanedFile) continue;

      // Check for various import patterns
      const patterns = [
        // Relative imports: ./Sidebar, ../components/Sidebar
        new RegExp(`from\\s+['"][^'"]*${fileNameNoExt}['"]`, "i"),
        new RegExp(
          `import\\s+[^'"]*from\\s+['"][^'"]*${fileNameNoExt}['"]`,
          "i"
        ),
        // Path alias imports: @/components/Sidebar
        new RegExp(`from\\s+['"]@/[^'"]*${fileNameNoExt}['"]`, "i"),
        // Direct file reference
        new RegExp(`['"]\\.\\.?/[^'"]*${fileNameNoExt}['"]`),
        // Component usage in JSX (for React components)
        new RegExp(`<${fileNameNoExt}[\\s/>]`),
      ];

      for (const pattern of patterns) {
        if (pattern.test(content)) {
          isActuallyUsed = true;
          break;
        }
      }

      if (isActuallyUsed) break;
    }

    // Only add to validated list if truly orphaned
    if (!isActuallyUsed) {
      validatedOrphaned.push(orphanedFile);
    }
  }

  return validatedOrphaned;
}

/**
 * Validate unused exports by checking if they're used internally
 * or referenced in ways the initial scan might have missed
 */
function validateUnusedExports(
  unusedExports: ExportedSymbol[],
  fileContents: Map<string, string>,
  usedSymbols: Set<string>
): ExportedSymbol[] {
  const validatedUnused: ExportedSymbol[] = [];

  for (const exp of unusedExports) {
    let isActuallyUsed = false;

    // Check if the symbol is used in any file (not just imported)
    for (const [checkFile, content] of fileContents) {
      // Skip the file where it's defined (we want external usage)
      if (checkFile === exp.file) continue;

      // Check for direct usage patterns
      const usagePatterns = [
        // Function call
        new RegExp(`\\b${exp.name}\\s*\\(`),
        // JSX component
        new RegExp(`<${exp.name}[\\s/>]`),
        // Property access
        new RegExp(`\\.${exp.name}\\b`),
        // Destructuring
        new RegExp(`\\{[^}]*\\b${exp.name}\\b[^}]*\\}`),
        // Variable reference
        new RegExp(`\\b${exp.name}\\b`),
      ];

      for (const pattern of usagePatterns) {
        if (pattern.test(content)) {
          // Verify it's not just in a comment or string
          const lines = content.split("\n");
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue;
            if (pattern.test(line)) {
              isActuallyUsed = true;
              break;
            }
          }
        }
        if (isActuallyUsed) break;
      }

      if (isActuallyUsed) break;
    }

    // Only add to validated list if truly unused
    if (!isActuallyUsed) {
      validatedUnused.push(exp);
    }
  }

  return validatedUnused;
}

/**
 * Categorize dead code into clear buckets for easier decision making
 */
function categorizeDeadCode(
  orphanedFiles: string[],
  unusedExports: ExportedSymbol[],
  fileContents: Map<string, string>,
  importedFiles: Set<string>,
  projectDir: string
): {
  completelyDead: Array<{
    file: string;
    reason: string;
    exports: string[];
    intent: string;
  }>;
  partiallyDead: Array<{
    file: string;
    usedExports: string[];
    unusedExports: string[];
  }>;
  unusedExportsInActiveFiles: Array<{
    file: string;
    symbol: string;
    line: number;
  }>;
  likelyIntentional: Array<{
    file: string;
    reason: string;
    recommendation: string;
  }>;
} {
  const completelyDead: Array<{
    file: string;
    reason: string;
    exports: string[];
    intent: string;
  }> = [];
  const partiallyDead: Array<{
    file: string;
    usedExports: string[];
    unusedExports: string[];
  }> = [];
  const unusedExportsInActiveFiles: Array<{
    file: string;
    symbol: string;
    line: number;
  }> = [];
  const likelyIntentional: Array<{
    file: string;
    reason: string;
    recommendation: string;
  }> = [];

  // Group unused exports by file
  const unusedByFile = new Map<string, ExportedSymbol[]>();
  for (const exp of unusedExports) {
    if (!unusedByFile.has(exp.file)) {
      unusedByFile.set(exp.file, []);
    }
    unusedByFile.get(exp.file)!.push(exp);
  }

  // Categorize orphaned files
  for (const file of orphanedFiles) {
    const relPath = path.relative(projectDir, file);
    const content = fileContents.get(file) || "";
    const fileExports = unusedByFile.get(file) || [];
    const intent = detectIntent(relPath, content, fileExports);

    if (intent.isLikelyIntentional) {
      likelyIntentional.push({
        file: relPath,
        reason: intent.reason,
        recommendation: intent.recommendation,
      });
    } else {
      completelyDead.push({
        file: relPath,
        reason: "File has 0 imports and 0 importedBy - completely unused",
        exports: fileExports.map((e) => e.name),
        intent: intent.reason,
      });
    }
  }

  // Categorize files with unused exports
  for (const [file, exports] of unusedByFile) {
    const relPath = path.relative(projectDir, file);

    // Skip if already categorized
    if (orphanedFiles.includes(file)) continue;

    // Check if file is imported (has some used exports)
    const isFileImported =
      importedFiles.has(file) || importedFiles.has(relPath);

    if (isFileImported) {
      // File is active but has unused exports
      for (const exp of exports) {
        unusedExportsInActiveFiles.push({
          file: relPath,
          symbol: exp.name,
          line: exp.line,
        });
      }
    } else {
      // File might be partially dead - imports things but nothing imports it
      const content = fileContents.get(file) || "";
      const hasImports = /import\s+/.test(content) || /from\s+/.test(content);
      const intent = detectIntent(relPath, content, exports);

      if (intent.isLikelyIntentional) {
        likelyIntentional.push({
          file: relPath,
          reason: intent.reason,
          recommendation: intent.recommendation,
        });
      } else if (hasImports) {
        partiallyDead.push({
          file: relPath,
          usedExports: [],
          unusedExports: exports.map((e) => e.name),
        });
      } else {
        completelyDead.push({
          file: relPath,
          reason: "File has no imports and nothing imports it",
          exports: exports.map((e) => e.name),
          intent: intent.reason,
        });
      }
    }
  }

  return {
    completelyDead,
    partiallyDead,
    unusedExportsInActiveFiles,
    likelyIntentional,
  };
}

/**
 * Detect if unused code is likely intentional (future use, migration, etc.)
 */
function detectIntent(
  filePath: string,
  content: string,
  exports: ExportedSymbol[]
): { isLikelyIntentional: boolean; reason: string; recommendation: string } {
  const fileName = path.basename(filePath).toLowerCase();
  const dirName = path.dirname(filePath).toLowerCase();

  // Pattern 1: React Query hooks that follow the same pattern as used hooks
  if (fileName.startsWith("use") && fileName.endsWith(".ts")) {
    if (
      content.includes("useQuery") ||
      content.includes("useMutation") ||
      content.includes("@tanstack/react-query")
    ) {
      return {
        isLikelyIntentional: true,
        reason: "React Query hook - likely for migration or future use",
        recommendation:
          "Use this hook instead of direct API calls, or delete if migration abandoned",
      };
    }
  }

  // Pattern 2: Validation schemas
  if (filePath.includes("validation") || filePath.includes("schema")) {
    if (
      content.includes("zod") ||
      content.includes("yup") ||
      content.includes("Schema")
    ) {
      return {
        isLikelyIntentional: true,
        reason: "Validation schema - may be for future form validation",
        recommendation: "Review if schemas should be used for form validation",
      };
    }
  }

  // Pattern 3: API service files
  if (dirName.includes("services") || dirName.includes("api")) {
    if (
      content.includes("fetch") ||
      content.includes("axios") ||
      content.includes("api")
    ) {
      return {
        isLikelyIntentional: true,
        reason: "API service - backend integration may be incomplete",
        recommendation: "Check if backend endpoint exists and wire up frontend",
      };
    }
  }

  // Pattern 4: Example/Demo files
  if (
    fileName.includes("example") ||
    fileName.includes("demo") ||
    fileName.includes("sample")
  ) {
    return {
      isLikelyIntentional: false,
      reason: "Example/demo file - safe to delete",
      recommendation: "Delete unless needed for documentation",
    };
  }

  // Pattern 5: Migration files
  if (fileName.includes("migration") || content.includes("// TODO: migrate")) {
    return {
      isLikelyIntentional: true,
      reason: "Migration-related code",
      recommendation: "Complete migration or delete if abandoned",
    };
  }

  // Pattern 6: Incomplete features with TODO
  if (content.includes("// TODO") || content.includes("not yet implemented")) {
    return {
      isLikelyIntentional: true,
      reason: "Incomplete feature with TODO comments",
      recommendation: "Complete the feature or delete if abandoned",
    };
  }

  // Pattern 7: Proxy/middleware
  if (fileName.includes("proxy") || fileName.includes("middleware")) {
    return {
      isLikelyIntentional: false,
      reason: "Proxy/middleware - check if superseded",
      recommendation: "Verify no other middleware handles this, then delete",
    };
  }

  // Default: likely dead
  return {
    isLikelyIntentional: false,
    reason: "No clear intent detected",
    recommendation: "Safe to delete after verification",
  };
}

function formatResponse(data: any) {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };
}

/**
 * Analyze dead code using the shared project context
 * This is much faster than re-scanning all files
 */
async function analyzeWithContext(
  context: ProjectContext,
  directory: string,
  entryPoints: string[],
  includeTypes: boolean,
  startTime: number
): Promise<any> {
  logger.info(`Analyzing dead code using shared context...`);

  // Use the pre-built dependency graph from context
  const allExports: ExportedSymbol[] = [];
  const usedSymbols = new Set<string>();
  const importedFiles = new Set<string>();

  // Collect exports from context
  for (const [filePath, fileInfo] of context.files) {
    if (fileInfo.isTest) continue; // Skip test files

    for (const exp of fileInfo.exports) {
      if (!includeTypes && exp.kind === "type") continue;

      allExports.push({
        name: exp.name,
        file: filePath,
        line: exp.line,
        type: exp.isDefault ? "default" : (exp.kind as any),
      });
    }
  }

  // Collect used symbols from context's symbol index
  for (const [symbolName, definitions] of context.symbolIndex) {
    // If a symbol is defined in multiple places or imported, it's used
    if (definitions.length > 0) {
      usedSymbols.add(symbolName);
    }
  }

  // Use the pre-built import graph
  for (const [filePath, imports] of context.importGraph) {
    for (const importedFile of imports) {
      importedFiles.add(importedFile);
      importedFiles.add(path.relative(directory, importedFile));
    }
  }

  // Also track files that are imported (from reverse graph)
  for (const [filePath, importers] of context.reverseImportGraph) {
    if (importers.length > 0) {
      importedFiles.add(filePath);
      importedFiles.add(path.relative(directory, filePath));
    }
  }

  // Framework entry point patterns
  const frameworkEntryPatterns = [
    /[\/\\]app[\/\\].*page\.[jt]sx?$/,
    /[\/\\]app[\/\\].*layout\.[jt]sx?$/,
    /[\/\\]app[\/\\].*route\.[jt]sx?$/,
    /[\/\\]pages[\/\\].*\.[jt]sx?$/,
    /next\.config\.[jt]s$/,
    /middleware\.[jt]s$/,
    /\.config\.[jt]s$/,
  ];

  // Find unused exports
  const unusedExports = allExports.filter((exp) => {
    if (frameworkEntryPatterns.some((p) => p.test(exp.file))) return false;
    if (exp.type === "default") {
      return !importedFiles.has(exp.file) && !usedSymbols.has(exp.name);
    }
    return !usedSymbols.has(exp.name);
  });

  // Find orphaned files using context
  const knownEntryPatterns = [
    /index\.[jt]sx?$/,
    /main\.[jt]sx?$/,
    /server\.[jt]sx?$/,
    ...frameworkEntryPatterns,
  ];

  const orphanedFiles: string[] = [];
  for (const [filePath, fileInfo] of context.files) {
    if (fileInfo.isTest || fileInfo.isConfig || fileInfo.isEntryPoint) continue;

    const relPath = path.relative(directory, filePath);
    if (entryPoints.some((ep: string) => relPath.includes(ep))) continue;
    if (knownEntryPatterns.some((p) => p.test(filePath))) continue;

    // Check if file is imported using the reverse import graph
    const importers = context.reverseImportGraph.get(filePath) || [];
    if (importers.length === 0) {
      orphanedFiles.push(filePath);
    }
  }

  const elapsed = Date.now() - startTime;

  return formatResponse({
    success: true,
    usedContext: true,
    unusedExports: unusedExports.map((e) => ({
      symbol: e.name,
      file: path.relative(directory, e.file),
      line: e.line,
      type: e.type,
    })),
    orphanedFiles: orphanedFiles.map((f) => path.relative(directory, f)),
    possiblyDead: [],
    summary: {
      totalFiles: context.files.size,
      totalExports: allExports.length,
      unusedExports: unusedExports.length,
      orphanedFiles: orphanedFiles.length,
      framework: context.framework?.name,
    },
    stats: {
      analysisTime: `${elapsed}ms`,
      contextBased: true,
    },
    recommendation:
      orphanedFiles.length > 0 ?
        `🗑️ ${orphanedFiles.length} orphaned files found - review before removing`
      : unusedExports.length > 0 ?
        `⚠️ ${unusedExports.length} unused exports found - review before removing`
      : "✅ No obvious dead code found",
  });
}
