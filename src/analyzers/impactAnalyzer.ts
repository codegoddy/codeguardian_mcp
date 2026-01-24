/**
 * Impact Analyzer
 * 
 * Secret #6: Semantic Ripples
 * 
 * Recursively traces the "blast radius" of a symbol change using the AST Symbol Graph.
 * Identifies direct consumers, transitive dependencies, and semantic risks.
 * 
 * @format
 */

import { SymbolGraph, SymbolRelationship } from "../types/symbolGraph.js";
import { logger } from "../utils/logger.js";

export interface ImpactNode {
  symbol: string;
  file: string;
  depth: number;
  type: "direct" | "transitive";
  reason: string;
}

export interface BlastRadius {
  target: string;
  impactedSymbols: ImpactNode[];
  affectedFiles: string[];
  severity: "high" | "medium" | "low";
}

export interface ProjectHub {
  symbol: string;
  file: string;
  centralityScore: number;
  dependentsCount: number;
  description: string;
}

export class ImpactAnalyzer {
  /**
   * Trace the blast radius of a symbol
   */
  traceBlastRadius(
    symbolName: string,
    graph: SymbolGraph,
    maxDepth: number = 3
  ): BlastRadius {
    const impacted = new Map<string, ImpactNode>();
    const visited = new Set<string>();
    const affectedFiles = new Set<string>();

    this.recursiveTrace(
      symbolName, 
      graph, 
      0, 
      maxDepth, 
      impacted, 
      visited, 
      affectedFiles
    );

    const impactedSymbols = Array.from(impacted.values());
    
    return {
      target: symbolName,
      impactedSymbols,
      affectedFiles: Array.from(affectedFiles),
      severity: this.calculateSeverity(impactedSymbols.length, affectedFiles.size),
    };
  }

  private recursiveTrace(
    currentSymbol: string,
    graph: SymbolGraph,
    depth: number,
    maxDepth: number,
    impacted: Map<string, ImpactNode>,
    visited: Set<string>,
    affectedFiles: Set<string>
  ): void {
    if (depth >= maxDepth || visited.has(currentSymbol)) return;
    visited.add(currentSymbol);

    // Find all symbols that call or reference this symbol
    const usage = graph.usage.get(currentSymbol);
    if (!usage) return;

    for (const callerFile of usage.calledBy) {
      affectedFiles.add(callerFile);
      
      // Find which SPECIFIC symbols in that file are doing the calling
      // (This uses our AST-driven relationships)
      const relationships = graph.relationships.filter(
        r => r.to === currentSymbol && r.file === callerFile
      );

      for (const rel of relationships) {
        const callerName = rel.from;
        if (callerName === currentSymbol) continue; // Skip self-recursion

        if (!impacted.has(callerName)) {
          impacted.set(callerName, {
            symbol: callerName,
            file: callerFile,
            depth: depth + 1,
            type: depth === 0 ? "direct" : "transitive",
            reason: rel.reason || "Calls target symbol",
          });

          // Recurse to find transitive impacts
          this.recursiveTrace(
            callerName,
            graph,
            depth + 1,
            maxDepth,
            impacted,
            visited,
            affectedFiles
          );
        }
      }
    }
  }

  private calculateSeverity(symbols: number, files: number): "high" | "medium" | "low" {
    if (files > 5 || symbols > 15) return "high";
    if (files > 1 || symbols > 3) return "medium";
    return "low";
  }

  /**
   * Secret #7: The AI Context Bundler
   * Packages the source code of affected files for AI consumption.
   */
  async bundleAffectedSource(
    blastRadius: BlastRadius,
    projectRoot: string
  ): Promise<string> {
    const fs = await import("fs/promises");
    const path = await import("path");
    
    let bundle = `# AI Context Bundle: Impact of changing '${blastRadius.target}'\n\n`;
    bundle += `**Summary**: This change has a ${blastRadius.severity} impact affecting ${blastRadius.affectedFiles.length} files.\n\n`;
    
    for (const fileRelPath of blastRadius.affectedFiles) {
      const absolutePath = path.isAbsolute(fileRelPath) 
        ? fileRelPath 
        : path.join(projectRoot, fileRelPath);
      
      try {
        const content = await fs.readFile(absolutePath, "utf-8");
        bundle += `## File: ${fileRelPath}\n\n`;
        bundle += "```" + this.getLanguage(fileRelPath) + "\n";
        bundle += content + "\n";
        bundle += "```\n\n";
      } catch (error) {
        logger.warn(`Could not include ${fileRelPath} in bundle:`, error);
      }
    }
    
    return bundle;
  }

  private getLanguage(filePath: string): string {
    if (filePath.endsWith(".ts") || filePath.endsWith(".tsx")) return "typescript";
    if (filePath.endsWith(".js") || filePath.endsWith(".jsx")) return "javascript";
    if (filePath.endsWith(".py")) return "python";
    if (filePath.endsWith(".go")) return "go";
    return "";
  }

  /**
   * Secret #8: Project Hub Map (The Vibe Map)
   * Identifies the most central and critical symbols in the codebase.
   */
  getProjectHubs(
    graph: SymbolGraph,
    limit: number = 5
  ): ProjectHub[] {
    const scores = new Map<string, { dependents: number; file: string }>();

    // Rank symbols by incoming relationships (how many things depend on them)
    for (const [symbolName, usage] of graph.usage.entries()) {
      // Find the primary file for this symbol from relationships or graph
      const primaryFile = Array.from(usage.calledBy)[0] || "unknown";
      
      scores.set(symbolName, {
        dependents: usage.calledBy.size + (usage.importCount || 0),
        file: primaryFile,
      });
    }

    // Sort by dependents count descending
    const sorted = Array.from(scores.entries())
      .sort((a, b) => b[1].dependents - a[1].dependents)
      .slice(0, limit);

    return sorted.map(([symbol, data], index) => ({
      symbol,
      file: data.file,
      centralityScore: data.dependents / (graph.usage.size || 1),
      dependentsCount: data.dependents,
      description: this.getTouristDescription(symbol, data.dependents, index),
    }));
  }

  private getTouristDescription(symbol: string, count: number, rank: number): string {
    const prefixes = [
      "The Grand Central Terminal: ",
      "The Foundation: ",
      "The Highway: ",
      "The Vital Organ: ",
      "The Cornerstone: "
    ];
    
    const prefix = prefixes[rank] || "Main Hub: ";
    
    if (count > 20) {
      return `${prefix}'${symbol}' is the project's brain. Almost everything flows through here. If you break this, you break the app.`;
    } else if (count > 5) {
      return `${prefix}'${symbol}' is a major intersection. Core business logic lives here.`;
    } else {
      return `${prefix}'${symbol}' is a shared helper used across multiple modules.`;
    }
  }
}

export const impactAnalyzer = new ImpactAnalyzer();
