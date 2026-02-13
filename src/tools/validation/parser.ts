/**
 * Parser Module - Tree-sitter Parser Initialization and Management
 *
 * This module manages Tree-sitter parser instances for different programming languages.
 * It provides parser caching for performance and validates language support.
 *
 * Responsibilities:
 * - Initialize Tree-sitter parsers for supported languages (Python, JavaScript, TypeScript)
 * - Cache parser instances for reuse (performance optimization)
 * - Validate language support before parsing
 * - Handle parser configuration and language grammar loading
 *
 * @format
 */

import type ParserT from "tree-sitter";
import { createRequire } from "module";
import { logger } from "../../utils/logger.js";
import * as crypto from "crypto";

const require = createRequire(import.meta.url);

// IMPORTANT: Use CJS `require(...)` so these native modules are loaded via the
// same loader/cache across Jest VM contexts.
const ParserRuntime = require("tree-sitter") as any;
const TypeScriptLangs = require("tree-sitter-typescript") as any;
const JavaScriptLang = require("tree-sitter-javascript") as any;
const PythonLang = require("tree-sitter-python") as any;

// Supported languages for explicit validation
const SUPPORTED_LANGUAGES = new Set(["typescript", "javascript", "python"]);

// Initialize parsers once (module-level cache for performance)
const parsers: Record<string, ParserT> = {};

// Jest executes each test file in its own VM context inside a worker process.
// Native Tree-sitter objects created in one VM context can behave
// inconsistently if reused in another, so we disable parser/tree caching under
// Jest for test isolation.
const CACHE_PARSER_INSTANCES =
  typeof process !== "undefined" && !process.env.JEST_WORKER_ID;
const CACHE_PARSED_TREES =
  typeof process !== "undefined" && !process.env.JEST_WORKER_ID;

// ============================================================================
// AST Parse Cache
// ============================================================================

type CachedTreeEntry = {
  tree: ParserT.Tree;
  hash: string;
  timestamp: number;
  code?: string;
};

// Content-hash based cache (best for: repeated passes over the same code string)
const treeCache = new Map<string, CachedTreeEntry>();

// File-path based cache (best for: watcher-driven re-validations of a file)
// Note: we attempt to pass the previous tree as `oldTree` to Tree-sitter.
// True incremental parsing requires precise `tree.edit(...)` ranges; we do not
// compute them here to avoid behavioral risk.
const fileTreeCache = new Map<string, CachedTreeEntry>();

const DEFAULT_TREE_CACHE_MAX_ENTRIES = 250;
const DEFAULT_TREE_CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes

/**
 * Clear all parser and AST caches.
 *
 * Primarily intended for tests to avoid cross-suite interference.
 */
export function clearParserCaches(): void {
  for (const key of Object.keys(parsers)) {
    delete parsers[key];
  }
  treeCache.clear();
  fileTreeCache.clear();
}

function computeContentHash(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function computePoint(code: string, index: number): { row: number; column: number } {
  // Tree-sitter Point uses zero-based row/column.
  let row = 0;
  let lastNewlineIndex = -1;
  // Fast path: scan up to index
  for (let i = 0; i < index; i++) {
    if (code.charCodeAt(i) === 10 /* \n */) {
      row++;
      lastNewlineIndex = i;
    }
  }
  return { row, column: index - (lastNewlineIndex + 1) };
}

function computeSingleEdit(oldCode: string, newCode: string): {
  startIndex: number;
  oldEndIndex: number;
  newEndIndex: number;
  startPosition: { row: number; column: number };
  oldEndPosition: { row: number; column: number };
  newEndPosition: { row: number; column: number };
} {
  let startIndex = 0;
  const oldLen = oldCode.length;
  const newLen = newCode.length;

  // Common prefix
  while (
    startIndex < oldLen &&
    startIndex < newLen &&
    oldCode.charCodeAt(startIndex) === newCode.charCodeAt(startIndex)
  ) {
    startIndex++;
  }

  // Common suffix
  let oldEndIndex = oldLen;
  let newEndIndex = newLen;
  while (
    oldEndIndex > startIndex &&
    newEndIndex > startIndex &&
    oldCode.charCodeAt(oldEndIndex - 1) === newCode.charCodeAt(newEndIndex - 1)
  ) {
    oldEndIndex--;
    newEndIndex--;
  }

  return {
    startIndex,
    oldEndIndex,
    newEndIndex,
    startPosition: computePoint(oldCode, startIndex),
    oldEndPosition: computePoint(oldCode, oldEndIndex),
    newEndPosition: computePoint(newCode, newEndIndex),
  };
}

function pruneCache(cache: Map<string, CachedTreeEntry>): void {
  const now = Date.now();
  // TTL pruning
  for (const [key, entry] of cache.entries()) {
    if (now - entry.timestamp > DEFAULT_TREE_CACHE_TTL_MS) {
      cache.delete(key);
    }
  }

  // Size pruning (remove oldest entries first)
  if (cache.size <= DEFAULT_TREE_CACHE_MAX_ENTRIES) return;
  const entries = Array.from(cache.entries()).sort(
    (a, b) => a[1].timestamp - b[1].timestamp,
  );
  const overflow = cache.size - DEFAULT_TREE_CACHE_MAX_ENTRIES;
  for (let i = 0; i < overflow; i++) {
    cache.delete(entries[i]![0]);
  }
}

/**
 * Get or create a parser for the specified language.
 * Parsers are cached at module level for performance.
 *
 * @param language - The programming language to parse (typescript, javascript, python)
 * @returns Parser instance configured for the specified language
 * @throws Error if language is not supported (falls back to TypeScript parser with warning)
 */
export function getParser(language: string): ParserT {
  if (CACHE_PARSER_INSTANCES && parsers[language]) return parsers[language];

  if (!SUPPORTED_LANGUAGES.has(language)) {
    logger.warn(
      `Unsupported language "${language}", falling back to TypeScript parser`,
    );
  }

  const parser = new ParserRuntime() as ParserT;
  switch (language) {
    case "typescript":
      // Always use TSX for TypeScript as it's a superset and handles JSX/TSX files
      parser.setLanguage(
        (TypeScriptLangs.tsx ?? TypeScriptLangs.typescript ?? TypeScriptLangs) as unknown as ParserT.Language,
      );
      break;
    case "javascript":
      // JavaScript parser handles JSX by default in tree-sitter-javascript
      parser.setLanguage(JavaScriptLang as unknown as ParserT.Language);
      break;
    case "python":
      parser.setLanguage(PythonLang as unknown as ParserT.Language);
      break;
    default:
      parser.setLanguage(
        (TypeScriptLangs.typescript ?? TypeScriptLangs) as unknown as ParserT.Language,
      );
  }
  if (CACHE_PARSER_INSTANCES) {
    parsers[language] = parser;
  }
  return parser;
}

/**
 * Parse code with a small in-memory cache.
 *
 * Primary goal: avoid repeated `parser.parse(...)` calls for the same `code`
 * string within a single validation run (imports/usages/type refs/symbols).
 *
 * If `filePath` is provided, we additionally keep a per-file last-tree cache
 * and pass the previous tree as `oldTree` to Tree-sitter for potential speedups.
 */
export function parseCodeCached(
  code: string,
  language: string,
  options: { filePath?: string; cacheKey?: string; useCache?: boolean } = {},
): ParserT.Tree {
  const { filePath, cacheKey, useCache = CACHE_PARSED_TREES } = options;

  const parser = getParser(language);
  if (!useCache) return parser.parse(code);

  pruneCache(treeCache);
  pruneCache(fileTreeCache);

  const hash = computeContentHash(code);

  // Cache key strategy:
  // - If caller provides `cacheKey`, treat it as a stable identity (session/file).
  // - Else if `filePath` is provided, use a stable per-file key so we don't keep
  //   multiple stale entries for the same file content across edits.
  // - Else fall back to content hash.
  //
  // IMPORTANT: Always namespace by language to avoid cross-language collisions.
  const contentKey =
    cacheKey ? `${language}:key:${cacheKey}`
    : filePath ? `${language}:file:${filePath}`
    : `${language}:hash:${hash}`;

  const cached = treeCache.get(contentKey);
  if (cached && cached.hash === hash) {
    cached.timestamp = Date.now();
    return cached.tree;
  }

  // Optional per-file cache (attempts to leverage Tree-sitter's oldTree reuse)
  let tree: ParserT.Tree;
  if (filePath) {
    const fileKey = `${language}:${filePath}`;
    const previous = fileTreeCache.get(fileKey);

    // Best-effort incremental parsing:
    // - Only enabled when we have the previous code string.
    // - We apply a single "replace range" edit to the previous tree.
    // - If anything fails, we fall back to a full parse.
    if (previous?.tree && typeof previous.code === "string") {
      try {
        const edit = computeSingleEdit(previous.code, code);
        previous.tree.edit(edit);
        tree = parser.parse(code, previous.tree);
      } catch {
        tree = parser.parse(code);
      }
    } else {
      tree = parser.parse(code);
    }

    fileTreeCache.set(fileKey, { tree, hash, timestamp: Date.now(), code });
  } else {
    tree = parser.parse(code);
  }

  treeCache.set(contentKey, { tree, hash, timestamp: Date.now() });
  return tree;
}

export function clearParseCaches(): void {
  treeCache.clear();
  fileTreeCache.clear();
  logger.debug("AST parse caches cleared");
}

/**
 * Check if a language is supported by the AST validator.
 *
 * @param language - The programming language to check
 * @returns true if the language is supported, false otherwise
 */
export function isSupportedLanguage(language: string): boolean {
  return SUPPORTED_LANGUAGES.has(language);
}

/**
 * Export the set of supported languages for external use.
 */
export { SUPPORTED_LANGUAGES };
