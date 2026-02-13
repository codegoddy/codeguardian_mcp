/**
 * Integration Tests for Contextual Naming in Validation Pipeline
 *
 * Verifies that contextual naming heuristics work correctly with the
 * validation system to eliminate false positives.
 *
 * @format
 */

import { describe, it, expect } from "vitest";
import { validateSymbols } from "../../src/tools/validation/validation.js";
import { extractSymbolsAST } from "../../src/tools/validation/extractors/index.js";
import { isContextuallyValid } from "../../src/tools/validation/contextualNaming.js";
import type { ASTUsage, ASTImport } from "../../src/tools/validation/types.js";

describe("Contextual Naming Integration with Validation", () => {
  // ============================================================================
  // Event Handler Scenarios
  // ============================================================================

  describe("Event Handler Validation", () => {
    it("should NOT flag e.preventDefault() as hallucination", () => {
      const code = `
function handleSubmit(e) {
  e.preventDefault();
  console.log('submitted');
}
`;

      const usages: ASTUsage[] = [
        {
          name: "preventDefault",
          type: "methodCall",
          object: "e",
          line: 3,
          column: 2,
          code: "e.preventDefault()",
        },
      ];

      const issues = validateSymbols(
        usages,
        [], // empty symbol table
        code,
        "javascript",
        false, // not strict mode
        [],
        new Map(),
        null,
        "",
        new Set(),
      );

      // Should NOT flag preventDefault (contextually valid)
      expect(issues).toHaveLength(0);
    });

    it("should NOT flag event.stopPropagation() and keyboard properties", () => {
      const code = `
function handleKeyDown(event) {
  if (event.key === 'Enter' && event.ctrlKey) {
    event.stopPropagation();
  }
}
`;

      const usages: ASTUsage[] = [
        {
          name: "key",
          type: "methodCall",
          object: "event",
          line: 3,
          column: 6,
          code: "event.key",
        },
        {
          name: "ctrlKey",
          type: "methodCall",
          object: "event",
          line: 3,
          column: 30,
          code: "event.ctrlKey",
        },
        {
          name: "stopPropagation",
          type: "methodCall",
          object: "event",
          line: 4,
          column: 4,
          code: "event.stopPropagation()",
        },
      ];

      const issues = validateSymbols(
        usages,
        [],
        code,
        "javascript",
        true,
        [],
        new Map(),
        null,
        "",
        new Set(),
      );

      expect(issues).toHaveLength(0);
    });

    it("should not over-whitelist unknown methods on event objects", () => {
      const code = `
const e = {};
e.preventDefault();
e.hallucinatedMethod();
`;

      const usages: ASTUsage[] = [
        {
          name: "preventDefault",
          type: "methodCall",
          object: "e",
          line: 2,
          column: 2,
          code: "e.preventDefault()",
        },
        {
          name: "hallucinatedMethod",
          type: "methodCall",
          object: "e",
          line: 3,
          column: 2,
          code: "e.hallucinatedMethod()",
        },
      ];

      const issues = validateSymbols(
        usages,
        [],
        code,
        "javascript",
        false,
        [],
        new Map(),
        null,
        "",
        new Set(),
      );

      expect(isContextuallyValid(usages[0])).toBe(true);
      expect(isContextuallyValid(usages[1])).toBe(false);

      // Auto mode can't safely validate method existence on local objects.
      expect(issues).toHaveLength(0);
    });
  });

  // ============================================================================
  // HTTP Request/Response Scenarios
  // ============================================================================

  describe("HTTP Handler Validation", () => {
    it("should NOT flag req.body, req.params, res.json()", () => {
      const code = `
function handler(req, res) {
  const data = req.body;
  const id = req.params.id;
  res.json({ data, id });
}
`;

      const usages: ASTUsage[] = [
        {
          name: "body",
          type: "methodCall",
          object: "req",
          line: 3,
          column: 15,
          code: "req.body",
        },
        {
          name: "params",
          type: "methodCall",
          object: "req",
          line: 4,
          column: 13,
          code: "req.params",
        },
        {
          name: "json",
          type: "methodCall",
          object: "res",
          line: 5,
          column: 2,
          code: "res.json({ data, id })",
        },
      ];

      const issues = validateSymbols(
        usages,
        [],
        code,
        "javascript",
        false,
        [],
        new Map(),
        null,
        "",
        new Set(),
      );

      expect(issues).toHaveLength(0);
    });
  });

  // ============================================================================
  // Error Handling Scenarios
  // ============================================================================

  describe("Error Handler Validation", () => {
    it("should NOT flag error.message, error.stack", () => {
      const code = `
function handleError(error) {
  console.error(error.message);
  console.error(error.stack);
}
`;

      const usages: ASTUsage[] = [
        {
          name: "error",
          type: "methodCall",
          object: "console",
          line: 3,
          column: 2,
          code: "console.error(error.message)",
        },
        {
          name: "message",
          type: "methodCall",
          object: "error",
          line: 3,
          column: 16,
          code: "error.message",
        },
        {
          name: "error",
          type: "methodCall",
          object: "console",
          line: 4,
          column: 2,
          code: "console.error(error.stack)",
        },
        {
          name: "stack",
          type: "methodCall",
          object: "error",
          line: 4,
          column: 16,
          code: "error.stack",
        },
      ];

      const issues = validateSymbols(
        usages,
        [],
        code,
        "javascript",
        false,
        [],
        new Map(),
        null,
        "",
        new Set(),
      );

      // Should not flag error.message or error.stack
      const errorPropertyIssues = issues.filter(
        (i) => i.message.includes("message") || i.message.includes("stack"),
      );
      expect(errorPropertyIssues).toHaveLength(0);
    });
  });

  // ============================================================================
  // Context Object Scenarios
  // ============================================================================

  describe("Context Object Validation", () => {
    it("should NOT flag Canvas context methods", () => {
      const code = `
function draw(ctx) {
  ctx.fillRect(0, 0, 100, 100);
  ctx.beginPath();
  ctx.stroke();
}
`;

      const usages: ASTUsage[] = [
        {
          name: "fillRect",
          type: "methodCall",
          object: "ctx",
          line: 3,
          column: 2,
          code: "ctx.fillRect(0, 0, 100, 100)",
          argCount: 4,
        },
        {
          name: "beginPath",
          type: "methodCall",
          object: "ctx",
          line: 4,
          column: 2,
          code: "ctx.beginPath()",
          argCount: 0,
        },
        {
          name: "stroke",
          type: "methodCall",
          object: "ctx",
          line: 5,
          column: 2,
          code: "ctx.stroke()",
          argCount: 0,
        },
      ];

      const issues = validateSymbols(
        usages,
        [],
        code,
        "javascript",
        false,
        [],
        new Map(),
        null,
        "",
        new Set(),
      );

      expect(issues).toHaveLength(0);
    });
  });

  // ============================================================================
  // Mixed Scenarios
  // ============================================================================

  describe("Mixed Validation Scenarios", () => {
    it("should handle multiple contextual patterns correctly", () => {
      const code = `
function complexHandler(e, req, res, error) {
  e.preventDefault();
  const data = req.body;
  res.json({ data });
  console.error(error.message);
}
`;

      const usages: ASTUsage[] = [
        {
          name: "preventDefault",
          type: "methodCall",
          object: "e",
          line: 3,
          column: 2,
          code: "e.preventDefault()",
        },
        {
          name: "body",
          type: "methodCall",
          object: "req",
          line: 4,
          column: 15,
          code: "req.body",
        },
        {
          name: "json",
          type: "methodCall",
          object: "res",
          line: 5,
          column: 2,
          code: "res.json({ data })",
        },
        {
          name: "message",
          type: "methodCall",
          object: "error",
          line: 6,
          column: 16,
          code: "error.message",
        },
      ];

      const issues = validateSymbols(
        usages,
        [],
        code,
        "javascript",
        false,
        [],
        new Map(),
        null,
        "",
        new Set(),
      );

      // Should not flag any contextual methods
      expect(issues).toHaveLength(0);
    });
  });
});
