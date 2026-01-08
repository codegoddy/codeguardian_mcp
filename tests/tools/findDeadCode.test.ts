/**
 * Comprehensive tests for find_dead_code tool
 *
 * @format
 */

import { findDeadCodeTool } from "../../src/tools/findDeadCode.js";
import * as fs from "fs/promises";
import * as path from "path";

describe("find_dead_code", () => {
  const testProjectPath = "tests/fixtures/dead-code-project";

  beforeAll(async () => {
    await fs.mkdir(`${testProjectPath}/src`, { recursive: true });
    await fs.mkdir(`${testProjectPath}/src/utils`, { recursive: true });

    // Main entry point - index.ts
    await fs.writeFile(
      `${testProjectPath}/src/index.ts`,
      `
import { usedFunction, UsedClass } from './utils/used';
import { partiallyUsed } from './utils/partial';

export function main() {
  usedFunction();
  const instance = new UsedClass();
  partiallyUsed();
}

main();
`
    );

    // File with all exports used
    await fs.writeFile(
      `${testProjectPath}/src/utils/used.ts`,
      `
export function usedFunction(): void {
  console.log('I am used');
}

export class UsedClass {
  doSomething() {
    return 'used';
  }
}
`
    );

    // File with some exports unused
    await fs.writeFile(
      `${testProjectPath}/src/utils/partial.ts`,
      `
export function partiallyUsed(): void {
  console.log('I am used');
}

export function unusedExport(): void {
  console.log('Nobody imports me');
}

export function anotherUnused(): string {
  return 'also unused';
}

export const UNUSED_CONSTANT = 42;
`
    );

    // Completely orphaned file - nothing imports it
    await fs.writeFile(
      `${testProjectPath}/src/utils/orphaned.ts`,
      `
export function orphanedFunction(): void {
  console.log('I am completely orphaned');
}

export class OrphanedClass {
  lonely() {
    return 'so lonely';
  }
}
`
    );

    // File with deprecated/TODO code
    await fs.writeFile(
      `${testProjectPath}/src/utils/legacy.ts`,
      `
// TODO: Remove this function
export function deprecatedFunc(): void {
  console.log('deprecated');
}

// FIXME: This is broken
export function brokenFunc(): void {
  throw new Error('broken');
}

// DEPRECATED
export function oldApi(): void {
  console.log('old');
}
`
    );

    // File with commented out code
    await fs.writeFile(
      `${testProjectPath}/src/utils/commented.ts`,
      `
export function activeFunction(): void {
  console.log('active');
}

// function commentedOut(): void {
//   console.log('commented');
// }

// const oldVariable = 'commented';
`
    );
  });

  afterAll(async () => {
    await fs.rm(testProjectPath, { recursive: true, force: true });
  });

  describe("Unused Export Detection", () => {
    test("should find unused exported functions", async () => {
      const result = await findDeadCodeTool.handler({
        directory: `${testProjectPath}/src`,
        language: "typescript",
      });

      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      expect(data.unusedExports.length).toBeGreaterThan(0);

      // Should find unusedExport and anotherUnused
      const unusedNames = data.unusedExports.map((e: any) => e.symbol);
      expect(unusedNames).toContain("unusedExport");
      expect(unusedNames).toContain("anotherUnused");
    });

    test("should NOT flag used exports", async () => {
      const result = await findDeadCodeTool.handler({
        directory: `${testProjectPath}/src`,
        language: "typescript",
      });

      const data = JSON.parse(result.content[0].text);

      const unusedNames = data.unusedExports.map((e: any) => e.symbol);
      expect(unusedNames).not.toContain("usedFunction");
      expect(unusedNames).not.toContain("UsedClass");
      expect(unusedNames).not.toContain("partiallyUsed");
    });

    test("should find unused constants", async () => {
      const result = await findDeadCodeTool.handler({
        directory: `${testProjectPath}/src`,
        language: "typescript",
      });

      const data = JSON.parse(result.content[0].text);

      const unusedNames = data.unusedExports.map((e: any) => e.symbol);
      expect(unusedNames).toContain("UNUSED_CONSTANT");
    });
  });

  describe("Orphaned File Detection", () => {
    test("should find orphaned files", async () => {
      const result = await findDeadCodeTool.handler({
        directory: `${testProjectPath}/src`,
        language: "typescript",
      });

      const data = JSON.parse(result.content[0].text);

      expect(data.orphanedFiles.length).toBeGreaterThan(0);
      expect(
        data.orphanedFiles.some((f: string) => f.includes("orphaned"))
      ).toBe(true);
    });

    test("should NOT flag entry point files as orphaned", async () => {
      const result = await findDeadCodeTool.handler({
        directory: `${testProjectPath}/src`,
        language: "typescript",
      });

      const data = JSON.parse(result.content[0].text);

      // index.ts should not be flagged as orphaned
      expect(data.orphanedFiles.some((f: string) => f.includes("index"))).toBe(
        false
      );
    });

    test("should respect custom entry points", async () => {
      const result = await findDeadCodeTool.handler({
        directory: `${testProjectPath}/src`,
        language: "typescript",
        entryPoints: ["orphaned.ts"],
      });

      const data = JSON.parse(result.content[0].text);

      // orphaned.ts should not be flagged when specified as entry point
      expect(
        data.orphanedFiles.some((f: string) => f.includes("orphaned"))
      ).toBe(false);
    });
  });

  describe("Possibly Dead Code Detection", () => {
    test("should flag code with TODO/FIXME/DEPRECATED comments", async () => {
      const result = await findDeadCodeTool.handler({
        directory: `${testProjectPath}/src`,
        language: "typescript",
      });

      const data = JSON.parse(result.content[0].text);

      expect(data.possiblyDead.length).toBeGreaterThan(0);
      expect(
        data.possiblyDead.some(
          (p: any) =>
            p.reason.includes("TODO") ||
            p.reason.includes("FIXME") ||
            p.reason.includes("DEPRECATED")
        )
      ).toBe(true);
    });

    test("should flag commented out code", async () => {
      const result = await findDeadCodeTool.handler({
        directory: `${testProjectPath}/src`,
        language: "typescript",
      });

      const data = JSON.parse(result.content[0].text);

      expect(
        data.possiblyDead.some((p: any) => p.reason.includes("Commented out"))
      ).toBe(true);
    });
  });

  describe("Summary Statistics", () => {
    test("should provide accurate summary", async () => {
      const result = await findDeadCodeTool.handler({
        directory: `${testProjectPath}/src`,
        language: "typescript",
      });

      const data = JSON.parse(result.content[0].text);

      expect(data.summary).toBeDefined();
      expect(data.summary.totalFiles).toBeGreaterThan(0);
      expect(data.summary.totalExports).toBeGreaterThan(0);
      expect(data.summary.unusedExports).toBe(data.unusedExports.length);
      expect(data.summary.orphanedFiles).toBe(data.orphanedFiles.length);
    });
  });

  describe("Edge Cases", () => {
    test("should handle empty directory", async () => {
      await fs.mkdir(`${testProjectPath}/empty`, { recursive: true });

      const result = await findDeadCodeTool.handler({
        directory: `${testProjectPath}/empty`,
        language: "typescript",
      });

      const data = JSON.parse(result.content[0].text);
      expect(data.success).toBe(true);
      expect(data.unusedExports).toEqual([]);
    });

    test("should handle non-existent directory", async () => {
      const result = await findDeadCodeTool.handler({
        directory: `${testProjectPath}/nonexistent`,
        language: "typescript",
      });

      const data = JSON.parse(result.content[0].text);
      expect(data.success).toBe(true);
      expect(data.unusedExports).toEqual([]);
    });
  });

  describe("Python Support", () => {
    beforeAll(async () => {
      await fs.mkdir(`${testProjectPath}/python`, { recursive: true });

      await fs.writeFile(
        `${testProjectPath}/python/main.py`,
        `
from utils import used_function

def main():
    used_function()

if __name__ == "__main__":
    main()
`
      );

      await fs.writeFile(
        `${testProjectPath}/python/utils.py`,
        `
def used_function():
    print("used")

def unused_function():
    print("unused")

class UnusedClass:
    pass
`
      );
    });

    test("should find unused Python functions", async () => {
      const result = await findDeadCodeTool.handler({
        directory: `${testProjectPath}/python`,
        language: "python",
      });

      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      const unusedNames = data.unusedExports.map((e: any) => e.symbol);
      expect(unusedNames).toContain("unused_function");
    });
  });

  describe("Performance", () => {
    test("should complete within reasonable time", async () => {
      const start = Date.now();

      await findDeadCodeTool.handler({
        directory: `${testProjectPath}/src`,
        language: "typescript",
      });

      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(5000);
    });
  });
});
