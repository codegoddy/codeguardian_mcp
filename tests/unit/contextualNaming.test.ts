/**
 * Tests for Contextual Naming Heuristics
 *
 * Verifies that common naming patterns (e.g., event handlers, HTTP objects)
 * are correctly recognized and whitelisted to eliminate false positives.
 *
 * @format
 */

import { describe, it, expect } from "@jest/globals";
import {
  isContextuallyValid,
  getContextualReason,
  filterContextualUsages,
  getFilterStats,
  createPattern,
  BUILTIN_PATTERNS,
} from "../../src/tools/validation/contextualNaming.js";
import type { ASTUsage } from "../../src/tools/validation/types.js";

describe("Contextual Naming Heuristics", () => {
  // ============================================================================
  // Event Handler Patterns
  // ============================================================================

  describe("Event Handler Patterns", () => {
    it("should recognize e.preventDefault() as valid", () => {
      const usage: ASTUsage = {
        name: "preventDefault",
        type: "methodCall",
        object: "e",
        line: 1,
        column: 0,
        code: "e.preventDefault()",
      };

      expect(isContextuallyValid(usage)).toBe(true);
      expect(getContextualReason(usage)).toContain("Event handler");
    });

    it("should recognize event.stopPropagation() as valid", () => {
      const usage: ASTUsage = {
        name: "stopPropagation",
        type: "methodCall",
        object: "event",
        line: 1,
        column: 0,
        code: "event.stopPropagation()",
      };

      expect(isContextuallyValid(usage)).toBe(true);
    });

    it("should recognize evt.target as valid", () => {
      const usage: ASTUsage = {
        name: "target",
        type: "methodCall",
        object: "evt",
        line: 1,
        column: 0,
        code: "evt.target",
      };

      expect(isContextuallyValid(usage)).toBe(true);
    });

    it("should recognize case-insensitive event names (Event, EVT)", () => {
      const usages: ASTUsage[] = [
        {
          name: "preventDefault",
          type: "methodCall",
          object: "Event",
          line: 1,
          column: 0,
          code: "Event.preventDefault()",
        },
        {
          name: "stopPropagation",
          type: "methodCall",
          object: "EVT",
          line: 2,
          column: 0,
          code: "EVT.stopPropagation()",
        },
      ];

      usages.forEach((usage) => {
        expect(isContextuallyValid(usage)).toBe(true);
      });
    });

    it("should recognize React SyntheticEvent methods", () => {
      const usages: ASTUsage[] = [
        {
          name: "nativeEvent",
          type: "methodCall",
          object: "e",
          line: 1,
          column: 0,
          code: "e.nativeEvent",
        },
        {
          name: "persist",
          type: "methodCall",
          object: "event",
          line: 2,
          column: 0,
          code: "event.persist()",
        },
        {
          name: "isPropagationStopped",
          type: "methodCall",
          object: "evt",
          line: 3,
          column: 0,
          code: "evt.isPropagationStopped()",
        },
      ];

      usages.forEach((usage) => {
        expect(isContextuallyValid(usage)).toBe(true);
      });
    });

    it("should recognize keyboard event properties", () => {
      const usages: ASTUsage[] = [
        {
          name: "key",
          type: "methodCall",
          object: "e",
          line: 1,
          column: 0,
          code: "e.key",
        },
        {
          name: "keyCode",
          type: "methodCall",
          object: "event",
          line: 2,
          column: 0,
          code: "event.keyCode",
        },
        {
          name: "ctrlKey",
          type: "methodCall",
          object: "evt",
          line: 3,
          column: 0,
          code: "evt.ctrlKey",
        },
      ];

      usages.forEach((usage) => {
        expect(isContextuallyValid(usage)).toBe(true);
      });
    });

    it("should recognize mouse event properties", () => {
      const usages: ASTUsage[] = [
        {
          name: "clientX",
          type: "methodCall",
          object: "e",
          line: 1,
          column: 0,
          code: "e.clientX",
        },
        {
          name: "clientY",
          type: "methodCall",
          object: "e",
          line: 2,
          column: 0,
          code: "e.clientY",
        },
        {
          name: "button",
          type: "methodCall",
          object: "event",
          line: 3,
          column: 0,
          code: "event.button",
        },
      ];

      usages.forEach((usage) => {
        expect(isContextuallyValid(usage)).toBe(true);
      });
    });

    it("should NOT recognize non-event methods on event-named variables", () => {
      const usage: ASTUsage = {
        name: "hallucination",
        type: "methodCall",
        object: "e",
        line: 1,
        column: 0,
        code: "e.hallucination()",
      };

      expect(isContextuallyValid(usage)).toBe(false);
      expect(getContextualReason(usage)).toBeNull();
    });
  });

  // ============================================================================
  // HTTP Request/Response Patterns
  // ============================================================================

  describe("HTTP Request/Response Patterns", () => {
    it("should recognize req.body, req.params, req.query", () => {
      const usages: ASTUsage[] = [
        {
          name: "body",
          type: "methodCall",
          object: "req",
          line: 1,
          column: 0,
          code: "req.body",
        },
        {
          name: "params",
          type: "methodCall",
          object: "request",
          line: 2,
          column: 0,
          code: "request.params",
        },
        {
          name: "query",
          type: "methodCall",
          object: "req",
          line: 3,
          column: 0,
          code: "req.query",
        },
      ];

      usages.forEach((usage) => {
        expect(isContextuallyValid(usage)).toBe(true);
      });
    });

    it("should recognize res.status(), res.json(), res.send()", () => {
      const usages: ASTUsage[] = [
        {
          name: "status",
          type: "methodCall",
          object: "res",
          line: 1,
          column: 0,
          code: "res.status(200)",
        },
        {
          name: "json",
          type: "methodCall",
          object: "response",
          line: 2,
          column: 0,
          code: "response.json()",
        },
        {
          name: "send",
          type: "methodCall",
          object: "res",
          line: 3,
          column: 0,
          code: "res.send()",
        },
      ];

      usages.forEach((usage) => {
        expect(isContextuallyValid(usage)).toBe(true);
      });
    });

    it("should recognize Fetch API methods", () => {
      const usages: ASTUsage[] = [
        {
          name: "json",
          type: "methodCall",
          object: "response",
          line: 1,
          column: 0,
          code: "response.json()",
        },
        {
          name: "text",
          type: "methodCall",
          object: "res",
          line: 2,
          column: 0,
          code: "res.text()",
        },
        {
          name: "ok",
          type: "methodCall",
          object: "response",
          line: 3,
          column: 0,
          code: "response.ok",
        },
      ];

      usages.forEach((usage) => {
        expect(isContextuallyValid(usage)).toBe(true);
      });
    });
  });

  // ============================================================================
  // Error Handling Patterns
  // ============================================================================

  describe("Error Handling Patterns", () => {
    it("should recognize error.message, error.stack", () => {
      const usages: ASTUsage[] = [
        {
          name: "message",
          type: "methodCall",
          object: "error",
          line: 1,
          column: 0,
          code: "error.message",
        },
        {
          name: "stack",
          type: "methodCall",
          object: "err",
          line: 2,
          column: 0,
          code: "err.stack",
        },
        {
          name: "name",
          type: "methodCall",
          object: "exception",
          line: 3,
          column: 0,
          code: "exception.name",
        },
      ];

      usages.forEach((usage) => {
        expect(isContextuallyValid(usage)).toBe(true);
      });
    });

    it("should recognize custom error properties", () => {
      const usages: ASTUsage[] = [
        {
          name: "statusCode",
          type: "methodCall",
          object: "error",
          line: 1,
          column: 0,
          code: "error.statusCode",
        },
        {
          name: "code",
          type: "methodCall",
          object: "err",
          line: 2,
          column: 0,
          code: "err.code",
        },
        {
          name: "isAxiosError",
          type: "methodCall",
          object: "error",
          line: 3,
          column: 0,
          code: "error.isAxiosError",
        },
      ];

      usages.forEach((usage) => {
        expect(isContextuallyValid(usage)).toBe(true);
      });
    });
  });

  // ============================================================================
  // Context Object Patterns
  // ============================================================================

  describe("Context Object Patterns", () => {
    it("should recognize Canvas context methods", () => {
      const usages: ASTUsage[] = [
        {
          name: "fillRect",
          type: "methodCall",
          object: "ctx",
          line: 1,
          column: 0,
          code: "ctx.fillRect(0, 0, 100, 100)",
        },
        {
          name: "strokeText",
          type: "methodCall",
          object: "context",
          line: 2,
          column: 0,
          code: "context.strokeText('Hello', 10, 10)",
        },
        {
          name: "beginPath",
          type: "methodCall",
          object: "ctx",
          line: 3,
          column: 0,
          code: "ctx.beginPath()",
        },
      ];

      usages.forEach((usage) => {
        expect(isContextuallyValid(usage)).toBe(true);
      });
    });

    it("should recognize Koa/Express context properties", () => {
      const usages: ASTUsage[] = [
        {
          name: "request",
          type: "methodCall",
          object: "ctx",
          line: 1,
          column: 0,
          code: "ctx.request",
        },
        {
          name: "response",
          type: "methodCall",
          object: "ctx",
          line: 2,
          column: 0,
          code: "ctx.response",
        },
        {
          name: "throw",
          type: "methodCall",
          object: "ctx",
          line: 3,
          column: 0,
          code: "ctx.throw(404)",
        },
      ];

      usages.forEach((usage) => {
        expect(isContextuallyValid(usage)).toBe(true);
      });
    });
  });

  // ============================================================================
  // Filtering and Statistics
  // ============================================================================

  describe("Usage Filtering", () => {
    it("should filter out contextually valid usages", () => {
      const usages: ASTUsage[] = [
        {
          name: "preventDefault",
          type: "methodCall",
          object: "e",
          line: 1,
          column: 0,
          code: "e.preventDefault()",
        },
        {
          name: "hallucination",
          type: "methodCall",
          object: "obj",
          line: 2,
          column: 0,
          code: "obj.hallucination()",
        },
        {
          name: "body",
          type: "methodCall",
          object: "req",
          line: 3,
          column: 0,
          code: "req.body",
        },
        {
          name: "fakeMethod",
          type: "methodCall",
          object: "something",
          line: 4,
          column: 0,
          code: "something.fakeMethod()",
        },
      ];

      const filtered = filterContextualUsages(usages);

      expect(filtered).toHaveLength(2);
      expect(filtered[0].name).toBe("hallucination");
      expect(filtered[1].name).toBe("fakeMethod");
    });

    it("should calculate filter statistics correctly", () => {
      const original: ASTUsage[] = [
        {
          name: "preventDefault",
          type: "methodCall",
          object: "e",
          line: 1,
          column: 0,
          code: "e.preventDefault()",
        },
        {
          name: "stopPropagation",
          type: "methodCall",
          object: "event",
          line: 2,
          column: 0,
          code: "event.stopPropagation()",
        },
        {
          name: "hallucination",
          type: "methodCall",
          object: "obj",
          line: 3,
          column: 0,
          code: "obj.hallucination()",
        },
      ];

      const filtered = filterContextualUsages(original);
      const stats = getFilterStats(original, filtered);

      expect(stats.total).toBe(3);
      expect(stats.filtered).toBe(2);
      expect(stats.remaining).toBe(1);
      expect(stats.filterRate).toBe(66.7);
    });
  });

  // ============================================================================
  // Custom Patterns
  // ============================================================================

  describe("Custom Patterns", () => {
    it("should support custom naming patterns", () => {
      const customPattern = createPattern({
        variablePattern: /^(db|database)$/i,
        allowedMembers: ["query", "execute", "connect", "close"],
        description: "Database connection object",
        context: "database",
      });

      const usage: ASTUsage = {
        name: "query",
        type: "methodCall",
        object: "db",
        line: 1,
        column: 0,
        code: "db.query('SELECT * FROM users')",
      };

      expect(isContextuallyValid(usage, [customPattern])).toBe(true);
    });

    it("should combine custom patterns with built-in patterns", () => {
      const customPattern = createPattern({
        variablePattern: /^logger$/i,
        allowedMembers: ["info", "warn", "error", "debug"],
        description: "Logger object",
      });

      const usages: ASTUsage[] = [
        {
          name: "info",
          type: "methodCall",
          object: "logger",
          line: 1,
          column: 0,
          code: "logger.info('test')",
        },
        {
          name: "preventDefault",
          type: "methodCall",
          object: "e",
          line: 2,
          column: 0,
          code: "e.preventDefault()",
        },
      ];

      usages.forEach((usage) => {
        expect(isContextuallyValid(usage, [customPattern])).toBe(true);
      });
    });
  });

  // ============================================================================
  // Edge Cases
  // ============================================================================

  describe("Edge Cases", () => {
    it("should only check methodCall usages", () => {
      const usages: ASTUsage[] = [
        {
          name: "preventDefault",
          type: "call",
          line: 1,
          column: 0,
          code: "preventDefault()",
        },
        {
          name: "Event",
          type: "instantiation",
          line: 2,
          column: 0,
          code: "new Event('click')",
        },
        {
          name: "e",
          type: "reference",
          line: 3,
          column: 0,
          code: "e",
        },
      ];

      usages.forEach((usage) => {
        expect(isContextuallyValid(usage)).toBe(false);
      });
    });

    it("should require object property for methodCall", () => {
      const usage: ASTUsage = {
        name: "preventDefault",
        type: "methodCall",
        // object is undefined
        line: 1,
        column: 0,
        code: "preventDefault()",
      };

      expect(isContextuallyValid(usage)).toBe(false);
    });

    it("should handle empty custom patterns array", () => {
      const usage: ASTUsage = {
        name: "preventDefault",
        type: "methodCall",
        object: "e",
        line: 1,
        column: 0,
        code: "e.preventDefault()",
      };

      expect(isContextuallyValid(usage, [])).toBe(true);
    });
  });

  // ============================================================================
  // Built-in Pattern Exports
  // ============================================================================

  describe("Built-in Pattern Exports", () => {
    it("should export all pattern categories", () => {
      expect(BUILTIN_PATTERNS.EVENT_PATTERNS).toBeDefined();
      expect(BUILTIN_PATTERNS.HTTP_PATTERNS).toBeDefined();
      expect(BUILTIN_PATTERNS.ERROR_PATTERNS).toBeDefined();
      expect(BUILTIN_PATTERNS.CONTEXT_PATTERNS).toBeDefined();
      expect(BUILTIN_PATTERNS.ALL_PATTERNS).toBeDefined();
    });

    it("should have non-empty pattern arrays", () => {
      expect(BUILTIN_PATTERNS.EVENT_PATTERNS.length).toBeGreaterThan(0);
      expect(BUILTIN_PATTERNS.HTTP_PATTERNS.length).toBeGreaterThan(0);
      expect(BUILTIN_PATTERNS.ERROR_PATTERNS.length).toBeGreaterThan(0);
      expect(BUILTIN_PATTERNS.CONTEXT_PATTERNS.length).toBeGreaterThan(0);
    });

    it("should have ALL_PATTERNS as combination of all categories", () => {
      const totalPatterns =
        BUILTIN_PATTERNS.EVENT_PATTERNS.length +
        BUILTIN_PATTERNS.HTTP_PATTERNS.length +
        BUILTIN_PATTERNS.ERROR_PATTERNS.length +
        BUILTIN_PATTERNS.CONTEXT_PATTERNS.length;

      expect(BUILTIN_PATTERNS.ALL_PATTERNS.length).toBe(totalPatterns);
    });
  });
});
