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

    it("should not treat module path as an imported symbol in from...import", () => {
      const code = "from app.core.config import settings";
      const root = parsePython(code);
      const imports: ASTImport[] = [];
      extractPythonImports(root, code, imports);

      expect(imports).toHaveLength(1);
      expect(imports[0].module).toBe("app.core.config");
      expect(imports[0].names).toEqual([
        { imported: "settings", local: "settings" },
      ]);
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

      // Now includes ALL type names (even builtins like int/str/bool) so that
      // imported typing-module aliases (Optional, List, etc.) are also captured
      // and prevent false "unused import" warnings.
      const names = references.map((r) => r.name);
      expect(names).toContain("int");
      expect(names).toContain("str");
      expect(names).toContain("bool");
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

    // ── typed_default_parameter ──────────────────────────────────────────────
    it("should extract types from parameters with defaults (typed_default_parameter)", () => {
      // tree-sitter-python emits `typed_default_parameter` for `x: T = val`
      const code =
        "def func(x: int = 0, y: Optional[str] = None) -> None:\n    pass";
      const root = parsePython(code);
      const references: ASTTypeReference[] = [];
      extractPythonTypeReferences(root, code, references);

      const names = references.map((r) => r.name);
      expect(names).toContain("int"); // plain typed_default_parameter
      expect(names).toContain("Optional"); // generic typed_default_parameter
      expect(names).toContain("str"); // type argument inside Optional[str]
    });

    it("should extract Optional[str] even when it is the only type hint (no false unused-import)", () => {
      // Real-world pattern: Optional imported but used only in a default-value param
      const code = [
        "from typing import Optional",
        "",
        "def get_name(prefix: Optional[str] = None) -> str:",
        "    return prefix or 'default'",
      ].join("\n");
      const root = parsePython(code);
      const references: ASTTypeReference[] = [];
      extractPythonTypeReferences(root, code, references);

      const names = references.map((r) => r.name);
      // Optional MUST be in type references so the import is not flagged as unused
      expect(names).toContain("Optional");
      expect(names).toContain("str");
    });

    // ── generic_type / type_parameter ────────────────────────────────────────
    it("should extract the outer type name from generic types like List[str]", () => {
      // tree-sitter-python WASM emits `generic_type` (not `subscript`) for List[str]
      const code = "def func(items: List[str]) -> Dict[str, int]:\n    pass";
      const root = parsePython(code);
      const references: ASTTypeReference[] = [];
      extractPythonTypeReferences(root, code, references);

      const names = references.map((r) => r.name);
      expect(names).toContain("List");
      expect(names).toContain("Dict");
      // type arguments must also be present
      expect(names).toContain("str");
      expect(names).toContain("int");
    });

    it("should extract all names from nested generics like Optional[List[Dict[str, int]]]", () => {
      const code =
        "def func(data: Optional[List[Dict[str, int]]] = None) -> None:\n    pass";
      const root = parsePython(code);
      const references: ASTTypeReference[] = [];
      extractPythonTypeReferences(root, code, references);

      const names = references.map((r) => r.name);
      expect(names).toContain("Optional");
      expect(names).toContain("List");
      expect(names).toContain("Dict");
      expect(names).toContain("str");
      expect(names).toContain("int");
    });

    it("should extract Union type arguments", () => {
      const code = "def func(val: Union[str, int]) -> None:\n    pass";
      const root = parsePython(code);
      const references: ASTTypeReference[] = [];
      extractPythonTypeReferences(root, code, references);

      const names = references.map((r) => r.name);
      expect(names).toContain("Union");
      expect(names).toContain("str");
      expect(names).toContain("int");
    });
  });

  // ── Wildcard & parenthesized imports ────────────────────────────────────────
  describe("extractPythonImports – wildcard and parenthesized", () => {
    it("should capture wildcard imports as { imported: '*', local: '*' }", () => {
      const code = "from typing import *";
      const root = parsePython(code);
      const imports: ASTImport[] = [];
      extractPythonImports(root, code, imports);

      expect(imports).toHaveLength(1);
      expect(imports[0].module).toBe("typing");
      expect(imports[0].names).toEqual([{ imported: "*", local: "*" }]);
    });

    it("should parse multi-line parenthesized from-imports correctly", () => {
      const code = [
        "from typing import (",
        "    Optional,",
        "    List,",
        "    Dict,",
        ")",
      ].join("\n");
      const root = parsePython(code);
      const imports: ASTImport[] = [];
      extractPythonImports(root, code, imports);

      expect(imports).toHaveLength(1);
      expect(imports[0].module).toBe("typing");

      const importedNames = imports[0].names.map((n) => n.imported);
      expect(importedNames).toContain("Optional");
      expect(importedNames).toContain("List");
      expect(importedNames).toContain("Dict");
    });

    it("should parse aliased imports inside parentheses", () => {
      const code = [
        "from datetime import (",
        "    datetime as dt,",
        "    timedelta,",
        ")",
      ].join("\n");
      const root = parsePython(code);
      const imports: ASTImport[] = [];
      extractPythonImports(root, code, imports);

      expect(imports).toHaveLength(1);
      const dtEntry = imports[0].names.find((n) => n.imported === "datetime");
      expect(dtEntry).toBeDefined();
      expect(dtEntry?.local).toBe("dt");

      const tdEntry = imports[0].names.find((n) => n.imported === "timedelta");
      expect(tdEntry).toBeDefined();
      expect(tdEntry?.local).toBe("timedelta");
    });

    it("should mark typing imports as external", () => {
      const code = "from typing import Optional, List";
      const root = parsePython(code);
      const imports: ASTImport[] = [];
      extractPythonImports(root, code, imports);

      expect(imports[0].isExternal).toBe(true);
    });

    it("should NOT flag Optional as an unused import when used only in a type hint", () => {
      // Integration-style check: the type references for Optional must be non-empty
      // so that the validation pipeline puts it in `usedNames` and skips the warning.
      const code = [
        "from typing import Optional",
        "",
        "async def fetch_user(user_id: Optional[int] = None) -> Optional[str]:",
        "    return None",
      ].join("\n");

      const root = parsePython(code);

      const imports: ASTImport[] = [];
      extractPythonImports(root, code, imports);
      expect(imports[0].names.map((n) => n.local)).toContain("Optional");

      const references: ASTTypeReference[] = [];
      extractPythonTypeReferences(root, code, references);
      const refNames = references.map((r) => r.name);

      // Optional appears in BOTH a typed_default_parameter AND a return type
      expect(refNames).toContain("Optional");
      // The import local name matches a type reference → should NOT be flagged unused
      const importedLocals = new Set(
        imports.flatMap((i) => i.names.map((n) => n.local)),
      );
      const typeRefNames = new Set(refNames);
      for (const local of importedLocals) {
        if (local === "*") continue;
        // Every imported typing symbol should appear in type references
        if (
          ["Optional", "List", "Dict", "Union", "Tuple", "Any"].includes(local)
        ) {
          expect(typeRefNames.has(local)).toBe(true);
        }
      }
    });
  });
});
