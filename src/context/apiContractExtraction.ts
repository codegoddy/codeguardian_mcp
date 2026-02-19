/**
 * API Contract Guardian - AST-Based Extraction
 *
 * Extracts API services, routes, types, and models using AST parsing.
 * Leverages the existing tree-sitter parser for accurate extraction.
 *
 * @format
 */

import * as fs from "fs/promises";
import * as path from "path";
import { logger } from "../utils/logger.js";
import { extractImportsAST } from "../tools/validation/extractors/index.js";
import {
  extractPydanticModelsFromPythonAST,
  extractRoutesFromPythonAST,
} from "../api-contract/extractors/pythonAstUtils.js";
import {
  extractServicesFromFile as extractServicesFromFileTS,
  extractTypesFromFile as extractTypesFromFileTS,
} from "../api-contract/extractors/typescript.js";
import type { ASTImport } from "../tools/validation/types.js";
import type {
  ApiServiceDefinition,
  ApiTypeDefinition,
  ApiRouteDefinition,
  ApiModelDefinition,
  ApiParameter,
} from "./projectContext.js";

// ============================================================================
// Frontend Service Extraction (TypeScript AST)
// ============================================================================

/**
 * Extract API service definitions from TypeScript files using AST
 */
export async function extractServicesFromFileAST(
  filePath: string,
): Promise<ApiServiceDefinition[]> {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    const services = extractServicesFromFileTS(content, filePath);
    return services.map((s) => ({
      name: s.name,
      method: s.method,
      endpoint: s.endpoint,
      requestType: s.requestType,
      responseType: s.responseType,
      queryParams: s.queryParams as ApiParameter[] | undefined,
      file: s.file,
      line: s.line,
    }));
  } catch (err) {
    logger.debug(`AST parsing failed for ${filePath}: ${err}`);
  }

  return [];
}

// ============================================================================
// Frontend Type Extraction (TypeScript AST)
// ============================================================================

/**
 * Extract TypeScript interface/type definitions from file using AST
 */
export async function extractTypesFromFileAST(
  filePath: string,
): Promise<ApiTypeDefinition[]> {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    const types = extractTypesFromFileTS(content, filePath);
    return types.map((t) => ({
      name: t.name,
      fields: t.fields,
      file: t.file,
      line: t.line,
      kind: t.kind,
    }));
  } catch (err) {
    logger.debug(`AST parsing failed for ${filePath}: ${err}`);
  }

  return [];
}

// ============================================================================
// Backend Route Extraction (Python AST)
// ============================================================================

/**
 * Strip Python docstrings from source content to prevent false positives
 * in regex-based route extraction. Replaces string content with spaces while
 * preserving newlines so that line numbers remain accurate.
 */
function stripPythonDocstrings(content: string): string {
  // Match triple-double-quoted and triple-single-quoted strings (multiline-aware)
  // We preserve newlines inside docstrings so line numbers stay correct.
  return content.replace(/"""[\s\S]*?"""|'''[\s\S]*?'''/g, (match) =>
    match.replace(/[^\n]/g, " "),
  );
}

/**
 * Extract API route definitions from Python files
 * Prefers AST-based extraction; falls back to regex only when AST is unavailable
 * for the given framework or throws an unrecoverable error.
 *
 * IMPORTANT: When AST extraction is supported (fastapi / flask) and runs
 * successfully, its result is trusted even if it is empty. This prevents the
 * regex fallback from picking up route-like patterns that appear inside
 * docstrings or comment examples.
 */
export async function extractRoutesFromFile(
  filePath: string,
  framework: string,
): Promise<ApiRouteDefinition[]> {
  const routes: ApiRouteDefinition[] = [];

  try {
    const content = await fs.readFile(filePath, "utf-8");

    // AST extraction is supported for FastAPI and Flask.
    // When it succeeds (no exception), we always trust the result — including an
    // empty array — so we never fall through to the regex scanner for these
    // frameworks. This is the key guard that prevents docstring examples from
    // being misidentified as real route definitions.
    const astSupportedFramework =
      framework === "fastapi" || framework === "flask";
    if (astSupportedFramework) {
      try {
        const astRoutes = extractRoutesFromPythonAST(
          content,
          filePath,
          framework,
        );
        // Return the AST result unconditionally (even if empty).
        // An empty result means the file genuinely has no route decorators.
        return astRoutes.map((r) => ({
          method: r.method,
          path: r.path,
          handler: r.handler,
          requestModel: r.requestModel,
          responseModel: r.responseModel,
          queryParams: r.queryParams as ApiParameter[] | undefined,
          file: filePath,
          line: r.line,
        }));
      } catch {
        // AST parsing threw — fall through to regex as last resort.
        logger.debug(
          `AST route extraction failed for ${filePath}, falling back to regex`,
        );
      }
    }

    // Regex fallback: used for unsupported frameworks (e.g. Django) or when
    // AST threw an exception. Strip docstrings first so that code examples
    // inside documentation strings are not mistaken for real route definitions.
    const strippedContent = stripPythonDocstrings(content);
    const lines = strippedContent.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      if (framework === "fastapi") {
        // FastAPI: @app.post("/api/clients") or @router.get("/api/clients")
        const fastapiMatch = line.match(
          /@(?:app|router)\.(get|post|put|patch|delete)\s*\(\s*["']([^"']+)["']/i,
        );
        if (fastapiMatch) {
          // Use original (un-stripped) content for handler extraction so that
          // parameter type hints inside function bodies are still readable.
          const originalLines = content.split("\n");
          const route = extractFastAPIRoute(
            content,
            originalLines,
            i,
            fastapiMatch[1].toUpperCase(),
            fastapiMatch[2],
            filePath,
            lineNum,
          );
          if (route) routes.push(route);
        }
      } else if (framework === "flask") {
        // Flask: @app.route("/api/clients", methods=["POST"])
        const flaskMatch = line.match(/@app\.route\s*\(\s*["']([^"']+)["']/i);
        if (flaskMatch) {
          const originalLines = content.split("\n");
          const route = extractFlaskRoute(
            content,
            originalLines,
            i,
            flaskMatch[1],
            filePath,
            lineNum,
          );
          if (route) routes.push(route);
        }
      }
    }
  } catch (err) {
    logger.debug(`Failed to extract routes from ${filePath}: ${err}`);
  }

  return routes;
}

function extractFastAPIRoute(
  content: string,
  lines: string[],
  decoratorLine: number,
  method: string,
  path: string,
  filePath: string,
  lineNum: number,
): ApiRouteDefinition | null {
  const searchRange = Math.min(decoratorLine + 5, lines.length);
  let funcName = "";
  let requestModel: string | undefined;
  let responseModel: string | undefined;

  for (let i = decoratorLine + 1; i < searchRange; i++) {
    const line = lines[i];

    // Find function name: async def create_client(data: ClientCreate) -> Client:
    const funcMatch = line.match(/(?:async\s+)?def\s+(\w+)\s*\(/);
    if (funcMatch) {
      funcName = funcMatch[1];

      // Extract request model from parameter type hint
      const paramMatch = line.match(/\w+\s*:\s*(\w+)(?:\s*[,\)])/);
      if (paramMatch) {
        const typeName = paramMatch[1];
        // Filter out primitive types
        if (!isPrimitiveType(typeName)) {
          requestModel = typeName;
        }
      }

      // Extract response model from return type
      const returnMatch = line.match(/-\s*\u003e\s*(\w+)/);
      if (returnMatch) {
        const returnType = returnMatch[1];
        if (!isPrimitiveType(returnType)) {
          responseModel = returnType;
        }
      }

      break;
    }
  }

  if (!funcName) return null;

  return {
    method: method as ApiRouteDefinition["method"],
    path,
    handler: funcName,
    requestModel,
    responseModel,
    file: filePath,
    line: lineNum,
  };
}

function extractFlaskRoute(
  content: string,
  lines: string[],
  decoratorLine: number,
  path: string,
  filePath: string,
  lineNum: number,
): ApiRouteDefinition | null {
  const searchRange = Math.min(decoratorLine + 5, lines.length);
  let funcName = "";
  let method = "GET";

  // Check decorator line for methods parameter
  const decoratorLineContent = lines[decoratorLine];
  const methodsMatch = decoratorLineContent.match(/methods\s*=\s*\[(.+?)\]/);
  if (methodsMatch) {
    const methods = methodsMatch[1]
      .split(",")
      .map((m) => m.trim().replace(/["']/g, ""));
    if (methods.length > 0) {
      method = methods[0].toUpperCase();
    }
  }

  for (let i = decoratorLine + 1; i < searchRange; i++) {
    const line = lines[i];
    const funcMatch = line.match(/def\s+(\w+)\s*\(/);
    if (funcMatch) {
      funcName = funcMatch[1];
      break;
    }
  }

  if (!funcName) return null;

  return {
    method: method as ApiRouteDefinition["method"],
    path,
    handler: funcName,
    file: filePath,
    line: lineNum,
  };
}

// ============================================================================
// Backend Model Extraction (Python)
// ============================================================================

/**
 * Extract Pydantic model definitions from Python files
 */
export async function extractModelsFromFile(
  filePath: string,
): Promise<ApiModelDefinition[]> {
  const models: ApiModelDefinition[] = [];

  try {
    const content = await fs.readFile(filePath, "utf-8");

    // Prefer AST-based extraction
    try {
      const astModels = extractPydanticModelsFromPythonAST(content, filePath);
      if (astModels.length > 0) {
        return astModels.map((m) => ({
          name: m.name,
          fields: m.fields.map((f) => ({
            name: f.name,
            type: f.type,
            required: f.required,
            default: f.default,
          })),
          file: filePath,
          line: m.line,
          baseClasses: m.baseClasses,
        }));
      }
    } catch {
      // Fall back to legacy regex below
    }

    const lines = content.split("\n");

    let currentModel: Partial<ApiModelDefinition> | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Class definition: class ClientCreate(BaseModel):
      const classMatch = line.match(/class\s+(\w+)\s*\(\s*(\w+)\s*\)/);
      if (classMatch) {
        if (currentModel) {
          models.push(currentModel as ApiModelDefinition);
          currentModel = null;
        }

        const className = classMatch[1];
        const baseClass = classMatch[2];

        // Only process Pydantic models
        if (["BaseModel", "BaseConfig", "RootModel"].includes(baseClass)) {
          currentModel = {
            name: className,
            fields: [],
            file: filePath,
            line: i + 1,
            baseClasses: [baseClass],
          };
        }
        continue;
      }

      // Inside a model class
      if (currentModel) {
        const isIndented = line.startsWith("    ") || line.startsWith("\t");
        const isEmpty = line.trim() === "";
        const isComment = line.trim().startsWith("#");

        if (!isIndented && !isEmpty && !isComment) {
          models.push(currentModel as ApiModelDefinition);
          currentModel = null;
          continue;
        }

        // Extract field: name: str or email: str = Field(...)
        const fieldMatch = line.match(
          /^(?:\s+)(\w+)\s*:\s*([\w\[\],\s]+?)(?:\s*=\s*(.+))?$/,
        );
        if (fieldMatch) {
          const fieldName = fieldMatch[1];
          const fieldType = fieldMatch[2].trim();
          const fieldDefault = fieldMatch[3]?.trim();

          // Check if field is required
          let required = true;
          if (fieldType.includes("Optional")) {
            required = false;
          } else if (fieldDefault) {
            if (
              fieldDefault === "None" ||
              fieldDefault.startsWith('"') ||
              fieldDefault.startsWith("'")
            ) {
              required = false;
            } else if (!fieldDefault.includes("...")) {
              required = false;
            }
          }

          currentModel.fields!.push({
            name: fieldName,
            type: fieldType,
            required,
            default: fieldDefault,
          });
        }
      }
    }

    if (currentModel) {
      models.push(currentModel as ApiModelDefinition);
    }
  } catch (err) {
    logger.debug(`Failed to extract models from ${filePath}: ${err}`);
  }

  return models;
}

// ============================================================================
// Utility Functions
// ============================================================================

function isPrimitiveType(typeName: string): boolean {
  // Python primitives
  const pythonPrimitives = [
    "str",
    "int",
    "float",
    "bool",
    "dict",
    "list",
    "tuple",
    "set",
    "None",
    "Any",
    "Optional",
    "Union",
  ];

  // TypeScript primitives
  const tsPrimitives = [
    "string",
    "number",
    "boolean",
    "null",
    "undefined",
    "any",
    "unknown",
    "void",
    "never",
  ];

  // Normalize the type name (remove array brackets, etc.)
  const normalized = typeName.replace(/\[\]$/, "").replace(/\|.*$/, "").trim();

  return (
    pythonPrimitives.includes(normalized) ||
    tsPrimitives.includes(normalized.toLowerCase())
  );
}

// ============================================================================
// Import Resolution for Type Definitions
// ============================================================================

/**
 * Extract imports from a TypeScript file
 */
export async function extractImportsFromFileAST(
  filePath: string,
): Promise<ASTImport[]> {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return extractImportsAST(content, "typescript");
  } catch (err) {
    logger.debug(`Failed to extract imports from ${filePath}: ${err}`);
    return [];
  }
}

/**
 * Resolve an import path to an absolute file path
 */
export function resolveImportPath(
  importPath: string,
  fromFile: string,
): string | null {
  // Handle relative imports
  if (importPath.startsWith("./") || importPath.startsWith("../")) {
    const fromDir = path.dirname(fromFile);
    let resolvedPath = path.resolve(fromDir, importPath);

    // Try common TypeScript/JavaScript extensions
    const extensions = [
      ".ts",
      ".tsx",
      ".js",
      ".jsx",
      "/index.ts",
      "/index.tsx",
      "/index.js",
      "/index.jsx",
    ];

    // First try exact path
    for (const ext of extensions) {
      const fullPath = resolvedPath + ext;
      // We can't check if file exists here without async, so return the path
      // The caller will need to check existence
      if (ext.startsWith("/")) {
        // For index files, try the directory
        return resolvedPath + ext;
      }
    }

    return resolvedPath + ".ts"; // Default to .ts
  }

  // Handle path aliases (e.g., "@/types", "~/components")
  // This would require tsconfig.json parsing to resolve properly
  // For now, return null to indicate we can't resolve it
  if (importPath.startsWith("@/") || importPath.startsWith("~/")) {
    logger.debug(`Cannot resolve path alias: ${importPath} from ${fromFile}`);
    return null;
  }

  // External package - not a local type import
  return null;
}

/**
 * Resolve a type name to its definition file using imports
 */
export async function resolveTypeImport(
  typeName: string,
  importingFile: string,
): Promise<{ filePath: string; importInfo: ASTImport } | null> {
  // Extract imports from the importing file
  const imports = await extractImportsFromFileAST(importingFile);

  // Find the import that contains this type
  for (const importInfo of imports) {
    // Check if this import includes the type we're looking for
    const matchingName = importInfo.names.find(
      (n) => n.local === typeName || n.imported === typeName,
    );

    if (matchingName) {
      // Resolve the import path
      const resolvedPath = resolveImportPath(importInfo.module, importingFile);
      if (resolvedPath) {
        return {
          filePath: resolvedPath,
          importInfo,
        };
      }
    }
  }

  return null;
}

/**
 * Check if a type is imported (vs defined in the same file)
 */
export async function isImportedType(
  typeName: string,
  filePath: string,
): Promise<boolean> {
  const imports = await extractImportsFromFileAST(filePath);
  return imports.some((imp) =>
    imp.names.some((n) => n.local === typeName || n.imported === typeName),
  );
}

/**
 * Build a map of imported types to their definition files
 * This is used to resolve types across the entire frontend codebase
 */
export async function buildImportResolutionMap(
  serviceFiles: string[],
): Promise<Map<string, string>> {
  const typeToFileMap = new Map<string, string>();

  for (const filePath of serviceFiles) {
    const imports = await extractImportsFromFileAST(filePath);

    for (const importInfo of imports) {
      // Skip external packages
      if (importInfo.isExternal) continue;

      const resolvedPath = resolveImportPath(importInfo.module, filePath);
      if (resolvedPath) {
        for (const name of importInfo.names) {
          // Map the local name to the resolved file path
          typeToFileMap.set(name.local, resolvedPath);
        }
      }
    }
  }

  return typeToFileMap;
}
