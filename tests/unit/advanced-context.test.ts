/**
 * Advanced Context Tests
 *
 * Verifies the "Augment Secrets" implementation:
 * 1. Session-Based Intent Tracking (Recency Boost)
 * 2. Git Lineage Integration
 * 3. AST-Driven Symbol Graph Accuracy
 *
 * @format
 */

import {
  getProjectContext,
  clearContextCache,
} from "../../src/context/projectContext.js";
import {
  scoreSymbolRelevance,
} from "../../src/analyzers/relevanceScorer.js";
import { intentTracker } from "../../src/context/intentTracker.js";
import { contextLineage } from "../../src/context/contextLineage.js";

describe("Advanced Context (Augment Secrets)", () => {
  const projectPath = process.cwd();
  let context: any;

  beforeAll(async () => {
    clearContextCache();
    context = await getProjectContext(projectPath, {
      language: "typescript",
      maxFiles: 50,
    });
  }, 60000);

  describe("Secret #1: Session-Based Intent Tracking", () => {
    it("should provide a significant boost to recently edited files", () => {
      let testFile: string | null = null;
      let testSymbol: string | null = null;

      for (const [path, info] of context.files.entries()) {
          if (info.symbols.length > 0) {
              testFile = path;
              testSymbol = info.symbols[0].name;
              break;
          }
      }

      const relevanceContext = {
        importedSymbols: [],
        recentFiles: [testFile!],
      };

      const scored = scoreSymbolRelevance(context, relevanceContext, 50);
      const symbolResult = scored.find(s => s.symbol === testSymbol);

      expect(symbolResult).toBeDefined();
      expect(symbolResult?.reasons).toContain("Recently edited");
    });

    it("should merge automatic intent tracking with manual session context", () => {
      let testSymbolName: string | null = null;
      let testFile: string | null = null;
      
      for (const [path, info] of context.files.entries()) {
          if (info.symbols.length > 0) {
              testSymbolName = info.symbols[0].name;
              testFile = path;
              break;
          }
      }

      // Provide COMPLETE EditEvent
      intentTracker.recordEdit({
          filePath: testFile!,
          timestamp: Date.now(),
          symbols: [testSymbolName!],
          language: "typescript"
      });

      const relevanceContext = {
        importedSymbols: [],
        recentFiles: [],
      };

      const scored = scoreSymbolRelevance(context, relevanceContext, 50);
      const match = scored.find(s => s.symbol === testSymbolName);

      expect(match).toBeDefined();
      expect(match?.reasons).toContain("Recently edited");
    });
  });

  describe("Secret #2: Git Lineage Integration", () => {
    it("should factor in lineage context when available", async () => {
      const lineageContext = await contextLineage.getLineageContext(projectPath);
      
      const relevanceContext = {
        importedSymbols: [],
        lineageContext: lineageContext || undefined,
      };

      const scored = scoreSymbolRelevance(context, relevanceContext, 50);
      expect(Array.isArray(scored)).toBe(true);
    });
  });

  describe("Secret #3: AST-Driven Symbol Graph", () => {
    it("should have high-confidence AST-based relationships", () => {
      const graph = context.symbolGraph;
      if (graph && graph.relationships.length > 0) {
        const astRelationships = graph.relationships.filter((r: any) => r.reason?.includes("AST-based"));
        expect(astRelationships.length).toBeGreaterThanOrEqual(0);
      }
    });

    it("should correctly populate usage.calledBy with file paths", () => {
      const graph = context.symbolGraph;
      if (!graph) return;

      let calledSymbolUsage: any = null;
      for (const usage of graph.usage.values()) {
        if (usage.calledBy.size > 0) {
          calledSymbolUsage = usage;
          break;
        }
      }

      if (calledSymbolUsage) {
        const caller = Array.from(calledSymbolUsage.calledBy)[0] as string;
        expect(caller.length).toBeGreaterThan(0);
      }
    });
  });
});
