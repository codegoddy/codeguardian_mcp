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

import Parser from "tree-sitter";
import TypeScript from "tree-sitter-typescript";
import JavaScript from "tree-sitter-javascript";
import Python from "tree-sitter-python";
import { logger } from "../../utils/logger.js";

// Supported languages for explicit validation
const SUPPORTED_LANGUAGES = new Set(["typescript", "javascript", "python"]);

// Initialize parsers once (module-level cache for performance)
const parsers: Record<string, Parser> = {};

/**
 * Get or create a parser for the specified language.
 * Parsers are cached at module level for performance.
 *
 * @param language - The programming language to parse (typescript, javascript, python)
 * @returns Parser instance configured for the specified language
 * @throws Error if language is not supported (falls back to TypeScript parser with warning)
 */
export function getParser(language: string): Parser {
  if (parsers[language]) return parsers[language];

  if (!SUPPORTED_LANGUAGES.has(language)) {
    logger.warn(
      `Unsupported language "${language}", falling back to TypeScript parser`,
    );
  }

  const parser = new Parser();
  switch (language) {
    case "typescript":
      // Always use TSX for TypeScript as it's a superset and handles JSX/TSX files
      parser.setLanguage(TypeScript.tsx as unknown as Parser.Language);
      break;
    case "javascript":
      // JavaScript parser handles JSX by default in tree-sitter-javascript
      parser.setLanguage(JavaScript as unknown as Parser.Language);
      break;
    case "python":
      parser.setLanguage(Python as unknown as Parser.Language);
      break;
    default:
      parser.setLanguage(TypeScript.typescript as unknown as Parser.Language);
  }
  parsers[language] = parser;
  return parser;
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
