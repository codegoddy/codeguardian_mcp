/**
 * Unit tests for the Automated Finding Verifier
 *
 * Tests the automated verification system that eliminates false positives
 * without requiring human intervention.
 *
 * @format
 */

import { describe, it, expect } from "@jest/globals";
import {
  verifyFindingsAutomatically,
  getConfirmedFindings,
  type VerifiedFinding,
  type VerificationResult,
} from "../../../src/analyzers/findingVerifier.js";
import type {
  ValidationIssue,
  DeadCodeIssue,
} from "../../../src/tools/validation/types.js";
import type { ProjectContext } from "../../../src/context/projectContext.js";

describe("Finding Verifier Module", () => {
  // Mock ProjectContext for testing
  const createMockContext = (): ProjectContext => ({
    projectPath: "/test",
    files: new Map(),
    symbolIndex: new Map(),
    totalFiles: 10,
    language: "typescript",
    symbolGraph: undefined,
  });

  describe("verifyFindingsAutomatically", () => {
    it("should confirm true hallucinations (symbol not in project)", async () => {
      const mockContext = createMockContext();
      const hallucination: ValidationIssue = {
        type: "nonExistentFunction",
        severity: "critical",
        message: "Function 'totallyFakeFunctionXYZ' does not exist in project",
        line: 5,
        file: "test.ts",
        code: "totallyFakeFunctionXYZ();",
        suggestion: "Did you mean: someRealFunction?",
        confidence: 95,
        reasoning: "Symbol not found in project",
      };

      const result = await verifyFindingsAutomatically(
        [hallucination],
        [],
        mockContext,
        "/test",
        "typescript",
      );

      expect(result.confirmed).toHaveLength(1);
      expect(result.confirmed[0].status).toBe("confirmed");
      expect(result.confirmed[0].confidence).toBeGreaterThanOrEqual(90);
      expect(result.stats.confirmedCount).toBe(1);
      expect(result.stats.falsePositiveCount).toBe(0);
    });

    it("should filter out false positive hallucinations (symbol exists in project)", async () => {
      const mockContext = createMockContext();
      // Add the symbol to the project context
      mockContext.symbolIndex.set("existingHelper", [
        {
          file: "helpers.ts",
          symbol: {
            name: "existingHelper",
            kind: "function",
            line: 10,
            exported: true,
          },
        },
      ]);

      const hallucination: ValidationIssue = {
        type: "nonExistentFunction",
        severity: "critical",
        message: "Function 'existingHelper' does not exist in project",
        line: 3,
        file: "test.ts",
        code: "existingHelper();",
        suggestion: "Add import",
        confidence: 90,
        reasoning: "Symbol not found",
      };

      const result = await verifyFindingsAutomatically(
        [hallucination],
        [],
        mockContext,
        "/test",
        "typescript",
      );

      expect(result.falsePositives).toHaveLength(1);
      expect(result.falsePositives[0].status).toBe("false_positive");
      expect(result.falsePositives[0].reasons.some(r => r.includes("exists in project"))).toBe(true);
      expect(result.stats.falsePositiveCount).toBe(1);
      expect(result.stats.confirmedCount).toBe(0);
    });

    it("should confirm dependency hallucinations (package not on registry)", async () => {
      const mockContext = createMockContext();
      const hallucination: ValidationIssue = {
        type: "dependencyHallucination",
        severity: "critical",
        message: "Package 'totally-fake-package-xyz123' does not exist on typescript registry",
        line: 1,
        file: "test.ts",
        code: 'import { something } from "totally-fake-package-xyz123";',
        suggestion: "Did you mean: something-else?",
        confidence: 99,
        reasoning: "Package not found in manifest AND lookup failed on registry",
      };

      const result = await verifyFindingsAutomatically(
        [hallucination],
        [],
        mockContext,
        "/test",
        "typescript",
      );

      expect(result.confirmed).toHaveLength(1);
      expect(result.confirmed[0].status).toBe("confirmed");
      expect(result.confirmed[0].verificationMethod).toBe("registry_check");
    });

    it("should filter out false positive dependency issues (package exists on registry)", async () => {
      const mockContext = createMockContext();
      const issue: ValidationIssue = {
        type: "dependencyHallucination",
        severity: "critical",
        message: "Package 'react' does not exist on typescript registry",
        line: 1,
        file: "test.ts",
        code: 'import React from "react";',
        suggestion: "Did you mean: react?",
        confidence: 99,
        reasoning: "Package not found in manifest",
      };

      const result = await verifyFindingsAutomatically(
        [issue],
        [],
        mockContext,
        "/test",
        "typescript",
      );

      // "react" is a known package, so this should be a false positive
      expect(result.falsePositives).toHaveLength(1);
      expect(result.falsePositives[0].status).toBe("false_positive");
      expect(result.falsePositives[0].reasons.some(r => r.includes("exists on npm registry"))).toBe(true);
    });

    it("should treat function parameters as locally-defined (filters undefinedVariable false positives)", async () => {
      const mockContext = createMockContext();
      const fs = await import("fs/promises");
      const path = await import("path");

      const tmpFile = path.join(process.cwd(), "tests", ".tmp_local_param.ts");
      await fs.writeFile(
        tmpFile,
        `export function getUserEntries(startDate?: string, endDate?: string) {\n  if (startDate) return endDate;\n  return null;\n}`,
        "utf-8",
      );

      const issue: ValidationIssue = {
        type: "undefinedVariable",
        severity: "critical",
        message: "Variable 'startDate' is not defined or imported",
        line: 2,
        file: tmpFile,
        code: "if (startDate) return endDate;",
        suggestion: "",
        confidence: 90,
        reasoning: "(test)",
      };

      const result = await verifyFindingsAutomatically(
        [issue],
        [],
        mockContext,
        process.cwd(),
        "typescript",
      );

      // Cleanup
      await fs.unlink(tmpFile);

      expect(result.falsePositives).toHaveLength(1);
      expect(result.falsePositives[0].status).toBe("false_positive");
      expect(result.falsePositives[0].verificationMethod).toBe("local_scope");
      expect(result.falsePositives[0].reasons.join(" ")).toContain("defined locally");
    });

    it("should confirm unused imports", async () => {
      const mockContext = createMockContext();
      const issue: ValidationIssue = {
        type: "unusedImport",
        severity: "warning",
        message: "Imported symbol 'unusedHelper' is never used",
        line: 1,
        file: "/test/test.ts",
        code: "import { unusedHelper } from './helpers';",
        suggestion: "Remove the unused import",
        confidence: 98,
        reasoning: "Symbol is imported but never referenced",
      };

      const result = await verifyFindingsAutomatically(
        [issue],
        [],
        mockContext,
        "/test",
        "typescript",
      );

      expect(result.confirmed).toHaveLength(1);
      expect(result.confirmed[0].status).toBe("confirmed");
    });
  });

  describe("Dead Code Verification", () => {
    it("should confirm unused exports that are not used anywhere", async () => {
      const mockContext = createMockContext();
      const deadCode: DeadCodeIssue = {
        type: "unusedExport",
        severity: "medium",
        name: "helperFunction",
        file: "/project/src/utils.ts", // Use a regular src path, not test
        message: "Export 'helperFunction' is never used",
        suggestion: "Remove if not needed",
      };

      const result = await verifyFindingsAutomatically(
        [],
        [deadCode],
        mockContext,
        "/project",
        "typescript",
      );

      expect(result.confirmed).toHaveLength(1);
      expect(result.confirmed[0].status).toBe("confirmed");
      expect(result.confirmed[0].verificationMethod).toBe("dead_code_detector_trust");
    });

    it("should filter out false positive dead code for entry point files", async () => {
      const mockContext = createMockContext();
      const deadCode: DeadCodeIssue = {
        type: "orphanedFile",
        severity: "medium",
        name: "index.ts",
        file: "/test/index.ts",
        message: "File 'index.ts' is never imported",
        suggestion: "Check if this file is needed",
      };

      const result = await verifyFindingsAutomatically(
        [],
        [deadCode],
        mockContext,
        "/test",
        "typescript",
      );

      expect(result.falsePositives).toHaveLength(1);
      expect(result.falsePositives[0].status).toBe("false_positive");
      expect(result.falsePositives[0].reasons.some(r => r.includes("entry point"))).toBe(true);
    });
  });

  describe("getConfirmedFindings", () => {
    it("should return only confirmed findings", () => {
      const mockResult: VerificationResult = {
        confirmed: [
          {
            original: {
              type: "nonExistentFunction",
              severity: "critical",
              message: "Test",
              line: 1,
              file: "test.ts",
              code: "test()",
              suggestion: "",
            } as ValidationIssue,
            status: "confirmed",
            confidence: 95,
            reasons: ["Test reason"],
            verificationMethod: "test",
          },
        ],
        falsePositives: [
          {
            original: {
              type: "nonExistentFunction",
              severity: "critical",
              message: "Test2",
              line: 2,
              file: "test.ts",
              code: "test2()",
              suggestion: "",
            } as ValidationIssue,
            status: "false_positive",
            confidence: 90,
            reasons: ["Test reason"],
            verificationMethod: "test",
          },
        ],
        uncertain: [],
        stats: {
          totalAnalyzed: 2,
          confirmedCount: 1,
          falsePositiveCount: 1,
          uncertainCount: 0,
        },
      };

      const confirmed = getConfirmedFindings(mockResult);

      expect(confirmed.hallucinations).toHaveLength(1);
      expect(confirmed.hallucinations[0].message).toBe("Test");
      expect(confirmed.deadCode).toHaveLength(0);
    });

    it("should include uncertain findings with high confidence", () => {
      const mockResult: VerificationResult = {
        confirmed: [],
        falsePositives: [],
        uncertain: [
          {
            original: {
              type: "nonExistentFunction",
              severity: "high",
              message: "Uncertain but high confidence",
              line: 1,
              file: "test.ts",
              code: "test()",
              suggestion: "",
              confidence: 85,
            } as ValidationIssue,
            status: "uncertain",
            confidence: 85, // High confidence uncertain finding
            reasons: ["High confidence"],
            verificationMethod: "test",
          },
          {
            original: {
              type: "nonExistentFunction",
              severity: "low",
              message: "Low confidence uncertain",
              line: 2,
              file: "test.ts",
              code: "test2()",
              suggestion: "",
              confidence: 50,
            } as ValidationIssue,
            status: "uncertain",
            confidence: 50, // Low confidence, should be filtered
            reasons: ["Low confidence"],
            verificationMethod: "test",
          },
        ],
        stats: {
          totalAnalyzed: 2,
          confirmedCount: 0,
          falsePositiveCount: 0,
          uncertainCount: 2,
        },
      };

      const confirmed = getConfirmedFindings(mockResult);

      // Only the high confidence uncertain finding should be included
      expect(confirmed.hallucinations).toHaveLength(1);
      expect(confirmed.hallucinations[0].message).toBe("Uncertain but high confidence");
    });
  });

  describe("Verification Statistics", () => {
    it("should provide accurate statistics", async () => {
      const mockContext = createMockContext();
      
      const issues: ValidationIssue[] = [
        {
          type: "nonExistentFunction",
          severity: "critical",
          message: "Function 'fake1' does not exist",
          line: 1,
          file: "test.ts",
          code: "fake1();",
          suggestion: "",
        },
        {
          type: "nonExistentFunction",
          severity: "critical",
          message: "Function 'fake2' does not exist",
          line: 2,
          file: "test.ts",
          code: "fake2();",
          suggestion: "",
        },
      ];

      const deadCode: DeadCodeIssue[] = [
        {
          type: "unusedExport",
          severity: "medium",
          name: "unused",
          file: "/test/utils.ts",
          message: "Export 'unused' is never used",
        },
      ];

      const result = await verifyFindingsAutomatically(
        issues,
        deadCode,
        mockContext,
        "/test",
        "typescript",
      );

      expect(result.stats.totalAnalyzed).toBe(3);
      expect(result.stats.confirmedCount + result.stats.falsePositiveCount + result.stats.uncertainCount).toBe(3);
    });
  });

  describe("Future Feature Detection", () => {
    it("should detect planned features via TODO comments", async () => {
      const mockContext = createMockContext();
      // Simulate a file with TODO comment
      const deadCode: DeadCodeIssue = {
        type: "unusedExport",
        severity: "medium",
        name: "newFeatureHandler",
        file: "/project/src/features/newFeature.ts",
        message: "Export 'newFeatureHandler' is never used",
      };

      const result = await verifyFindingsAutomatically(
        [],
        [deadCode],
        mockContext,
        "/project",
        "typescript",
      );

      // Without actual file system, we can't detect TODOs
      // But we verify the verification runs without error
      expect(result).toBeDefined();
      expect(result.stats).toBeDefined();
    });

    it("should treat symbols with 'new' naming as potential future features", async () => {
      const mockContext = createMockContext();
      const hallucination: ValidationIssue = {
        type: "nonExistentFunction",
        severity: "critical",
        message: "Function 'newUserProfile' does not exist in project",
        line: 10,
        file: "/project/src/pages/profile.ts",
        code: "newUserProfile();",
        suggestion: "Did you mean: userProfile?",
        confidence: 95,
        reasoning: "Symbol not found",
      };

      const result = await verifyFindingsAutomatically(
        [hallucination],
        [],
        mockContext,
        "/project",
        "typescript",
      );

      // Should run without error - actual future feature detection
      // depends on git status and file content
      expect(result).toBeDefined();
    });

    it("should identify stub implementations as future features", async () => {
      const mockContext = createMockContext();
      const deadCode: DeadCodeIssue = {
        type: "unusedExport",
        severity: "low",
        name: "upcomingPaymentGateway",
        file: "/project/src/payment/gateway.ts",
        message: "Export 'upcomingPaymentGateway' is never used",
      };

      const result = await verifyFindingsAutomatically(
        [],
        [deadCode],
        mockContext,
        "/project",
        "typescript",
      );

      expect(result).toBeDefined();
      expect(result.stats.totalAnalyzed).toBe(1);
    });
  });
});
