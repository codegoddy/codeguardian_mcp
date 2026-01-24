/**
 * Intent Tracker Tests
 *
 * @format
 */

import {
  intentTracker,
  type EditEvent,
} from "../../src/context/intentTracker.js";

describe("IntentTracker", () => {
  beforeEach(() => {
    // Clear history before each test
    intentTracker.clear();
  });

  describe("recordEdit", () => {
    it("should record edit events", () => {
      const event: EditEvent = {
        filePath: "src/utils/helper.ts",
        timestamp: Date.now(),
        symbols: ["helperFunction", "HelperClass"],
        language: "typescript",
      };

      intentTracker.recordEdit(event);
      const intent = intentTracker.getCurrentIntent();

      expect(intent.recentFiles).toContain("src/utils/helper.ts");
      expect(intent.recentSymbols.has("helperFunction")).toBe(true);
      expect(intent.recentSymbols.has("HelperClass")).toBe(true);
    });

    it("should track multiple edits", () => {
      const events: EditEvent[] = [
        {
          filePath: "src/components/Button.tsx",
          timestamp: Date.now(),
          symbols: ["Button", "ButtonProps"],
          language: "typescript",
        },
        {
          filePath: "src/components/Input.tsx",
          timestamp: Date.now(),
          symbols: ["Input", "InputProps"],
          language: "typescript",
        },
      ];

      events.forEach((e) => intentTracker.recordEdit(e));
      const intent = intentTracker.getCurrentIntent();

      expect(intent.recentFiles).toHaveLength(2);
      expect(intent.recentSymbols.size).toBe(4);
      expect(intent.recentSymbols.has("Button")).toBe(true);
      expect(intent.recentSymbols.has("Input")).toBe(true);
    });

    it("should limit history to MAX_HISTORY", () => {
      // Record 60 events (more than MAX_HISTORY of 50)
      for (let i = 0; i < 60; i++) {
        intentTracker.recordEdit({
          filePath: `src/file${i}.ts`,
          timestamp: Date.now(),
          symbols: [`symbol${i}`],
          language: "typescript",
        });
      }

      const intent = intentTracker.getCurrentIntent();
      // Should only keep last 50
      expect(intent.recentFiles.length).toBeLessThanOrEqual(50);
    });
  });

  describe("getCurrentIntent", () => {
    it("should return empty intent when no edits", () => {
      const intent = intentTracker.getCurrentIntent();

      expect(intent.recentFiles).toHaveLength(0);
      expect(intent.recentSymbols.size).toBe(0);
      expect(intent.focusArea).toBeNull();
      expect(intent.language).toBeNull();
    });

    it("should filter out old events", () => {
      const oldEvent: EditEvent = {
        filePath: "src/old.ts",
        timestamp: Date.now() - 10 * 60 * 1000, // 10 minutes ago
        symbols: ["oldSymbol"],
        language: "typescript",
      };

      const recentEvent: EditEvent = {
        filePath: "src/recent.ts",
        timestamp: Date.now(),
        symbols: ["recentSymbol"],
        language: "typescript",
      };

      intentTracker.recordEdit(oldEvent);
      intentTracker.recordEdit(recentEvent);

      const intent = intentTracker.getCurrentIntent();

      // Old event should be filtered out (> 5 minutes)
      expect(intent.recentFiles).not.toContain("src/old.ts");
      expect(intent.recentFiles).toContain("src/recent.ts");
      expect(intent.recentSymbols.has("oldSymbol")).toBe(false);
      expect(intent.recentSymbols.has("recentSymbol")).toBe(true);
    });

    it("should determine focus area from recent edits", () => {
      const events: EditEvent[] = [
        {
          filePath: "src/components/Button.tsx",
          timestamp: Date.now(),
          symbols: ["Button"],
          language: "typescript",
        },
        {
          filePath: "src/components/Input.tsx",
          timestamp: Date.now(),
          symbols: ["Input"],
          language: "typescript",
        },
        {
          filePath: "src/components/Form.tsx",
          timestamp: Date.now(),
          symbols: ["Form"],
          language: "typescript",
        },
        {
          filePath: "src/utils/helper.ts",
          timestamp: Date.now(),
          symbols: ["helper"],
          language: "typescript",
        },
      ];

      events.forEach((e) => intentTracker.recordEdit(e));
      const intent = intentTracker.getCurrentIntent();

      // Most edits in src/components
      expect(intent.focusArea).toBe("src/components");
    });

    it("should determine primary language", () => {
      const events: EditEvent[] = [
        {
          filePath: "src/file1.ts",
          timestamp: Date.now(),
          symbols: ["symbol1"],
          language: "typescript",
        },
        {
          filePath: "src/file2.ts",
          timestamp: Date.now(),
          symbols: ["symbol2"],
          language: "typescript",
        },
        {
          filePath: "src/file3.py",
          timestamp: Date.now(),
          symbols: ["symbol3"],
          language: "python",
        },
      ];

      events.forEach((e) => intentTracker.recordEdit(e));
      const intent = intentTracker.getCurrentIntent();

      // More TypeScript edits
      expect(intent.language).toBe("typescript");
    });
  });

  describe("isInFocusArea", () => {
    it("should return true for files in focus area", () => {
      const events: EditEvent[] = [
        {
          filePath: "src/components/Button.tsx",
          timestamp: Date.now(),
          symbols: ["Button"],
          language: "typescript",
        },
        {
          filePath: "src/components/Input.tsx",
          timestamp: Date.now(),
          symbols: ["Input"],
          language: "typescript",
        },
      ];

      events.forEach((e) => intentTracker.recordEdit(e));

      expect(intentTracker.isInFocusArea("src/components/Form.tsx")).toBe(true);
      expect(intentTracker.isInFocusArea("src/utils/helper.ts")).toBe(false);
    });

    it("should return false when no focus area", () => {
      expect(intentTracker.isInFocusArea("src/any/file.ts")).toBe(false);
    });
  });

  describe("isRecentlyUsed", () => {
    it("should return true for recently used symbols", () => {
      intentTracker.recordEdit({
        filePath: "src/file.ts",
        timestamp: Date.now(),
        symbols: ["myFunction", "MyClass"],
        language: "typescript",
      });

      expect(intentTracker.isRecentlyUsed("myFunction")).toBe(true);
      expect(intentTracker.isRecentlyUsed("MyClass")).toBe(true);
      expect(intentTracker.isRecentlyUsed("unknownSymbol")).toBe(false);
    });
  });

  describe("getFileRelevance", () => {
    it("should give highest score to most recently edited file", () => {
      const now = Date.now();
      intentTracker.recordEdit({
        filePath: "src/file1.ts",
        timestamp: now - 1000,
        symbols: ["symbol1"],
        language: "typescript",
      });
      intentTracker.recordEdit({
        filePath: "src/file2.ts",
        timestamp: now,
        symbols: ["symbol2"],
        language: "typescript",
      });

      const score1 = intentTracker.getFileRelevance("src/file1.ts");
      const score2 = intentTracker.getFileRelevance("src/file2.ts");

      expect(score2).toBeGreaterThan(score1);
      expect(score2).toBe(1.0); // Most recent
    });

    it("should give medium score to files in focus area", () => {
      intentTracker.recordEdit({
        filePath: "src/components/Button.tsx",
        timestamp: Date.now(),
        symbols: ["Button"],
        language: "typescript",
      });
      intentTracker.recordEdit({
        filePath: "src/components/Input.tsx",
        timestamp: Date.now(),
        symbols: ["Input"],
        language: "typescript",
      });

      const score = intentTracker.getFileRelevance("src/components/Form.tsx");
      expect(score).toBe(0.5);
    });

    it("should give zero score to unrelated files", () => {
      intentTracker.recordEdit({
        filePath: "src/components/Button.tsx",
        timestamp: Date.now(),
        symbols: ["Button"],
        language: "typescript",
      });

      const score = intentTracker.getFileRelevance("src/utils/helper.ts");
      expect(score).toBe(0.0);
    });
  });

  describe("getSymbolRelevance", () => {
    it("should give high score to recently used symbols", () => {
      intentTracker.recordEdit({
        filePath: "src/file.ts",
        timestamp: Date.now(),
        symbols: ["myFunction"],
        language: "typescript",
      });

      const score = intentTracker.getSymbolRelevance("myFunction");
      expect(score).toBe(0.8);
    });

    it("should give zero score to unknown symbols", () => {
      intentTracker.recordEdit({
        filePath: "src/file.ts",
        timestamp: Date.now(),
        symbols: ["myFunction"],
        language: "typescript",
      });

      const score = intentTracker.getSymbolRelevance("unknownSymbol");
      expect(score).toBe(0.0);
    });
  });

  describe("clear", () => {
    it("should clear all edit history", () => {
      intentTracker.recordEdit({
        filePath: "src/file.ts",
        timestamp: Date.now(),
        symbols: ["symbol"],
        language: "typescript",
      });

      intentTracker.clear();
      const intent = intentTracker.getCurrentIntent();

      expect(intent.recentFiles).toHaveLength(0);
      expect(intent.recentSymbols.size).toBe(0);
    });
  });
});
