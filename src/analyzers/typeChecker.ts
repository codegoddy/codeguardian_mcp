/**
 * Type Consistency Checker
 *
 * Validates type consistency in AI-generated code
 *
 * @format
 */

import { SymbolTable, Issue } from "../types/tools.js";
import { logger } from "../utils/logger.js";
import { extractTypeReferencesAST } from "../tools/validation/extractors/index.js";
import { getParser } from "../tools/validation/parser.js";

/**
 * Check type consistency in new code
 */
export async function checkTypeConsistency(
  newCode: string,
  symbolTable: SymbolTable,
  language: string,
): Promise<Issue[]> {
  logger.debug("Checking type consistency...");

  const issues: Issue[] = [];

  // Only perform detailed type checking for TypeScript
  if (language !== "typescript") {
    logger.debug("Type checking only fully supported for TypeScript");
    return issues;
  }

  try {
    // Check for common type issues in TypeScript (AST-based)

    // 1) 'any' type usage in type positions
    issues.push(...detectAnyTypeUsageAST(newCode));

    // 2) Missing explicit return types on named functions/methods
    issues.push(...detectMissingReturnTypesAST(newCode));

    // 3) Implicit-any parameters on named functions/methods
    issues.push(...detectImplicitAnyParamsAST(newCode));

    // 4. Check for non-existent type references (AST-based)
    const typeReferences = extractTypeReferencesFromAST(newCode);
    for (const typeRef of typeReferences) {
      const existsInSymbolTable =
        symbolTable.classes.includes(typeRef.name) ||
        symbolTable.interfaces?.includes(typeRef.name) ||
        isBuiltInType(typeRef.name);

      if (!existsInSymbolTable) {
        issues.push({
          type: "nonExistentType",
          severity: "high",
          message: `Type '${typeRef.name}' does not exist in codebase`,
          line: typeRef.line,
          column: typeRef.column,
          code: typeRef.code,
          suggestion: `Available types: ${getAvailableTypes(symbolTable).join(", ") || "none found"}`,
          confidence: 85,
        });
      }
    }

    // 5. Check for property access hallucinations (AST-based)
    const propertyAccesses = extractPropertyAccessesAST(newCode, symbolTable);
    for (const access of propertyAccesses) {
      issues.push({
        type: "nonExistentProperty",
        severity: "high",
        message: `Property '${access.property}' does not exist on '${access.object}'`,
        line: access.line,
        column: access.column,
        code: access.code,
        suggestion: `Check available properties on ${access.object}`,
        confidence: 70,
      });
    }

    logger.debug(`Found ${issues.length} type consistency issues`);
  } catch (error) {
    logger.error("Error checking type consistency:", error);
  }

  return issues;
}

// ============================================================================
// AST-based TypeScript checks (regex migrations)
// ============================================================================

function getLineTextByLineNumber(code: string, line: number): string {
  const lines = code.split("\n");
  return lines[line - 1] || "";
}

function detectAnyTypeUsageAST(code: string): Issue[] {
  const issues: Issue[] = [];
  const parser = getParser("typescript");
  const tree = parser.parse(code)!;
  const root: any = tree.rootNode;

  const getText = (node: { startIndex: number; endIndex: number }) =>
    code.slice(node.startIndex, node.endIndex);

  const isTypeContext = (node: any): boolean => {
    let cur: any = node;
    for (let i = 0; i < 8 && cur; i++) {
      if (
        cur.type === "type_annotation" ||
        cur.type === "return_type" ||
        cur.type === "type_alias_declaration" ||
        cur.type === "interface_declaration" ||
        cur.type === "extends_clause" ||
        cur.type === "implements_clause" ||
        cur.type === "generic_type" ||
        cur.type === "type_arguments" ||
        cur.type === "type_parameter" ||
        cur.type === "mapped_type_clause" ||
        cur.type === "as_expression"
      ) {
        return true;
      }
      cur = cur.parent;
    }
    return false;
  };

  const visit = (node: any) => {
    if (!node) return;

    // Tree-sitter TS represents `any` as a predefined type in type positions.
    if (node.type === "predefined_type") {
      const t = getText(node);
      if (t === "any" && isTypeContext(node)) {
        const line = node.startPosition?.row + 1 || 0;
        issues.push({
          type: "typeMismatch",
          severity: "medium",
          message: "Usage of 'any' type defeats TypeScript's type safety",
          line,
          column: node.startPosition?.column || 0,
          code: getLineTextByLineNumber(code, line).trim(),
          suggestion: "Use a specific type instead of any",
          confidence: 100,
        });
      }
    }

    for (const child of node.children || []) {
      visit(child);
    }
  };

  visit(root);
  return issues;
}

function detectMissingReturnTypesAST(code: string): Issue[] {
  const issues: Issue[] = [];
  const parser = getParser("typescript");
  const tree = parser.parse(code)!;
  const root: any = tree.rootNode;

  const getText = (node: { startIndex: number; endIndex: number }) =>
    code.slice(node.startIndex, node.endIndex);

  const getFunctionName = (node: any): string | null => {
    if (!node) return null;
    if (node.type === "function_declaration") {
      const nameNode = node.childForFieldName?.("name");
      return nameNode ? getText(nameNode) : null;
    }
    if (node.type === "method_definition") {
      const nameNode = node.childForFieldName?.("name");
      if (!nameNode) return null;
      const name = getText(nameNode);
      if (name === "constructor") return null;
      return name;
    }
    if (node.type === "arrow_function" || node.type === "function" || node.type === "function_expression") {
      const parent = node.parent;
      if (parent?.type === "variable_declarator") {
        const nameNode = parent.childForFieldName?.("name");
        if (nameNode?.type === "identifier") return getText(nameNode);
      }
    }
    return null;
  };

  const hasReturnType = (node: any): boolean => {
    // Common field name on TS nodes
    if (node.childForFieldName?.("return_type")) return true;
    // Some grammars attach return type as a named child
    return (node.children || []).some((c: any) => c?.type === "return_type");
  };

  const visit = (node: any) => {
    if (!node) return;

    const isFunctionLike =
      node.type === "function_declaration" ||
      node.type === "method_definition" ||
      node.type === "arrow_function" ||
      node.type === "function" ||
      node.type === "function_expression";

    if (isFunctionLike) {
      const name = getFunctionName(node);
      if (name && !hasReturnType(node)) {
        const line = node.startPosition?.row + 1 || 0;
        issues.push({
          type: "missingReturnType",
          severity: "low",
          message: "Function missing explicit return type",
          line,
          column: node.startPosition?.column || 0,
          code: getLineTextByLineNumber(code, line).trim(),
          suggestion: "Add explicit return type annotation",
          confidence: 80,
        });
      }
    }

    for (const child of node.children || []) {
      visit(child);
    }
  };

  visit(root);
  return issues;
}

function detectImplicitAnyParamsAST(code: string): Issue[] {
  const issues: Issue[] = [];
  const parser = getParser("typescript");
  const tree = parser.parse(code)!;
  const root: any = tree.rootNode;

  const getText = (node: { startIndex: number; endIndex: number }) =>
    code.slice(node.startIndex, node.endIndex);

  const getFunctionNameForParams = (node: any): string | null => {
    if (!node) return null;
    if (node.type === "function_declaration") {
      const nameNode = node.childForFieldName?.("name");
      return nameNode ? getText(nameNode) : null;
    }
    if (node.type === "method_definition") {
      const nameNode = node.childForFieldName?.("name");
      if (!nameNode) return null;
      const name = getText(nameNode);
      if (name === "constructor") return null;
      return name;
    }
    if (node.type === "arrow_function" || node.type === "function" || node.type === "function_expression") {
      const parent = node.parent;
      if (parent?.type === "variable_declarator") {
        const nameNode = parent.childForFieldName?.("name");
        if (nameNode?.type === "identifier") return getText(nameNode);
      }
    }
    return null;
  };

  const paramsHaveTypeAnnotation = (paramNode: any): boolean => {
    if (!paramNode) return false;
    if (paramNode.childForFieldName?.("type")) return true;
    // tree-sitter-typescript commonly uses `type_annotation` nodes
    const stack: any[] = [paramNode];
    while (stack.length) {
      const n = stack.pop();
      if (!n) continue;
      if (n.type === "type_annotation") return true;
      // Avoid walking into default value expressions too deeply
      for (const c of n.children || []) {
        stack.push(c);
      }
    }
    return false;
  };

  const visit = (node: any) => {
    if (!node) return;

    const isFunctionLike =
      node.type === "function_declaration" ||
      node.type === "method_definition" ||
      node.type === "arrow_function" ||
      node.type === "function" ||
      node.type === "function_expression";

    if (isFunctionLike) {
      const funcName = getFunctionNameForParams(node);
      if (funcName) {
        const paramsNode = node.childForFieldName?.("parameters") || node.childForFieldName?.("parameter");
        if (paramsNode) {
          // Consider children that are parameters (identifier / required_parameter / optional_parameter / rest_pattern)
          for (const child of paramsNode.children || []) {
            const patternNode = child.childForFieldName?.("pattern") || child;
            if (patternNode?.type === "identifier") {
              if (!paramsHaveTypeAnnotation(child)) {
                const line = patternNode.startPosition?.row + 1 || 0;
                issues.push({
                  type: "implicitAny",
                  severity: "medium",
                  message: "Parameter has implicit any type",
                  line,
                  column: patternNode.startPosition?.column || 0,
                  code: getLineTextByLineNumber(code, line).trim(),
                  suggestion: "Add type annotation to parameter",
                  confidence: 75,
                });
              }
            }
          }
        }
      }
    }

    for (const child of node.children || []) {
      visit(child);
    }
  };

  visit(root);
  return issues;
}

/**
 * Extract type references from code using Tree-sitter extractor.
 */
function extractTypeReferencesFromAST(code: string): Array<{
  name: string;
  line: number;
  column: number;
  code: string;
}> {
  const refs: Array<{ name: string; line: number; column: number; code: string }> = [];
  const typeRefs = extractTypeReferencesAST(code, "typescript");
  const lines = code.split("\n");

  for (const ref of typeRefs) {
    const lineText = lines[ref.line - 1] || "";
    // Best-effort column: first occurrence of the type name in the line.
    const col = Math.max(0, lineText.indexOf(ref.name));
    if (!isKeyword(ref.name, "typescript") && ref.name.length > 1) {
      refs.push({
        name: ref.name,
        line: ref.line,
        column: col,
        code: lineText.trim(),
      });
    }
  }

  return refs;
}

/**
 * Extract property accesses from code using Tree-sitter.
 *
 * We intentionally only emit accesses for *simple* object identifiers.
 * This matches the original heuristic intent while avoiding regex false positives
 * in strings/comments.
 */
function extractPropertyAccessesAST(
  code: string,
  symbolTable: SymbolTable,
): Array<{
  object: string;
  property: string;
  line: number;
  column: number;
  code: string;
}> {
  const accesses: Array<{ object: string; property: string; line: number; column: number; code: string }> = [];
  const parser = getParser("typescript");
  const tree = parser.parse(code)!;
  const root = tree.rootNode;
  const lines = code.split("\n");

  const getText = (node: { startIndex: number; endIndex: number }) =>
    code.slice(node.startIndex, node.endIndex);

  const unwrapParens = (node: any): any => {
    if (!node) return node;
    if (node.type !== "parenthesized_expression") return node;
    // ( expr )
    for (const c of node.children || []) {
      if (c.type !== "(" && c.type !== ")") return c;
    }
    return node;
  };

  const visit = (node: any) => {
    if (!node) return;

    if (node.type === "member_expression") {
      const objNode = unwrapParens(node.childForFieldName?.("object"));
      const propNode = node.childForFieldName?.("property");

      if (objNode && propNode) {
        // Only treat simple identifiers as "objects" for this heuristic.
        if (objNode.type === "identifier") {
          const objectName = getText(objNode);
          const propertyName = getText(propNode);
          const line = node.startPosition?.row + 1 || 0;

          if (!isBuiltInObject(objectName) &&
              !isReturnObject(objectName) &&
              !isKnownProperty(objectName, propertyName, symbolTable) &&
              symbolTable.variables.includes(objectName)) {
            accesses.push({
              object: objectName,
              property: propertyName,
              line,
              column: propNode.startPosition?.column || 0,
              code: (lines[line - 1] || "").trim(),
            });
          }
        }
      }
    }

    for (const child of node.children || []) {
      visit(child);
    }
  };

  visit(root);
  return accesses;
}

/**
 * Check if object name is a common return variable name
 */
function isReturnObject(name: string): boolean {
  const returnNames = [
    "result",
    "data",
    "response",
    "res",
    "output",
    "value",
    "item",
    "obj",
    "profile",
    "session",
    "token",
  ];
  return returnNames.includes(name.toLowerCase());
}

/**
 * Check if a type is built-in
 */
function isBuiltInType(name: string): boolean {
  const builtInTypes = [
    "string",
    "number",
    "boolean",
    "void",
    "null",
    "undefined",
    "any",
    "unknown",
    "never",
    "object",
    "Array",
    "Function",
    "Promise",
    "Date",
    "RegExp",
    "Error",
    "Map",
    "Set",
    "WeakMap",
    "WeakSet",
    "JSON",
    "Math",
    "URL",
    "URLSearchParams",
    "FormData",
    "Blob",
    "Response",
    "Request",
    "Headers",
    "ReadonlyArray",
    "Partial",
    "Required",
    "Pick",
    "Omit",
    "Record",
    "Exclude",
    "Extract",
  ];
  return builtInTypes.includes(name);
}

/**
 * Check if an object is built-in
 */
function isBuiltInObject(name: string): boolean {
  const builtInObjects = [
    "console",
    "Math",
    "JSON",
    "Date",
    "Array",
    "Object",
    "String",
    "Number",
    "Boolean",
    "Promise",
    "Map",
    "Set",
    "WeakMap",
    "WeakSet",
    "URL",
    "URLSearchParams",
    "FormData",
    "Blob",
    "localStorage",
    "sessionStorage",
    "document",
    "window",
    "navigator",
  ];
  return builtInObjects.includes(name);
}

/**
 * Check if a property is known for an object
 */
function isKnownProperty(
  object: string,
  property: string,
  _symbolTable: SymbolTable,
): boolean {
  // This is a simplified check. In a full implementation, we would
  // track type definitions and their properties
  const knownProperties: Record<string, string[]> = {
    user: ["id", "name", "email"],
    config: ["port", "host", "environment"],
    request: ["headers", "body", "method", "url"],
    response: ["status", "data", "headers"],
  };

  const lowerObject = object.toLowerCase();
  for (const [key, props] of Object.entries(knownProperties)) {
    if (lowerObject.includes(key) && props.includes(property)) {
      return true;
    }
  }

  return false;
}

/**
 * Get available types from symbol table
 */
function getAvailableTypes(symbolTable: SymbolTable): string[] {
  return [
    ...symbolTable.classes,
    ...(symbolTable.interfaces || []),
    "string",
    "number",
    "boolean",
    "void",
    "Array",
    "Object",
    "Promise",
  ];
}

/**
 * Check if a name is a language keyword
 */
function isKeyword(name: string, language: string): boolean {
  const keywords: Record<string, string[]> = {
    javascript: [
      "if",
      "else",
      "for",
      "while",
      "return",
      "function",
      "const",
      "let",
      "var",
      "class",
      "new",
      "this",
      "typeof",
      "instanceof",
    ],
    typescript: [
      "if",
      "else",
      "for",
      "while",
      "return",
      "function",
      "const",
      "let",
      "var",
      "class",
      "new",
      "this",
      "typeof",
      "instanceof",
      "interface",
      "type",
    ],
    python: [
      "if",
      "elif",
      "else",
      "for",
      "while",
      "return",
      "def",
      "class",
      "import",
      "from",
      "as",
      "with",
      "lambda",
      "yield",
    ],
    go: [
      "if",
      "else",
      "for",
      "return",
      "func",
      "type",
      "struct",
      "interface",
      "go",
      "defer",
      "range",
      "var",
      "const",
    ],
  };

  return keywords[language]?.includes(name) || false;
}
