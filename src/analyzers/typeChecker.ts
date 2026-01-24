/**
 * Type Consistency Checker
 *
 * Validates type consistency in AI-generated code
 *
 * @format
 */

import { SymbolTable, Issue } from "../types/tools.js";
import { logger } from "../utils/logger.js";

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
    // Check for common type issues in TypeScript

    // 1. Check for 'any' type usage (AI often uses this)
    const anyPattern = /:\s*any\b/g;
    const lines = newCode.split("\n");

    lines.forEach((line, index) => {
      if (anyPattern.test(line)) {
        issues.push({
          type: "typeMismatch",
          severity: "medium",
          message: "Usage of 'any' type defeats TypeScript's type safety",
          line: index + 1,
          column: line.indexOf("any"),
          code: line.trim(),
          suggestion: "Use a specific type instead of any",
          confidence: 100,
        });
      }
    });

    // 2. Check for missing return types on functions
    const funcWithoutReturnType =
      /function\s+\w+\([^)]*\)\s*{|const\s+\w+\s*=\s*\([^)]*\)\s*=>/g;
    lines.forEach((line, index) => {
      if (funcWithoutReturnType.test(line) && !line.includes(":")) {
        issues.push({
          type: "missingReturnType",
          severity: "low",
          message: "Function missing explicit return type",
          line: index + 1,
          column: 0,
          code: line.trim(),
          suggestion: "Add explicit return type annotation",
          confidence: 80,
        });
      }
    });

    // 3. Check for implicit any parameters
    const implicitAnyParam = /\(\s*\w+\s*\)/g;
    lines.forEach((line, index) => {
      const matches = line.matchAll(implicitAnyParam);
      for (const match of matches) {
        if (line.includes("=>") || line.includes("function")) {
          issues.push({
            type: "implicitAny",
            severity: "medium",
            message: "Parameter has implicit any type",
            line: index + 1,
            column: match.index || 0,
            code: line.trim(),
            suggestion: "Add type annotation to parameter",
            confidence: 75,
          });
        }
      }
    });

    // 4. Check for non-existent type references (Scenario 3 fix)
    const typeReferences = extractTypeReferences(newCode);
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

    // 5. Check for property access hallucinations (Scenario 8 fix)
    const propertyAccesses = extractPropertyAccesses(newCode, symbolTable);
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

/**
 * Extract type references from code
 */
function extractTypeReferences(code: string): Array<{
  name: string;
  line: number;
  column: number;
  code: string;
}> {
  const refs: Array<{
    name: string;
    line: number;
    column: number;
    code: string;
  }> = [];
  const lines = code.split("\n");

  lines.forEach((line, index) => {
    // Skip comments and strings
    if (
      line.trim().startsWith("//") ||
      line.trim().startsWith("*") ||
      line.trim().startsWith("/*")
    ) {
      return;
    }

    // Pattern for type annotations: : TypeName
    const typeAnnotationPattern = /:\s*([A-Z]\w+)/g;
    let match;
    while ((match = typeAnnotationPattern.exec(line)) !== null) {
      const typeName = match[1];
      if (!isKeyword(typeName, "typescript") && typeName.length > 1) {
        refs.push({
          name: typeName,
          line: index + 1,
          column: match.index + 1,
          code: line.trim(),
        });
      }
    }

    // Pattern for return type: function(): TypeName
    const returnTypePattern = /\)\s*:\s*([A-Z]\w+)/g;
    while ((match = returnTypePattern.exec(line)) !== null) {
      const typeName = match[1];
      if (!isKeyword(typeName, "typescript") && typeName.length > 1) {
        refs.push({
          name: typeName,
          line: index + 1,
          column: match.index + 1,
          code: line.trim(),
        });
      }
    }

    // Pattern for interface definitions (should be valid if defined in the code)
    const interfaceDefPattern = /interface\s+(\w+)/g;
    while ((match = interfaceDefPattern.exec(line)) !== null) {
      // Skip if it's just defining the interface, not using it
      if (!line.includes("extends")) {
        continue;
      }
    }
  });

  return refs;
}

/**
 * Extract property accesses from code
 */
function extractPropertyAccesses(
  code: string,
  symbolTable: SymbolTable,
): Array<{
  object: string;
  property: string;
  line: number;
  column: number;
  code: string;
}> {
  const accesses: Array<{
    object: string;
    property: string;
    line: number;
    column: number;
    code: string;
  }> = [];
  const lines = code.split("\n");

  lines.forEach((line, index) => {
    // Skip comments
    if (
      line.trim().startsWith("//") ||
      line.trim().startsWith("*") ||
      line.trim().startsWith("/*")
    ) {
      return;
    }

    // Pattern for property access: object.property
    const propAccessPattern = /(\w+)\.(\w+)/g;
    let match;
    while ((match = propAccessPattern.exec(line)) !== null) {
      const objectName = match[1];
      const propertyName = match[2];

      // Skip built-in objects and their methods
      if (isBuiltInObject(objectName)) {
        continue;
      }

      // Skip if the property is a known property of the object
      if (isKnownProperty(objectName, propertyName, symbolTable)) {
        continue;
      }

      // Skip common return value properties (result.userId, data.id, etc.)
      if (isReturnObject(objectName)) {
        continue;
      }

      // Only flag if object exists in symbol table (variable or parameter)
      // But NOT if it's a function (functions returning objects should have their properties tracked separately)
      if (symbolTable.variables.includes(objectName)) {
        accesses.push({
          object: objectName,
          property: propertyName,
          line: index + 1,
          column: match.index,
          code: line.trim(),
        });
      }
    }

    // Pattern for nested property access: object.nested.property
    const nestedPropAccessPattern = /(\w+)\.(\w+)\.(\w+)/g;
    while ((match = nestedPropAccessPattern.exec(line)) !== null) {
      const objectName = match[1];
      const nestedProperty = match[2];
      const finalProperty = match[3];

      // Skip built-in objects
      if (isBuiltInObject(objectName)) {
        continue;
      }

      // Skip return objects
      if (isReturnObject(objectName)) {
        continue;
      }

      // Flag nested property access if the first object exists
      if (symbolTable.variables.includes(objectName)) {
        accesses.push({
          object: `${objectName}.${nestedProperty}`,
          property: finalProperty,
          line: index + 1,
          column: match.index,
          code: line.trim(),
        });
      }
    }
  });

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
