/**
 * Symbol Table Builder (AST-based)
 *
 * NOTE: This file is intentionally separate from the validation pipeline.
 * The flagship validator uses [`src/tools/validation/extractors/index.ts`](src/tools/validation/extractors/index.ts)
 * + project context indexing.
 *
 * This module provides a lightweight, snippet-level symbol table used by
 * legacy analyzers/tests (e.g. type consistency heuristics).
 *
 * @format
 */

import { SymbolTable } from "../types/tools.js";
import { logger } from "../utils/logger.js";
import {
  extractSymbolsAST,
  extractImportsAST,
} from "../tools/validation/extractors/index.js";

/**
 * Build symbol table from codebase
 */
export async function buildSymbolTable(
  codebase: string,
  language: string,
): Promise<SymbolTable> {
  logger.debug(`Building symbol table for ${language}...`);

  const symbolTable: SymbolTable = {
    functions: [],
    classes: [],
    interfaces: [],
    variables: [],
    imports: [],
    dependencies: [],
  };

  try {
    switch (language) {
      case "javascript":
      case "typescript":
        return await buildJavaScriptSymbolTable(codebase, language);
      case "python":
        return await buildPythonSymbolTable(codebase);
      case "go":
        return await buildGoSymbolTable(codebase);
      default:
        logger.warn(
          `Symbol table building not fully implemented for ${language}`,
        );
        return symbolTable;
    }
  } catch (error) {
    logger.error("Error building symbol table:", error);
    return symbolTable;
  }
}

/**
 * Build symbol table for JavaScript/TypeScript using Tree-sitter AST extractors.
 *
 * This replaces legacy regex patterns (which were prone to false positives in
 * comments/strings and missed destructuring/object-literal methods).
 */
async function buildJavaScriptSymbolTable(
  code: string,
  language: "javascript" | "typescript",
): Promise<SymbolTable> {
  const functions = new Set<string>();
  const classes = new Set<string>();
  const interfaces = new Set<string>();
  const variables = new Set<string>();
  const imports = new Set<string>();

  // 1) Symbols (AST)
  const symbols = extractSymbolsAST(code, "", language);
  for (const sym of symbols) {
    switch (sym.type) {
      case "function":
      case "method":
        functions.add(sym.name);
        break;
      case "class":
        classes.add(sym.name);
        break;
      case "interface":
      case "type":
        interfaces.add(sym.name);
        break;
      case "variable":
        variables.add(sym.name);
        break;
    }
  }

  // 2) Imports (AST)
  const astImports = extractImportsAST(code, language);
  for (const imp of astImports) {
    if (imp.module) imports.add(imp.module);
  }

  logger.debug(
    `Found ${functions.size} functions, ${classes.size} classes, ${interfaces.size} interfaces (AST-based)`,
  );

  return {
    functions: Array.from(functions),
    classes: Array.from(classes),
    interfaces: Array.from(interfaces),
    variables: Array.from(variables),
    imports: Array.from(imports),
    dependencies: [],
    classFields: {},
  };
}

/**
 * Build symbol table for Python - ENHANCED
 */
async function buildPythonSymbolTable(code: string): Promise<SymbolTable> {
  const functions = new Set<string>();
  const classes = new Set<string>();
  const variables = new Set<string>();
  const imports = new Set<string>();

  // 1) Symbols (AST)
  const symbols = extractSymbolsAST(code, "", "python");
  for (const sym of symbols) {
    switch (sym.type) {
      case "function":
      case "method":
        functions.add(sym.name);
        break;
      case "class":
        classes.add(sym.name);
        break;
      case "variable":
        variables.add(sym.name);
        break;
    }
  }

  // 2) Imports (AST) - normalize to base package (matches validator logic)
  const astImports = extractImportsAST(code, "python");
  for (const imp of astImports) {
    const base = imp.module?.split(".")[0];
    if (base) imports.add(base);
  }

  logger.debug(`Found ${functions.size} functions, ${classes.size} classes (AST-based)`);

  // For Python we also expose classFields for class attributes if present
  const classFields: Record<string, string[]> = {};
  for (const sym of symbols) {
    if (sym.type === "variable" && sym.scope) {
      if (!classFields[sym.scope]) classFields[sym.scope] = [];
      classFields[sym.scope].push(sym.name);
    }
  }

  return {
    functions: Array.from(functions),
    classes: Array.from(classes),
    variables: Array.from(variables),
    imports: Array.from(imports),
    dependencies: [],
    classFields,
  };
}

/**
 * Build symbol table for Go
 */
async function buildGoSymbolTable(code: string): Promise<SymbolTable> {
  const symbolTable: SymbolTable = {
    functions: [],
    classes: [],
    variables: [],
    imports: [],
    dependencies: [],
  };

  // Extract functions
  const functionPattern = /func\s+(\w+)\s*\(/g;
  let match;
  while ((match = functionPattern.exec(code)) !== null) {
    symbolTable.functions.push(match[1]);
  }

  // Extract structs (Go's equivalent of classes)
  const structPattern = /type\s+(\w+)\s+struct/g;
  while ((match = structPattern.exec(code)) !== null) {
    symbolTable.classes.push(match[1]);
  }

  // Extract imports
  const importPattern = /import\s+.*?["']([^"']+)["']/g;
  while ((match = importPattern.exec(code)) !== null) {
    symbolTable.imports.push(match[1]);
  }

  logger.debug(
    `Found ${symbolTable.functions.length} functions, ${symbolTable.classes.length} structs`,
  );

  return symbolTable;
}
