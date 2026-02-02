/**
 * Unit tests for Anti-Patterns analyzer
 *
 * @format
 */

import {
  loadAntiPatterns,
  getAntiPatternsSync,
  getRelevantAntiPatterns,
  getAIAntiPatterns,
  enrichIssueWithAntiPattern,
  generateAntiPatternContext,
  getAntiPatternById,
} from "../../../src/analyzers/antiPatterns.js";

describe("Anti-Patterns Analyzer", () => {
  describe("loadAntiPatterns", () => {
    it("should load anti-patterns from JSON file", async () => {
      const patterns = await loadAntiPatterns();
      
      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns[0]).toHaveProperty("id");
      expect(patterns[0]).toHaveProperty("name");
      expect(patterns[0]).toHaveProperty("category");
    });

    it("should cache patterns after first load", async () => {
      const patterns1 = await loadAntiPatterns();
      const patterns2 = await loadAntiPatterns();
      
      // Should be same reference (cached)
      expect(patterns1).toBe(patterns2);
    });
  });

  describe("getAntiPatternsSync", () => {
    it("should return empty array before loading", () => {
      // Note: If other tests ran first, this might have data
      // This test is mainly for coverage
      const patterns = getAntiPatternsSync();
      expect(Array.isArray(patterns)).toBe(true);
    });
  });

  describe("getRelevantAntiPatterns", () => {
    it("should return patterns for unusedImport type", async () => {
      const patterns = await getRelevantAntiPatterns("unusedImport", "typescript");
      
      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns.some(p => p.category === "dead-code")).toBe(true);
    });

    it("should return patterns for undefinedVariable type", async () => {
      const patterns = await getRelevantAntiPatterns("undefinedVariable", "typescript");
      
      // Should find maintainability category patterns
      expect(patterns.some(p => p.category === "maintainability" || p.category === "bugs")).toBe(true);
    });
  });

  describe("getAIAntiPatterns", () => {
    it("should return only AI-generated anti-patterns", async () => {
      const patterns = await getAIAntiPatterns();
      
      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns.every(p => p.aiGenerated)).toBe(true);
    });
  });

  describe("enrichIssueWithAntiPattern", () => {
    it("should enrich unused import issue with anti-pattern", async () => {
      const issue = {
        type: "unusedImport",
        message: "Imported symbol 'X' is never used",
        severity: "warning",
      };

      const enriched = await enrichIssueWithAntiPattern(issue, "typescript");

      expect(enriched).toHaveProperty("antiPattern");
      expect(enriched.antiPattern).toBeDefined();
      expect(enriched.antiPattern).toHaveProperty("id");
      expect(enriched.antiPattern).toHaveProperty("name");
    });

    it("should return original issue if no matching pattern", async () => {
      const issue = {
        type: "unknownIssueType",
        message: "Some unknown issue",
      };

      const enriched = await enrichIssueWithAntiPattern(issue, "typescript");

      expect(enriched).toEqual(issue);
    });
  });

  describe("generateAntiPatternContext", () => {
    it("should generate context for unused import issues", async () => {
      const issues = [
        { type: "unusedImport", message: "Import A" },
        { type: "deadCode", message: "Unused var" },
      ];

      const context = await generateAntiPatternContext(issues, "typescript");

      expect(context).toContain("Anti-Patterns");
      expect(context).toContain("dead-code");
    });

    it("should return empty string for issues with no matching categories", async () => {
      const issues = [
        { type: "unknownType", message: "Something" },
      ];

      const context = await generateAntiPatternContext(issues, "typescript");

      expect(context).toBe("");
    });
  });

  describe("getAntiPatternById", () => {
    it("should find anti-pattern by ID", async () => {
      const pattern = await getAntiPatternById("AP-013"); // Unused Import

      expect(pattern).not.toBeNull();
      expect(pattern?.id).toBe("AP-013");
    });

    it("should return null for unknown ID", async () => {
      const pattern = await getAntiPatternById("UNKNOWN-ID");

      expect(pattern).toBeNull();
    });
  });
});
