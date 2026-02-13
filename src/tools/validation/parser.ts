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

import { Parser, Language, Edit, type Tree as TreeType, type Node as NodeType } from "web-tree-sitter";
import { logger } from "../../utils/logger.js";
import * as crypto from "crypto";
import * as path from "path";
import { fileURLToPath } from "url";

// Supported languages for explicit validation
const SUPPORTED_LANGUAGES = new Set(["typescript", "javascript", "python"]);

// Initialize parsers once (module-level cache for performance)
const parsers: Record<string, InstanceType<typeof Parser>> = {};

// Track initialization state
let parsersInitialized = false;
let initPromise: Promise<void> | null = null;

const CACHE_PARSER_INSTANCES =
  typeof process !== "undefined" && !process.env.JEST_WORKER_ID;
const CACHE_PARSED_TREES =
  typeof process !== "undefined" && !process.env.JEST_WORKER_ID;

/**
 * Resolve the path to a bundled .wasm grammar file.
 *
 * The .wasm files are shipped inside the package's `wasm/` directory
 * (copied from the tree-sitter-* devDependencies at build time).
 * This avoids any dependency on hoisted / nested node_modules layout
 * and works in all install scenarios (local dev, npx, global install).
 */
function resolveWasmPath(wasmFile: string): string {
  // `import.meta.url` points to dist/tools/validation/parser.js
  // Package root is three levels up: ../../..
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  return path.join(__dirname, "..", "..", "..", "wasm", wasmFile);
}

/**
 * Initialize web-tree-sitter and load all language grammars.
 * Must be called (and awaited) before any parsing.
 * Safe to call multiple times — subsequent calls are no-ops.
 */
export async function initParsers(): Promise<void> {
  if (parsersInitialized) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      await Parser.init();

      // Load language WASM files
      const tsxWasm = resolveWasmPath("tree-sitter-tsx.wasm");
      const jsWasm = resolveWasmPath("tree-sitter-javascript.wasm");
      const pyWasm = resolveWasmPath("tree-sitter-python.wasm");

      const [tsxLang, jsLang, pyLang] = await Promise.all([
        Language.load(tsxWasm),
        Language.load(jsWasm),
        Language.load(pyWasm),
      ]);

      // TypeScript parser (TSX superset)
      const tsParser = new Parser();
      tsParser.setLanguage(tsxLang);
      parsers["typescript"] = tsParser;

      // JavaScript parser
      const jsParser = new Parser();
      jsParser.setLanguage(jsLang);
      parsers["javascript"] = jsParser;

      // Python parser
      const pyParser = new Parser();
      pyParser.setLanguage(pyLang);
      parsers["python"] = pyParser;

      parsersInitialized = true;
      logger.debug("web-tree-sitter parsers initialized (WASM)");
    } catch (e) {
      logger.error("Failed to initialize web-tree-sitter parsers", e);
      throw e;
    }
  })();

  return initPromise;
}

/**
 * Ensure parsers are ready. Blocks synchronously if they haven't been
 * initialized yet by triggering init and throwing a helpful error.
 * In practice, server.ts should call initParsers() at startup.
 */
function ensureParsersReady(): void {
  if (!parsersInitialized) {
    // Kick off init for next time, but we can't await here
    initParsers().catch(() => {});
    throw new Error(
      "Tree-sitter parsers not initialized. Call and await initParsers() before parsing."
    );
  }
}

// ============================================================================
// AST Parse Cache
// ============================================================================

type CachedTreeEntry = {
  tree: TreeType;
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
export function getParser(language: string): InstanceType<typeof Parser> {
  ensureParsersReady();

  if (parsers[language]) return parsers[language];

  if (!SUPPORTED_LANGUAGES.has(language)) {
    logger.warn(
      `Unsupported language "${language}", falling back to TypeScript parser`,
    );
    return parsers["typescript"];
  }

  // Should not reach here after init, but just in case
  return parsers["typescript"];
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
): TreeType {
  const { filePath, cacheKey, useCache = CACHE_PARSED_TREES } = options;

  const parser = getParser(language);
  if (!useCache) {
    const tree = parser.parse(code);
    if (!tree) throw new Error(`Failed to parse code for language: ${language}`);
    return tree;
  }

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
  let tree: TreeType;
  if (filePath) {
    const fileKey = `${language}:${filePath}`;
    const previous = fileTreeCache.get(fileKey);

    // Best-effort incremental parsing:
    // - Only enabled when we have the previous code string.
    // - We apply a single "replace range" edit to the previous tree.
    // - If anything fails, we fall back to a full parse.
    if (previous?.tree && typeof previous.code === "string") {
      try {
        const editData = computeSingleEdit(previous.code, code);
        previous.tree.edit(new Edit(editData));
        const parsed = parser.parse(code, previous.tree);
        tree = parsed ?? parser.parse(code)!;
      } catch {
        tree = parser.parse(code)!;
      }
    } else {
      tree = parser.parse(code)!;
    }

    fileTreeCache.set(fileKey, { tree, hash, timestamp: Date.now(), code });
  } else {
    tree = parser.parse(code)!;
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
