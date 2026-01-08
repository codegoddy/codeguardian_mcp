/**
 * Tests for validate_code tool - THE hallucination detector
 *
 * @format
 */

import { validateCodeTool } from "../../src/tools/validateCode.js";

describe("validate_code tool", () => {
  it("should catch non-existent function calls", async () => {
    const result = await validateCodeTool.handler({
      projectPath: "src",
      newCode: `
        // This function doesn't exist in the codebase
        const result = await fakeNonExistentFunction(123);
      `,
      language: "typescript",
    });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.success).toBe(true);
    expect(parsed.hallucinationDetected).toBe(true);
    expect(parsed.issues.length).toBeGreaterThan(0);
    expect(parsed.issues[0].type).toBe("nonExistentFunction");
  });

  it("should NOT flag valid function calls", async () => {
    const result = await validateCodeTool.handler({
      projectPath: "src",
      newCode: `
        // Built-ins should not be flagged
        console.log('test');
        const data = JSON.stringify({ x: 1 });
        const arr = [1,2,3].map(x => x * 2);
      `,
      language: "typescript",
    });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.success).toBe(true);
    expect(parsed.score).toBe(100);
    expect(parsed.issues.length).toBe(0);
  });

  it("should catch non-existent class instantiation", async () => {
    const result = await validateCodeTool.handler({
      projectPath: "src",
      newCode: `
        const validator = new FakeClassThatDoesNotExist();
      `,
      language: "typescript",
    });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.hallucinationDetected).toBe(true);
    expect(parsed.issues.some((i: any) => i.type === "nonExistentClass")).toBe(
      true
    );
  });

  it("should provide helpful suggestions", async () => {
    const result = await validateCodeTool.handler({
      projectPath: "src",
      newCode: `
        // Typo in function name
        const table = await buildSymbolTabl(code, 'ts');
      `,
      language: "typescript",
    });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.issues.length).toBeGreaterThan(0);
    // Should suggest the correct function name
    expect(parsed.issues[0].suggestion).toContain("buildSymbolTable");
  });

  it("should return proper stats", async () => {
    const result = await validateCodeTool.handler({
      projectPath: "src",
      newCode: `const x = 1;`,
      language: "typescript",
    });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.stats).toBeDefined();
    expect(parsed.stats.filesScanned).toBeGreaterThan(0);
    expect(parsed.stats.symbolsInProject).toBeGreaterThan(0);
    expect(parsed.stats.analysisTime).toMatch(/\d+ms/);
  });
});
