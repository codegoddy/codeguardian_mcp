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
import { getParser } from "../tools/validation/parser.js";
import { logger } from "../utils/logger.js";
import { extractImportsAST } from "../tools/validation/extractors/index.js";
import type { ASTImport } from "../tools/validation/types.js";
import type {
  ApiServiceDefinition,
  ApiTypeDefinition,
  ApiRouteDefinition,
  ApiModelDefinition,
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
  const services: ApiServiceDefinition[] = [];

  try {
    const content = await fs.readFile(filePath, "utf-8");
    const parser = getParser("typescript");
    const tree = parser.parse(content);

    // Traverse AST to find API calls
    traverseForServices(tree.rootNode, content, filePath, services);
  } catch (err) {
    logger.debug(`AST parsing failed for ${filePath}: ${err}`);
  }

  return services;
}

function traverseForServices(
  node: any,
  content: string,
  filePath: string,
  services: ApiServiceDefinition[],
): void {
  if (!node) return;

  // Look for call expressions (method calls)
  if (node.type === "call_expression") {
    const service = extractServiceFromCall(node, content, filePath);
    if (service) {
      services.push(service);
    }
  }

  // Recursively traverse children
  for (const child of node.children || []) {
    traverseForServices(child, content, filePath, services);
  }
}

function extractServiceFromCall(
  node: any,
  content: string,
  filePath: string,
): ApiServiceDefinition | null {
  // Get the function being called
  const functionNode = node.childForFieldName("function");
  if (!functionNode) return null;

  // Check if it's a method call like ApiService.post or api.get
  if (functionNode.type === "member_expression") {
    const objectNode = functionNode.childForFieldName("object");
    const propertyNode = functionNode.childForFieldName("property");

    if (!objectNode || !propertyNode) return null;

    const objectName = getNodeText(objectNode, content);
    const methodName = getNodeText(propertyNode, content);

    // Check if it's an API call pattern
    const isApiCall =
      objectName === "ApiService" ||
      objectName === "api" ||
      objectName === "axios" ||
      objectName === "client" ||
      objectName.endsWith("Api") ||
      objectName.endsWith("Service");

    if (!isApiCall) return null;

    // Map method name to HTTP method
    const httpMethod = mapToHttpMethod(methodName);
    if (!httpMethod) return null;

    // Extract arguments
    const argumentsNode = node.childForFieldName("arguments");
    if (!argumentsNode) return null;

    const endpoint = extractEndpointFromArguments(argumentsNode, content);
    if (!endpoint) return null;

    // Try to find the enclosing function/method name
    const enclosingFunction = findEnclosingFunction(node, content);

    // Extract request and response types from the enclosing function
    const { requestType, responseType } = extractTypesFromEnclosingFunction(node, content);

    return {
      name: enclosingFunction || `${methodName}_${endpoint.replace(/[^a-zA-Z0-9]/g, "_")}`,
      method: httpMethod,
      endpoint,
      requestType,
      responseType,
      file: filePath,
      line: node.startPosition.row + 1,
    };
  }

  return null;
}

function mapToHttpMethod(methodName: string): ApiServiceDefinition["method"] | null {
  const methodMap: Record<string, ApiServiceDefinition["method"]> = {
    get: "GET",
    post: "POST",
    put: "PUT",
    patch: "PATCH",
    delete: "DELETE",
  };

  return methodMap[methodName.toLowerCase()] || null;
}

function extractEndpointFromArguments(argumentsNode: any, content: string): string | null {
  // First argument should be the endpoint
  for (const child of argumentsNode.children || []) {
    if (child.type === "string" || child.type === "template_string") {
      return extractStringValue(child, content);
    }
  }
  return null;
}

function extractStringValue(node: any, content: string): string | null {
  if (node.type === "string") {
    const text = getNodeText(node, content);
    // Remove quotes and strip query parameters
    return text.replace(/^["']|["']$/g, "").split("?")[0];
  }

  if (node.type === "template_string") {
    // For template strings like `/api/clients/${id}`, extract the full path with placeholders
    const text = getNodeText(node, content);
    // Remove backticks first
    let result = text.replace(/^`/, "").replace(/`$/, "");
    // Strip query parameters (anything after ?)
    result = result.split("?")[0];
    // Replace ${...} with {varName} to match backend format
    // But skip variables that are likely query string builders (at end of path, named query/params)
    result = result.replace(/\$\{([^}]+)\}/g, (match, varName) => {
      // If variable name suggests it's a query string, return empty string
      if (/^(query|params|searchParams|queryString)$/i.test(varName)) {
        return "";
      }
      // Convert camelCase to snake_case to match Python conventions
      const snakeCase = varName.replace(/[A-Z]/g, (letter: string) => `_${letter.toLowerCase()}`);
      return `{${snakeCase}}`;
    });
    return result;
  }

  return null;
}

function findEnclosingFunction(node: any, content: string): string | null {
  let current = node;

  while (current) {
    // Check for function declaration
    if (current.type === "function_declaration") {
      const nameNode = current.childForFieldName("name");
      if (nameNode) {
        return getNodeText(nameNode, content);
      }
    }

    // Check for arrow function in variable declaration
    if (current.type === "variable_declarator") {
      const nameNode = current.childForFieldName("name");
      if (nameNode) {
        return getNodeText(nameNode, content);
      }
    }

    // Check for method definition
    if (current.type === "method_definition") {
      const nameNode = current.childForFieldName("name");
      if (nameNode) {
        return getNodeText(nameNode, content);
      }
    }

    // Check for object property (like clientsApi: { getClients: ... })
    if (current.type === "property_definition" || current.type === "pair") {
      const keyNode = current.childForFieldName("key") || current.childForFieldName("name");
      if (keyNode) {
        return getNodeText(keyNode, content);
      }
    }

    current = current.parent;
  }

  return null;
}

/**
 * Extract request and response types from the enclosing function
 * Looks at the enclosing arrow function or method for type annotations
 */
function extractTypesFromEnclosingFunction(
  node: any,
  content: string,
): { requestType?: string; responseType?: string } {
  let current = node;
  const result: { requestType?: string; responseType?: string } = {};

  while (current) {
    // Check for arrow function
    if (current.type === "arrow_function") {
      // Extract return type (response type)
      const returnTypeNode = current.childForFieldName("return_type");
      if (returnTypeNode) {
        const returnTypeText = getNodeText(returnTypeNode, content);
        // Handle Promise<Type> pattern
        const promiseMatch = returnTypeText.match(/Promise<(.+)>/);
        if (promiseMatch) {
          result.responseType = promiseMatch[1].trim();
        } else {
          result.responseType = returnTypeText.replace(/^:\s*/, "").trim();
        }
      }

      // Extract parameter types (request type for POST/PUT/PATCH)
      const parametersNode = current.childForFieldName("parameters");
      if (parametersNode) {
        // Collect all parameters with their types
        const params: Array<{ node: any; type: string | null; name: string }> = [];
        for (const child of parametersNode.children || []) {
          if (child.type === "identifier" || child.type === "required_parameter" || child.type === "optional_parameter") {
            const nameNode = child.childForFieldName("name") || child;
            const name = getNodeText(nameNode, content);
            const typeAnnotation = child.childForFieldName("type");
            const type = typeAnnotation ? getNodeText(typeAnnotation, content).replace(/^:\s*/, "").trim() : null;
            params.push({ node: child, type, name });
          }
        }

        // Find the body parameter (not a primitive type like string/number)
        // Usually the body parameter has an object/interface type
        for (const param of params) {
          if (param.type && !isPrimitiveType(param.type)) {
            result.requestType = param.type;
            break;
          }
        }
      }

      return result;
    }

    // Check for method definition
    if (current.type === "method_definition") {
      // Extract return type
      const returnTypeNode = current.childForFieldName("return_type");
      if (returnTypeNode) {
        const returnTypeText = getNodeText(returnTypeNode, content);
        const promiseMatch = returnTypeText.match(/Promise<(.+)>/);
        if (promiseMatch) {
          result.responseType = promiseMatch[1].trim();
        } else {
          result.responseType = returnTypeText.replace(/^:\s*/, "").trim();
        }
      }

      // Extract parameter types
      const parametersNode = current.childForFieldName("parameters");
      if (parametersNode) {
        const params: Array<{ node: any; type: string | null; name: string }> = [];
        for (const child of parametersNode.children || []) {
          if (child.type === "identifier" || child.type === "required_parameter" || child.type === "optional_parameter") {
            const nameNode = child.childForFieldName("name") || child;
            const name = getNodeText(nameNode, content);
            const typeAnnotation = child.childForFieldName("type");
            const type = typeAnnotation ? getNodeText(typeAnnotation, content).replace(/^:\s*/, "").trim() : null;
            params.push({ node: child, type, name });
          }
        }

        // Find the body parameter (not a primitive type)
        for (const param of params) {
          if (param.type && !isPrimitiveType(param.type)) {
            result.requestType = param.type;
            break;
          }
        }
      }

      return result;
    }

    current = current.parent;
  }

  return result;
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
  const types: ApiTypeDefinition[] = [];

  try {
    const content = await fs.readFile(filePath, "utf-8");
    const parser = getParser("typescript");
    const tree = parser.parse(content);

    traverseForTypes(tree.rootNode, content, filePath, types);
  } catch (err) {
    logger.debug(`AST parsing failed for ${filePath}: ${err}`);
  }

  return types;
}

function traverseForTypes(
  node: any,
  content: string,
  filePath: string,
  types: ApiTypeDefinition[],
): void {
  if (!node) return;

  // Interface declaration
  if (node.type === "interface_declaration") {
    const type = extractInterface(node, content, filePath);
    if (type) types.push(type);
  }

  // Type alias declaration
  if (node.type === "type_alias_declaration") {
    const type = extractTypeAlias(node, content, filePath);
    if (type) types.push(type);
  }

  // Recursively traverse children
  for (const child of node.children || []) {
    traverseForTypes(child, content, filePath, types);
  }
}

function extractInterface(
  node: any,
  content: string,
  filePath: string,
): ApiTypeDefinition | null {
  const nameNode = node.childForFieldName("name");
  if (!nameNode) return null;

  const name = getNodeText(nameNode, content);
  const bodyNode = node.childForFieldName("body");
  if (!bodyNode) return null;

  const fields = extractFieldsFromBody(bodyNode, content);

  return {
    name,
    fields,
    file: filePath,
    line: node.startPosition.row + 1,
    kind: "interface",
  };
}

function extractTypeAlias(
  node: any,
  content: string,
  filePath: string,
): ApiTypeDefinition | null {
  const nameNode = node.childForFieldName("name");
  if (!nameNode) return null;

  const name = getNodeText(nameNode, content);

  // For object type aliases
  const valueNode = node.childForFieldName("value");
  if (valueNode && valueNode.type === "object_type") {
    const fields = extractFieldsFromBody(valueNode, content);

    return {
      name,
      fields,
      file: filePath,
      line: node.startPosition.row + 1,
      kind: "type",
    };
  }

  return null;
}

function extractFieldsFromBody(bodyNode: any, content: string) {
  const fields: Array<{ name: string; type: string; required: boolean; optional?: boolean }> = [];

  for (const child of bodyNode.children || []) {
    if (child.type === "property_signature" || child.type === "field_definition") {
      const nameNode = child.childForFieldName("name");
      const typeNode = child.childForFieldName("type");

      if (nameNode) {
        const name = getNodeText(nameNode, content);
        const type = typeNode ? getNodeText(typeNode, content) : "any";

        // Check if optional
        const isOptional =
          child.type === "property_signature" &&
          child.children.some((c: any) => c.type === "?");

        fields.push({
          name,
          type,
          required: !isOptional,
          optional: isOptional,
        });
      }
    }
  }

  return fields;
}

// ============================================================================
// Backend Route Extraction (Python AST)
// ============================================================================

/**
 * Extract API route definitions from Python files
 * Uses regex-based extraction for Python (tree-sitter-python not available)
 */
export async function extractRoutesFromFile(
  filePath: string,
  framework: string,
): Promise<ApiRouteDefinition[]> {
  const routes: ApiRouteDefinition[] = [];

  try {
    const content = await fs.readFile(filePath, "utf-8");
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      if (framework === "fastapi") {
        // FastAPI: @app.post("/api/clients") or @router.get("/api/clients")
        const fastapiMatch = line.match(
          /@(?:app|router)\.(get|post|put|patch|delete)\s*\(\s*["']([^"']+)["']/i,
        );
        if (fastapiMatch) {
          const route = extractFastAPIRoute(
            content,
            lines,
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
          const route = extractFlaskRoute(content, lines, i, flaskMatch[1], filePath, lineNum);
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
    const methods = methodsMatch[1].split(",").map((m) => m.trim().replace(/["']/g, ""));
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
export async function extractModelsFromFile(filePath: string): Promise<ApiModelDefinition[]> {
  const models: ApiModelDefinition[] = [];

  try {
    const content = await fs.readFile(filePath, "utf-8");
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
        const fieldMatch = line.match(/^(?:\s+)(\w+)\s*:\s*([\w\[\],\s]+?)(?:\s*=\s*(.+))?$/);
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

function getNodeText(node: any, content: string): string {
  if (!node) return "";
  return content.slice(node.startIndex, node.endIndex);
}

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
  
  return pythonPrimitives.includes(normalized) || tsPrimitives.includes(normalized.toLowerCase());
}

// ============================================================================
// Import Resolution for Type Definitions
// ============================================================================

/**
 * Extract imports from a TypeScript file
 */
export async function extractImportsFromFileAST(filePath: string): Promise<ASTImport[]> {
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
export function resolveImportPath(importPath: string, fromFile: string): string | null {
  // Handle relative imports
  if (importPath.startsWith("./") || importPath.startsWith("../")) {
    const fromDir = path.dirname(fromFile);
    let resolvedPath = path.resolve(fromDir, importPath);
    
    // Try common TypeScript/JavaScript extensions
    const extensions = [".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx", "/index.js", "/index.jsx"];
    
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
      (n) => n.local === typeName || n.imported === typeName
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
export async function isImportedType(typeName: string, filePath: string): Promise<boolean> {
  const imports = await extractImportsFromFileAST(filePath);
  return imports.some((imp) =>
    imp.names.some((n) => n.local === typeName || n.imported === typeName)
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
