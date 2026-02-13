/**
 * API Contract Guardian - Complex TypeScript Type Handling
 *
 * Handles advanced TypeScript types including:
 * - Union types (string | number)
 * - Generic types (Array<T>, Promise<T>)
 * - Intersection types (Type1 & Type2)
 * - Mapped types (Partial<T>, Required<T>, etc.)
 * - Conditional types
 * - Type aliases
 * - Cross-file type resolution
 *
 * @format
 */

import * as fs from "fs/promises";
import * as path from "path";
import { logger } from "../../utils/logger.js";
import { getParser } from "../../tools/validation/parser.js";
import type { ApiTypeDefinition, ApiTypeField } from "../projectContext.js";

// ============================================================================
// Types
// ============================================================================

export interface ComplexTypeInfo {
  name: string;
  kind: "union" | "intersection" | "generic" | "mapped" | "conditional" | "alias" | "primitive";
  baseType?: string;
  typeParameters?: string[];
  constituents?: ComplexTypeInfo[];
  mappedType?: "partial" | "required" | "readonly" | "pick" | "omit" | "record" | "exclude" | "extract";
  mappedTypeArgument?: string;
  condition?: {
    checkType: string;
    extendsType: string;
    trueType: string;
    falseType: string;
  };
  resolvedType?: string;
  file: string;
  line: number;
}

export interface TypeResolutionContext {
  resolvedTypes: Map<string, ComplexTypeInfo>;
  pendingResolutions: Set<string>;
  errors: TypeResolutionError[];
}

export interface TypeResolutionError {
  typeName: string;
  file: string;
  message: string;
  line?: number;
}

export interface TypeCompatibilityResult {
  compatible: boolean;
  score: number;
  issues: TypeCompatibilityIssue[];
}

export interface TypeCompatibilityIssue {
  severity: "error" | "warning";
  message: string;
  frontendType?: string;
  backendType?: string;
  field?: string;
}

// ============================================================================
// Type Parser
// ============================================================================

/**
 * Parse a complex TypeScript type string into structured info
 */
export function parseComplexType(typeString: string, file: string, line: number): ComplexTypeInfo {
  const trimmed = typeString.trim();

  // Check for union types: string | number | null
  if (trimmed.includes("|")) {
    return parseUnionType(trimmed, file, line);
  }

  // Check for intersection types: Type1 & Type2
  if (trimmed.includes("&")) {
    return parseIntersectionType(trimmed, file, line);
  }

  // Check for mapped types FIRST: Partial<T>, Required<T>, etc.
  // These look like generics but are special TypeScript utility types
  const mappedTypeMatch = trimmed.match(/^(Partial|Required|Readonly|Pick|Omit|Record|Exclude|Extract)<(.+)>$/);
  if (mappedTypeMatch) {
    return parseMappedType(mappedTypeMatch[1], mappedTypeMatch[2], file, line);
  }

  // Check for generic types: Array<T>, Promise<T>, Map<K, V>
  if (trimmed.includes("<") && trimmed.includes(">")) {
    return parseGenericType(trimmed, file, line);
  }

  // Check for conditional types: T extends U ? X : Y
  if (trimmed.includes("extends") && trimmed.includes("?")) {
    return parseConditionalType(trimmed, file, line);
  }

  // Primitive type
  return {
    name: trimmed,
    kind: "primitive",
    file,
    line,
  };
}

function parseUnionType(typeString: string, file: string, line: number): ComplexTypeInfo {
  const parts = splitTypeString(typeString, "|");
  const constituents = parts.map(p => parseComplexType(p.trim(), file, line));

  // Check if it's a nullable type (includes null or undefined)
  const isNullable = constituents.some(c => 
    c.name === "null" || c.name === "undefined"
  );

  return {
    name: typeString,
    kind: "union",
    constituents,
    file,
    line,
  };
}

function parseIntersectionType(typeString: string, file: string, line: number): ComplexTypeInfo {
  const parts = splitTypeString(typeString, "&");
  const constituents = parts.map(p => parseComplexType(p.trim(), file, line));

  return {
    name: typeString,
    kind: "intersection",
    constituents,
    file,
    line,
  };
}

function parseGenericType(typeString: string, file: string, line: number): ComplexTypeInfo {
  // Match: TypeName<T1, T2, ...>
  const match = typeString.match(/^(\w+)<(.+)>$/);
  if (!match) {
    return {
      name: typeString,
      kind: "primitive",
      file,
      line,
    };
  }

  const baseType = match[1];
  const paramsString = match[2];
  
  // Split type parameters (handle nested generics)
  const typeParameters = splitTypeParams(paramsString);

  return {
    name: typeString,
    kind: "generic",
    baseType,
    typeParameters,
    file,
    line,
  };
}

function parseMappedType(
  mappedType: string,
  typeArg: string,
  file: string,
  line: number
): ComplexTypeInfo {
  const mappedTypeMap: Record<string, ComplexTypeInfo["mappedType"]> = {
    Partial: "partial",
    Required: "required",
    Readonly: "readonly",
    Pick: "pick",
    Omit: "omit",
    Record: "record",
    Exclude: "exclude",
    Extract: "extract",
  };

  return {
    name: `${mappedType}<${typeArg}>`,
    kind: "mapped",
    mappedType: mappedTypeMap[mappedType],
    mappedTypeArgument: typeArg,
    file,
    line,
  };
}

function parseConditionalType(typeString: string, file: string, line: number): ComplexTypeInfo {
  // Match: T extends U ? X : Y
  const match = typeString.match(/^(.+?)\s+extends\s+(.+?)\s*\?\s*(.+?)\s*:\s*(.+)$/);
  if (!match) {
    return {
      name: typeString,
      kind: "primitive",
      file,
      line,
    };
  }

  return {
    name: typeString,
    kind: "conditional",
    condition: {
      checkType: match[1].trim(),
      extendsType: match[2].trim(),
      trueType: match[3].trim(),
      falseType: match[4].trim(),
    },
    file,
    line,
  };
}

/**
 * Split a type string by delimiter, respecting nested angle brackets
 */
function splitTypeString(typeString: string, delimiter: string): string[] {
  const parts: string[] = [];
  let current = "";
  let depth = 0;

  for (const char of typeString) {
    if (char === "<") depth++;
    if (char === ">") depth--;

    if (char === delimiter && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  if (current.trim()) {
    parts.push(current.trim());
  }

  return parts;
}

function splitTypeParams(paramsString: string): string[] {
  const params: string[] = [];
  let current = "";
  let depth = 0;

  for (const char of paramsString) {
    if (char === "<") depth++;
    if (char === ">") depth--;

    if (char === "," && depth === 0) {
      params.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  if (current.trim()) {
    params.push(current.trim());
  }

  return params;
}

// ============================================================================
// Type Resolution
// ============================================================================

/**
 * Resolve a complex type to its base type
 * Expands type aliases, evaluates conditional types, etc.
 */
export function resolveComplexType(
  typeInfo: ComplexTypeInfo,
  typeDefinitions: Map<string, ComplexTypeInfo>,
  context: TypeResolutionContext
): ComplexTypeInfo {
  // Check for circular references
  if (context.pendingResolutions.has(typeInfo.name)) {
    context.errors.push({
      typeName: typeInfo.name,
      file: typeInfo.file,
      message: "Circular type reference detected",
      line: typeInfo.line,
    });
    return typeInfo;
  }

  // Check if already resolved
  if (context.resolvedTypes.has(typeInfo.name)) {
    return context.resolvedTypes.get(typeInfo.name)!;
  }

  context.pendingResolutions.add(typeInfo.name);

  let resolved: ComplexTypeInfo;

  switch (typeInfo.kind) {
    case "union":
      resolved = resolveUnionType(typeInfo, typeDefinitions, context);
      break;
    case "intersection":
      resolved = resolveIntersectionType(typeInfo, typeDefinitions, context);
      break;
    case "generic":
      resolved = resolveGenericType(typeInfo, typeDefinitions, context);
      break;
    case "mapped":
      resolved = resolveMappedType(typeInfo, typeDefinitions, context);
      break;
    case "conditional":
      resolved = resolveConditionalType(typeInfo, typeDefinitions, context);
      break;
    case "alias":
      resolved = resolveAliasType(typeInfo, typeDefinitions, context);
      break;
    default:
      resolved = typeInfo;
  }

  context.pendingResolutions.delete(typeInfo.name);
  context.resolvedTypes.set(typeInfo.name, resolved);

  return resolved;
}

function resolveUnionType(
  typeInfo: ComplexTypeInfo,
  typeDefinitions: Map<string, ComplexTypeInfo>,
  context: TypeResolutionContext
): ComplexTypeInfo {
  if (!typeInfo.constituents) return typeInfo;

  const resolvedConstituents = typeInfo.constituents.map(c =>
    resolveComplexType(c, typeDefinitions, context)
  );

  // Flatten nested unions
  const flattened: ComplexTypeInfo[] = [];
  for (const c of resolvedConstituents) {
    if (c.kind === "union" && c.constituents) {
      flattened.push(...c.constituents);
    } else {
      flattened.push(c);
    }
  }

  return {
    ...typeInfo,
    constituents: flattened,
    resolvedType: flattened.map(c => c.resolvedType || c.name).join(" | "),
  };
}

function resolveIntersectionType(
  typeInfo: ComplexTypeInfo,
  typeDefinitions: Map<string, ComplexTypeInfo>,
  context: TypeResolutionContext
): ComplexTypeInfo {
  if (!typeInfo.constituents) return typeInfo;

  const resolvedConstituents = typeInfo.constituents.map(c =>
    resolveComplexType(c, typeDefinitions, context)
  );

  return {
    ...typeInfo,
    constituents: resolvedConstituents,
    resolvedType: resolvedConstituents.map(c => c.resolvedType || c.name).join(" & "),
  };
}

function resolveGenericType(
  typeInfo: ComplexTypeInfo,
  typeDefinitions: Map<string, ComplexTypeInfo>,
  context: TypeResolutionContext
): ComplexTypeInfo {
  if (!typeInfo.typeParameters) return typeInfo;

  const resolvedParams = typeInfo.typeParameters.map(p => {
    const parsed = parseComplexType(p, typeInfo.file, typeInfo.line);
    return resolveComplexType(parsed, typeDefinitions, context);
  });

  // Handle built-in generic types
  if (typeInfo.baseType === "Array" || typeInfo.baseType === "Promise") {
    return {
      ...typeInfo,
      resolvedType: `${typeInfo.baseType}<${resolvedParams[0]?.resolvedType || resolvedParams[0]?.name}>`,
    };
  }

  return {
    ...typeInfo,
    resolvedType: `${typeInfo.baseType}<${resolvedParams.map(p => p.resolvedType || p.name).join(", ")}>`,
  };
}

function resolveMappedType(
  typeInfo: ComplexTypeInfo,
  typeDefinitions: Map<string, ComplexTypeInfo>,
  context: TypeResolutionContext
): ComplexTypeInfo {
  if (!typeInfo.mappedType || !typeInfo.mappedTypeArgument) return typeInfo;

  const baseType = typeDefinitions.get(typeInfo.mappedTypeArgument);
  if (!baseType) {
    return {
      ...typeInfo,
      resolvedType: typeInfo.name,
    };
  }

  const resolvedBase = resolveComplexType(baseType, typeDefinitions, context);

  // Apply mapped type transformation
  switch (typeInfo.mappedType) {
    case "partial":
      return {
        ...typeInfo,
        resolvedType: `Partial<${resolvedBase.resolvedType || resolvedBase.name}>`,
      };
    case "required":
      return {
        ...typeInfo,
        resolvedType: `Required<${resolvedBase.resolvedType || resolvedBase.name}>`,
      };
    case "readonly":
      return {
        ...typeInfo,
        resolvedType: `Readonly<${resolvedBase.resolvedType || resolvedBase.name}>`,
      };
    default:
      return {
        ...typeInfo,
        resolvedType: typeInfo.name,
      };
  }
}

function resolveConditionalType(
  typeInfo: ComplexTypeInfo,
  typeDefinitions: Map<string, ComplexTypeInfo>,
  context: TypeResolutionContext
): ComplexTypeInfo {
  if (!typeInfo.condition) return typeInfo;

  const { checkType, extendsType, trueType, falseType } = typeInfo.condition;

  // Simple case: check if checkType extends extendsType
  // In a real implementation, this would be more sophisticated
  const resolvedCheck = parseComplexType(checkType, typeInfo.file, typeInfo.line);
  const resolvedExtends = parseComplexType(extendsType, typeInfo.file, typeInfo.line);

  // For now, assume the condition is true if types match
  const conditionResult = resolvedCheck.name === resolvedExtends.name;
  const resultType = conditionResult ? trueType : falseType;

  return {
    ...typeInfo,
    resolvedType: resultType,
  };
}

function resolveAliasType(
  typeInfo: ComplexTypeInfo,
  typeDefinitions: Map<string, ComplexTypeInfo>,
  context: TypeResolutionContext
): ComplexTypeInfo {
  const aliasedType = typeDefinitions.get(typeInfo.name);
  if (aliasedType) {
    return resolveComplexType(aliasedType, typeDefinitions, context);
  }
  return typeInfo;
}

// ============================================================================
// Type Compatibility Checking
// ============================================================================

/**
 * Check if a TypeScript type is compatible with a Python type
 */
export function checkTypeCompatibility(
  tsType: ComplexTypeInfo,
  pyType: string
): TypeCompatibilityResult {
  const issues: TypeCompatibilityIssue[] = [];
  let score = 100;

  // Normalize Python type
  const normalizedPyType = normalizePythonType(pyType);

  // Handle union types
  if (tsType.kind === "union" && tsType.constituents) {
    // Check if any constituent matches
    const matches = tsType.constituents.some(c => {
      const result = checkTypeCompatibility(c, pyType);
      return result.compatible;
    });

    if (!matches) {
      issues.push({
        severity: "error",
        message: `Union type '${tsType.name}' is not compatible with Python type '${pyType}'`,
        frontendType: tsType.name,
        backendType: pyType,
      });
      score = 0;
    }

    return { compatible: matches, score, issues };
  }

  // Check primitive type compatibility
  const tsPrimitive = getPrimitiveTypeName(tsType);
  const compatibility = getTypeCompatibility(tsPrimitive, normalizedPyType);

  if (!compatibility.compatible) {
    issues.push({
      severity: "error",
      message: `Type mismatch: TypeScript '${tsType.name}' is not compatible with Python '${pyType}'`,
      frontendType: tsType.name,
      backendType: pyType,
    });
    score = 0;
  } else if (compatibility.warning) {
    issues.push({
      severity: "warning",
      message: compatibility.warning,
      frontendType: tsType.name,
      backendType: pyType,
    });
    score -= 20;
  }

  return { compatible: compatibility.compatible, score: Math.max(0, score), issues };
}

function normalizePythonType(pyType: string): string {
  return pyType
    .replace(/Optional\[(.+?)\]/, "$1 | null")
    .replace(/List\[(.+?)\]/, "Array<$1>")
    .replace(/Dict\[(.+?),\s*(.+?)\]/, "Record<$1, $2>")
    .replace(/Union\[(.+?)\]/, "$1")
    .trim();
}

function getPrimitiveTypeName(typeInfo: ComplexTypeInfo): string {
  if (typeInfo.resolvedType) {
    return typeInfo.resolvedType;
  }

  // Handle generic types
  if (typeInfo.kind === "generic" && typeInfo.baseType) {
    if (typeInfo.baseType === "Array") {
      return "array";
    }
    if (typeInfo.baseType === "Promise") {
      return "promise";
    }
    if (typeInfo.baseType === "Record") {
      return "record";
    }
  }

  return typeInfo.name.toLowerCase();
}

interface CompatibilityInfo {
  compatible: boolean;
  warning?: string;
}

function getTypeCompatibility(tsType: string, pyType: string): CompatibilityInfo {
  // TypeScript to Python type mapping
  const typeMap: Record<string, string[]> = {
    string: ["str", "string", "text"],
    number: ["int", "float", "decimal", "number"],
    boolean: ["bool", "boolean"],
    null: ["none", "null"],
    undefined: ["none", "null"],
    any: ["any"],
    unknown: ["any"],
    array: ["list", "array", "sequence"],
    record: ["dict", "mapping", "object"],
    date: ["date", "datetime"],
    bigint: ["int"],
    symbol: [],
    object: ["dict", "object"],
  };

  const normalizedTs = tsType.toLowerCase();
  const normalizedPy = pyType.toLowerCase();

  // Direct match
  if (normalizedTs === normalizedPy) {
    return { compatible: true };
  }

  // Check mapping
  const compatibleTypes = typeMap[normalizedTs] || [];
  if (compatibleTypes.includes(normalizedPy)) {
    return { compatible: true };
  }

  // Special case: array types
  if (normalizedTs === "array" && normalizedPy.startsWith("array<")) {
    return { compatible: true };
  }

  // Special cases
  if (normalizedTs === "string" && normalizedPy === "int") {
    return {
      compatible: false,
      warning: "Type mismatch: string cannot be assigned to int",
    };
  }

  if (normalizedTs === "number" && normalizedPy === "str") {
    return {
      compatible: true,
      warning: "Implicit conversion: number to string",
    };
  }

  if (normalizedTs === "array" && !["list", "array", "sequence"].includes(normalizedPy)) {
    return {
      compatible: false,
      warning: "Type mismatch: array type requires Python List",
    };
  }

  return { compatible: false };
}

// ============================================================================
// Import Resolution
// ============================================================================

/**
 * Extract all type definitions from a TypeScript file
 * Including imported types
 */
export async function extractAllTypeDefinitions(
  filePath: string,
  projectPath: string
): Promise<Map<string, ComplexTypeInfo>> {
  const typeMap = new Map<string, ComplexTypeInfo>();

  try {
    const content = await fs.readFile(filePath, "utf-8");
    const parser = getParser("typescript");
    const tree = parser.parse(content)!;

    // Extract local type definitions
    extractTypeDefinitionsFromAST(tree.rootNode, content, filePath, typeMap);

    // Extract imports and resolve them
    const imports = extractTypeImportsFromAST(tree.rootNode, content);
    
    for (const importInfo of imports) {
      const resolvedPath = resolveImportPath(importInfo.path, filePath, projectPath);
      if (resolvedPath) {
        try {
          const importedTypes = await extractAllTypeDefinitions(resolvedPath, projectPath);
          for (const [name, typeInfo] of importedTypes) {
            if (!typeMap.has(name)) {
              typeMap.set(name, typeInfo);
            }
          }
        } catch {
          // Ignore import resolution errors
        }
      }
    }
  } catch (err) {
    logger.debug(`Failed to extract type definitions from ${filePath}: ${err}`);
  }

  return typeMap;
}

function extractTypeDefinitionsFromAST(
  node: any,
  content: string,
  filePath: string,
  typeMap: Map<string, ComplexTypeInfo>
): void {
  if (!node) return;

  // Type alias: type MyType = ...
  if (node.type === "type_alias_declaration") {
    const nameNode = node.childForFieldName("name");
    const valueNode = node.childForFieldName("value");

    if (nameNode && valueNode) {
      const name = getNodeText(nameNode, content);
      const value = getNodeText(valueNode, content);
      const line = node.startPosition.row + 1;

      const typeInfo = parseComplexType(value, filePath, line);
      typeInfo.name = name;
      typeInfo.kind = "alias";

      typeMap.set(name, typeInfo);
    }
  }

  // Interface declaration
  if (node.type === "interface_declaration") {
    const nameNode = node.childForFieldName("name");
    if (nameNode) {
      const name = getNodeText(nameNode, content);
      const line = node.startPosition.row + 1;

      typeMap.set(name, {
        name,
        kind: "primitive",
        file: filePath,
        line,
      });
    }
  }

  // Recursively traverse children
  for (const child of node.children || []) {
    extractTypeDefinitionsFromAST(child, content, filePath, typeMap);
  }
}

interface ImportInfo {
  names: string[];
  path: string;
}

function extractTypeImportsFromAST(node: any, content: string): ImportInfo[] {
  const imports: ImportInfo[] = [];

  if (!node) return imports;

  if (node.type === "import_statement" || node.type === "import_declaration") {
    const sourceNode = node.childForFieldName("source");
    if (sourceNode) {
      const importPath = getNodeText(sourceNode, content).replace(/['"]/g, "");
      
      // Extract imported names
      const clauseNode = node.childForFieldName("clause") || node.childForFieldName("importClause");
      if (clauseNode) {
        const names: string[] = [];
        
        for (const child of clauseNode.children || []) {
          if (child.type === "identifier" || child.type === "type_identifier") {
            names.push(getNodeText(child, content));
          }
          
          if (child.type === "named_imports") {
            for (const spec of child.children || []) {
              if (spec.type === "import_specifier") {
                const nameNode = spec.childForFieldName("name");
                if (nameNode) {
                  names.push(getNodeText(nameNode, content));
                }
              }
            }
          }
        }

        imports.push({ names, path: importPath });
      }
    }
  }

  // Recursively traverse children
  for (const child of node.children || []) {
    imports.push(...extractTypeImportsFromAST(child, content));
  }

  return imports;
}

function resolveImportPath(importPath: string, fromFile: string, projectPath: string): string | null {
  // Handle relative imports
  if (importPath.startsWith("./") || importPath.startsWith("../")) {
    const fromDir = path.dirname(fromFile);
    let resolvedPath = path.resolve(fromDir, importPath);

    // Try common extensions
    const extensions = [".ts", ".tsx", ".d.ts", "/index.ts", "/index.tsx"];
    
    for (const ext of extensions) {
      const fullPath = resolvedPath + ext;
      try {
        fsSync.accessSync(fullPath);
        return fullPath;
      } catch {
        // Try next extension
      }
    }
  }

  // Handle path aliases (simplified - would need tsconfig.json parsing)
  if (importPath.startsWith("@/") || importPath.startsWith("~/")) {
    // Try to resolve from project root
    const relativePath = importPath.slice(2); // Remove @/ or ~/
    const possiblePath = path.join(projectPath, "src", relativePath);
    
    const extensions = [".ts", ".tsx", ".d.ts", "/index.ts", "/index.tsx"];
    for (const ext of extensions) {
      const fullPath = possiblePath + ext;
      try {
        fsSync.accessSync(fullPath);
        return fullPath;
      } catch {
        // Try next extension
      }
    }
  }

  return null;
}

import * as fsSync from "fs";

function getNodeText(node: any, content: string): string {
  if (!node) return "";
  return content.slice(node.startIndex, node.endIndex);
}

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Enhance ApiTypeDefinition with complex type information
 */
export async function enhanceTypeWithComplexInfo(
  typeDef: ApiTypeDefinition,
  projectPath: string
): Promise<ApiTypeDefinition & { complexFields?: Array<ApiTypeField & { complexType?: ComplexTypeInfo }> }> {
  const typeMap = await extractAllTypeDefinitions(typeDef.file, projectPath);
  
  const context: TypeResolutionContext = {
    resolvedTypes: new Map(),
    pendingResolutions: new Set(),
    errors: [],
  };

  const enhancedFields = typeDef.fields.map(field => {
    const complexType = parseComplexType(field.type, typeDef.file, typeDef.line);
    const resolvedType = resolveComplexType(complexType, typeMap, context);

    return {
      ...field,
      complexType: resolvedType,
    };
  });

  return {
    ...typeDef,
    complexFields: enhancedFields,
  };
}
