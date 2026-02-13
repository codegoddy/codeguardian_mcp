/**
 * @format
 */

import { describe, it, expect } from "vitest";
import { checkTypeConsistency } from "../../src/analyzers/typeChecker.js";
import type { SymbolTable } from "../../src/types/tools.js";

describe("TypeChecker - AST-based TypeScript checks", () => {
  const baseSymbolTable: SymbolTable = {
    functions: [],
    classes: [],
    interfaces: [],
    variables: ["foo"],
    imports: [],
  };

  it("flags 'any' usage in type positions", async () => {
    const code = `
type X = any;
`;
    const issues = await checkTypeConsistency(code, baseSymbolTable, "typescript");
    expect(issues.some((i) => i.type === "typeMismatch")).toBe(true);
  });

  it("flags missing explicit return types on named functions", async () => {
    const code = `
export function fooFn(x: number) {
  return x + 1;
}
`;
    const issues = await checkTypeConsistency(code, baseSymbolTable, "typescript");
    expect(issues.some((i) => i.type === "missingReturnType")).toBe(true);
  });

  it("flags implicit-any parameters on named functions", async () => {
    const code = `
function bar(x) {
  return x;
}
`;
    const issues = await checkTypeConsistency(code, baseSymbolTable, "typescript");
    expect(issues.some((i) => i.type === "implicitAny")).toBe(true);
  });

  it("flags non-existent type references", async () => {
    const code = `
export function makeThing(x: MissingType): void {
  console.log(x);
}
`;
    const issues = await checkTypeConsistency(code, baseSymbolTable, "typescript");
    const nonExistent = issues.find((i) => i.type === "nonExistentType");
    expect(nonExistent).toBeTruthy();
    expect(nonExistent?.message).toContain("MissingType");
  });

  it("flags non-existent property accesses for simple identifier objects present in symbolTable", async () => {
    const code = `
foo.notARealProperty;
`;
    const issues = await checkTypeConsistency(code, baseSymbolTable, "typescript");
    const propIssue = issues.find((i) => i.type === "nonExistentProperty");
    expect(propIssue).toBeTruthy();
    expect(propIssue?.message).toContain("notARealProperty");
  });
});

