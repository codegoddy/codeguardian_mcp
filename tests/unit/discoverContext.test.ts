/**
 * Tests for discover_context tool
 *
 * @format
 */

import { discoverContextTool } from "../../src/tools/discoverContext.js";

describe("discover_context tool", () => {
  it("should find files by query", async () => {
    const result = await discoverContextTool.handler({
      projectPath: "src",
      query: "security scan vulnerability",
      language: "typescript",
      maxResults: 5,
    });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.success).toBe(true);
    expect(parsed.relevantFiles.length).toBeGreaterThan(0);

    // Should find security-related files
    const paths = parsed.relevantFiles.map((f: any) => f.path);
    expect(paths.some((p: string) => p.includes("security"))).toBe(true);
  });

  it("should find files by code symbols", async () => {
    const result = await discoverContextTool.handler({
      projectPath: "src",
      newCode: `
        const table = await buildSymbolTable(code, 'typescript');
        const issues = await validateReferences(newCode, table, 'typescript');
      `,
      language: "typescript",
    });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.success).toBe(true);

    // Should find symbolTable.ts and referenceValidator.ts
    const paths = parsed.relevantFiles.map((f: any) => f.path);
    expect(paths.some((p: string) => p.includes("symbolTable"))).toBe(true);
  });

  it("should return entry points when no query provided", async () => {
    const result = await discoverContextTool.handler({
      projectPath: "src",
      language: "typescript",
      maxResults: 5,
    });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.success).toBe(true);
    expect(parsed.summary.totalFilesIndexed).toBeGreaterThan(0);
  });

  it("should provide suggested read order", async () => {
    const result = await discoverContextTool.handler({
      projectPath: "src",
      query: "hallucination",
      language: "typescript",
    });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.suggestedReadOrder).toBeDefined();
    expect(Array.isArray(parsed.suggestedReadOrder)).toBe(true);
  });
});
