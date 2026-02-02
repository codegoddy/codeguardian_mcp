/**
 * Unit tests for validation logic module
 *
 * Tests the core validation functions:
 * - validateManifest
 * - validateSymbols
 * - buildSymbolTable
 * - calculateConfidence
 *
 * @format
 */

import { describe, it, expect } from "@jest/globals";
import {
  validateManifest,
  validateSymbols,
  buildSymbolTable,
  calculateConfidence,
} from "../../../src/tools/validation/validation.js";
import type {
  ASTImport,
  ManifestDependencies,
  ASTUsage,
  ProjectSymbol,
} from "../../../src/tools/validation/types.js";
import type { ProjectContext } from "../../../src/context/projectContext.js";

describe("Validation Module", () => {
  describe("validateManifest", () => {
    it("should detect missing dependencies", async () => {
      const imports: ASTImport[] = [
        {
          module: "express",
          names: [{ imported: "express", local: "express" }],
          isExternal: true,
          line: 1,
        },
      ];

      const manifest: ManifestDependencies = {
        dependencies: new Set(),
        devDependencies: new Set(),
        all: new Set(),
      };

      const newCode = 'import express from "express";';

      const issues = await validateManifest(imports, manifest, newCode);

      expect(issues).toHaveLength(1);
      expect(issues[0].type).toBe("missingDependency");
      expect(issues[0].severity).toBe("low");
      expect(issues[0].message).toContain("express");
    });

    it("should not flag dependencies that exist in manifest", async () => {
      const imports: ASTImport[] = [
        {
          module: "express",
          names: [{ imported: "express", local: "express" }],
          isExternal: true,
          line: 1,
        },
      ];

      const manifest: ManifestDependencies = {
        dependencies: new Set(["express"]),
        devDependencies: new Set(),
        all: new Set(["express"]),
      };

      const newCode = 'import express from "express";';

      const issues = await validateManifest(imports, manifest, newCode);

      expect(issues).toHaveLength(0);
    });

    it("should skip internal imports", async () => {
      const imports: ASTImport[] = [
        {
          module: "./utils",
          names: [{ imported: "helper", local: "helper" }],
          isExternal: false,
          line: 1,
        },
      ];

      const manifest: ManifestDependencies = {
        dependencies: new Set(),
        devDependencies: new Set(),
        all: new Set(),
      };

      const newCode = 'import { helper } from "./utils";';

      const issues = await validateManifest(imports, manifest, newCode);

      expect(issues).toHaveLength(0);
    });
  });

  describe("buildSymbolTable", () => {
    it("should build symbol table from project context", () => {
      const context: ProjectContext = {
        projectPath: "/test",
        totalFiles: 1,
        files: new Map(),
        symbolIndex: new Map([
          [
            "myFunction",
            [
              {
                file: "test.ts",
                symbol: {
                  name: "myFunction",
                  kind: "function",
                  line: 1,
                  params: [{ name: "arg1" }, { name: "arg2" }],
                  exported: true,
                },
              },
            ],
          ],
          [
            "MyClass",
            [
              {
                file: "test.ts",
                symbol: {
                  name: "MyClass",
                  kind: "class",
                  line: 5,
                  exported: true,
                },
              },
            ],
          ],
        ]),
        importGraph: new Map(),
        exportGraph: new Map(),
        framework: undefined,
      };

      const symbolTable = buildSymbolTable(context);

      expect(symbolTable).toHaveLength(2);
      expect(symbolTable[0].name).toBe("myFunction");
      expect(symbolTable[0].type).toBe("function");
      expect(symbolTable[0].paramCount).toBe(2);
      expect(symbolTable[1].name).toBe("MyClass");
      expect(symbolTable[1].type).toBe("class");
    });
  });

  describe("calculateConfidence", () => {
    it("should return high confidence for non-existent functions with no similar symbols", () => {
      const result = calculateConfidence({
        issueType: "nonExistentFunction",
        symbolName: "unknownFunc",
        similarSymbols: [],
        existsInProject: false,
        strictMode: false,
      });

      expect(result.confidence).toBe(95);
      expect(result.reasoning).toContain("hallucination");
    });

    it("should return high confidence for dependency hallucinations", () => {
      const result = calculateConfidence({
        issueType: "dependencyHallucination",
        symbolName: "missing-package",
        similarSymbols: [],
        existsInProject: false,
        strictMode: false,
      });

      expect(result.confidence).toBe(95);
      expect(result.reasoning).toContain("Package not found");
    });

    it("should return lower confidence for methods", () => {
      const result = calculateConfidence({
        issueType: "nonExistentMethod",
        symbolName: "unknownMethod",
        similarSymbols: [],
        existsInProject: false,
        strictMode: false,
      });

      expect(result.confidence).toBe(70);
      expect(result.reasoning).toContain("Medium confidence");
    });
  });

  describe("validateSymbols", () => {
    it("should detect non-existent function calls", () => {
      const usedSymbols: ASTUsage[] = [
        {
          name: "nonExistentFunc",
          type: "call",
          line: 1,
          column: 0,
          code: "nonExistentFunc()",
          argCount: 0,
        },
      ];

      const symbolTable: ProjectSymbol[] = [];

      const newCode = "nonExistentFunc();";

      const issues = validateSymbols(
        usedSymbols,
        symbolTable,
        newCode,
        "typescript",
        false,
        [],
        new Map(),
      );

      expect(issues).toHaveLength(1);
      expect(issues[0].type).toBe("nonExistentFunction");
      expect(issues[0].severity).toBe("critical");
    });

    it("should not flag functions that exist in symbol table", () => {
      const usedSymbols: ASTUsage[] = [
        {
          name: "existingFunc",
          type: "call",
          line: 1,
          column: 0,
          code: "existingFunc()",
          argCount: 0,
        },
      ];

      const symbolTable: ProjectSymbol[] = [
        {
          name: "existingFunc",
          type: "function",
          file: "test.ts",
          line: 1,
          paramCount: 0,
        },
      ];

      const newCode = "existingFunc();";

      const issues = validateSymbols(
        usedSymbols,
        symbolTable,
        newCode,
        "typescript",
        false,
        [],
        new Map(),
      );

      expect(issues).toHaveLength(0);
    });

    it("should detect wrong parameter count in strict mode", () => {
      const usedSymbols: ASTUsage[] = [
        {
          name: "myFunc",
          type: "call",
          line: 1,
          column: 0,
          code: "myFunc(1, 2, 3)",
          argCount: 3,
        },
      ];

      const symbolTable: ProjectSymbol[] = [
        {
          name: "myFunc",
          type: "function",
          file: "test.ts",
          line: 1,
          params: ["a", "b"],
          paramCount: 2,
        },
      ];

      // In strict mode, we need to import the function first
      // So we add it to imports to make it valid
      const imports: ASTImport[] = [
        {
          module: "./test",
          names: [{ imported: "myFunc", local: "myFunc" }],
          isExternal: false,
          line: 1,
        },
      ];

      const newCode = "myFunc(1, 2, 3);";

      const issues = validateSymbols(
        usedSymbols,
        symbolTable,
        newCode,
        "typescript",
        true, // strict mode
        imports,
        new Map(),
      );

      expect(issues).toHaveLength(1);
      expect(issues[0].type).toBe("wrongParamCount");
      expect(issues[0].severity).toBe("high");
    });

    it("should not flag wrong parameter count in non-strict mode", () => {
      const usedSymbols: ASTUsage[] = [
        {
          name: "myFunc",
          type: "call",
          line: 1,
          column: 0,
          code: "myFunc(1, 2, 3)",
          argCount: 3,
        },
      ];

      const symbolTable: ProjectSymbol[] = [
        {
          name: "myFunc",
          type: "function",
          file: "test.ts",
          line: 1,
          params: ["a", "b"],
          paramCount: 2,
        },
      ];

      const newCode = "myFunc(1, 2, 3);";

      const issues = validateSymbols(
        usedSymbols,
        symbolTable,
        newCode,
        "typescript",
        false, // non-strict mode
        [],
        new Map(),
      );

      expect(issues).toHaveLength(0);
    });
  });
});
