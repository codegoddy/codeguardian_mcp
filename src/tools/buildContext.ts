/**
 * Build Context Tool
 *
 * Builds a shared project context that other tools can use.
 * This is the entry point for the shared context system.
 *
 * Usage pattern:
 * 1. Call build_context once at the start of a session
 * 2. Other tools automatically use the cached context
 * 3. Context is cached for 5 minutes, auto-rebuilds if stale
 *
 * @format
 */

import { ToolDefinition } from "../types/tools.js";
import { logger } from "../utils/logger.js";
import {
  getProjectContext,
  invalidateContext,
  clearContextCache,
  ProjectContext,
} from "../context/projectContext.js";

export const buildContextTool: ToolDefinition = {
  definition: {
    name: "build_context",
    description: `Build a shared project context that accelerates all other CodeGuardian tools.

NOTE: Context is now AUTO-BUILT by other tools when needed. You only need to call this explicitly if you want to:
- Force a rebuild after major changes
- Pre-warm the cache before running multiple tools
- Get detailed stats about the project structure

The context is cached and automatically used by:
- validate_code: Knows what symbols exist, reduces false positives
- discover_context: Instant results from cached index
- find_dead_code: Uses dependency graph for accurate detection
- get_dependency_graph: Pre-computed graph available
- scan_directory: Smarter issue prioritization
- get_test_coverage_gaps: Knows which functions are tested

Smart invalidation: Context auto-refreshes when files change (checks modification times).

Returns a summary of the project structure and what was indexed.`,
    inputSchema: {
      type: "object",
      properties: {
        projectPath: {
          type: "string",
          description: "Root path of the project to analyze",
        },
        language: {
          type: "string",
          enum: ["javascript", "typescript", "python", "go", "java", "all"],
          description: "Programming language to focus on (default: all)",
          default: "all",
        },
        includeTests: {
          type: "boolean",
          description: "Include test files in context (default: true)",
          default: true,
        },
        forceRebuild: {
          type: "boolean",
          description:
            "Force rebuild even if cached context exists (default: false)",
          default: false,
        },
        maxFiles: {
          type: "number",
          description: "Maximum files to index (default: 1000)",
          default: 1000,
        },
      },
      required: ["projectPath"],
    },
  },

  async handler(args: any) {
    const startTime = Date.now();

    const {
      projectPath,
      language = "all",
      includeTests = true,
      forceRebuild = false,
      maxFiles = 1000,
    } = args;

    logger.info(`Building context for: ${projectPath}`);

    try {
      const context = await getProjectContext(projectPath, {
        language,
        includeTests,
        forceRebuild,
        maxFiles,
      });

      const elapsed = Date.now() - startTime;

      // Generate summary
      const summary = generateContextSummary(context);

      return formatResponse({
        success: true,
        message: `Project context built successfully in ${elapsed}ms`,
        summary,
        stats: {
          totalFiles: context.totalFiles,
          totalSymbols: context.symbolIndex.size,
          totalDependencies: context.dependencies.length,
          externalPackages: context.externalDependencies.size,
          entryPoints: context.entryPoints.length,
          buildTime: `${elapsed}ms`,
          cachedUntil: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        },
        framework: context.framework,
        hint: "Context is now cached. Other tools will automatically use it for faster, more accurate results.",
      });
    } catch (error) {
      logger.error("Error building context:", error);
      return formatResponse({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
};

function generateContextSummary(context: ProjectContext): {
  filesByLanguage: Record<string, number>;
  symbolsByKind: Record<string, number>;
  topImportedFiles: Array<{ file: string; importedBy: number }>;
  topSymbols: Array<{ name: string; definedIn: number }>;
  directoryStructure: string[];
} {
  // Files by language
  const filesByLanguage: Record<string, number> = {};
  for (const file of context.files.values()) {
    filesByLanguage[file.language] = (filesByLanguage[file.language] || 0) + 1;
  }

  // Symbols by kind
  const symbolsByKind: Record<string, number> = {};
  for (const definitions of context.symbolIndex.values()) {
    for (const def of definitions) {
      symbolsByKind[def.symbol.kind] =
        (symbolsByKind[def.symbol.kind] || 0) + 1;
    }
  }

  // Top imported files
  const importCounts: Array<{ file: string; importedBy: number }> = [];
  for (const [file, importers] of context.reverseImportGraph) {
    importCounts.push({
      file: context.files.get(file)?.relativePath || file,
      importedBy: importers.length,
    });
  }
  importCounts.sort((a, b) => b.importedBy - a.importedBy);
  const topImportedFiles = importCounts.slice(0, 10);

  // Top symbols (defined in multiple files or heavily used)
  const symbolCounts: Array<{ name: string; definedIn: number }> = [];
  for (const [name, definitions] of context.symbolIndex) {
    if (definitions.length > 0) {
      symbolCounts.push({ name, definedIn: definitions.length });
    }
  }
  symbolCounts.sort((a, b) => b.definedIn - a.definedIn);
  const topSymbols = symbolCounts.slice(0, 20);

  // Directory structure (unique directories)
  const directories = new Set<string>();
  for (const file of context.files.values()) {
    const parts = file.relativePath.split("/");
    if (parts.length > 1) {
      directories.add(parts.slice(0, -1).join("/"));
    }
  }
  const directoryStructure = Array.from(directories).sort().slice(0, 20);

  return {
    filesByLanguage,
    symbolsByKind,
    topImportedFiles,
    topSymbols,
    directoryStructure,
  };
}

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

// Also export tools for cache management
export const invalidateContextTool: ToolDefinition = {
  definition: {
    name: "invalidate_context",
    description:
      "Invalidate cached context for a project. Use after making significant changes to force a rebuild on next tool call.",
    inputSchema: {
      type: "object",
      properties: {
        projectPath: {
          type: "string",
          description:
            "Project path to invalidate (or 'all' to clear everything)",
        },
      },
      required: ["projectPath"],
    },
  },

  async handler(args: any) {
    const { projectPath } = args;

    if (projectPath === "all") {
      clearContextCache();
      return formatResponse({
        success: true,
        message: "All cached contexts cleared",
      });
    }

    invalidateContext(projectPath);
    return formatResponse({
      success: true,
      message: `Context invalidated for ${projectPath}`,
    });
  },
};
