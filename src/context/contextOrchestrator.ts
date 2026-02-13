/**
 * Context Orchestrator
 *
 * Coordinates all context features to work together seamlessly.
 * Inspired by Augment Code's invisible, harmonious integration.
 *
 * @format
 */

import { getProjectContext, type ProjectContext, type ApiContractContext } from "./projectContext.js";
import { intentTracker } from "./intentTracker.js";
import { contextLineage, type LineageContext } from "./contextLineage.js";
import { getRelevantSymbolsForValidation } from "../analyzers/relevanceScorer.js";
import { logger } from "../utils/logger.js";
import { validateApiContractsFromContext, type ApiContractIssue } from "../api-contract/validators/index.js";

export interface OrchestrationContext {
  projectContext: ProjectContext;
  lineageContext: LineageContext | null;
  relevantSymbols: string[];
  useIncremental: boolean;
  contextQuality: "excellent" | "good" | "fair" | "poor";
  recommendations: string[];
  // API Contract Guardian integration
  apiContractIssues?: ApiContractIssue[];
  apiContractSummary?: {
    totalIssues: number;
    critical: number;
    high: number;
    matchedEndpoints: number;
    matchedTypes: number;
  };
}

/**
 * Orchestrate all context features to work together
 */
export async function orchestrateContext(options: {
  projectPath: string;
  language: string;
  newCode?: string;
  imports?: string[];
  useSmartContext?: boolean;
  includeLineage?: boolean;
  forceRebuild?: boolean;
  includeTests?: boolean;
  maxFiles?: number;
  sessionId?: string;
  currentFile?: string;
  recentlyEditedFiles?: string[];
}): Promise<OrchestrationContext> {
  const orchestrationStart = Date.now();
  const {
    projectPath,
    language,
    newCode,
    imports = [],
    useSmartContext = true,
    includeLineage = false,
    forceRebuild = false,
    includeTests = true,
    maxFiles,
    sessionId,
    currentFile,
    recentlyEditedFiles = [],
  } = options;

  const recommendations: string[] = [];
  let contextQuality: "excellent" | "good" | "fair" | "poor" = "good";

  // 1. Get project context (with branch-aware caching)
  const contextStart = Date.now();
  const projectContext = await getProjectContext(projectPath, {
    language, // Use the requested language without overriding
    forceRebuild,
    includeTests,
    ...(typeof maxFiles === "number" ? { maxFiles } : {}),
  });
  logger.debug(`Project context loaded in ${Date.now() - contextStart}ms`);

  // 2. Get developer intent
  const intent = intentTracker.getCurrentIntent();
  if (intent.recentFiles.length > 0) {
    logger.debug(
      `Developer intent: ${intent.recentFiles.length} recent files, focus: ${intent.focusArea || "none"}`,
    );
  }

  // 3. Determine if we should use smart context (cheap checks only)
  const shouldUseSmartContext =
    useSmartContext &&
    projectContext.symbolGraph &&
    projectContext.symbolIndex.size > 100 &&
    (imports.length > 0 || intent.recentSymbols.size > 0);

  // 4. Get git lineage context
  let lineageContext: LineageContext | null = null;
  // - for validate_code: only when smart context is enabled (performance)
  // - for build_context: always when includeLineage is explicitly requested
  if (includeLineage || shouldUseSmartContext) {
    try {
      lineageContext = await contextLineage.getLineageContext(projectPath, {
        commitDepth: 20,
      });
      if (lineageContext) {
        logger.debug(
          `Git lineage: ${lineageContext.recentlyModifiedFiles.length} recent files, ${lineageContext.hotspotFiles.length} hotspots`,
        );
      }
    } catch {
      logger.debug("Git lineage not available");
    }
  }

  // 5. Get relevant symbols using all available context
  let relevantSymbols: string[] = [];
  if (shouldUseSmartContext) {
    relevantSymbols = getRelevantSymbolsForValidation(
      projectContext,
      {
        importedSymbols: imports,
        currentFile,
        recentFiles: [...new Set([...intent.recentFiles, ...recentlyEditedFiles])],
        lineageContext,
      },
      0.3, // Min relevance score
      200, // Max symbols
    );

    const reductionPercent = Math.round(
      (1 - relevantSymbols.length / projectContext.symbolIndex.size) * 100,
    );
    logger.debug(
      `Smart context: ${relevantSymbols.length}/${projectContext.symbolIndex.size} symbols (${reductionPercent}% reduction)`,
    );

    if (reductionPercent > 70) {
      contextQuality = "excellent";
    } else if (reductionPercent > 50) {
      contextQuality = "good";
    } else {
      contextQuality = "fair";
    }
  } else {
    contextQuality = "fair";
    if (projectContext.symbolIndex.size > 100) {
      recommendations.push(
        useSmartContext
          ? "Consider providing imports or using sessionId for better context"
          : "Smart context disabled; running full-context validation",
      );
    }
  }

  // 6. Determine if incremental validation is beneficial
  const useIncremental = Boolean(
    sessionId && newCode && newCode.split("\n").length > 10,
  );

  // 7. Quality assessment
  if (!projectContext.symbolGraph) {
    contextQuality = "poor";
    recommendations.push("Symbol graph not available - rebuild context");
  }

  if (intent.recentFiles.length === 0 && !lineageContext) {
    recommendations.push(
      "No session context - provide sessionId for better results",
    );
  }

  // 8. API Contract validation (if context has API Contract info)
  let apiContractIssues: ApiContractIssue[] | undefined;
  let apiContractSummary: OrchestrationContext["apiContractSummary"] | undefined;

  if (projectContext.apiContract) {
    const validationResult = validateApiContractsFromContext(projectContext);
    apiContractIssues = validationResult.issues;
    apiContractSummary = {
      totalIssues: validationResult.summary.totalIssues,
      critical: validationResult.summary.critical,
      high: validationResult.summary.high,
      matchedEndpoints: validationResult.summary.matchedEndpoints,
      matchedTypes: validationResult.summary.matchedTypes,
    };

    if (validationResult.summary.critical > 0) {
      recommendations.push(
        `${validationResult.summary.critical} critical API contract issues detected - review recommended`,
      );
    }
  }

  const totalTime = Date.now() - orchestrationStart;
  logger.info(`Context orchestration completed in ${totalTime}ms (quality: ${contextQuality})`);
  
  // Performance warning
  if (totalTime > 5000) {
    logger.warn(`Slow orchestration detected (${totalTime}ms) - consider limiting project scope`);
  }

  return {
    projectContext,
    lineageContext,
    relevantSymbols,
    useIncremental,
    contextQuality,
    recommendations,
    apiContractIssues,
    apiContractSummary,
  };
}

/**
 * Record validation event for future context
 */
export function recordValidationEvent(options: {
  filePath?: string;
  symbols: string[];
  language: string;
}): void {
  const { filePath, symbols, language } = options;

  if (filePath) {
    intentTracker.recordEdit({
      filePath,
      timestamp: Date.now(),
      symbols,
      language,
    });
  }
}

/**
 * Get context quality explanation
 */
export function explainContextQuality(
  quality: "excellent" | "good" | "fair" | "poor",
): string {
  switch (quality) {
    case "excellent":
      return "All context features active: smart filtering (>70% reduction), git history, and session tracking";
    case "good":
      return "Most context features active: smart filtering (>50% reduction) with some history";
    case "fair":
      return "Basic context available: limited filtering or missing session data";
    case "poor":
      return "Minimal context: missing symbol graph or project data";
  }
}
