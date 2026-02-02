import { getParser } from "../../src/tools/validation/parser.js";
import { extractJSParams, extractJSSymbols } from "../../src/tools/validation/extractors/javascript.js";
import type { ASTSymbol } from "../../src/tools/validation/types.js";

describe("Debug Parameters", () => {
  it("should show parameter AST structure", () => {
    const code = `
export function useTimeTracker({
  autoConnect = true,
  autoDisconnect = true,
  initialViewMode = 'day'
}: UseTimeTrackerOptions) {
  return null;
}
    `;

    const parser = getParser("typescript");
    const tree = parser.parse(code);

    function printTree(node: any, indent = 0) {
      if (!node) return;
      const text = code
        .slice(node.startIndex ?? 0, node.endIndex ?? 0)
        .replace(/\n/g, "\\n")
        .slice(0, 60);
      console.log(" ".repeat(indent) + `${node.type}: "${text}"`);
      for (const child of node.children ?? []) {
        if (child) printTree(child, indent + 2);
      }
    }

    console.log("=== AST Structure ===");
    printTree(tree.rootNode);

    const symbols: ASTSymbol[] = [];
    extractJSSymbols(tree.rootNode as any, code, "test.ts", symbols, null, {
      includeParameterSymbols: true,
    });

    console.log("\n=== Extracted Symbols ===");
    console.log(symbols.map(s => s.name));
  });
});
