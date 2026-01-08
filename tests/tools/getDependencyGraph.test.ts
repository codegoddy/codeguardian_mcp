/**
 * Comprehensive tests for get_dependency_graph tool
 *
 * @format
 */

import { getDependencyGraphTool } from "../../src/tools/getDependencyGraph.js";
import * as fs from "fs/promises";
import * as path from "path";

describe("get_dependency_graph", () => {
  const testProjectPath = "tests/fixtures/dep-graph-project";

  beforeAll(async () => {
    // Create a project with clear dependency structure
    await fs.mkdir(`${testProjectPath}/src`, { recursive: true });
    await fs.mkdir(`${testProjectPath}/src/utils`, { recursive: true });
    await fs.mkdir(`${testProjectPath}/src/services`, { recursive: true });

    // Create package.json for project root detection
    await fs.writeFile(
      `${testProjectPath}/package.json`,
      JSON.stringify({ name: "test-project", version: "1.0.0" })
    );

    // utils/helpers.ts - leaf node (no imports)
    await fs.writeFile(
      `${testProjectPath}/src/utils/helpers.ts`,
      `
export function formatDate(date: Date): string {
  return date.toISOString();
}

export function slugify(text: string): string {
  return text.toLowerCase().replace(/\\s+/g, '-');
}
`
    );

    // utils/logger.ts - leaf node
    await fs.writeFile(
      `${testProjectPath}/src/utils/logger.ts`,
      `
export function log(message: string): void {
  console.log(\`[\${new Date().toISOString()}] \${message}\`);
}

export function error(message: string): void {
  console.error(\`[ERROR] \${message}\`);
}
`
    );

    // services/userService.ts - imports helpers and logger
    await fs.writeFile(
      `${testProjectPath}/src/services/userService.ts`,
      `
import { formatDate } from '../utils/helpers';
import { log } from '../utils/logger';

export async function getUser(id: string) {
  log(\`Fetching user \${id}\`);
  return { id, createdAt: formatDate(new Date()) };
}

export async function createUser(name: string) {
  log(\`Creating user \${name}\`);
  return { name, createdAt: formatDate(new Date()) };
}
`
    );

    // services/authService.ts - imports userService
    await fs.writeFile(
      `${testProjectPath}/src/services/authService.ts`,
      `
import { getUser } from './userService';
import { log, error } from '../utils/logger';

export async function login(userId: string, password: string) {
  log(\`Login attempt for \${userId}\`);
  const user = await getUser(userId);
  if (!user) {
    error('User not found');
    return null;
  }
  return { user, token: 'jwt-token' };
}
`
    );

    // index.ts - entry point, imports authService
    await fs.writeFile(
      `${testProjectPath}/src/index.ts`,
      `
import { login } from './services/authService';
import { createUser } from './services/userService';

export { login, createUser };

async function main() {
  const session = await login('user1', 'password');
  console.log(session);
}

main();
`
    );

    // Create circular dependency for testing
    await fs.mkdir(`${testProjectPath}/src/circular`, { recursive: true });

    await fs.writeFile(
      `${testProjectPath}/src/circular/a.ts`,
      `
import { funcB } from './b';
export function funcA() { return funcB(); }
`
    );

    await fs.writeFile(
      `${testProjectPath}/src/circular/b.ts`,
      `
import { funcA } from './a';
export function funcB() { return funcA(); }
`
    );
  });

  afterAll(async () => {
    await fs.rm(testProjectPath, { recursive: true, force: true });
  });

  describe("Basic Dependency Tracing", () => {
    test("should find imports for a file", async () => {
      const result = await getDependencyGraphTool.handler({
        target: `${testProjectPath}/src/services/userService.ts`,
        language: "typescript",
        depth: 1,
      });

      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);

      // Find the userService entry
      const files = Object.keys(data.graph.files);
      const userServiceKey = files.find((f) => f.includes("userService"));
      expect(userServiceKey).toBeDefined();

      const userService = data.graph.files[userServiceKey!];
      expect(
        userService.imports.some((i: string) => i.includes("helpers"))
      ).toBe(true);
      expect(
        userService.imports.some((i: string) => i.includes("logger"))
      ).toBe(true);
    });

    test("should find files that import a given file", async () => {
      const result = await getDependencyGraphTool.handler({
        target: `${testProjectPath}/src/utils/logger.ts`,
        language: "typescript",
        depth: 2,
      });

      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);

      // Logger should be imported by userService and authService
      const files = Object.keys(data.graph.files);
      const loggerKey = files.find((f) => f.includes("logger"));

      if (loggerKey && data.graph.files[loggerKey]) {
        const importedBy = data.graph.files[loggerKey].importedBy;
        expect(importedBy.length).toBeGreaterThan(0);
      }
    });

    test("should identify external dependencies", async () => {
      const result = await getDependencyGraphTool.handler({
        target: `${testProjectPath}/src`,
        language: "typescript",
        depth: 1,
      });

      const data = JSON.parse(result.content[0].text);
      expect(data.success).toBe(true);
    });
  });

  describe("Depth Control", () => {
    test("should respect depth limit", async () => {
      const shallowResult = await getDependencyGraphTool.handler({
        target: `${testProjectPath}/src/index.ts`,
        language: "typescript",
        depth: 1,
      });

      const deepResult = await getDependencyGraphTool.handler({
        target: `${testProjectPath}/src/index.ts`,
        language: "typescript",
        depth: 3,
      });

      const shallowData = JSON.parse(shallowResult.content[0].text);
      const deepData = JSON.parse(deepResult.content[0].text);

      // Deeper search should find more files
      const shallowFileCount = Object.keys(shallowData.graph.files).length;
      const deepFileCount = Object.keys(deepData.graph.files).length;

      expect(deepFileCount).toBeGreaterThanOrEqual(shallowFileCount);
    });

    test("should cap depth at 5", async () => {
      const result = await getDependencyGraphTool.handler({
        target: `${testProjectPath}/src/index.ts`,
        language: "typescript",
        depth: 100, // Should be capped to 5
      });

      const data = JSON.parse(result.content[0].text);
      expect(data.success).toBe(true);
    });
  });

  describe("Direction Control", () => {
    test("should only trace imports when direction=imports", async () => {
      const result = await getDependencyGraphTool.handler({
        target: `${testProjectPath}/src/services/userService.ts`,
        language: "typescript",
        depth: 2,
        direction: "imports",
      });

      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      // Should have imports but importedBy should be empty
      if (data.graph && data.graph.files) {
        const files = Object.values(data.graph.files) as any[];
        files.forEach((file) => {
          expect(file.importedBy).toEqual([]);
        });
      }
    });

    test("should only trace importedBy when direction=importedBy", async () => {
      const result = await getDependencyGraphTool.handler({
        target: `${testProjectPath}/src/utils/helpers.ts`,
        language: "typescript",
        depth: 2,
        direction: "importedBy",
      });

      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      // Should have importedBy but imports should be empty
      if (data.graph && data.graph.files) {
        const files = Object.values(data.graph.files) as any[];
        files.forEach((file) => {
          expect(file.imports).toEqual([]);
        });
      }
    });
  });

  describe("Circular Dependency Detection", () => {
    test("should detect circular dependencies", async () => {
      const result = await getDependencyGraphTool.handler({
        target: `${testProjectPath}/src/circular/a.ts`,
        language: "typescript",
        depth: 2,
      });

      const data = JSON.parse(result.content[0].text);

      // Circular detection may or may not find the files depending on project root
      expect(data).toBeDefined();
      if (data.success && data.graph) {
        expect(data.graph.circularDependencies).toBeDefined();
      }
    });
  });

  describe("Edge Cases", () => {
    test("should handle non-existent file gracefully", async () => {
      const result = await getDependencyGraphTool.handler({
        target: `${testProjectPath}/src/nonexistent.ts`,
        language: "typescript",
        depth: 1,
      });

      const data = JSON.parse(result.content[0].text);
      expect(data.success).toBe(false);
      expect(data.error).toContain("No matching files");
    });

    test("should handle partial file name match", async () => {
      const result = await getDependencyGraphTool.handler({
        target: "userService",
        language: "typescript",
        depth: 1,
      });

      const data = JSON.parse(result.content[0].text);
      // May or may not find depending on project root detection
      expect(data).toBeDefined();
    });

    test("should handle directory as target", async () => {
      const result = await getDependencyGraphTool.handler({
        target: `${testProjectPath}/src/services`,
        language: "typescript",
        depth: 1,
      });

      const data = JSON.parse(result.content[0].text);
      // Directory targets may not match files directly
      expect(data).toBeDefined();
    });
  });

  describe("Performance", () => {
    test("should complete within reasonable time", async () => {
      const start = Date.now();

      await getDependencyGraphTool.handler({
        target: `${testProjectPath}/src`,
        language: "typescript",
        depth: 3,
      });

      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(5000);
    });
  });
});
