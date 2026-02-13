/**
 * Tough Tests for Unified Validate Code Tool (Deterministic)
 *
 * This suite intentionally avoids scanning the repository itself and avoids
 * live network calls by using a temporary fixture project + mocked registry.
 *
 * @format
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";

vi.mock("../../src/tools/validation/registry.js", () => ({
  checkPackageRegistry: vi.fn(),
}));

let validateCodeTool: typeof import("../../src/tools/validateCode.js").validateCodeTool;
let mockCheckPackageRegistry: Mock;

describe("Validate Code - Tough Tests (Deterministic)", () => {
  let projectPath: string;

  beforeAll(async () => {
    ({ validateCodeTool } = await import("../../src/tools/validateCode.js"));
    ({ checkPackageRegistry: mockCheckPackageRegistry } =
      (await import("../../src/tools/validation/registry.js")) as any);

    projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "codeguardian-validate-"));

    await fs.mkdir(path.join(projectPath, "src", "context"), { recursive: true });
    await fs.mkdir(path.join(projectPath, "src", "utils"), { recursive: true });

    await fs.writeFile(
      path.join(projectPath, "package.json"),
      JSON.stringify(
        {
          name: "codeguardian-validate-fixture",
          version: "1.0.0",
          type: "module",
          dependencies: {
            glob: "1.0.0",
            "tree-sitter": "1.0.0",
            "@modelcontextprotocol/sdk": "1.0.0",
          },
        },
        null,
        2,
      ),
    );

    await fs.writeFile(
      path.join(projectPath, "src", "context", "projectContext.ts"),
      [
        "export async function getProjectContext(projectPath: string, _opts: unknown) {",
        "  return { projectPath };",
        "}",
        "",
      ].join("\n"),
    );

    await fs.writeFile(
      path.join(projectPath, "src", "utils", "logger.ts"),
      [
        "export const logger = {",
        "  info: (..._args: any[]) => {},",
        "  debug: (..._args: any[]) => {},",
        "  error: (..._args: any[]) => {},",
        "};",
        "",
      ].join("\n"),
    );

    await fs.writeFile(
      path.join(projectPath, "src", "validateCodeAST.ts"),
      [
        "export function extractSymbolsAST(_code: string, _file: string, _lang: string) {",
        "  return [];",
        "}",
        "export function extractUsagesAST(_code: string, _lang: string, _ignore: string[]) {",
        "  return [];",
        "}",
        "",
      ].join("\n"),
    );

    await fs.writeFile(
      path.join(projectPath, "src", "index.ts"),
      [
        "export { getProjectContext } from './context/projectContext.js';",
        "export { logger } from './utils/logger.js';",
        "export { extractSymbolsAST, extractUsagesAST } from './validateCodeAST.js';",
        "",
      ].join("\n"),
    );
  });

  afterAll(async () => {
    if (projectPath) {
      await fs.rm(projectPath, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("flags uninstalled but real packages as missingDependency (low)", async () => {
    mockCheckPackageRegistry.mockResolvedValue(true);

    const newCode = [
      "import { useQuery } from '@tanstack/react-query';",
      "import { motion } from 'framer-motion';",
      "const data = useQuery({ queryKey: ['test'] });",
      "motion.div;",
    ].join("\n");

    const result = await validateCodeTool.handler({
      projectPath,
      newCode,
      language: "typescript",
    });

    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.hallucinationDetected).toBe(true);

    const depIssues = parsed.hallucinations.filter(
      (h: any) => h.type === "missingDependency",
    );

    expect(depIssues.some((i: any) => i.message.includes("@tanstack/react-query"))).toBe(true);
    expect(depIssues.some((i: any) => i.message.includes("framer-motion"))).toBe(true);
  });

  it("flags non-existent packages as dependencyHallucination (critical)", async () => {
    mockCheckPackageRegistry.mockResolvedValue(false);

    const newCode = "import { x } from 'definitely-not-a-real-package-xyz';\nconsole.log(x);";

    const result = await validateCodeTool.handler({
      projectPath,
      newCode,
      language: "typescript",
    });

    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.hallucinationDetected).toBe(true);

    const depIssues = parsed.hallucinations.filter(
      (h: any) => h.type === "dependencyHallucination",
    );

    expect(depIssues.length).toBeGreaterThan(0);
    expect(depIssues[0].message).toContain("definitely-not-a-real-package-xyz");
  });

  it("does NOT flag packages that ARE in package.json", async () => {
    const newCode = [
      "import { glob } from 'glob';",
      "import Parser from 'tree-sitter';",
      "const files = await glob('**/*.ts');",
      "const parser = new Parser();",
      "console.log(files.length, parser);",
    ].join("\n");

    const result = await validateCodeTool.handler({
      projectPath,
      newCode,
      language: "typescript",
    });

    const parsed = JSON.parse(result.content[0].text);

    const depIssues = parsed.hallucinations.filter(
      (h: any) => h.type === "missingDependency" || h.type === "dependencyHallucination",
    );

    expect(depIssues.length).toBe(0);
    expect(mockCheckPackageRegistry).not.toHaveBeenCalled();
  });

  it("does not flag functions that exist in the project fixture, but flags typos with suggestions", async () => {
    const newCode = [
      "import { getProjectContext } from './src/context/projectContext.js';",
      "const ok = await getProjectContext('.', {});",
      "const typo = await getProjectContxt('.', {});",
      "console.log(ok, typo);",
    ].join("\n");

    const result = await validateCodeTool.handler({
      projectPath,
      newCode,
      language: "typescript",
    });

    const parsed = JSON.parse(result.content[0].text);

    const funcIssues = parsed.hallucinations.filter(
      (h: any) => h.type === "nonExistentFunction",
    );

    expect(funcIssues.some((i: any) => i.message.includes("getProjectContext"))).toBe(false);

    const typoIssue = funcIssues.find((i: any) => i.message.includes("getProjectContxt"));
    expect(typoIssue).toBeDefined();
    expect(String(typoIssue.suggestion || "")).toContain("getProjectContext");
  });

  it("catches hallucinated calls but does not flag locally defined symbols", async () => {
    const newCode = [
      "function helper(x: number) { return x * 2; }",
      "const y = helper(2);",
      "const z = notARealFunction();",
      "console.log(y, z);",
    ].join("\n");

    const result = await validateCodeTool.handler({
      projectPath,
      newCode,
      language: "typescript",
    });

    const parsed = JSON.parse(result.content[0].text);

    const funcIssues = parsed.hallucinations.filter(
      (h: any) => h.type === "nonExistentFunction",
    );

    expect(funcIssues.some((i: any) => i.message.includes("helper"))).toBe(false);
    expect(funcIssues.some((i: any) => i.message.includes("notARealFunction"))).toBe(true);
  });
});
