/**
 * Unit tests for JavaScript/TypeScript extractor module
 *
 * @format
 */

import {
  extractJSSymbols,
  extractJSUsages,
  extractJSImports,
  extractJSTypeReferences,
  extractJSParams,
  extractDestructuredNames,
  extractTypeNamesFromNode,
} from "../../../src/tools/validation/extractors/javascript.js";
import { getParser } from "../../../src/tools/validation/parser.js";
import type {
  ASTSymbol,
  ASTUsage,
  ASTImport,
  ASTTypeReference,
} from "../../../src/tools/validation/types.js";

describe("JavaScript Extractor", () => {
  describe("extractJSSymbols", () => {
    it("should extract function declarations", () => {
      const code = "function hello(name) { return 'Hello ' + name; }";
      const parser = getParser("javascript");
      const tree = parser.parse(code);
      const symbols: ASTSymbol[] = [];

      extractJSSymbols(tree.rootNode, code, "test.js", symbols, null);

      // Should have function symbol + parameter symbol(s)
      expect(symbols.length).toBeGreaterThanOrEqual(1);
      const funcSymbol = symbols.find((s) => s.name === "hello");
      expect(funcSymbol).toBeDefined();
      expect(funcSymbol?.type).toBe("function");
      expect(funcSymbol?.params).toEqual(["name"]);
      expect(funcSymbol?.paramCount).toBe(1);
      // Parameter 'name' is also extracted as a local variable symbol
      const paramSymbol = symbols.find((s) => s.name === "name" && s.type === "variable");
      expect(paramSymbol).toBeDefined();
    });

    it("should extract arrow functions", () => {
      const code = "const greet = (name) => 'Hello ' + name;";
      const parser = getParser("javascript");
      const tree = parser.parse(code);
      const symbols: ASTSymbol[] = [];

      extractJSSymbols(tree.rootNode, code, "test.js", symbols, null);

      // Should have function symbol + parameter symbol(s)
      expect(symbols.length).toBeGreaterThanOrEqual(1);
      const funcSymbol = symbols.find((s) => s.name === "greet");
      expect(funcSymbol).toBeDefined();
      expect(funcSymbol?.type).toBe("function");
      expect(funcSymbol?.params).toEqual(["name"]);
      // Parameter 'name' is also extracted as a local variable symbol
      const paramSymbol = symbols.find((s) => s.name === "name" && s.type === "variable");
      expect(paramSymbol).toBeDefined();
    });

    it("should extract class declarations", () => {
      const code = "class MyClass { method() {} }";
      const parser = getParser("javascript");
      const tree = parser.parse(code);
      const symbols: ASTSymbol[] = [];

      extractJSSymbols(tree.rootNode, code, "test.js", symbols, null);

      expect(symbols.length).toBeGreaterThanOrEqual(1);
      const classSymbol = symbols.find((s) => s.name === "MyClass");
      expect(classSymbol).toBeDefined();
      expect(classSymbol?.type).toBe("class");
    });

    it("should extract TypeScript interfaces", () => {
      const code = "interface User { name: string; }";
      const parser = getParser("typescript");
      const tree = parser.parse(code);
      const symbols: ASTSymbol[] = [];

      extractJSSymbols(tree.rootNode, code, "test.ts", symbols, null);

      expect(symbols).toHaveLength(1);
      expect(symbols[0].name).toBe("User");
      expect(symbols[0].type).toBe("interface");
    });

    it("should extract TypeScript type aliases", () => {
      const code = "type UserId = string;";
      const parser = getParser("typescript");
      const tree = parser.parse(code);
      const symbols: ASTSymbol[] = [];

      extractJSSymbols(tree.rootNode, code, "test.ts", symbols, null);

      expect(symbols).toHaveLength(1);
      expect(symbols[0].name).toBe("UserId");
      expect(symbols[0].type).toBe("type");
    });

    it("should handle destructuring in variable declarations", () => {
      const code = "const { a, b } = obj;";
      const parser = getParser("javascript");
      const tree = parser.parse(code);
      const symbols: ASTSymbol[] = [];

      extractJSSymbols(tree.rootNode, code, "test.js", symbols, null);

      expect(symbols.length).toBeGreaterThanOrEqual(2);
      expect(symbols.some((s) => s.name === "a")).toBe(true);
      expect(symbols.some((s) => s.name === "b")).toBe(true);
    });
  });

  describe("extractJSUsages", () => {
    it("should extract function calls", () => {
      const code = "hello('world');";
      const parser = getParser("javascript");
      const tree = parser.parse(code);
      const usages: ASTUsage[] = [];
      const externalSymbols = new Set<string>();

      extractJSUsages(tree.rootNode, code, usages, externalSymbols);

      expect(usages).toHaveLength(1);
      expect(usages[0].name).toBe("hello");
      expect(usages[0].type).toBe("call");
      expect(usages[0].argCount).toBe(1);
    });

    it("should extract method calls", () => {
      const code = "obj.method('arg');";
      const parser = getParser("javascript");
      const tree = parser.parse(code);
      const usages: ASTUsage[] = [];
      const externalSymbols = new Set<string>();

      extractJSUsages(tree.rootNode, code, usages, externalSymbols);

      expect(usages).toHaveLength(1);
      expect(usages[0].name).toBe("method");
      expect(usages[0].type).toBe("methodCall");
      expect(usages[0].object).toBe("obj");
    });

    it("should extract instantiations", () => {
      const code = "const instance = new MyClass();";
      const parser = getParser("javascript");
      const tree = parser.parse(code);
      const usages: ASTUsage[] = [];
      const externalSymbols = new Set<string>();

      extractJSUsages(tree.rootNode, code, usages, externalSymbols);

      expect(usages).toHaveLength(1);
      expect(usages[0].name).toBe("MyClass");
      expect(usages[0].type).toBe("instantiation");
    });

    it("should skip built-in functions", () => {
      const code = "console.log('test');";
      const parser = getParser("javascript");
      const tree = parser.parse(code);
      const usages: ASTUsage[] = [];
      const externalSymbols = new Set<string>();

      extractJSUsages(tree.rootNode, code, usages, externalSymbols);

      expect(usages).toHaveLength(0);
    });
  });

  describe("extractJSImports", () => {
    it("should extract ES6 named imports", () => {
      const code = "import { foo, bar } from 'module';";
      const parser = getParser("javascript");
      const tree = parser.parse(code);
      const imports: ASTImport[] = [];

      extractJSImports(tree.rootNode, code, imports);

      expect(imports).toHaveLength(1);
      expect(imports[0].module).toBe("module");
      expect(imports[0].names).toHaveLength(2);
      expect(imports[0].names[0]).toEqual({ imported: "foo", local: "foo" });
      expect(imports[0].names[1]).toEqual({ imported: "bar", local: "bar" });
      expect(imports[0].isExternal).toBe(true);
    });

    it("should extract default imports", () => {
      const code = "import React from 'react';";
      const parser = getParser("javascript");
      const tree = parser.parse(code);
      const imports: ASTImport[] = [];

      extractJSImports(tree.rootNode, code, imports);

      expect(imports).toHaveLength(1);
      expect(imports[0].module).toBe("react");
      expect(imports[0].names).toHaveLength(1);
      expect(imports[0].names[0]).toEqual({
        imported: "default",
        local: "React",
      });
    });

    it("should extract namespace imports", () => {
      const code = "import * as utils from 'utils';";
      const parser = getParser("javascript");
      const tree = parser.parse(code);
      const imports: ASTImport[] = [];

      extractJSImports(tree.rootNode, code, imports);

      expect(imports).toHaveLength(1);
      expect(imports[0].module).toBe("utils");
      expect(imports[0].names).toHaveLength(1);
      expect(imports[0].names[0]).toEqual({ imported: "*", local: "utils" });
    });

    it("should detect relative imports as internal", () => {
      const code = "import { foo } from './local';";
      const parser = getParser("javascript");
      const tree = parser.parse(code);
      const imports: ASTImport[] = [];

      extractJSImports(tree.rootNode, code, imports);

      expect(imports).toHaveLength(1);
      expect(imports[0].isExternal).toBe(false);
    });
  });

  describe("extractJSTypeReferences", () => {
    it("should extract type annotations", () => {
      const code = "function greet(name: string): void {}";
      const parser = getParser("typescript");
      const tree = parser.parse(code);
      const references: ASTTypeReference[] = [];

      extractJSTypeReferences(tree.rootNode, code, references);

      // Should find 'string' in parameter and 'void' in return type
      // Note: built-in types like 'string' and 'void' are filtered out
      expect(references).toHaveLength(0);
    });

    it("should extract custom type references", () => {
      const code = "function process(user: User): Result {}";
      const parser = getParser("typescript");
      const tree = parser.parse(code);
      const references: ASTTypeReference[] = [];

      extractJSTypeReferences(tree.rootNode, code, references);

      expect(references.length).toBeGreaterThanOrEqual(2);
      expect(references.some((r) => r.name === "User")).toBe(true);
      expect(references.some((r) => r.name === "Result")).toBe(true);
    });

    it("should extract generic type parameters", () => {
      const code = "const arr: Array<MyType> = [];";
      const parser = getParser("typescript");
      const tree = parser.parse(code);
      const references: ASTTypeReference[] = [];

      extractJSTypeReferences(tree.rootNode, code, references);

      expect(references.some((r) => r.name === "MyType")).toBe(true);
    });

    it("should extract extends clause types", () => {
      const code = "interface Child extends Parent {}";
      const parser = getParser("typescript");
      const tree = parser.parse(code);
      const references: ASTTypeReference[] = [];

      extractJSTypeReferences(tree.rootNode, code, references);

      expect(references.some((r) => r.name === "Parent")).toBe(true);
      expect(
        references.some((r) => r.context === "extends" && r.name === "Parent"),
      ).toBe(true);
    });
  });

  describe("extractJSParams", () => {
    it("should extract simple parameters", () => {
      const code = "function test(a, b, c) {}";
      const parser = getParser("javascript");
      const tree = parser.parse(code);
      const funcNode = tree.rootNode.children[0];
      const paramsNode = funcNode?.childForFieldName("parameters");

      const params = extractJSParams(paramsNode, code);

      expect(params).toEqual(["a", "b", "c"]);
    });

    it("should handle empty parameter list", () => {
      const code = "function test() {}";
      const parser = getParser("javascript");
      const tree = parser.parse(code);
      const funcNode = tree.rootNode.children[0];
      const paramsNode = funcNode?.childForFieldName("parameters");

      const params = extractJSParams(paramsNode, code);

      expect(params).toEqual([]);
    });
  });

  describe("extractDestructuredNames", () => {
    it("should extract object destructuring names", () => {
      const code = "const { a, b } = obj;";
      const parser = getParser("javascript");
      const tree = parser.parse(code);
      const symbols: ASTSymbol[] = [];

      // Find the object_pattern node
      const varDecl = tree.rootNode.children[0];
      const declarator = varDecl?.children.find(
        (c) => c.type === "variable_declarator",
      );
      const pattern = declarator?.childForFieldName("name");

      if (pattern && pattern.type === "object_pattern") {
        extractDestructuredNames(pattern, code, "test.js", symbols, 1);
      }

      expect(symbols.length).toBeGreaterThanOrEqual(2);
      expect(symbols.some((s) => s.name === "a")).toBe(true);
      expect(symbols.some((s) => s.name === "b")).toBe(true);
    });

    it("should extract array destructuring names", () => {
      const code = "const [x, y] = arr;";
      const parser = getParser("javascript");
      const tree = parser.parse(code);
      const symbols: ASTSymbol[] = [];

      // Find the array_pattern node
      const varDecl = tree.rootNode.children[0];
      const declarator = varDecl?.children.find(
        (c) => c.type === "variable_declarator",
      );
      const pattern = declarator?.childForFieldName("name");

      if (pattern && pattern.type === "array_pattern") {
        extractDestructuredNames(pattern, code, "test.js", symbols, 1);
      }

      expect(symbols.length).toBeGreaterThanOrEqual(2);
      expect(symbols.some((s) => s.name === "x")).toBe(true);
      expect(symbols.some((s) => s.name === "y")).toBe(true);
    });
  });
});
