/**
 * Symbol Graph Tests
 *
 * Tests symbol-level dependency tracking inspired by Augment Code.
 * Validates that we can track relationships between symbols and find
 * relevant symbols based on usage patterns.
 *
 * @format
 */

import {
  getProjectContext,
  clearContextCache,
} from "../../src/context/projectContext.js";
import {
  findRelatedSymbols,
  getRelevantSymbols,
  getSymbolUsage,
} from "../../src/analyzers/symbolGraph.js";

describe("Symbol Graph", () => {
  const projectPath = process.cwd();
  let context: Awaited<ReturnType<typeof getProjectContext>>;

  beforeAll(async () => {
    clearContextCache();
    context = await getProjectContext(projectPath, {
      language: "typescript",
      maxFiles: 100,
    });
  }, 60000);

  it("should build symbol graph with relationships", () => {
    expect(context.symbolGraph).toBeDefined();
    const graph = context.symbolGraph!;

    expect(graph.relationships.length).toBeGreaterThan(0);
    expect(graph.usage.size).toBeGreaterThan(0);
    expect(graph.symbolToFiles.size).toBeGreaterThan(0);

    console.log(
      `Symbol graph: ${graph.relationships.length} relationships, ${graph.usage.size} symbols`,
    );
  });

  it("should track symbol-to-file mappings", () => {
    const graph = context.symbolGraph!;

    // Check that we have mappings
    expect(graph.symbolToFiles.size).toBeGreaterThan(0);
    expect(graph.fileToSymbols.size).toBeGreaterThan(0);

    // Find a common symbol (like 'logger' or 'getProjectContext')
    const commonSymbols = ["logger", "getProjectContext", "buildSymbolGraph"];
    let foundSymbol: string | null = null;

    for (const sym of commonSymbols) {
      if (graph.symbolToFiles.has(sym)) {
        foundSymbol = sym;
        break;
      }
    }

    if (foundSymbol) {
      const files = graph.symbolToFiles.get(foundSymbol)!;
      expect(files.size).toBeGreaterThan(0);
      console.log(`Symbol '${foundSymbol}' found in ${files.size} file(s)`);
    }
  });

  it("should track import relationships", () => {
    const graph = context.symbolGraph!;

    const importRelationships = graph.relationships.filter(
      (r) => r.type === "imports",
    );

    expect(importRelationships.length).toBeGreaterThan(0);
    console.log(`Found ${importRelationships.length} import relationships`);

    // Check that relationships have required fields
    const sampleRel = importRelationships[0];
    expect(sampleRel.from).toBeTruthy();
    expect(sampleRel.to).toBeTruthy();
    expect(sampleRel.file).toBeTruthy();
    expect(sampleRel.confidence).toBeGreaterThan(0);
  });

  it("should calculate usage statistics", () => {
    const graph = context.symbolGraph!;

    // Find a symbol with usage stats
    let symbolWithUsage: string | null = null;
    for (const [symbol, usage] of graph.usage) {
      if (usage.importCount > 0 || usage.usageCount > 0) {
        symbolWithUsage = symbol;
        break;
      }
    }

    if (symbolWithUsage) {
      const usage = graph.usage.get(symbolWithUsage)!;
      expect(usage.symbol).toBe(symbolWithUsage);
      expect(usage.files.size).toBeGreaterThan(0);
      console.log(
        `Symbol '${symbolWithUsage}': ${usage.usageCount} usages, ${usage.importCount} imports, ${usage.files.size} files`,
      );
    }
  });

  it("should build co-occurrence matrix", () => {
    const graph = context.symbolGraph!;

    expect(graph.coOccurrence.size).toBeGreaterThan(0);

    // Find a symbol with co-occurrences
    let symbolWithCoOccurs: string | null = null;
    for (const [symbol, coOccurs] of graph.coOccurrence) {
      if (coOccurs.size > 0) {
        symbolWithCoOccurs = symbol;
        break;
      }
    }

    if (symbolWithCoOccurs) {
      const coOccurs = graph.coOccurrence.get(symbolWithCoOccurs)!;
      console.log(
        `Symbol '${symbolWithCoOccurs}' co-occurs with ${coOccurs.size} other symbols`,
      );

      // Check co-occurrence counts
      for (const [otherSymbol, count] of coOccurs) {
        expect(count).toBeGreaterThanOrEqual(2); // Min threshold
        console.log(`  - ${otherSymbol}: ${count} times`);
        if (coOccurs.size > 3) break; // Only show first few
      }
    }
  });

  it("should find related symbols", () => {
    const graph = context.symbolGraph!;

    // Find a symbol that has relationships
    let testSymbol: string | null = null;
    for (const [symbol, usage] of graph.usage) {
      if (
        usage.calls.size > 0 ||
        usage.calledBy.size > 0 ||
        usage.coOccurs.size > 0
      ) {
        testSymbol = symbol;
        break;
      }
    }

    if (testSymbol) {
      const related = findRelatedSymbols(graph, testSymbol, 5);

      expect(related.symbol).toBe(testSymbol);
      console.log(`\nRelated symbols for '${testSymbol}':`);

      for (const rel of related.related) {
        expect(rel.symbol).toBeTruthy();
        expect(rel.relationship).toBeTruthy();
        expect(rel.score).toBeGreaterThan(0);
        expect(rel.score).toBeLessThanOrEqual(1);
        console.log(
          `  - ${rel.symbol} (${rel.relationship}, score: ${rel.score.toFixed(2)}): ${rel.reason}`,
        );
      }
    }
  });

  it("should get relevant symbols based on imports", () => {
    const graph = context.symbolGraph!;

    // Pick some commonly imported symbols
    const testImports = ["logger", "glob", "fs"];
    const actualImports = testImports.filter((sym) => graph.usage.has(sym));

    if (actualImports.length > 0) {
      const relevant = getRelevantSymbols(graph, actualImports, 10);

      expect(Array.isArray(relevant)).toBe(true);
      console.log(
        `\nRelevant symbols for imports [${actualImports.join(", ")}]:`,
      );
      console.log(relevant.slice(0, 5).join(", "));

      // Should return symbols that are related
      expect(relevant.length).toBeGreaterThan(0);
    }
  });

  it("should get symbol usage details", () => {
    const graph = context.symbolGraph!;

    // Find a symbol with interesting usage
    let testSymbol: string | null = null;
    for (const [symbol, usage] of graph.usage) {
      if (usage.importCount > 1) {
        testSymbol = symbol;
        break;
      }
    }

    if (testSymbol) {
      const usage = getSymbolUsage(graph, testSymbol);

      expect(usage).not.toBeNull();
      expect(usage!.symbol).toBe(testSymbol);
      expect(usage!.files.size).toBeGreaterThan(0);

      console.log(`\nUsage details for '${testSymbol}':`);
      console.log(`  - Used in ${usage!.files.size} files`);
      console.log(`  - Imported ${usage!.importCount} times`);
      console.log(`  - Total usages: ${usage!.usageCount}`);
      console.log(`  - Calls ${usage!.calls.size} other symbols`);
      console.log(`  - Called by ${usage!.calledBy.size} symbols`);
    }
  });

  it("should handle non-existent symbols gracefully", () => {
    const graph = context.symbolGraph!;

    const related = findRelatedSymbols(graph, "NonExistentSymbol123", 5);
    expect(related.symbol).toBe("NonExistentSymbol123");
    expect(related.related).toEqual([]);

    const usage = getSymbolUsage(graph, "NonExistentSymbol123");
    expect(usage).toBeNull();
  });

  it("should track call relationships", () => {
    const graph = context.symbolGraph!;

    const callRelationships = graph.relationships.filter(
      (r) => r.type === "calls",
    );

    console.log(`\nFound ${callRelationships.length} call relationships`);

    if (callRelationships.length > 0) {
      // Show a few examples
      const examples = callRelationships.slice(0, 3);
      for (const rel of examples) {
        console.log(
          `  ${rel.from} -> ${rel.to} (confidence: ${rel.confidence})`,
        );
      }
    }

    // Call relationships should have medium confidence (heuristic-based)
    if (callRelationships.length > 0) {
      const avgConfidence =
        callRelationships.reduce((sum, r) => sum + r.confidence, 0) /
        callRelationships.length;
      console.log(
        `Average call relationship confidence: ${avgConfidence.toFixed(2)}`,
      );
    }
  });
});
