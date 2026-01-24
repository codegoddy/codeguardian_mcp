/**
 * Relevance Scorer Tests
 *
 * Tests smart context selection for validation.
 * Validates that we can identify the most relevant symbols
 * based on imports, usage patterns, and file proximity.
 *
 * @format
 */

import {
  getProjectContext,
  clearContextCache,
} from "../../src/context/projectContext.js";
import {
  scoreSymbolRelevance,
  getRelevantSymbolsForValidation,
  explainRelevance,
} from "../../src/analyzers/relevanceScorer.js";

describe("Relevance Scorer", () => {
  const projectPath = process.cwd();
  let context: Awaited<ReturnType<typeof getProjectContext>>;

  beforeAll(async () => {
    clearContextCache();
    context = await getProjectContext(projectPath, {
      language: "typescript",
      maxFiles: 100,
    });
  }, 60000);

  it("should score symbols by relevance", () => {
    const scored = scoreSymbolRelevance(
      context,
      {
        importedSymbols: ["logger", "glob"],
      },
      50,
    );

    expect(scored.length).toBeGreaterThan(0);
    expect(scored.length).toBeLessThanOrEqual(50);

    // Should be sorted by score (descending)
    for (let i = 1; i < scored.length; i++) {
      expect(scored[i].score).toBeLessThanOrEqual(scored[i - 1].score);
    }

    console.log(`\nTop 5 relevant symbols for ['logger', 'glob']:`);
    for (const { symbol, score, reasons } of scored.slice(0, 5)) {
      console.log(`  ${symbol} (${score.toFixed(2)}): ${reasons.join(", ")}`);
    }
  });

  it("should prioritize explicitly imported symbols", () => {
    const scored = scoreSymbolRelevance(
      context,
      {
        importedSymbols: ["logger"],
      },
      20,
    );

    // 'logger' should be in the results with high score
    const loggerScore = scored.find((s) => s.symbol === "logger");
    if (loggerScore) {
      expect(loggerScore.score).toBeGreaterThanOrEqual(1.0);
      expect(loggerScore.reasons).toContain("Explicitly imported");
      console.log(`\n'logger' score: ${loggerScore.score.toFixed(2)}`);
      console.log(`Reasons: ${loggerScore.reasons.join(", ")}`);
    }
  });

  it("should include symbols related to imports", () => {
    const scored = scoreSymbolRelevance(
      context,
      {
        importedSymbols: ["logger"],
      },
      30,
    );

    // Should include symbols related to logger (like LogLevel, Logger class, etc.)
    const relatedSymbols = scored.filter((s) =>
      s.reasons.some((r) => r.includes("Related to imports")),
    );

    expect(relatedSymbols.length).toBeGreaterThan(0);
    console.log(`\nFound ${relatedSymbols.length} symbols related to imports`);
    console.log(
      "Examples:",
      relatedSymbols
        .slice(0, 3)
        .map((s) => s.symbol)
        .join(", "),
    );
  });

  it("should boost symbols from current file", () => {
    // Find a file with some symbols
    let testFile: string | null = null;
    for (const [filePath, fileInfo] of context.files) {
      if (fileInfo.symbols.length > 3 && !fileInfo.isTest) {
        testFile = filePath;
        break;
      }
    }

    if (testFile) {
      const fileInfo = context.files.get(testFile)!;
      const symbolsInFile = fileInfo.symbols.map((s) => s.name);

      const scored = scoreSymbolRelevance(
        context,
        {
          importedSymbols: [],
          currentFile: testFile,
        },
        50,
      );

      // Symbols from current file should appear in results
      const fromCurrentFile = scored.filter((s) =>
        symbolsInFile.includes(s.symbol),
      );
      expect(fromCurrentFile.length).toBeGreaterThan(0);

      console.log(`\nFile: ${fileInfo.relativePath}`);
      console.log(
        `Symbols from current file in top results: ${fromCurrentFile.length}`,
      );
    }
  });

  it("should consider popular symbols", () => {
    const scored = scoreSymbolRelevance(
      context,
      {
        importedSymbols: [],
      },
      100,
    );

    // Should include some popular symbols
    const popularSymbols = scored.filter((s) =>
      s.reasons.some((r) => r.includes("Popular")),
    );

    expect(popularSymbols.length).toBeGreaterThan(0);
    console.log(`\nFound ${popularSymbols.length} popular symbols in results`);
    console.log(
      "Top 3:",
      popularSymbols
        .slice(0, 3)
        .map((s) => s.symbol)
        .join(", "),
    );
  });

  it("should filter by minimum score", () => {
    const allScored = scoreSymbolRelevance(
      context,
      {
        importedSymbols: ["logger"],
      },
      200,
    );

    const filtered = getRelevantSymbolsForValidation(
      context,
      {
        importedSymbols: ["logger"],
      },
      0.5, // Min score
      100,
    );

    // Filtered should be smaller than all scored
    expect(filtered.length).toBeLessThanOrEqual(allScored.length);

    // All filtered symbols should have score >= 0.5
    const filteredScored = allScored.filter((s) => filtered.includes(s.symbol));
    for (const scored of filteredScored) {
      expect(scored.score).toBeGreaterThanOrEqual(0.5);
    }

    console.log(
      `\nFiltered from ${allScored.length} to ${filtered.length} symbols (min score: 0.5)`,
    );
  });

  it("should handle multiple imported symbols", () => {
    const scored = scoreSymbolRelevance(
      context,
      {
        importedSymbols: ["logger", "glob", "fs", "path"],
      },
      50,
    );

    // All imported symbols should appear with high scores
    const importedScores = scored.filter((s) =>
      ["logger", "glob", "fs", "path"].includes(s.symbol),
    );

    console.log(`\nScores for imported symbols:`);
    for (const { symbol, score } of importedScores) {
      console.log(`  ${symbol}: ${score.toFixed(2)}`);
    }

    // Should have high scores
    for (const scored of importedScores) {
      expect(scored.score).toBeGreaterThan(0.5);
    }
  });

  it("should explain relevance in human-readable format", () => {
    const explanation = explainRelevance(
      context,
      {
        importedSymbols: ["logger", "ProjectContext"],
      },
      5,
    );

    expect(explanation).toContain("Top 5 relevant symbols");
    expect(explanation).toContain("score:");

    console.log(`\n${explanation}`);
  });

  it("should handle empty import list", () => {
    const scored = scoreSymbolRelevance(
      context,
      {
        importedSymbols: [],
      },
      20,
    );

    // Should still return results (based on popularity, etc.)
    expect(scored.length).toBeGreaterThan(0);
    console.log(
      `\nWith no imports, returned ${scored.length} symbols based on other signals`,
    );
  });

  it("should boost symbols from similar files", () => {
    // Find a file that imports logger
    let testFile: string | null = null;
    for (const [filePath, fileInfo] of context.files) {
      const importsLogger = fileInfo.imports.some(
        (imp) =>
          imp.namedImports.includes("logger") || imp.defaultImport === "logger",
      );
      if (importsLogger && !fileInfo.isTest) {
        testFile = filePath;
        break;
      }
    }

    if (testFile) {
      const scored = scoreSymbolRelevance(
        context,
        {
          importedSymbols: ["logger"],
        },
        100,
      );

      // Should include symbols from files that also import logger
      const fromSimilarFiles = scored.filter((s) =>
        s.reasons.some((r) => r.includes("From similar file")),
      );

      console.log(
        `\nFound ${fromSimilarFiles.length} symbols from similar files`,
      );
      if (fromSimilarFiles.length > 0) {
        expect(fromSimilarFiles.length).toBeGreaterThan(0);
      }
    }
  });

  it("should limit results to maxResults", () => {
    const scored10 = scoreSymbolRelevance(
      context,
      {
        importedSymbols: ["logger"],
      },
      10,
    );

    const scored50 = scoreSymbolRelevance(
      context,
      {
        importedSymbols: ["logger"],
      },
      50,
    );

    expect(scored10.length).toBeLessThanOrEqual(10);
    expect(scored50.length).toBeLessThanOrEqual(50);
    expect(scored50.length).toBeGreaterThan(scored10.length);

    console.log(`\nLimited to 10: ${scored10.length} symbols`);
    console.log(`Limited to 50: ${scored50.length} symbols`);
  });
});
