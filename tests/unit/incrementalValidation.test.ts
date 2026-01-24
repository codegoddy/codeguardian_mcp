/**
 * Incremental Validation Tests
 *
 * @format
 */

import { incrementalValidation } from "../../src/tools/incrementalValidation.js";
import type {
  ValidationIssue,
  DeadCodeIssue,
} from "../../src/tools/validation/types.js";

describe("IncrementalValidation", () => {
  beforeEach(() => {
    incrementalValidation.clear();
  });

  describe("saveSnapshot and getSnapshot", () => {
    it("should save and retrieve validation snapshot", () => {
      const code = "const x = 1;";
      const issues: ValidationIssue[] = [];
      const deadCode: DeadCodeIssue[] = [];

      incrementalValidation.saveSnapshot("session1", code, issues, deadCode);
      const snapshot = incrementalValidation.getSnapshot("session1");

      expect(snapshot).toBeDefined();
      expect(snapshot?.code).toBe(code);
      expect(snapshot?.issues).toEqual(issues);
      expect(snapshot?.deadCode).toEqual(deadCode);
    });

    it("should return null for non-existent session", () => {
      const snapshot = incrementalValidation.getSnapshot("nonexistent");
      expect(snapshot).toBeNull();
    });
  });

  describe("detectChanges", () => {
    it("should detect additions", () => {
      const oldCode = "line1\nline2";
      const newCode = "line1\nline2\nline3";

      const changes = incrementalValidation.detectChanges(oldCode, newCode);

      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe("addition");
      expect(changes[0].newContent).toContain("line3");
    });

    it("should detect deletions", () => {
      const oldCode = "line1\nline2\nline3";
      const newCode = "line1\nline3";

      const changes = incrementalValidation.detectChanges(oldCode, newCode);

      expect(changes.length).toBeGreaterThan(0);
      expect(changes.some((c) => c.type === "deletion")).toBe(true);
    });

    it("should detect modifications", () => {
      const oldCode = "const x = 1;";
      const newCode = "const x = 2;";

      const changes = incrementalValidation.detectChanges(oldCode, newCode);

      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe("modification");
    });

    it("should detect no changes for identical code", () => {
      const code = "const x = 1;\nconst y = 2;";

      const changes = incrementalValidation.detectChanges(code, code);

      expect(changes).toHaveLength(0);
    });
  });

  describe("canUseIncremental", () => {
    it("should return false when no snapshot exists", () => {
      const result = incrementalValidation.canUseIncremental(
        "session1",
        "const x = 1;",
      );

      expect(result.canUse).toBe(false);
      expect(result.snapshot).toBeUndefined();
    });

    it("should return true for small changes", () => {
      const oldCode =
        "const x = 1;\nconst y = 2;\nconst z = 3;\nconst a = 4;\nconst b = 5;\nconst c = 6;\nconst d = 7;\nconst e = 8;\nconst f = 9;\nconst g = 10;";
      const newCode =
        "const x = 2;\nconst y = 2;\nconst z = 3;\nconst a = 4;\nconst b = 5;\nconst c = 6;\nconst d = 7;\nconst e = 8;\nconst f = 9;\nconst g = 10;"; // Only 1 line changed out of 10

      incrementalValidation.saveSnapshot("session1", oldCode, [], []);
      const result = incrementalValidation.canUseIncremental(
        "session1",
        newCode,
      );

      expect(result.canUse).toBe(true);
      expect(result.snapshot).toBeDefined();
      expect(result.changes).toBeDefined();
    });

    it("should return false for large changes (>30%)", () => {
      const oldCode = "line1\nline2\nline3\nline4\nline5";
      const newCode = "line1\nNEW2\nNEW3\nNEW4\nline5"; // 3 out of 5 lines changed (60%)

      incrementalValidation.saveSnapshot("session1", oldCode, [], []);
      const result = incrementalValidation.canUseIncremental(
        "session1",
        newCode,
      );

      expect(result.canUse).toBe(false);
    });
  });

  describe("filterAffectedIssues", () => {
    it("should keep issues not in affected lines", () => {
      const issues: ValidationIssue[] = [
        {
          type: "nonExistentFunction",
          severity: "critical",
          message: "Issue on line 1",
          line: 1,
          code: "code1",
          confidence: 90,
        },
        {
          type: "nonExistentFunction",
          severity: "critical",
          message: "Issue on line 5",
          line: 5,
          code: "code5",
          confidence: 90,
        },
      ];

      const changes = [
        {
          type: "modification" as const,
          startLine: 3,
          endLine: 3,
          newContent: "changed",
        },
      ];

      const filtered = incrementalValidation.filterAffectedIssues(
        issues,
        changes,
      );

      expect(filtered).toHaveLength(2); // Both issues kept (not on line 3)
      expect(filtered.map((i) => i.line)).toEqual([1, 5]);
    });

    it("should remove issues in affected lines", () => {
      const issues: ValidationIssue[] = [
        {
          type: "nonExistentFunction",
          severity: "critical",
          message: "Issue on line 1",
          line: 1,
          code: "code1",
          confidence: 90,
        },
        {
          type: "nonExistentFunction",
          severity: "critical",
          message: "Issue on line 3",
          line: 3,
          code: "code3",
          confidence: 90,
        },
      ];

      const changes = [
        {
          type: "modification" as const,
          startLine: 3,
          endLine: 3,
          newContent: "changed",
        },
      ];

      const filtered = incrementalValidation.filterAffectedIssues(
        issues,
        changes,
      );

      expect(filtered).toHaveLength(1);
      expect(filtered[0].line).toBe(1);
    });

    it("should keep issues without line numbers", () => {
      const issues: ValidationIssue[] = [
        {
          type: "missingDependency",
          severity: "critical",
          message: "Missing package",
          confidence: 95,
        },
      ];

      const changes = [
        {
          type: "modification" as const,
          startLine: 1,
          endLine: 1,
          newContent: "changed",
        },
      ];

      const filtered = incrementalValidation.filterAffectedIssues(
        issues,
        changes,
      );

      expect(filtered).toHaveLength(1);
    });
  });

  describe("clear", () => {
    it("should clear all snapshots", () => {
      incrementalValidation.saveSnapshot("session1", "code1", [], []);
      incrementalValidation.saveSnapshot("session2", "code2", [], []);

      incrementalValidation.clear();

      expect(incrementalValidation.getSnapshot("session1")).toBeNull();
      expect(incrementalValidation.getSnapshot("session2")).toBeNull();
    });
  });
});
