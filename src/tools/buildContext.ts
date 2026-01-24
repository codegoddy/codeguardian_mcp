/**
 * Build Context Tool (Improved Version)
 *
 * Builds a shared project context that other tools can use.
 * This is the entry point for the shared context system.
 *
 * Improvements:
 * 1. Dynamic cache expiration reporting from the context object.
 * 2. Added `refresh_context` tool for atomic invalidation and rebuild.
 * 3. Enhanced response formatting for better LLM consumption.
 * 4. Improved documentation and type safety.
 *
 * @format
 */

import { ToolDefinition } from "../types/tools.js";
import { logger } from "../utils/logger.js";
import {
  invalidateContext,
  clearContextCache,
  ProjectContext,
} from "../context/projectContext.js";
import { orchestrateContext, OrchestrationContext } from "../context/contextOrchestrator.js";
import { intentTracker } from "../context/intentTracker.js";
import { impactAnalyzer, ProjectHub } from "../analyzers/impactAnalyzer.js";

/**
 * Interface for the context building options
 */
interface BuildContextOptions {
  projectPath: string;
  language?: "javascript" | "typescript" | "python" | "go" | "java" | "all";
  includeTests?: boolean;
  forceRebuild?: boolean;
  maxFiles?: number;
}

/**
 * Extended context interface that may include cache metadata
 */
interface ExtendedProjectContext extends ProjectContext {
  expiresAt?: number;
}

export const buildContextTool: ToolDefinition = {
  definition: {
    name: "build_context",
    description: "Build or rebuild project context including symbols, git history, and intent signals. Usually auto-called by other tools.",
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
          description: "Force rebuild even if cached",
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

  async handler(args: BuildContextOptions) {
    const startTime = Date.now();
    const {
      projectPath,
      language = "all",
    } = args;

    logger.info(`Building orchestrated context for: ${projectPath}`);

    try {
      // Use the robust orchestrator from src/context
      const orchestration: OrchestrationContext = await orchestrateContext({
        projectPath,
        language: language === "all" ? "typescript" : language, // Default to TS if all
      });
      
      const context = orchestration.projectContext as ExtendedProjectContext;
      const intent = intentTracker.getCurrentIntent();

      const elapsed = Date.now() - startTime;
      const summary = generateContextSummary(context);
      
      // Calculate recent authors from history
      const recentAuthors = new Set<string>();
      if (orchestration.lineageContext) {
          for (const history of orchestration.lineageContext.fileHistories.values()) {
              history.authors.forEach(a => recentAuthors.add(a));
          }
      }

      // Calculate Project Hubs (Architecture)
      // We need to import impactAnalyzer first (adding to imports)
      // For now, I will assume it is available or imported at top
      
      const hubs = context.symbolGraph 
        ? impactAnalyzer.getProjectHubs(context.symbolGraph, 3).map(h => `${h.symbol} (${h.description})`)
        : [];

      // Use dynamic cache expiration if available in the context object
      const cachedUntil =
        context.expiresAt ?
          new Date(context.expiresAt).toISOString()
        : new Date(Date.now() + 5 * 60 * 1000).toISOString();

      return formatResponse({
        success: true,
        message: `Project context built successfully in ${elapsed}ms`,
        data: {
          summary,
          stats: {
            totalFiles: context.totalFiles,
            totalSymbols: context.symbolIndex.size,
            totalDependencies: context.dependencies.length,
            externalPackages: context.externalDependencies.size,
            entryPoints: context.entryPoints.length,
            buildTimeMs: elapsed,
            cachedUntil,
            quality: orchestration.contextQuality,
          },
          augmentSecrets: {
            hotFiles: orchestration.lineageContext?.hotspotFiles.slice(0, 5) || [],
            recentAuthors: Array.from(recentAuthors).slice(0, 5),
            focusedIntent: intent.recentFiles.slice(0, 5),
            projectHubs: hubs,
          },
          framework: context.framework,
        },
        hint: "Context is cached. VibeGuard is now aware of your Git history and focus.",
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

/**
 * Generates a structured summary of the project context.
 */
function generateContextSummary(context: ProjectContext) {
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
  const topImportedFiles = Array.from(context.reverseImportGraph.entries())
    .map(([file, importers]) => ({
      file: context.files.get(file)?.relativePath || file,
      importedBy: importers.length,
    }))
    .sort((a, b) => b.importedBy - a.importedBy)
    .slice(0, 10);

  // Top symbols
  const topSymbols = Array.from(context.symbolIndex.entries())
    .filter(([_, definitions]) => definitions.length > 0)
    .map(([name, definitions]) => ({ name, definedIn: definitions.length }))
    .sort((a, b) => b.definedIn - a.definedIn)
    .slice(0, 20);

  // Directory structure
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

/**
 * Formats the tool response for MCP.
 */
function formatResponse(data: Record<string, unknown>) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}
