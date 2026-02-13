/**
 * Persistent Context Caching Tests
 *
 * Verifies that the project context can be serialized, saved to disk,
 * and correctly rehydrated after a process restart.
 *
 * @format
 */

import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { serialize, deserialize } from "../../src/utils/serialization.js";
import { 
  getProjectContext, 
  clearContextCache,
  ProjectContext
} from "../../src/context/projectContext.js";
import { logger } from "../../src/utils/logger.js";
import { execFileSync } from "child_process";

describe("Persistent Context Caching", () => {
  let projectPath: string;
  let cacheDir: string;
  let cacheFile: string;

  beforeAll(async () => {
    projectPath = await fs.mkdtemp(
      path.join(os.tmpdir(), "codeguardian-persistent-context-"),
    );
    await fs.mkdir(path.join(projectPath, "src"), { recursive: true });
    await fs.writeFile(
      path.join(projectPath, "package.json"),
      JSON.stringify({ name: "test-project", version: "1.0.0" }),
    );
    await fs.writeFile(
      path.join(projectPath, "src", "index.ts"),
      "export const answer = 42;\n",
    );
    await fs.writeFile(path.join(projectPath, ".gitignore"), "node_modules/\n");

    execFileSync("git", ["init", "-b", "main"], { cwd: projectPath });
    execFileSync("git", ["config", "user.email", "test@example.com"], {
      cwd: projectPath,
    });
    execFileSync("git", ["config", "user.name", "Test"], { cwd: projectPath });
    execFileSync("git", ["add", "."], { cwd: projectPath });
    execFileSync("git", ["commit", "-m", "init"], { cwd: projectPath });

    cacheDir = path.join(projectPath, ".codeguardian");
    cacheFile = path.join(cacheDir, "context_cache.json");
  });

  beforeEach(async () => {
    clearContextCache();
    // Clean up disk cache before each test
    try {
      await fs.rm(cacheDir, { recursive: true, force: true });
    } catch (err) {
      // Ignore
    }
  });

  afterAll(async () => {
    // Final cleanup
    try {
      await fs.rm(projectPath, { recursive: true, force: true });
    } catch (err) {
      // Ignore
    }
  });

  describe("Serialization", () => {
    it("should correctly serialize and deserialize Maps", () => {
      const originalMap = new Map<string, any>();
      originalMap.set("key1", { id: 1, name: "test" });
      originalMap.set("key2", [1, 2, 3]);

      const serialized = serialize({ myMap: originalMap });
      const deserialized: any = deserialize(serialized);

      expect(deserialized.myMap).toBeInstanceOf(Map);
      expect(deserialized.myMap.get("key1")).toEqual(originalMap.get("key1"));
      expect(deserialized.myMap.get("key2")).toEqual(originalMap.get("key2"));
    });

    it("should correctly serialize and deserialize Sets", () => {
      const originalSet = new Set<string>(["a", "b", "c"]);

      const serialized = serialize({ mySet: originalSet });
      const deserialized: any = deserialize(serialized);

      expect(deserialized.mySet).toBeInstanceOf(Set);
      expect(deserialized.mySet.has("a")).toBe(true);
      expect(deserialized.mySet.has("b")).toBe(true);
      expect(deserialized.mySet.size).toBe(3);
    });
  });

  describe("Disk Persistence Flow", () => {
    it("should save context to disk after first build", async () => {
      // 1. Build context (this should trigger save)
      await getProjectContext(projectPath, {
        language: "typescript",
        maxFiles: 10,
      });

      // 2. Verify file exists
      const exists = await fs.access(cacheFile).then(() => true).catch(() => false);
      expect(exists).toBe(true);

      // 3. Verify .gitignore was updated
      const gitignore = await fs.readFile(path.join(projectPath, ".gitignore"), "utf-8");
      expect(gitignore).toContain(".codeguardian/");
    }, 30000);

    it("should hydrate from disk when memory cache is empty", async () => {
      // 1. First build to populate disk
      await getProjectContext(projectPath, {
        language: "typescript",
        maxFiles: 10,
      });

      // 2. Clear memory cache
      clearContextCache();

      // 3. Second call should hit disk
      // We'll peek at the logs or check the returned object
      const startTime = Date.now();
      const context = await getProjectContext(projectPath, {
        language: "typescript",
        maxFiles: 10,
      });
      const duration = Date.now() - startTime;

      expect(context).toBeDefined();
      expect(context.projectPath).toBe(projectPath);
      
      // Hydration from disk should be significantly faster than full scan
      // (Full scan takes ~1000ms+, disk load < 100ms)
      console.log(`Hydration duration: ${duration}ms`);
      expect(duration).toBeLessThan(500); 
    }, 30000);

    it("should invalidate disk cache if git hash changes (mocked)", async () => {
      // 1. First build
      await getProjectContext(projectPath, {
        language: "typescript",
        maxFiles: 10,
      });

      // Clear memory cache FIRST
      clearContextCache();

      // 2. Manually corrupt the disk cache's git info
      const content = await fs.readFile(cacheFile, "utf-8");
      // Use global flag to replace ALL occurrences (there are multiple: in CachedContext and ProjectContext)
      const corruptedContent = content.replace(/"commitSHA":"[^"]+"/g, '"commitSHA":"BOGUS_SHA"');
      await fs.writeFile(cacheFile, corruptedContent, "utf-8");

      // 4. Second call should detect mismatch and REBUILD
      const context = await getProjectContext(projectPath, {
        language: "typescript",
        maxFiles: 10,
      });

      expect(context).toBeDefined();
      
      // 5. Verify disk was rewritten after rebuild with the CORRECT SHA
      const newContent = await fs.readFile(cacheFile, "utf-8");
      expect(newContent).not.toContain("BOGUS_SHA");
      expect(newContent).toContain(context.gitInfo?.commitSHA);
    }, 30000);
  });
});
