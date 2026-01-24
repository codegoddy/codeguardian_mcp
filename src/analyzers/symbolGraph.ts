/**
 * Symbol Graph Builder
 *
 * Builds symbol-level dependency graphs to understand relationships between
 * functions, classes, and other symbols across the codebase.
 *
 * Inspired by Augment Code's semantic dependency analysis.
 *
 * @format
 */

import { ProjectContext, FileInfo } from "../context/projectContext.js";
import {
  extractUsagesAST,
  extractImportsAST,
} from "../tools/validation/extractors/index.js";
import {
  SymbolGraph,
  SymbolRelationship,
  SymbolUsage,
  SymbolGraphOptions,
  RelatedSymbols,
  RelationType,
} from "../types/symbolGraph.js";
import { logger } from "../utils/logger.js";

/**
 * Build symbol-level dependency graph from project context
 */
export async function buildSymbolGraph(
  context: ProjectContext,
  options: SymbolGraphOptions = {},
): Promise<SymbolGraph> {
  const {
    includeCallRelationships = true,
    includeCoOccurrence = true,
    minCoOccurrenceCount = 2,
  } = options;

  logger.debug("Building symbol graph...");
  const startTime = Date.now();

  const graph: SymbolGraph = {
    relationships: [],
    usage: new Map(),
    symbolToFiles: new Map(),
    fileToSymbols: new Map(),
    coOccurrence: new Map(),
  };

  // Step 1: Build basic symbol-to-file mappings
  await buildSymbolMappings(context, graph);

  // Step 2: Extract import relationships
  await extractImportRelationships(context, graph);

  // Step 3: Extract call relationships (if enabled)
  if (includeCallRelationships) {
    await extractCallRelationships(context, graph);
  }

  // Step 4: Build co-occurrence matrix (if enabled)
  if (includeCoOccurrence) {
    await buildCoOccurrenceMatrix(context, graph, minCoOccurrenceCount);
  }

  // Step 5: Link Semantic Bridge (Cross-Language)
  await linkSemanticBridge(graph);

  // Step 5: Calculate usage statistics
  calculateUsageStats(graph);

  const elapsed = Date.now() - startTime;
  logger.debug(
    `Symbol graph built in ${elapsed}ms (${graph.relationships.length} relationships, ${graph.usage.size} symbols)`,
  );

  return graph;
}

/**
 * Build basic symbol-to-file and file-to-symbol mappings
 */
async function buildSymbolMappings(
  context: ProjectContext,
  graph: SymbolGraph,
): Promise<void> {
  let i = 0;
  for (const [filePath, fileInfo] of context.files) {
    i++;
    const symbolsInFile = new Set<string>();

    for (const symbol of fileInfo.symbols) {
      // Track symbol -> files
      if (!graph.symbolToFiles.has(symbol.name)) {
        graph.symbolToFiles.set(symbol.name, new Set());
      }
      graph.symbolToFiles.get(symbol.name)!.add(filePath);

      // Track file -> symbols
      symbolsInFile.add(symbol.name);

      // Initialize usage stats
      if (!graph.usage.has(symbol.name)) {
        graph.usage.set(symbol.name, {
          symbol: symbol.name,
          usageCount: 0,
          importCount: 0,
          calledBy: new Set(),
          calls: new Set(),
          coOccurs: new Map(),
          files: new Set(),
        });
      }
      graph.usage.get(symbol.name)!.files.add(filePath);
    }

    graph.fileToSymbols.set(filePath, symbolsInFile);

    // Yield every 50 files
    if (i % 50 === 0) {
      await new Promise((resolve) => setImmediate(resolve));
    }
  }
}

/**
 * Extract import relationships between symbols
 */
async function extractImportRelationships(
  context: ProjectContext,
  graph: SymbolGraph,
): Promise<void> {
  let i = 0;
  for (const [filePath, fileInfo] of context.files) {
    i++;
    for (const imp of fileInfo.imports) {
      // For each imported symbol, create a relationship
      const importedSymbols = [
        ...imp.namedImports,
        ...(imp.defaultImport ? [imp.defaultImport] : []),
      ];

      for (const importedSymbol of importedSymbols) {
        // Find which file defines this symbol
        const definingFiles = graph.symbolToFiles.get(importedSymbol);
        if (!definingFiles) continue;

        for (const definingFile of definingFiles) {
          graph.relationships.push({
            from: filePath,
            to: importedSymbol,
            type: "imports",
            file: filePath,
            line: imp.line,
            confidence: 1.0,
            reason: "AST-based import",
          });

          // Update usage stats
          const usage = graph.usage.get(importedSymbol);
          if (usage) {
            usage.importCount++;
          }
        }
      }
    }
    // Yield every 50 files
    if (i % 50 === 0) {
      await new Promise((resolve) => setImmediate(resolve));
    }
  }
}

/**
 * Extract call relationships by analyzing function calls using AST
 */
async function extractCallRelationships(
  context: ProjectContext,
  graph: SymbolGraph,
): Promise<void> {
  const fs = await import("fs/promises");
  let i = 0;

  for (const [filePath, fileInfo] of context.files) {
    i++;
    try {
      // Skip files that are too large to parse repeatedly or not source files
      if (fileInfo.size > 500000) continue;

      const content = await fs.readFile(filePath, "utf-8");
      const lang =
        fileInfo.language === "python" ? "python" :
        fileInfo.language === "go" ? "go" :
        "typescript";

      const imports = extractImportsAST(content, lang);
      const usages = extractUsagesAST(content, lang, imports);

      // Heuristic: identify which symbol in the file contains these usages
      // (For now, we attribute them to the containing file or top-level symbols)
      const symbolsInFile = fileInfo.symbols;

      for (const usage of usages) {
        // Find which symbol defines this name
        const definingFiles = graph.symbolToFiles.get(usage.name);
        if (!definingFiles) continue;

        for (const definingFile of definingFiles) {
          // If we have a current symbol scope (e.g., we're in a function), we'd use that.
          // Since our AST extraction for usages doesn't yet return the containing symbol,
          // we associate the usage with the file for now, or with all symbols in the file
          // if it's a small file.

          graph.relationships.push({
            from: filePath, // Association with file
            to: usage.name,
            type: usage.type === "call" ? "calls" : "references",
            file: filePath,
            line: usage.line,
            confidence: 0.95, // High confidence (AST-based)
            reason: "AST-based call",
          });

          // Update usage stats
          const toUsage = graph.usage.get(usage.name);
          if (toUsage) {
            toUsage.calledBy.add(filePath);
            toUsage.usageCount++;
          }
        }
      }
    } catch (error) {
      logger.debug(`Could not extract call relationships for ${filePath}:`, error);
    }

    // Yield every 10 files
    if (i % 10 === 0) {
      await new Promise((resolve) => setImmediate(resolve));
    }
  }
}

/**
 * Build co-occurrence matrix: which symbols are often used together
 */
async function buildCoOccurrenceMatrix(
  context: ProjectContext,
  graph: SymbolGraph,
  minCount: number,
): Promise<void> {
  let i = 0;
  // For each file, track which symbols appear together
  for (const [filePath, fileInfo] of context.files) {
    i++;
    const symbolsInFile = new Set<string>();

    // Collect all symbols used in this file (defined + imported)
    for (const symbol of fileInfo.symbols) {
      symbolsInFile.add(symbol.name);
    }
    for (const imp of fileInfo.imports) {
      imp.namedImports.forEach((s) => symbolsInFile.add(s));
      if (imp.defaultImport) symbolsInFile.add(imp.defaultImport);
    }

    // Add symbols from call relationships in this file
    const callRelationships = graph.relationships.filter(
      (r) => r.file === filePath && r.type === "calls",
    );
    for (const rel of callRelationships) {
      symbolsInFile.add(rel.to);
    }

    const symbolArray = Array.from(symbolsInFile);
    for (let j = 0; j < symbolArray.length; j++) {
      for (let k = j + 1; k < symbolArray.length; k++) {
        const sym1 = symbolArray[j];
        const sym2 = symbolArray[k];

        // Update co-occurrence for sym1 and sym2
        incrementCoOccurrence(graph, sym1, sym2);
        incrementCoOccurrence(graph, sym2, sym1);

        // Update usage stats (legacy)
        const usage1 = graph.usage.get(sym1);
        const usage2 = graph.usage.get(sym2);
        if (usage1) usage1.coOccurs.set(sym2, (usage1.coOccurs.get(sym2) || 0) + 1);
        if (usage2) usage2.coOccurs.set(sym1, (usage2.coOccurs.get(sym1) || 0) + 1);
      }
    }
    // Yield every 20 files
    if (i % 20 === 0) {
      await new Promise((resolve) => setImmediate(resolve));
    }
  }

  // Filter out low-frequency co-occurrences
  for (const [symbol, coOccurs] of graph.coOccurrence) {
    for (const [otherSymbol, count] of coOccurs) {
      if (count < minCount) {
        coOccurs.delete(otherSymbol);
      }
    }
  }
}

/**
 * Helper to increment co-occurrence count
 */
function incrementCoOccurrence(
  graph: SymbolGraph,
  s1: string,
  s2: string,
): void {
  let map = graph.coOccurrence.get(s1);
  if (!map) {
    map = new Map<string, number>();
    graph.coOccurrence.set(s1, map);
  }
  map.set(s2, (map.get(s2) || 0) + 1);
}

/**
 * Calculate final usage statistics
 */
function calculateUsageStats(graph: SymbolGraph): void {
  for (const usage of graph.usage.values()) {
    // Count total usages (imports + calls)
    usage.usageCount = usage.importCount + usage.calledBy.size;
  }
}

/**
 * Link Semantic Bridge: Connect frontend API calls (TS) to backend routes (Python)
 */
async function linkSemanticBridge(graph: SymbolGraph): Promise<void> {
  logger.debug("Linking Semantic Bridge (Cross-Language Tracing)...");
  
  // 1. Identify all route symbols (mostly from Python)
  const routeSymbols: Array<{ name: string, file: string }> = [];
  for (const [symbol, files] of graph.symbolToFiles.entries()) {
    // We need to check if ANY of these files define this as a 'route'
    // For now, we assume if it starts with / and is tracked, it's a route
    if (symbol.startsWith("/")) {
      for (const file of files) {
        routeSymbols.push({ name: symbol, file });
      }
    }
  }

  if (routeSymbols.length === 0) return;

  // 2. Scan for TS usages that match these routes
  for (const [symbolName, usage] of graph.usage.entries()) {
    // If a TS file "references" a string that matches a route
    if (symbolName.startsWith("/")) {
       const matchingRoute = routeSymbols.find(r => r.name === symbolName);
       if (matchingRoute) {
          // Link the files that USE this URL to the file that DEFINES the route
          for (const callerFile of usage.calledBy) {
             // Avoid self-linking (unlikely for cross-language)
             if (callerFile === matchingRoute.file) continue;

             graph.relationships.push({
               from: callerFile,
               to: matchingRoute.name,
               type: "calls", // We treat API access as a semantic call
               file: callerFile,
               line: 0, // General relationship
               confidence: 0.9,
               reason: `Semantic Bridge: API access to ${matchingRoute.name}`,
             });

             // Update usage stats for the route
             const routeUsage = graph.usage.get(matchingRoute.name);
             if (routeUsage) {
               routeUsage.calledBy.add(callerFile);
               routeUsage.usageCount++;
             }
          }
       }
    }
  }
}

/**
 * Find symbols related to a given symbol
 */
export function findRelatedSymbols(
  graph: SymbolGraph,
  symbolName: string,
  maxResults: number = 10,
): RelatedSymbols {
  const related: RelatedSymbols["related"] = [];
  const usage = graph.usage.get(symbolName);

  if (!usage) {
    return { symbol: symbolName, related: [] };
  }

  // Add symbols this one calls
  for (const calledSymbol of usage.calls) {
    related.push({
      symbol: calledSymbol,
      relationship: "calls",
      score: 0.9,
      reason: `${symbolName} calls ${calledSymbol}`,
    });
  }

  // Add symbols that call this one
  for (const callerSymbol of usage.calledBy) {
    related.push({
      symbol: callerSymbol,
      relationship: "calls",
      score: 0.8,
      reason: `${callerSymbol} calls ${symbolName}`,
    });
  }

  // Add frequently co-occurring symbols
  const coOccurArray = Array.from(usage.coOccurs.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  for (const [coSymbol, count] of coOccurArray) {
    const score = Math.min(0.7, count / 10); // Max score 0.7 for co-occurrence
    related.push({
      symbol: coSymbol,
      relationship: "co-occurs",
      score,
      reason: `Often used together (${count} times)`,
    });
  }

  // Sort by score and limit results
  related.sort((a, b) => b.score - a.score);
  return {
    symbol: symbolName,
    related: related.slice(0, maxResults),
  };
}

/**
 * Get symbols that are most relevant to a set of imports
 * This is useful for validation - given what's imported, what else is likely needed?
 */
export function getRelevantSymbols(
  graph: SymbolGraph,
  importedSymbols: string[],
  maxResults: number = 20,
): string[] {
  const relevanceScores = new Map<string, number>();

  for (const importedSymbol of importedSymbols) {
    const related = findRelatedSymbols(graph, importedSymbol, 20);

    for (const rel of related.related) {
      const currentScore = relevanceScores.get(rel.symbol) || 0;
      relevanceScores.set(rel.symbol, currentScore + rel.score);
    }
  }

  // Sort by relevance score
  const sorted = Array.from(relevanceScores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxResults)
    .map(([symbol]) => symbol);

  return sorted;
}

/**
 * Get usage statistics for a symbol
 */
export function getSymbolUsage(
  graph: SymbolGraph,
  symbolName: string,
): SymbolUsage | null {
  return graph.usage.get(symbolName) || null;
}
