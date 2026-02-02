/**
 * Unified Extractor API - Language-Agnostic AST Extraction
 *
 * This module provides a unified interface for extracting symbols, usages, imports,
 * and type references from code, automatically routing to the appropriate language-specific
 * extractor (Python or JavaScript/TypeScript).
 *
 * This abstraction allows the rest of the validation system to work with any supported
 * language without needing to know the implementation details of each language's AST.
 *
 * @format
 */

import type {
  ASTSymbol,
  ASTUsage,
  ASTImport,
  ASTTypeReference,
} from "../types.js";
import { getParser, isSupportedLanguage } from "../parser.js";
import {
  extractPythonSymbols,
  extractPythonUsages,
  extractPythonImports,
  extractPythonTypeReferences,
} from "./python.js";
import {
  extractJSSymbols,
  extractJSUsages,
  extractJSImports,
  extractJSTypeReferences,
} from "./javascript.js";

// ============================================================================
// Re-export Shared Types for Convenience
// ============================================================================

export type {
  ASTSymbol,
  ASTUsage,
  ASTImport,
  ASTTypeReference,
} from "../types.js";

// ============================================================================
// Unified Extraction Functions
// ============================================================================

/**
 * Extract all symbol definitions from code using language-appropriate AST parser.
 * Routes to Python or JavaScript/TypeScript extractor based on language parameter.
 *
 * This function handles parser initialization and AST parsing internally, providing
 * a simple interface for extracting symbols from source code.
 *
 * @param code - The source code string to analyze
 * @param filePath - Path to the file being analyzed
 * @param language - Programming language ('python', 'javascript', 'typescript')
 * @returns Array of extracted symbol definitions
 *
 * @example
 * ```typescript
 * const symbols = extractSymbolsAST('def hello(): pass', 'test.py', 'python');
 * console.log(symbols); // [{ name: 'hello', type: 'function', ... }]
 * ```
 */
export function extractSymbolsAST(
  code: string,
  filePathOrLanguage: string,
  languageOrOptions?: string | { includeParameterSymbols?: boolean },
  options: { includeParameterSymbols?: boolean } = {},
): ASTSymbol[] {
  // Backwards compatibility:
  // - Old signature: extractSymbolsAST(code, language)
  // - Current signature: extractSymbolsAST(code, filePath, language, options?)
  let filePath = filePathOrLanguage;
  let language: string | undefined;
  let normalizedOptions = options;

  if (typeof languageOrOptions === "object" && languageOrOptions !== null) {
    // Called as: (code, language, options)
    language = filePathOrLanguage;
    filePath = "";
    normalizedOptions = languageOrOptions;
  } else {
    language = languageOrOptions;
    // Called as: (code, language)
    if (!language && isSupportedLanguage(filePathOrLanguage)) {
      language = filePathOrLanguage;
      filePath = "";
    }
  }

  const parser = getParser(language as any);
  const tree = parser.parse(code);
  const symbols: ASTSymbol[] = [];

  if (language === "python") {
    extractPythonSymbols(tree.rootNode, code, filePath, symbols, null);
  } else {
    // JavaScript and TypeScript use the same extractor
    // Cast to any to handle type mismatch between tree-sitter and web-tree-sitter
    extractJSSymbols(
      tree.rootNode as any,
      code,
      filePath,
      symbols,
      null,
      normalizedOptions,
    );
  }

  return symbols;
}

/**
 * Extract all symbol usages from code using language-appropriate AST parser.
 * Routes to Python or JavaScript/TypeScript extractor based on language parameter.
 *
 * This function handles parser initialization and AST parsing internally. It filters
 * out imported symbols to avoid false positives (imported symbols are validated separately).
 *
 * @param code - The source code string to analyze
 * @param language - Programming language ('python', 'javascript', 'typescript')
 * @param imports - Array of import statements to build the external symbols set
 * @returns Array of extracted symbol usages
 *
 * @example
 * ```typescript
 * const imports = extractImportsAST(code, 'typescript');
 * const usages = extractUsagesAST(code, 'typescript', imports);
 * console.log(usages); // [{ name: 'myFunc', type: 'call', ... }]
 * ```
 */
export function extractUsagesAST(
  code: string,
  language: string,
  imports: ASTImport[],
): ASTUsage[] {
  const parser = getParser(language);
  const tree = parser.parse(code);
  const usages: ASTUsage[] = [];

  // Build set of ALL imported symbols to skip (both external AND internal)
  // We skip internal imports because they're explicitly imported from project files
  // and will be validated separately via the project context
  const importedSymbols = new Set<string>();
  for (const imp of imports) {
    for (const name of imp.names) {
      importedSymbols.add(name.local);
    }
  }

  if (language === "python") {
    extractPythonUsages(tree.rootNode, code, usages, importedSymbols);
  } else {
    // JavaScript and TypeScript use the same extractor
    // Cast to any to handle type mismatch between tree-sitter and web-tree-sitter
    extractJSUsages(tree.rootNode as any, code, usages, importedSymbols);
  }

  return usages;
}

/**
 * Extract all import statements from code using language-appropriate AST parser.
 * Routes to Python or JavaScript/TypeScript extractor based on language parameter.
 *
 * This function handles parser initialization and AST parsing internally, providing
 * a simple interface for extracting import statements.
 *
 * @param code - The source code string to analyze
 * @param language - Programming language ('python', 'javascript', 'typescript')
 * @returns Array of extracted import statements
 *
 * @example
 * ```typescript
 * const imports = extractImportsAST('import { foo } from "bar"', 'typescript');
 * console.log(imports); // [{ module: 'bar', names: [{ imported: 'foo', local: 'foo' }], ... }]
 * ```
 */
export function extractImportsAST(code: string, language: string): ASTImport[] {
  const parser = getParser(language);
  const tree = parser.parse(code);
  const imports: ASTImport[] = [];

  if (language === "python") {
    extractPythonImports(tree.rootNode, code, imports);
  } else {
    // JavaScript and TypeScript use the same extractor
    // Cast to any to handle type mismatch between tree-sitter and web-tree-sitter
    extractJSImports(tree.rootNode as any, code, imports);
  }

  return imports;
}

/**
 * Extract all type references from code using language-appropriate AST parser.
 * Routes to Python or JavaScript/TypeScript extractor based on language parameter.
 *
 * This function handles parser initialization and AST parsing internally. Type references
 * include type annotations, generic parameters, return types, class inheritance, and more.
 *
 * Type references include:
 * - Type annotations on parameters and variables
 * - Generic type parameters
 * - Return type annotations
 * - Class inheritance (extends/implements)
 * - Property type annotations in interfaces/types
 *
 * @param code - The source code string to analyze
 * @param language - Programming language ('python', 'javascript', 'typescript')
 * @returns Array of extracted type references
 *
 * @example
 * ```typescript
 * const typeRefs = extractTypeReferencesAST('function foo(): MyType {}', 'typescript');
 * console.log(typeRefs); // [{ name: 'MyType', context: 'returnType', ... }]
 * ```
 */
export function extractTypeReferencesAST(
  code: string,
  language: string,
): ASTTypeReference[] {
  const parser = getParser(language);
  const tree = parser.parse(code);
  const references: ASTTypeReference[] = [];

  if (language === "python") {
    extractPythonTypeReferences(tree.rootNode, code, references);
  } else {
    // JavaScript and TypeScript use the same extractor
    // Cast to any to handle type mismatch between tree-sitter and web-tree-sitter
    extractJSTypeReferences(tree.rootNode as any, code, references);
  }

  return references;
}
