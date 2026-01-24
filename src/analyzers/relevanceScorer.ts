/**
 * Relevance Scorer
 *
 * Scores symbols by relevance to the current validation context.
 * Inspired by Augment Code's "helpfulness over relevance" approach.
 *
 * Uses multiple signals:
 * - Import relationships (what's explicitly imported)
 * - Intent-based context (recently edited symbols) - NEW
 * - Co-occurrence patterns (symbols often used together)
 * - Usage frequency (popular symbols)
 * - File proximity (symbols from nearby files)
 *
 * @format
 */

import { ProjectContext } from "../context/projectContext.js";
import { SymbolGraph } from "../types/symbolGraph.js";
import { getRelevantSymbols } from "./symbolGraph.js";
import { logger } from "../utils/logger.js";
import { intentTracker } from "../context/intentTracker.js";
import {
  contextLineage,
  type LineageContext,
} from "../context/contextLineage.js";

export interface RelevanceContext {
  // Symbols explicitly imported in the code being validated
  importedSymbols?: string[];

  // File being edited (if known)
  currentFile?: string;

  // Recently edited files (session context)
  recentFiles?: string[];

  // Git lineage context (optional)
  lineageContext?: LineageContext | null;
}

export interface ScoredSymbol {
  symbol: string;
  score: number;
  reasons: string[];
}

/**
 * Score all symbols by relevance to the current context
 * Returns symbols sorted by relevance (highest first)
 */
export function scoreSymbolRelevance(
  projectContext: ProjectContext,
  relevanceContext: RelevanceContext,
  maxResults: number = 200,
): ScoredSymbol[] {
  const startTime = Date.now();
  const scores = new Map<string, { score: number; reasons: Set<string> }>();

  const {
    importedSymbols = [],
    currentFile,
    recentFiles = [],
    lineageContext,
  } = relevanceContext;
  const symbolGraph = projectContext.symbolGraph;

  if (!symbolGraph) {
    logger.warn("Symbol graph not available, falling back to all symbols");
    return getAllSymbolsWithBasicScoring(projectContext, maxResults);
  }

  // Signal 1: Explicitly imported symbols (highest priority)
  for (const imported of importedSymbols) {
    addScore(scores, imported, 1.0, "Explicitly imported");
  }

  // Signal 2: Symbols related to imports (via symbol graph)
  const relatedToImports = getRelevantSymbols(symbolGraph, importedSymbols, 50);
  for (const symbol of relatedToImports) {
    addScore(scores, symbol, 0.8, "Related to imports");
  }

  // Signal 3: Symbols from current file
  if (currentFile && projectContext.files.has(currentFile)) {
    const fileInfo = projectContext.files.get(currentFile)!;
    for (const symbol of fileInfo.symbols) {
      addScore(scores, symbol.name, 0.7, "From current file");
    }
  }

  // Signal 4: Intent-based - Recently edited files & symbols (NEW - merged)
  const intent = intentTracker.getCurrentIntent();
  const allRecentFiles = new Set([...recentFiles, ...intent.recentFiles]);

  // Boost symbols from recently edited files (high priority)
  for (const filePath of allRecentFiles) {
    if (projectContext.files.has(filePath)) {
      const fileInfo = projectContext.files.get(filePath)!;
      for (const symbol of fileInfo.symbols) {
        addScore(scores, symbol.name, 0.9, "Recently edited");
      }
    }
  }

  // Boost specific recently edited symbols
  for (const symbol of intent.recentSymbols) {
    addScore(scores, symbol, 0.6, "Recently edited");
  }

  // Signal 5: Git lineage - Recently modified files (NEW)
  if (lineageContext) {
    // Symbols from recently modified files
    for (const filePath of lineageContext.recentlyModifiedFiles.slice(0, 10)) {
      if (projectContext.files.has(filePath)) {
        const fileInfo = projectContext.files.get(filePath)!;
        const lineageScore = contextLineage.getFileLineageScore(
          filePath,
          lineageContext,
        );
        for (const symbol of fileInfo.symbols) {
          addScore(
            scores,
            symbol.name,
            lineageScore * 0.5,
            "Recently modified (git)",
          );
        }
      }
    }

    // Symbols from hotspot files (frequently changed)
    for (const filePath of lineageContext.hotspotFiles.slice(0, 5)) {
      if (projectContext.files.has(filePath)) {
        const fileInfo = projectContext.files.get(filePath)!;
        for (const symbol of fileInfo.symbols) {
          addScore(scores, symbol.name, 0.35, "Hotspot file");
        }
      }
    }
  }

  // Signal 7: Frequently used symbols (global popularity)
  const popularSymbols = getPopularSymbols(symbolGraph, 100);
  for (const { symbol, usageCount } of popularSymbols) {
    const popularityScore = Math.min(0.4, usageCount / 100);
    addScore(scores, symbol, popularityScore, `Popular (${usageCount} uses)`);
  }

  // Signal 8: Symbols from files that import similar things
  const similarFiles = findSimilarFiles(projectContext, importedSymbols);
  for (const filePath of similarFiles.slice(0, 5)) {
    const fileInfo = projectContext.files.get(filePath)!;
    for (const symbol of fileInfo.symbols) {
      addScore(scores, symbol.name, 0.3, "From similar file");
    }
  }

  // Convert to sorted array
  const scored: ScoredSymbol[] = Array.from(scores.entries())
    .map(([symbol, { score, reasons }]) => ({
      symbol,
      score,
      reasons: Array.from(reasons),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults);

  const elapsed = Date.now() - startTime;
  logger.debug(
    `Scored ${scores.size} symbols in ${elapsed}ms, returning top ${scored.length}`,
  );

  return scored;
}

/**
 * Add score to a symbol with a reason
 */
function addScore(
  scores: Map<string, { score: number; reasons: Set<string> }>,
  symbol: string,
  scoreToAdd: number,
  reason: string,
): void {
  if (!scores.has(symbol)) {
    scores.set(symbol, { score: 0, reasons: new Set() });
  }
  const entry = scores.get(symbol)!;
  entry.score += scoreToAdd;
  entry.reasons.add(reason);
}

/**
 * Get most popular symbols by usage count
 */
function getPopularSymbols(
  symbolGraph: SymbolGraph,
  limit: number,
): Array<{ symbol: string; usageCount: number }> {
  return Array.from(symbolGraph.usage.entries())
    .map(([symbol, usage]) => ({ symbol, usageCount: usage.usageCount }))
    .sort((a, b) => b.usageCount - a.usageCount)
    .slice(0, limit);
}

/**
 * Find files that import similar symbols (similar context)
 */
function findSimilarFiles(
  projectContext: ProjectContext,
  importedSymbols: string[],
): string[] {
  const fileScores = new Map<string, number>();

  for (const [filePath, fileInfo] of projectContext.files) {
    let matchCount = 0;

    // Count how many of the imported symbols this file also imports
    for (const imp of fileInfo.imports) {
      const fileImports = [...imp.namedImports, imp.defaultImport].filter(
        Boolean,
      );
      for (const imported of importedSymbols) {
        if (fileImports.includes(imported)) {
          matchCount++;
        }
      }
    }

    if (matchCount > 0) {
      fileScores.set(filePath, matchCount);
    }
  }

  return Array.from(fileScores.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([filePath]) => filePath);
}

/**
 * Fallback: Get all symbols with basic scoring when symbol graph unavailable
 */
function getAllSymbolsWithBasicScoring(
  projectContext: ProjectContext,
  maxResults: number,
): ScoredSymbol[] {
  const scored: ScoredSymbol[] = [];

  for (const [symbol, definitions] of projectContext.symbolIndex) {
    scored.push({
      symbol,
      score: 0.5, // Neutral score
      reasons: [`Defined in ${definitions.length} file(s)`],
    });
  }

  return scored.slice(0, maxResults);
}

/**
 * Filter symbols to only the most relevant ones
 * This is the main API for validation to use
 */
export function getRelevantSymbolsForValidation(
  projectContext: ProjectContext,
  relevanceContext: RelevanceContext,
  minScore: number = 0.3,
  maxResults: number = 200,
): string[] {
  const scored = scoreSymbolRelevance(
    projectContext,
    relevanceContext,
    maxResults * 2,
  );

  // Filter by minimum score and limit results
  const relevant = scored
    .filter((s) => s.score >= minScore)
    .slice(0, maxResults)
    .map((s) => s.symbol);

  logger.debug(
    `Filtered to ${relevant.length} relevant symbols (min score: ${minScore})`,
  );

  return relevant;
}

/**
 * Get detailed relevance information for debugging/logging
 */
export function explainRelevance(
  projectContext: ProjectContext,
  relevanceContext: RelevanceContext,
  topN: number = 10,
): string {
  const scored = scoreSymbolRelevance(projectContext, relevanceContext, topN);

  const lines = [`Top ${topN} relevant symbols:`, ""];

  for (const { symbol, score, reasons } of scored) {
    lines.push(`  ${symbol} (score: ${score.toFixed(2)})`);
    for (const reason of reasons) {
      lines.push(`    - ${reason}`);
    }
  }

  return lines.join("\n");
}
