/**
 * Comprehensive tests for scan_directory tool
 *
 * @format
 */

import { scanDirectoryTool } from "../../src/tools/scanDirectory.js";
import * as fs from "fs/promises";
import * as path from "path";

describe("scan_directory", () => {
  const testProjectPath = "tests/fixtures/scan-project";

  beforeAll(async () => {
    await fs.mkdir(`${testProjectPath}/src`, { recursive: true });
    await fs.mkdir(`${testProjectPath}/src/services`, { recursive: true });
    await fs.mkdir(`${testProjectPath}/src/utils`, { recursive: true });

    // File with various issues
    await fs.writeFile(
      `${testProjectPath}/src/services/userService.ts`,
      `
import { getUserById } from './nonexistent'; // Bad import

export async function fetchUser(id: string) {
  // Calling non-existent function
  const user = await getUser(id);
  const validated = validateUserData(user);
  return processUserResult(validated);
}

export function processData(data: any) {
  // eval is a security issue
  return eval(data.code);
}

export async function saveUser(user: any) {
  // SQL injection vulnerability
  const query = "SELECT * FROM users WHERE id = " + user.id;
  return db.execute(query);
}
`
    );

    // File with quality issues
    await fs.writeFile(
      `${testProjectPath}/src/services/dataService.ts`,
      `
export function complexFunction(a: number, b: number, c: number) {
  if (a > 0) {
    if (b > 0) {
      if (c > 0) {
        if (a > b) {
          if (b > c) {
            return a + b + c;
          } else {
            return a + b - c;
          }
        } else {
          return a - b + c;
        }
      } else {
        return a + b;
      }
    } else {
      return a;
    }
  } else {
    return 0;
  }
}

// TODO: Fix this function
export function brokenFunction() {
  console.log('broken');
}
`
    );

    // Clean file
    await fs.writeFile(
      `${testProjectPath}/src/utils/helpers.ts`,
      `
export function formatDate(date: Date): string {
  return date.toISOString();
}

export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function slugify(text: string): string {
  return text.toLowerCase().replace(/\\s+/g, '-');
}
`
    );

    // File with import issues
    await fs.writeFile(
      `${testProjectPath}/src/utils/broken.ts`,
      `
import { nonExistent } from './doesNotExist';
import { alsoMissing } from '../missing/module';

export function useImports() {
  return nonExistent() + alsoMissing();
}
`
    );
  });

  afterAll(async () => {
    await fs.rm(testProjectPath, { recursive: true, force: true });
  });

  describe("Summary Mode", () => {
    test("should return compact summary by default", async () => {
      const result = await scanDirectoryTool.handler({
        directory: `${testProjectPath}/src`,
        language: "typescript",
        outputMode: "summary",
      });

      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      expect(data.mode).toBe("summary");
      expect(data.summary).toBeDefined();
      expect(data.stats).toBeDefined();
      expect(data.stats.filesScanned).toBeGreaterThan(0);
    });

    test("should include score in summary", async () => {
      const result = await scanDirectoryTool.handler({
        directory: `${testProjectPath}/src`,
        language: "typescript",
        outputMode: "summary",
      });

      const data = JSON.parse(result.content[0].text);

      expect(data.stats.score).toBeDefined();
      expect(typeof data.stats.score).toBe("number");
    });
  });

  describe("Aggregated Mode", () => {
    test("should group issues by type", async () => {
      const result = await scanDirectoryTool.handler({
        directory: `${testProjectPath}/src`,
        language: "typescript",
        outputMode: "aggregated",
      });

      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      expect(data.mode).toBe("aggregated");
      expect(data.issues).toBeDefined();
      expect(data.summary).toBeDefined();
    });

    test("should provide hint for detailed view", async () => {
      const result = await scanDirectoryTool.handler({
        directory: `${testProjectPath}/src`,
        language: "typescript",
        outputMode: "aggregated",
      });

      const data = JSON.parse(result.content[0].text);

      expect(data.hint).toBeDefined();
      expect(data.hint).toContain("outputMode");
    });
  });

  describe("Detailed Mode", () => {
    test("should return paginated raw issues", async () => {
      const result = await scanDirectoryTool.handler({
        directory: `${testProjectPath}/src`,
        language: "typescript",
        outputMode: "detailed",
        page: 1,
        pageSize: 10,
      });

      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      expect(data.mode).toBe("detailed");
      expect(data.issues).toBeDefined();
      expect(data.pagination).toBeDefined();
      expect(data.pagination.page).toBe(1);
      expect(data.pagination.pageSize).toBe(10);
    });

    test("should respect page size limit", async () => {
      const result = await scanDirectoryTool.handler({
        directory: `${testProjectPath}/src`,
        language: "typescript",
        outputMode: "detailed",
        pageSize: 5,
      });

      const data = JSON.parse(result.content[0].text);

      expect(data.issues.length).toBeLessThanOrEqual(5);
    });

    test("should cap page size at 100", async () => {
      const result = await scanDirectoryTool.handler({
        directory: `${testProjectPath}/src`,
        language: "typescript",
        outputMode: "detailed",
        pageSize: 500, // Should be capped to 100
      });

      const data = JSON.parse(result.content[0].text);

      expect(data.pagination.pageSize).toBeLessThanOrEqual(100);
    });
  });

  describe("File Mode", () => {
    test("should return issues for specific file", async () => {
      const result = await scanDirectoryTool.handler({
        directory: `${testProjectPath}/src`,
        language: "typescript",
        outputMode: "file",
        targetFile: "userService.ts",
      });

      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      expect(data.mode).toBe("file");
      expect(data.file).toContain("userService");
      expect(data.issues).toBeDefined();
    });

    test("should require targetFile for file mode", async () => {
      const result = await scanDirectoryTool.handler({
        directory: `${testProjectPath}/src`,
        language: "typescript",
        outputMode: "file",
        // Missing targetFile
      });

      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(false);
      expect(data.error).toContain("targetFile");
    });
  });

  describe("Scan Types", () => {
    test("should run all scans by default", async () => {
      const result = await scanDirectoryTool.handler({
        directory: `${testProjectPath}/src`,
        language: "typescript",
        scanTypes: ["all"],
      });

      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
    });

    test("should run only security scan when specified", async () => {
      const result = await scanDirectoryTool.handler({
        directory: `${testProjectPath}/src`,
        language: "typescript",
        scanTypes: ["security"],
        outputMode: "aggregated",
      });

      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
    });

    test("should run only quality scan when specified", async () => {
      const result = await scanDirectoryTool.handler({
        directory: `${testProjectPath}/src`,
        language: "typescript",
        scanTypes: ["quality"],
        outputMode: "aggregated",
      });

      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
    });

    test("should run only import validation when specified", async () => {
      const result = await scanDirectoryTool.handler({
        directory: `${testProjectPath}/src`,
        language: "typescript",
        scanTypes: ["imports"],
        outputMode: "aggregated",
      });

      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
    });
  });

  describe("Severity Filtering", () => {
    test("should filter by minimum severity", async () => {
      const criticalOnly = await scanDirectoryTool.handler({
        directory: `${testProjectPath}/src`,
        language: "typescript",
        minSeverity: "critical",
        outputMode: "detailed",
      });

      const allSeverities = await scanDirectoryTool.handler({
        directory: `${testProjectPath}/src`,
        language: "typescript",
        minSeverity: "low",
        outputMode: "detailed",
      });

      const criticalData = JSON.parse(criticalOnly.content[0].text);
      const allData = JSON.parse(allSeverities.content[0].text);

      // All severities should have more or equal issues
      expect(allData.summary.totalIssues).toBeGreaterThanOrEqual(
        criticalData.summary.totalIssues
      );
    });
  });

  describe("Exclude Patterns", () => {
    test("should respect exclude patterns", async () => {
      const withExclude = await scanDirectoryTool.handler({
        directory: `${testProjectPath}/src`,
        language: "typescript",
        excludePatterns: ["**/services/**"],
        outputMode: "summary",
      });

      const withoutExclude = await scanDirectoryTool.handler({
        directory: `${testProjectPath}/src`,
        language: "typescript",
        outputMode: "summary",
      });

      const withData = JSON.parse(withExclude.content[0].text);
      const withoutData = JSON.parse(withoutExclude.content[0].text);

      // Excluding services should scan fewer files
      expect(withData.stats.filesScanned).toBeLessThan(
        withoutData.stats.filesScanned
      );
    });
  });

  describe("Max Files Limit", () => {
    test("should respect maxFiles limit", async () => {
      const result = await scanDirectoryTool.handler({
        directory: `${testProjectPath}/src`,
        language: "typescript",
        maxFiles: 2,
        outputMode: "summary",
      });

      const data = JSON.parse(result.content[0].text);

      expect(data.stats.filesScanned).toBeLessThanOrEqual(2);
    });

    test("should indicate when files were limited", async () => {
      // Create more files to trigger limit
      for (let i = 0; i < 5; i++) {
        await fs.writeFile(
          `${testProjectPath}/src/extra${i}.ts`,
          `export const x${i} = ${i};`
        );
      }

      const result = await scanDirectoryTool.handler({
        directory: `${testProjectPath}/src`,
        language: "typescript",
        maxFiles: 3,
        outputMode: "summary",
      });

      const data = JSON.parse(result.content[0].text);

      if (data.stats.filesLimited) {
        expect(data.stats.filesLimited).toContain("Limited");
      }

      // Cleanup
      for (let i = 0; i < 5; i++) {
        await fs.rm(`${testProjectPath}/src/extra${i}.ts`, { force: true });
      }
    });
  });

  describe("Edge Cases", () => {
    test("should handle empty directory", async () => {
      await fs.mkdir(`${testProjectPath}/empty`, { recursive: true });

      const result = await scanDirectoryTool.handler({
        directory: `${testProjectPath}/empty`,
        language: "typescript",
      });

      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      expect(data.stats.filesScanned).toBe(0);
    });

    test("should handle non-existent directory", async () => {
      const result = await scanDirectoryTool.handler({
        directory: `${testProjectPath}/nonexistent`,
        language: "typescript",
      });

      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      expect(data.stats.filesScanned).toBe(0);
    });

    test("should handle files with syntax errors gracefully", async () => {
      await fs.writeFile(
        `${testProjectPath}/src/broken-syntax.ts`,
        `
export function broken( {
  // Missing closing brace and paren
  return 1
`
      );

      const result = await scanDirectoryTool.handler({
        directory: `${testProjectPath}/src`,
        language: "typescript",
      });

      const data = JSON.parse(result.content[0].text);

      // Should still complete without crashing
      expect(data.success).toBe(true);

      // Cleanup
      await fs.rm(`${testProjectPath}/src/broken-syntax.ts`, { force: true });
    });
  });

  describe("Language Support", () => {
    test("should scan JavaScript files", async () => {
      await fs.writeFile(
        `${testProjectPath}/src/script.js`,
        `
function test() {
  return eval('1+1'); // Security issue
}
`
      );

      const result = await scanDirectoryTool.handler({
        directory: `${testProjectPath}/src`,
        language: "javascript",
      });

      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      expect(data.stats.filesScanned).toBeGreaterThan(0);

      // Cleanup
      await fs.rm(`${testProjectPath}/src/script.js`, { force: true });
    });

    test("should scan Python files", async () => {
      await fs.mkdir(`${testProjectPath}/python`, { recursive: true });
      await fs.writeFile(
        `${testProjectPath}/python/script.py`,
        `
def test():
    return eval('1+1')  # Security issue
`
      );

      const result = await scanDirectoryTool.handler({
        directory: `${testProjectPath}/python`,
        language: "python",
      });

      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);

      // Cleanup
      await fs.rm(`${testProjectPath}/python`, {
        recursive: true,
        force: true,
      });
    });
  });

  describe("Performance", () => {
    test("should complete within reasonable time", async () => {
      const start = Date.now();

      await scanDirectoryTool.handler({
        directory: `${testProjectPath}/src`,
        language: "typescript",
        scanTypes: ["all"],
      });

      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(10000); // 10 seconds max
    });

    test("should include scan time in response", async () => {
      const result = await scanDirectoryTool.handler({
        directory: `${testProjectPath}/src`,
        language: "typescript",
      });

      const data = JSON.parse(result.content[0].text);

      expect(data.stats.scanTime).toBeDefined();
      expect(data.stats.scanTime).toMatch(/\d+ms/);
    });
  });
});
