/**
 * Usage Pattern Analyzer
 * 
 * Secret #5: Usage Pattern Consistency (The Helpfulness Pattern)
 * 
 * Learns "rituals" from the codebase:
 * - Co-occurrence: Which functions are almost always called together?
 * - Argument Rituals: Common arguments passed to specific functions.
 * - Call Ordering: (Heuristic) Which symbols often appear in sequence.
 * 
 * @format
 */

import { SymbolGraph } from "../types/symbolGraph.js";
import { logger } from "../utils/logger.js";

export interface UsagePattern {
  symbol: string;
  coOccurringSymbols: Array<{ name: string; frequency: number }>;
  commonArguments: Array<{ value: string; count: number }>;
  callConfidence: number;
}

export class UsagePatternAnalyzer {
  private patterns = new Map<string, UsagePattern>();

  /**
   * Analyze the symbol graph to discover patterns
   */
  async analyze(graph: SymbolGraph): Promise<void> {
    logger.debug(`Analyzing usage patterns for ${graph.usage.size} symbols...`);

    for (const [symbolName, usage] of graph.usage.entries()) {
      // We only care about symbols used at least 3 times to establish a pattern
      if (usage.usageCount < 3) continue;

      const coOccurring = this.extractCoOccurrence(symbolName, graph);
      
      // If we found significant co-occurrence, store the pattern
      if (coOccurring.length > 0) {
        this.patterns.set(symbolName, {
          symbol: symbolName,
          coOccurringSymbols: coOccurring,
          commonArguments: [], // To be implemented with deeper AST mining
          callConfidence: usage.usageCount > 10 ? 0.9 : 0.7,
        });
      }
    }
    
    logger.debug(`Established ${this.patterns.size} usage pattern rituals.`);
  }

  /**
   * Check if new code deviates from established patterns
   */
  checkDeviations(
    symbolName: string, 
    surroundingSymbols: string[]
  ): string[] {
    const pattern = this.patterns.get(symbolName);
    if (!pattern) return [];

    const deviations: string[] = [];
    const surroundingSet = new Set(surroundingSymbols);

    // If a symbol has a high co-occurrence (e.g. > 80% usage), 
    // it should probably be present
    for (const ritual of pattern.coOccurringSymbols) {
      if (ritual.frequency > 0.8 && !surroundingSet.has(ritual.name)) {
        deviations.push(
          `When using '${symbolName}', projects usually also call '${ritual.name}'.`
        );
      }
    }

    return deviations;
  }

  /**
   * Extract co-occurrence statistics for a symbol
   */
  private extractCoOccurrence(
    symbolName: string, 
    graph: SymbolGraph
  ): Array<{ name: string; frequency: number }> {
    const results: Array<{ name: string; frequency: number }> = [];
    const coChanges = graph.coOccurrence.get(symbolName);
    
    if (!coChanges) return results;

    const totalUsage = graph.usage.get(symbolName)?.usageCount || 1;

    for (const [otherName, count] of coChanges.entries()) {
      const frequency = count / totalUsage;
      if (frequency > 0.5) { // Significant ritual if seen in >50% of cases
        results.push({ name: otherName, frequency });
      }
    }

    return results.sort((a, b) => b.frequency - a.frequency);
  }
}

export const usagePatternAnalyzer = new UsagePatternAnalyzer();
