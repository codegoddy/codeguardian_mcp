/**
 * Test suite for 'this' keyword validation fix
 *
 * This test verifies that the validation logic correctly handles the 'this' keyword
 * in class contexts without generating false positives.
 *
 * @format
 */

import { describe, it, expect } from "vitest";
import {
  validateSymbols,
  buildSymbolTable,
} from "../../src/tools/validation/validation.js";
import { extractSymbolsAST } from "../../src/tools/validation/extractors/index.js";
import type { ASTUsage, ASTImport } from "../../src/tools/validation/types.js";

describe("this keyword validation", () => {
  it("should NOT flag this.method() calls in class instance methods", () => {
    const code = `
      class TimeTrackingClient {
        private ws: WebSocket | null = null;
        
        connect(url: string) {
          this.ws = new WebSocket(url);
          this.startPing();
        }
        
        startPing() {
          console.log('Pinging...');
        }
      }
    `;

    // Extract symbols from the code
    const symbols = extractSymbolsAST(code, "test.ts", "typescript");
    const symbolTable = symbols.map((s) => ({
      name: s.name,
      type: s.type as any,
      file: "test.ts",
      params: s.params,
      paramCount: s.paramCount,
    }));

    // Manually create usages (simulating what the extractor would find)
    const usages: ASTUsage[] = [
      {
        type: "methodCall",
        name: "startPing",
        object: "this",
        line: 6,
        code: "this.startPing();",
      },
    ];

    const imports: ASTImport[] = [];

    // Validate
    const issues = validateSymbols(
      usages,
      symbolTable,
      code,
      "typescript",
      false, // non-strict mode
      imports,
      new Map(),
      null,
      "test.ts",
      new Set(),
      [],
    );

    // Should have NO issues - 'this' is valid in class context
    expect(issues).toHaveLength(0);
  });

  it("should NOT flag this.method() calls in static methods", () => {
    const code = `
      class ApiService {
        static makeRequest<T>(endpoint: string): Promise<T> {
          return fetch(endpoint).then(r => r.json());
        }
        
        static get<T>(endpoint: string): Promise<T> {
          return this.makeRequest<T>(endpoint);
        }
      }
    `;

    const symbols = extractSymbolsAST(code, "test.ts", "typescript");
    const symbolTable = symbols.map((s) => ({
      name: s.name,
      type: s.type as any,
      file: "test.ts",
      params: s.params,
      paramCount: s.paramCount,
    }));

    const usages: ASTUsage[] = [
      {
        type: "methodCall",
        name: "makeRequest",
        object: "this",
        line: 7,
        code: "return this.makeRequest<T>(endpoint);",
      },
    ];

    const imports: ASTImport[] = [];

    const issues = validateSymbols(
      usages,
      symbolTable,
      code,
      "typescript",
      false,
      imports,
      new Map(),
      null,
      "test.ts",
      new Set(),
      [],
    );

    // Should have NO issues
    expect(issues).toHaveLength(0);
  });

  it("should NOT flag this.property access", () => {
    const code = `
      class NATSClient {
        private ws: WebSocket | null = null;
        
        disconnect() {
          if (this.ws) {
            this.ws.close();
          }
        }
      }
    `;

    const symbols = extractSymbolsAST(code, "test.ts", "typescript");
    const symbolTable = symbols.map((s) => ({
      name: s.name,
      type: s.type as any,
      file: "test.ts",
      params: s.params,
      paramCount: s.paramCount,
    }));

    const usages: ASTUsage[] = [
      {
        type: "reference",
        name: "ws",
        object: "this",
        line: 5,
        code: "if (this.ws) {",
      },
      {
        type: "methodCall",
        name: "close",
        object: "this.ws",
        line: 6,
        code: "this.ws.close();",
      },
    ];

    const imports: ASTImport[] = [];

    const issues = validateSymbols(
      usages,
      symbolTable,
      code,
      "typescript",
      false,
      imports,
      new Map(),
      null,
      "test.ts",
      new Set(),
      [],
    );

    // Should have NO issues
    expect(issues).toHaveLength(0);
  });

  it("should still flag actual hallucinations on other objects", () => {
    const code = `
      class ApiService {
        static get<T>(endpoint: string): Promise<T> {
          return someHallucinatedApi.makeRequest<T>(endpoint);
        }
      }
    `;

    const symbols = extractSymbolsAST(code, "test.ts", "typescript");
    const symbolTable = symbols.map((s) => ({
      name: s.name,
      type: s.type as any,
      file: "test.ts",
      params: s.params,
      paramCount: s.paramCount,
    }));

    const usages: ASTUsage[] = [
      {
        type: "methodCall",
        name: "makeRequest",
        object: "someHallucinatedApi",
        line: 3,
        code: "return someHallucinatedApi.makeRequest<T>(endpoint);",
      },
    ];

    const imports: ASTImport[] = [];

    const issues = validateSymbols(
      usages,
      symbolTable,
      code,
      "typescript",
      false,
      imports,
      new Map(),
      null,
      "test.ts",
      new Set(),
      [],
    );

    // Should flag 'someHallucinatedApi' as undefined
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].type).toBe("undefinedVariable");
    expect(issues[0].message).toContain("someHallucinatedApi");
  });

  it("should handle this in arrow functions (lexical this)", () => {
    const code = `
      class Component {
        private data: string[] = [];
        
        processData() {
          this.data.forEach((item) => {
            this.handleItem(item);
          });
        }
        
        handleItem(item: string) {
          console.log(item);
        }
      }
    `;

    const symbols = extractSymbolsAST(code, "test.ts", "typescript");
    const symbolTable = symbols.map((s) => ({
      name: s.name,
      type: s.type as any,
      file: "test.ts",
      params: s.params,
      paramCount: s.paramCount,
    }));

    const usages: ASTUsage[] = [
      {
        type: "methodCall",
        name: "forEach",
        object: "this.data",
        line: 6,
        code: "this.data.forEach((item) => {",
      },
      {
        type: "methodCall",
        name: "handleItem",
        object: "this",
        line: 7,
        code: "this.handleItem(item);",
      },
    ];

    const imports: ASTImport[] = [];

    const issues = validateSymbols(
      usages,
      symbolTable,
      code,
      "typescript",
      false,
      imports,
      new Map(),
      null,
      "test.ts",
      new Set(),
      [],
    );

    // Should have NO issues - 'this' is lexically bound in arrow functions
    expect(issues).toHaveLength(0);
  });
});
