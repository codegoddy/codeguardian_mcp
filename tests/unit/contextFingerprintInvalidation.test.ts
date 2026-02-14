/**
 * Context Fingerprint Invalidation Tests
 *
 * Ensures the persistent context cache invalidates correctly even when mtime is
 * preserved (e.g., copy-with-preserve, untar).
 *
 * @format
 */

import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { execFileSync } from "child_process";

import {
  clearContextCache,
  getProjectContext,
} from "../../src/context/projectContext.js";

describe("Context cache fingerprint invalidation", () => {
  let projectPath: string;
  let srcFile: string;

  beforeEach(async () => {
    clearContextCache();
    projectPath = await fs.mkdtemp(
      path.join(os.tmpdir(), "codeguardian-fingerprint-cache-"),
    );
    await fs.mkdir(path.join(projectPath, "src"), { recursive: true });
    await fs.writeFile(
      path.join(projectPath, "package.json"),
      JSON.stringify({ name: "test-project", version: "1.0.0" }),
    );
    await fs.writeFile(path.join(projectPath, ".gitignore"), "node_modules/\n");

    execFileSync("git", ["init", "-b", "main"], { cwd: projectPath });
    execFileSync("git", ["config", "user.email", "test@example.com"], {
      cwd: projectPath,
    });
    execFileSync("git", ["config", "user.name", "Test"], { cwd: projectPath });

    srcFile = path.join(projectPath, "src", "api.ts");
    await fs.writeFile(
      srcFile,
      [
        "class ApiError extends Error {}",
        "export { ApiError };",
        "export const answer = 42;",
        "",
      ].join("\n"),
    );

    execFileSync("git", ["add", "."], { cwd: projectPath });
    execFileSync("git", ["commit", "-m", "init"], { cwd: projectPath });
  });

  afterEach(async () => {
    clearContextCache();
    await fs.rm(projectPath, { recursive: true, force: true });
  });

  it("should preserve duplicate symbol names across disk hydration", async () => {
    const ctx1 = await getProjectContext(projectPath, {
      language: "typescript",
      maxFiles: 50,
      forceRebuild: true,
    });
    const fileInfo1 = ctx1.files.get(srcFile);
    expect(fileInfo1).toBeDefined();
    const apiErrors1 = fileInfo1!.symbols.filter((s) => s.name === "ApiError");
    expect(apiErrors1).toHaveLength(2);
    expect(apiErrors1.some((s) => s.exported)).toBe(true);

    // Simulate a new process by clearing the memory cache.
    clearContextCache();
    const ctx2 = await getProjectContext(projectPath, {
      language: "typescript",
      maxFiles: 50,
    });
    const fileInfo2 = ctx2.files.get(srcFile);
    expect(fileInfo2).toBeDefined();
    const apiErrors2 = fileInfo2!.symbols.filter((s) => s.name === "ApiError");
    expect(apiErrors2).toHaveLength(2);
    expect(apiErrors2.some((s) => s.exported)).toBe(true);
  }, 30000);

  it("should invalidate cache when content changes but mtime is preserved", async () => {
    // Initial build (and disk save)
    await getProjectContext(projectPath, {
      language: "typescript",
      maxFiles: 50,
      forceRebuild: true,
    });

    // Mutate content but preserve mtime to mimic copy-with-preserve workflows.
    const before = await fs.stat(srcFile);
    const originalMtime = before.mtime;
    const originalAtime = before.atime;

    await fs.writeFile(
      srcFile,
      [
        "class ApiError extends Error {}",
        "export { ApiError };",
        "export const answer = 42;",
        "export const addedLater = true;",
        "",
      ].join("\n"),
    );
    await fs.utimes(srcFile, originalAtime, originalMtime);

    clearContextCache();
    const ctx = await getProjectContext(projectPath, {
      language: "typescript",
      maxFiles: 50,
    });
    const fileInfo = ctx.files.get(srcFile);
    expect(fileInfo).toBeDefined();
    expect(fileInfo!.symbols.some((s) => s.name === "addedLater")).toBe(true);
  }, 30000);
});
