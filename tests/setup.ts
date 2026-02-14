/**
 * Global test setup
 * Runs before each test to ensure clean state
 *
 * @format
 */

import { clearContextCache } from "../src/context/projectContext.js";
import { clearDeadCodeCaches } from "../src/tools/validation/deadCode.js";
import { initParsers, clearParseCaches } from "../src/tools/validation/parser.js";

// Tree-sitter parsers must be initialized before any AST-based validation/extraction.
// Many modules call into parser.getParser() which throws if initParsers() wasn't awaited.
beforeAll(async () => {
  await initParsers();
});

// Clear all caches before each test to prevent test interference
beforeEach(() => {
  clearContextCache();
  clearDeadCodeCaches();
  clearParseCaches();
});
