/**
 * AST-Based Unused Local Detection
 *
 * This module provides superior dead code detection using AST parsing instead of regex.
 * It properly handles:
 * - All naming conventions (camelCase, PascalCase, UPPER_SNAKE_CASE)
 * - Both JavaScript/TypeScript AND Python
 * - Exported vs non-exported symbols
 * - Local function declarations, const/let/var, and Python def
 * - React hooks and framework patterns
 *
 * @format
 */

import type { DeadCodeIssue } from "./types.js";
import {
  extractSymbolsAST,
  extractUsagesAST,
  extractImportsAST,
  collectLocalDefinitionsAST,
} from "./extractors/index.js";
import { getParser } from "./parser.js";
import { logger } from "../../utils/logger.js";

/**
 * Detect unused local functions and variables within a single file using AST parsing.
 * This is the AST-based replacement for the regex-based detectUnusedLocals.
 *
 * Advantages over regex approach:
 * - Handles all naming conventions (camelCase, PascalCase, UPPER_SNAKE_CASE)
 * - Properly distinguishes exported vs non-exported symbols
 * - Accurate line numbers from AST
 * - Works for both JS/TS and Python with proper language support
 * - Understands scope (won't flag parameters as unused when they're used in function body)
 *
 * @param code - The source code string to analyze
 * @param filePath - Path to the file (used to determine language from extension)
 * @returns Array of dead code issues found
 */
export function detectUnusedLocalsAST(code: string, filePath: string): DeadCodeIssue[] {
  const issues: DeadCodeIssue[] = [];

  // Detect language from file extension
  const language = detectFileLanguage(filePath);
  if (language === "unknown") {
    logger.debug(`Unknown language for file: ${filePath}`);
    return issues;
  }

  try {
    // Step 1: Extract all symbol definitions from the file
    const symbols = extractSymbolsAST(code, filePath, language);

    // Step 2: Extract all imports (to identify external symbols)
    const imports = extractImportsAST(code, language);
    const importedNames = new Set<string>();
    for (const imp of imports) {
      for (const name of imp.names) {
        importedNames.add(name.local);
        // For Python dotted imports, also add base module
        if (language === "python" && name.local.includes(".")) {
          importedNames.add(name.local.split(".")[0]);
        }
      }
    }

    // Step 3: Collect all locally-defined names (params, destructured vars, etc.)
    // This prevents false positives on function parameters
    const localDefinitions = collectLocalDefinitionsAST(code, language);

    // Step 4: Extract all symbol usages (cross-file focused)
    const usages = extractUsagesAST(code, language, imports);
    const usedNames = new Set<string>();
    for (const usage of usages) {
      usedNames.add(usage.name);
    }

    // Step 4b: Build a comprehensive set of ALL identifier references in the file.
    // extractUsagesAST only tracks cross-file symbol usages (for hallucination detection),
    // so we need our own set that includes local references like `resolve` in
    // `new Promise(resolve => setTimeout(resolve, ms))` and `ProtectedComponent` in
    // `return function ProtectedComponent(props) {...}`.
    if (language === "typescript" || language === "javascript") {
      try {
        const parser = getParser(language);
        const tree = parser.parse(code)!;
        const collectRefs = (node: any) => {
          if (!node) return;
          if (node.type === "identifier" || node.type === "property_identifier" || node.type === "type_identifier") {
            const parentType = node.parent?.type;
            // Skip declaration positions (variable_declarator name, function declaration name)
            const isDecl =
              (parentType === "variable_declarator" && node.parent?.childForFieldName?.("name")?.id === node.id) ||
              ((parentType === "function_declaration" || parentType === "method_definition") &&
                node.parent?.childForFieldName?.("name")?.id === node.id);
            if (!isDecl) {
              const text = node.text || code.slice(node.startIndex, node.endIndex);
              if (text) usedNames.add(text);
            }
          }
          if (node.children) {
            for (const child of node.children) collectRefs(child);
          }
        };
        collectRefs(tree.rootNode);
      } catch {
        // Best-effort
      }
    }

    // Step 5: Check each local symbol to see if it's used
    for (const sym of symbols) {
      // Skip exported symbols - they may be used by other files
      if (sym.isExported) continue;

      // Skip class/object methods and properties — they are NOT locals.
      // They are accessed via their parent instance (e.g., spoonacularService.getRecipeDetails())
      // and their usage is cross-file, not detectable by single-file analysis.
      // Also skip ALL method-type symbols regardless of scope — they are always properties
      // of an object literal (e.g., { queryFn: async () => {...} } inside useQuery()),
      // consumed by the parent object, not standalone locals.
      if (sym.type === "method") continue;
      // For scoped symbols: skip class methods/properties (scope = class name),
      // but DO check function-scoped variables/functions in JS/TS (e.g., arrow functions
      // inside React components like `const refreshInventoryLegacy = () => {...}` inside Inventory).
      // These are local to the component and should be flagged if unused.
      if (sym.scope && language === "python") continue; // Python scoped symbols are class methods
      if (sym.scope && (language === "typescript" || language === "javascript")) {
        // In JS/TS, only skip if the symbol is a class method (not a function-scoped local)
        // Class methods have scope = class name and are extracted from class_declaration/class bodies
        // Function-scoped locals (inside React components) should still be checked
        const scopeDefs = symbols.filter(s => s.name === sym.scope);
        const scopeIsClass = scopeDefs.some(s => s.type === "class");
        if (scopeIsClass) continue;
      }

      // Python: Skip ALL module-level functions and classes.
      // In Python, there is no `export` keyword — all module-level functions and classes
      // are implicitly part of the module's public API and can be imported by other modules.
      // Single-file analysis cannot determine if they're used elsewhere.
      // Additionally, decorated functions (FastAPI routes, event handlers, etc.) are consumed
      // by the framework at runtime and won't appear as local references.
      // This is fundamentally different from JS/TS where `export` is explicit.
      if (language === "python" && (sym.type === "function" || sym.type === "class")) continue;

      // Skip imported symbols
      if (importedNames.has(sym.name)) continue;

      // Skip React hooks and common framework patterns
      if (shouldSkipFrameworkPattern(sym.name)) continue;

      // Skip variable-type symbols that are local definitions (function params,
      // destructured vars, catch clause vars, etc.) — these are inner-scope
      // variables, not top-level locals worth flagging. We only skip "variable"
      // types to preserve detection of unused function declarations.
      if (sym.type === "variable" && localDefinitions.has(sym.name)) continue;
      if (isParameterSymbol(sym, code, language)) continue;

      // Check if the symbol is used
      const isUsed = usedNames.has(sym.name);

      if (!isUsed) {
        const issueType = sym.type === "function" ? "unusedFunction" : "unusedExport";
        const displayType = sym.type === "function" ? "Function" : "Variable";

        issues.push({
          type: issueType,
          severity: "medium",
          name: sym.name,
          file: filePath,
          line: sym.line,
          message: `${displayType} '${sym.name}' is defined but never used in this file`,
        });
      }
    }

    // Step 6: Check for unused local definitions (const/let/var that aren't in symbols)
    // This catches variables that might not be detected as symbols
    const unusedLocals = findUnusedLocalDefinitions(code, filePath, language, usedNames, importedNames);
    issues.push(...unusedLocals);

  } catch (error) {
    logger.warn(`Error analyzing unused locals in ${filePath}:`, error);
  }

  return issues;
}

/**
 * Detect file language from extension
 */
function detectFileLanguage(filePath: string): string {
  const ext = filePath.toLowerCase().split(".").pop();
  switch (ext) {
    case "ts":
    case "tsx":
      return "typescript";
    case "js":
    case "jsx":
    case "mjs":
    case "cjs":
      return "javascript";
    case "py":
      return "python";
    default:
      return "unknown";
  }
}

/**
 * Check if a symbol should be skipped due to framework patterns
 */
export function shouldSkipFrameworkPattern(name: string): boolean {
  // React hooks
  if (name.startsWith("use") && name.length > 3 && /[A-Z]/.test(name[3])) {
    return false; // Actually check these - they might be custom hooks
  }

  // Common framework patterns that are often auto-used
  const skipPatterns = [
    "default",
    "constructor",
    "render",
    "componentDidMount",
    "componentWillUnmount",
    "getStaticProps",
    "getServerSideProps",
  ];

  return skipPatterns.includes(name);
}

/**
 * Check if a symbol is a function parameter (not a top-level definition)
 */
function isParameterSymbol(sym: any, code: string, language: string): boolean {
  // This is a heuristic - if the symbol type suggests it's a parameter, skip it
  // The extractSymbolsAST should handle this, but we double-check here
  return false; // Let the extractor handle this
}

/**
 * Find unused local variable definitions that might not be in the symbol table
 * This catches const/let/var declarations using AST parsing
 */
function findUnusedLocalDefinitions(
  code: string,
  filePath: string,
  language: string,
  usedNames: Set<string>,
  importedNames: Set<string>,
): DeadCodeIssue[] {
  const issues: DeadCodeIssue[] = [];

  if (language !== "typescript" && language !== "javascript") {
    return issues; // Python is handled by extractSymbolsAST
  }

  try {
    const parser = getParser(language);
    const tree = parser.parse(code)!;

    // Build a comprehensive set of ALL identifier references in the file.
    // extractUsagesAST only tracks cross-file symbol usages (for hallucination detection),
    // so we need our own set that includes local references like `validAisles.includes(...)`.
    const allReferences = new Set<string>();
    function collectReferences(node: any) {
      if (!node) return;
      // Collect identifiers that are NOT in declaration positions
      if (node.type === "identifier" || node.type === "property_identifier" || node.type === "type_identifier") {
        const parentType = node.parent?.type;
        // Skip if this is the NAME side of a variable_declarator (declaration, not usage)
        const isDeclarationName =
          parentType === "variable_declarator" && node.parent?.childForFieldName?.("name")?.id === node.id;
        // Skip if this is a function/method declaration name
        const isFuncDeclName =
          (parentType === "function_declaration" || parentType === "method_definition") &&
          node.parent?.childForFieldName?.("name")?.id === node.id;
        if (!isDeclarationName && !isFuncDeclName) {
          const text = node.text || getNodeText(node, code);
          if (text) allReferences.add(text);
        }
      }
      if (node.children) {
        for (const child of node.children) {
          collectReferences(child);
        }
      }
    }
    collectReferences(tree.rootNode);

    // Merge with usedNames from extractUsagesAST
    const combinedUsed = new Set([...usedNames, ...allReferences]);

    // Only check MODULE-LEVEL variable declarations (direct children of program).
    // Variables inside function/method bodies are local to that scope and their
    // usage is NOT tracked by extractUsagesAST (which focuses on cross-file symbols).
    // Recursing into function bodies would produce massive false positives
    // (e.g., `const where = {}` inside an Express handler).
    const root = tree.rootNode;
    for (const topNode of root.children) {
      // Handle both direct declarations and export_statement wrappers
      const declNode =
        (topNode.type === "lexical_declaration" || topNode.type === "variable_declaration")
          ? topNode
          : (topNode.type === "export_statement"
              ? topNode.children?.find((c: any) => c.type === "lexical_declaration" || c.type === "variable_declaration")
              : null);

      if (!declNode) continue;

      const isExported = declNode.parent?.type === "export_statement";

      for (const child of declNode.children) {
        if (child.type === "variable_declarator") {
          const nameNode = child.childForFieldName?.("name");

          if (nameNode && nameNode.type === "identifier") {
            const name = nameNode.text || getNodeText(nameNode, code);
            const line = nameNode.startPosition?.row + 1 || 1;

            // Skip if exported
            if (isExported) continue;

            // Skip if used (check both cross-file usages and local references)
            if (combinedUsed.has(name)) continue;

            // Skip if imported
            if (importedNames.has(name)) continue;

            // Skip if it starts with _ (intentionally unused)
            if (name.startsWith("_")) continue;

            // Skip React hooks (useXxx)
            if (name.startsWith("use") && name.length > 3 && /[A-Z]/.test(name[3])) continue;

            // Check if this is a function assignment (already handled by extractSymbolsAST)
            const valueNode = child.childForFieldName?.("value");
            if (valueNode && (
              valueNode.type === "arrow_function" ||
              valueNode.type === "function" ||
              valueNode.type === "function_expression"
            )) {
              // Already handled by extractSymbolsAST
              continue;
            }

            // This is an unused variable
            issues.push({
              type: "unusedExport",
              severity: "medium",
              name,
              file: filePath,
              line,
              message: `Variable '${name}' is defined but never used in this file`,
            });
          }
        }
      }
    }

  } catch (error) {
    logger.debug(`Error in findUnusedLocalDefinitions for ${filePath}:`, error);
  }

  return issues;
}

/**
 * Get text from an AST node
 */
function getNodeText(node: any, code: string): string {
  if (node.text) return node.text;
  if (node.startIndex !== undefined && node.endIndex !== undefined) {
    return code.slice(node.startIndex, node.endIndex);
  }
  return "";
}

/**
 * Backwards-compatible wrapper that uses AST-based detection
 * This replaces the old regex-based detectUnusedLocals
 */
export function detectUnusedLocals(code: string, filePath: string): DeadCodeIssue[] {
  // Use the new AST-based implementation
  return detectUnusedLocalsAST(code, filePath);
}
