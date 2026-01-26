/** @format */

import { describe, it, expect } from "@jest/globals";
import { extractSymbolsAST } from "../../../src/tools/validation/extractors/index.js";

describe("Rest Parameter Extraction", () => {
  it("should extract rest parameter as a symbol", () => {
    const code = `function cn(...inputs) { return inputs; }`;

    const symbols = extractSymbolsAST(code, "test.ts", "typescript");

    console.log(
      "All symbols:",
      symbols.map((s) => ({ name: s.name, type: s.type })),
    );

    const inputsSymbol = symbols.find((s) => s.name === "inputs");
    expect(inputsSymbol).toBeDefined();
    expect(inputsSymbol?.type).toBe("variable");
  });

  it("should extract typed rest parameter", () => {
    const code = `function cn(...inputs: string[]) { return inputs; }`;

    const symbols = extractSymbolsAST(code, "test.ts", "typescript");

    console.log(
      "All symbols:",
      symbols.map((s) => ({ name: s.name, type: s.type })),
    );

    const inputsSymbol = symbols.find((s) => s.name === "inputs");
    expect(inputsSymbol).toBeDefined();
  });
});
