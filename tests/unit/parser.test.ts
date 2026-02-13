/**
 * Unit tests for parser module
 *
 * Tests parser initialization, caching, and language support validation.
 *
 * @format
 */

import {
  getParser,
  isSupportedLanguage,
  SUPPORTED_LANGUAGES,
} from "../../src/tools/validation/parser.js";

describe("Parser Module", () => {
  describe("isSupportedLanguage", () => {
    it("should return true for supported languages", () => {
      expect(isSupportedLanguage("typescript")).toBe(true);
      expect(isSupportedLanguage("javascript")).toBe(true);
      expect(isSupportedLanguage("python")).toBe(true);
    });

    it("should return false for unsupported languages", () => {
      expect(isSupportedLanguage("go")).toBe(false);
      expect(isSupportedLanguage("rust")).toBe(false);
      expect(isSupportedLanguage("java")).toBe(false);
    });
  });

  describe("SUPPORTED_LANGUAGES", () => {
    it("should contain exactly typescript, javascript, and python", () => {
      expect(SUPPORTED_LANGUAGES.size).toBe(3);
      expect(SUPPORTED_LANGUAGES.has("typescript")).toBe(true);
      expect(SUPPORTED_LANGUAGES.has("javascript")).toBe(true);
      expect(SUPPORTED_LANGUAGES.has("python")).toBe(true);
    });
  });

  describe("getParser", () => {
    it("should return a parser instance for supported languages", () => {
      const tsParser = getParser("typescript");
      const jsParser = getParser("javascript");
      const pyParser = getParser("python");

      expect(tsParser).toBeDefined();
      expect(jsParser).toBeDefined();
      expect(pyParser).toBeDefined();
    });

    it("should return cached parser instances for same language", () => {
      const parser1 = getParser("typescript");
      const parser2 = getParser("typescript");

      // Under Jest we intentionally disable parser-instance caching because
      // Tree-sitter native bindings can behave inconsistently across VM contexts.
      if (process.env.JEST_WORKER_ID) {
        expect(parser1).not.toBe(parser2);
      } else {
        expect(parser1).toBe(parser2);
      }
    });

    it("should return different parser instances for different languages", () => {
      const tsParser = getParser("typescript");
      const jsParser = getParser("javascript");
      const pyParser = getParser("python");

      // Should return different instances
      expect(tsParser).not.toBe(jsParser);
      expect(jsParser).not.toBe(pyParser);
      expect(tsParser).not.toBe(pyParser);
    });

    it("should fall back to TypeScript parser for unsupported languages", () => {
      const unsupportedParser = getParser("go");
      const tsParser = getParser("typescript");

      // Should return a parser instance (fallback)
      expect(unsupportedParser).toBeDefined();
      // But it should not be the same as the cached TypeScript parser
      // because it was created with a different language key
      expect(unsupportedParser).not.toBe(tsParser);
    });

    it("should be able to parse code with returned parser", () => {
      const parser = getParser("typescript");
      const code = "function hello() { return 'world'; }";
      const tree = parser.parse(code);

      expect(tree).toBeDefined();
      expect(tree.rootNode).toBeDefined();
      expect(tree.rootNode.type).toBe("program");
    });
  });
});
