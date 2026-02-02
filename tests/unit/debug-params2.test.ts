import { getParser } from "../../src/tools/validation/parser.js";
import { extractDestructuredNames } from "../../src/tools/validation/extractors/javascript.js";
import type { ASTSymbol } from "../../src/tools/validation/types.js";

describe("Debug extractDestructuredNames", () => {
  it("should show object_pattern structure", () => {
    const code = `{
  autoConnect = true,
  autoDisconnect = true,
  initialViewMode = 'day'
}`;

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

    const objectPattern = tree.rootNode.children[0];
    console.log("\nObject pattern type:", objectPattern?.type);

    const symbols: ASTSymbol[] = [];
    extractDestructuredNames(
      objectPattern,
      code,
      "test.ts",
      symbols,
      1
    );

    console.log("\n=== Extracted Symbols ===");
    console.log(symbols.map(s => s.name));
  });
});
