import { getParser } from "../../src/tools/validation/parser.js";
import { extractJSParams } from "../../src/tools/validation/extractors/javascript.js";
import type { ASTSymbol } from "../../src/tools/validation/types.js";

describe("Debug extractJSParams", () => {
  it("should extract destructured parameters", () => {
    const code = `function test({
  autoConnect = true,
  autoDisconnect = true,
  initialViewMode = 'day'
}) { return null; }`;

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

    // Get formal_parameters
    const funcDecl = tree.rootNode.children[0];
    const formalParams = funcDecl?.children.find((c: any) => c.type === "formal_parameters");
    console.log("\nFound formal_parameters:", formalParams?.type);

    const symbols: ASTSymbol[] = [];
    const params = extractJSParams(formalParams, code, "test.ts", symbols, {
      includeParameterSymbols: true,
    });

    console.log("\n=== Extracted Params ===");
    console.log("Params:", params);
    console.log("Symbols:", symbols.map(s => s.name));
  });
});
