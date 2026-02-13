/**
 * Unit tests for Python extractor module
 * Tests symbol, usage, import, and type reference extraction from Python code
 *
 * @format
 */

import { describe, it, expect } from "vitest";
import type ParserT from "tree-sitter";
import { getParser } from "../../../src/tools/validation/parser.js";
import {
  extractPythonSymbols,
  extractPythonUsages,
  extractPythonImports,
  extractPythonTypeReferences,
  extractPythonParams,
} from "../../../src/tools/validation/extractors/python.js";
import type {
  ASTSymbol,
  ASTUsage,
  ASTImport,
  ASTTypeReference,
} from "../../../src/tools/validation/types.js";

// Helper to parse Python code
function parsePython(code: string): ParserT.SyntaxNode {
  const tree = getParser("python").parse(code);
  return tree.rootNode;
}

describe("Python Extractor", () => {
  describe("extractPythonSymbols", () => {
    it("should extract function definitions", () => {
      const code = "def hello():\n    pass";
      const root = parsePython(code);
      const symbols: ASTSymbol[] = [];
      extractPythonSymbols(root, code, "test.py", symbols, null);

      expect(symbols).toHaveLength(1);
      expect(symbols[0].name).toBe("hello");
      expect(symbols[0].type).toBe("function");
      expect(symbols[0].paramCount).toBe(0);
    });

    it("should extract class definitions", () => {
      const code = "class MyClass:\n    pass";
      const root = parsePython(code);
      const symbols: ASTSymbol[] = [];
      extractPythonSymbols(root, code, "test.py", symbols, null);

      expect(symbols).toHaveLength(1);
      expect(symbols[0].name).toBe("MyClass");
      expect(symbols[0].type).toBe("class");
    });

    it("should extract method definitions with class context", () => {
      const code = "class MyClass:\n    def method(self, x):\n        pass";
      const root = parsePython(code);
      const symbols: ASTSymbol[] = [];
      extractPythonSymbols(root, code, "test.py", symbols, null);

      expect(symbols).toHaveLength(2);
      expect(symbols[0].name).toBe("MyClass");
      expect(symbols[0].type).toBe("class");
      expect(symbols[1].name).toBe("method");
      expect(symbols[1].type).toBe("method");
      expect(symbols[1].scope).toBe("MyClass");
      expect(symbols[1].paramCount).toBe(1); // self is excluded
    });

    it("should detect async functions", () => {
      const code = "async def async_func():\n    pass";
      const root = parsePython(code);
      const symbols: ASTSymbol[] = [];
      extractPythonSymbols(root, code, "test.py", symbols, null);

      expect(symbols).toHaveLength(1);
      expect(symbols[0].isAsync).toBe(true);
    });
  });

  describe("extractPythonParams", () => {
    it("should extract function parameters excluding self and cls", () => {
      const code = "def method(self, x, y):\n    pass";
      const root = parsePython(code);
      const funcNode = root.descendantsOfType("function_definition")[0];
      const paramsNode = funcNode?.childForFieldName("parameters");

      const params = extractPythonParams(paramsNode, code);
      expect(params).toEqual(["x", "y"]);
    });
  });

  describe("extractPythonUsages", () => {
    it("should extract function calls", () => {
      const code = "result = my_func(1, 2)";
      const root = parsePython(code);
      const usages: ASTUsage[] = [];
      extractPythonUsages(root, code, usages, new Set());

      expect(usages).toHaveLength(1);
      expect(usages[0].name).toBe("my_func");
      expect(usages[0].type).toBe("call");
      expect(usages[0].argCount).toBe(2);
    });

    it("should extract method calls", () => {
      const code = "obj.method(1)";
      const root = parsePython(code);
      const usages: ASTUsage[] = [];
      extractPythonUsages(root, code, usages, new Set());

      expect(usages).toHaveLength(1);
      expect(usages[0].name).toBe("method");
      expect(usages[0].type).toBe("methodCall");
      expect(usages[0].object).toBe("obj");
    });

    it("should skip built-in functions", () => {
      const code = "result = print('hello')";
      const root = parsePython(code);
      const usages: ASTUsage[] = [];
      extractPythonUsages(root, code, usages, new Set());

      expect(usages).toHaveLength(0);
    });

    it("should include imported symbols as usages (for unused import tracking)", () => {
      const code = "result = imported_func()";
      const root = parsePython(code);
      const usages: ASTUsage[] = [];
      const importedSymbols = new Set(["imported_func"]);
      extractPythonUsages(root, code, usages, importedSymbols);

      expect(usages).toHaveLength(1);
      expect(usages[0].type).toBe("call");
      expect(usages[0].name).toBe("imported_func");
    });
  });

  describe("extractPythonImports", () => {
    it("should extract simple import statements", () => {
      const code = "import os";
      const root = parsePython(code);
      const imports: ASTImport[] = [];
      extractPythonImports(root, code, imports);

      expect(imports).toHaveLength(1);
      expect(imports[0].module).toBe("os");
      expect(imports[0].isExternal).toBe(true);
      expect(imports[0].names).toEqual([{ imported: "os", local: "os" }]);
    });

    it("should extract from...import statements", () => {
      const code = "from os import path";
      const root = parsePython(code);
      const imports: ASTImport[] = [];
      extractPythonImports(root, code, imports);

      expect(imports).toHaveLength(1);
      expect(imports[0].module).toBe("os");
      expect(imports[0].names).toEqual([{ imported: "path", local: "path" }]);
    });

    it("should detect relative imports as internal", () => {
      const code = "from . import module";
      const root = parsePython(code);
      const imports: ASTImport[] = [];
      extractPythonImports(root, code, imports);

      expect(imports).toHaveLength(1);
      expect(imports[0].isExternal).toBe(false);
    });

    it("should detect project imports as internal", () => {
      const code = "from app.models import User";
      const root = parsePython(code);
      const imports: ASTImport[] = [];
      extractPythonImports(root, code, imports);

      expect(imports).toHaveLength(1);
      expect(imports[0].isExternal).toBe(false);
    });
  });

  describe("extractPythonTypeReferences", () => {
    it("should extract type annotations from function parameters", () => {
      const code = "def func(x: int, y: str) -> bool:\n    pass";
      const root = parsePython(code);
      const references: ASTTypeReference[] = [];
      extractPythonTypeReferences(root, code, references);

      // Should not include built-in types like int, str, bool
      expect(references).toHaveLength(0);
    });

    it("should extract custom type annotations", () => {
      const code = "def func(user: User) -> Response:\n    pass";
      const root = parsePython(code);
      const references: ASTTypeReference[] = [];
      extractPythonTypeReferences(root, code, references);

      expect(references.length).toBeGreaterThanOrEqual(2);
      const names = references.map((r) => r.name);
      expect(names).toContain("User");
      expect(names).toContain("Response");
    });

    it("should extract class inheritance", () => {
      const code = "class Child(Parent):\n    pass";
      const root = parsePython(code);
      const references: ASTTypeReference[] = [];
      extractPythonTypeReferences(root, code, references);

      expect(references).toHaveLength(1);
      expect(references[0].name).toBe("Parent");
      expect(references[0].context).toBe("extends");
    });
  });
});
