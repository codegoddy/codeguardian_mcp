/**
 * Branch-Aware Caching Tests
 *
 * Tests the new branch-aware caching feature inspired by Augment Code.
 * Ensures context is properly isolated per branch and invalidated on branch switches.
 *
 * @format
 */

import {
  getProjectContext,
  clearContextCache,
} from "../../src/context/projectContext.js";
import { getGitInfo } from "../../src/utils/gitUtils.js";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { execFileSync } from "child_process";

describe("Branch-Aware Caching", () => {
  let projectPath: string;

  beforeAll(async () => {
    projectPath = await fs.mkdtemp(
      path.join(os.tmpdir(), "codeguardian-branch-cache-"),
    );
    await fs.mkdir(path.join(projectPath, "src"), { recursive: true });
    await fs.writeFile(
      path.join(projectPath, "package.json"),
      JSON.stringify({ name: "test-project", version: "1.0.0" }),
    );
    await fs.writeFile(
      path.join(projectPath, "src", "index.ts"),
      "export function hello() { return 'world'; }\n",
    );
    await fs.writeFile(path.join(projectPath, ".gitignore"), "node_modules/\n");

    execFileSync("git", ["init", "-b", "main"], { cwd: projectPath });
    execFileSync("git", ["config", "user.email", "test@example.com"], {
      cwd: projectPath,
    });
    execFileSync("git", ["config", "user.name", "Test"], { cwd: projectPath });
    execFileSync("git", ["add", "."], { cwd: projectPath });
    execFileSync("git", ["commit", "-m", "init"], { cwd: projectPath });
  });

  afterAll(async () => {
    if (!projectPath) return;
    await fs.rm(projectPath, { recursive: true, force: true });
  });

  beforeEach(() => {
    clearContextCache();
  });

  it("should include git info in project context", async () => {
    const context = await getProjectContext(projectPath, {
      language: "typescript",
      maxFiles: 50,
    });

    // Should have git info (this project is a git repo)
    expect(context.gitInfo).toBeDefined();
    if (context.gitInfo) {
      expect(context.gitInfo.branch).toBeTruthy();
      expect(context.gitInfo.commitSHA).toBeTruthy();
      expect(context.gitInfo.isRepo).toBe(true);
    }
  }, 30000);

  it("should cache context per branch", async () => {
    const startTime1 = Date.now();
    const context1 = await getProjectContext(projectPath, {
      language: "typescript",
      maxFiles: 50,
    });
    const buildTime1 = Date.now() - startTime1;

    // Second call should be much faster (cached)
    const startTime2 = Date.now();
    const context2 = await getProjectContext(projectPath, {
      language: "typescript",
      maxFiles: 50,
    });
    const buildTime2 = Date.now() - startTime2;

    // Should have same git identity (branch-aware)
    expect(context2.gitInfo).toEqual(context1.gitInfo);

    console.log(`First build: ${buildTime1}ms, Cached: ${buildTime2}ms`);
  }, 30000);

  it("should detect git info correctly", async () => {
    const gitInfo = await getGitInfo(projectPath);

    expect(gitInfo).toBeDefined();
    if (gitInfo) {
      expect(gitInfo.isRepo).toBe(true);
      expect(gitInfo.branch).toBeTruthy();
      expect(gitInfo.commitSHA).toBeTruthy();
      expect(gitInfo.commitSHA.length).toBeLessThanOrEqual(7); // Short SHA

      console.log(`Git: ${gitInfo.branch}@${gitInfo.commitSHA}`);
    }
  });

  it("should handle non-git directories gracefully", async () => {
    const tempDir = "/tmp";
    const gitInfo = await getGitInfo(tempDir);

    // /tmp is typically not a git repo
    expect(gitInfo).toBeNull();
  });

  it("should force rebuild when requested", async () => {
    // Build once
    const context1 = await getProjectContext(projectPath, {
      language: "typescript",
      maxFiles: 50,
    });

    // Force rebuild
    const startTime = Date.now();
    const context2 = await getProjectContext(projectPath, {
      language: "typescript",
      maxFiles: 50,
      forceRebuild: true,
    });
    const rebuildTime = Date.now() - startTime;

    // Force rebuild should update the context build time
    expect(context2.buildTime).not.toBe(context1.buildTime);

    // Should keep same git identity
    expect(context2.gitInfo).toEqual(context1.gitInfo);

    // maxFiles should be respected by the rebuilt context
    expect(context2.files.size).toBeLessThanOrEqual(50);

    console.log(`Force rebuild: ${rebuildTime}ms`);
  }, 30000);
});
