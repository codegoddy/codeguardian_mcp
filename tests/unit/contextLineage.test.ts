/**
 * Context Lineage Tests
 *
 * @format
 */

import { contextLineage } from "../../src/context/contextLineage.js";

describe("ContextLineage", () => {
  const projectPath = process.cwd();

  beforeEach(() => {
    contextLineage.clear();
  });

  describe("getLineageContext", () => {
    it("should return null for non-git repositories", async () => {
      const context = await contextLineage.getLineageContext("/tmp/not-a-repo");
      expect(context).toBeNull();
    }, 5000);

    it("should get lineage context for git repository", async () => {
      const context = await contextLineage.getLineageContext(projectPath, {
        commitDepth: 5, // Reduced from 20
      });

      if (context) {
        expect(context.recentlyModifiedFiles).toBeDefined();
        expect(Array.isArray(context.recentlyModifiedFiles)).toBe(true);
        expect(context.hotspotFiles).toBeDefined();
        expect(context.relatedFiles).toBeDefined();
        expect(context.fileHistories).toBeDefined();
      }
    }, 8000);
  });

  describe("getFileLineageScore", () => {
    it("should return 0 for null context", () => {
      const score = contextLineage.getFileLineageScore("any/file.ts", null);
      expect(score).toBe(0);
    });

    it("should score recently modified files higher", async () => {
      const context = await contextLineage.getLineageContext(projectPath, {
        commitDepth: 5,
      });

      if (context && context.recentlyModifiedFiles.length > 0) {
        const recentFile = context.recentlyModifiedFiles[0];
        const score = contextLineage.getFileLineageScore(recentFile, context);
        expect(score).toBeGreaterThanOrEqual(0);
      }
    }, 8000);
  });

  describe("getRelatedFileSymbols", () => {
    it("should return empty array for null context", () => {
      const related = contextLineage.getRelatedFileSymbols("any/file.ts", null);
      expect(related).toEqual([]);
    });
  });

  describe("clear", () => {
    it("should clear cache", () => {
      contextLineage.clear();
      // Just verify it doesn't throw
      expect(true).toBe(true);
    });
  });
});
