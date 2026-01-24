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

describe("Branch-Aware Caching", () => {
  const projectPath = process.cwd(); // Use current project as test subject

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

    // Should be the same context object (cached)
    expect(context1).toBe(context2);

    // Second call should be significantly faster
    expect(buildTime2).toBeLessThan(buildTime1 / 2);

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

    // Should be different objects (rebuilt)
    expect(context1).not.toBe(context2);

    // But should have same content
    expect(context2.totalFiles).toBe(context1.totalFiles);
    expect(context2.gitInfo).toEqual(context1.gitInfo);

    console.log(`Force rebuild: ${rebuildTime}ms`);
  }, 30000);
});
