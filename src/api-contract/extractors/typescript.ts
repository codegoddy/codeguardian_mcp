/**
 * API Contract Guardian - TypeScript Extractor (AST-based)
 *
 * Extracts API service functions and TypeScript types/interfaces using AST.
 *
 * @format
 */

import * as fs from "fs/promises";
import * as path from "path";
import { glob } from "glob";
import { logger } from "../../utils/logger.js";
import { getParser } from "../../tools/validation/parser.js";
import {
  extractEndpointFromArguments as extractEndpointFromArgumentsTS,
  extractHttpMethodFromArguments as extractHttpMethodFromArgumentsTS,
  findEnclosingFunctionName,
  getNodeText,
  mapToHttpMethod,
} from "./tsAstUtils.js";
import type {
  ServiceDefinition,
  TypeDefinition,
  TypeField,
  HttpClient,
} from "../types.js";

// ============================================================================
// Service Extraction
// ============================================================================

/**
 * Extract all API service functions from a project
 */
export async function extractServices(
  projectPath: string,
): Promise<ServiceDefinition[]> {
  const services: ServiceDefinition[] = [];

  // Find service files
  const servicePatterns = [
    `${projectPath}/**/services/**/*.ts`,
    `${projectPath}/**/api/**/*.ts`,
    `${projectPath}/**/clients/**/*.ts`,
    `${projectPath}/src/lib/api.ts`,
    `${projectPath}/lib/api.ts`,
  ];

  const excludePatterns = [
    "**/node_modules/**",
    "**/*.test.ts",
    "**/*.spec.ts",
    "**/dist/**",
    "**/build/**",
  ];

  for (const pattern of servicePatterns) {
    const files = await glob(pattern, {
      ignore: excludePatterns,
      nodir: true,
      absolute: true,
    });

    for (const file of files) {
      try {
        const content = await fs.readFile(file, "utf-8");
        const fileServices = extractServicesFromFile(content, file);
        services.push(...fileServices);
      } catch (err) {
        logger.debug(`Failed to extract services from ${file}`);
      }
    }
  }

  logger.info(`Extracted ${services.length} API services from ${projectPath}`);
  return services;
}

/**
 * Extract service functions from a single file using AST
 */
export function extractServicesFromFile(
  content: string,
  filePath: string,
): ServiceDefinition[] {
  const services: ServiceDefinition[] = [];

  try {
    const parser = getParser("typescript");
    const tree = parser.parse(content)!;

    // Traverse AST to find API calls
    traverseNode(tree.rootNode, content, filePath, services);
  } catch (err) {
    logger.debug(`AST parsing failed for ${filePath}, falling back to regex`);
    return extractServicesFromFileRegex(content, filePath);
  }

  return services;
}

/**
 * Recursively traverse AST nodes to find API calls
 */
function traverseNode(
  node: any,
  content: string,
  filePath: string,
  services: ServiceDefinition[],
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
    traverseNode(child, content, filePath, services);
  }
}

/**
 * Common patterns for direct API helper function names
 */
const API_HELPER_PATTERNS = [
  /^fetch/i,          // fetchApi, fetchData, fetchJson
  /^api(?:Call|Request|Fetch)?$/i,   // api, apiCall, apiRequest, apiFetch
  /^(?:make|do|send)Request$/i,      // makeRequest, doRequest, sendRequest
  /^request$/i,
  /^http(?:Client|Request)?$/i,
];

/**
 * Extract service from a call expression node
 */
function extractServiceFromCall(
  node: any,
  content: string,
  filePath: string,
): ServiceDefinition | null {
  // Get the function being called
  const functionNode = node.childForFieldName("function");
  if (!functionNode) return null;

  // Case 1: Method call like ApiService.post or api.get
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

    const extracted = extractEndpointFromArgumentsTS(argumentsNode, content);
    if (!extracted) return null;
    const endpoint = extracted.endpoint;

    // Try to find the enclosing function/method name
    const enclosingFunction = findEnclosingFunctionName(node, content);

    // Extract request/response types from the enclosing function/method
    const { requestType, responseType } = extractTypesFromEnclosingFunction(
      node,
      content,
      httpMethod,
    );

    return {
      name: enclosingFunction || `${methodName}_${endpoint.replace(/[^a-zA-Z0-9]/g, "_")}`,
      method: httpMethod,
      endpoint,
      requestType,
      responseType,
      queryParams: extracted.queryParams.length > 0 ? extracted.queryParams : undefined,
      file: filePath,
      line: node.startPosition.row + 1,
    };
  }

  // Case 2: Direct function call like fetchApi('/endpoint', { method: 'POST' })
  // This handles wrapper functions (fetchApi, apiCall, request, etc.)
  if (functionNode.type === "identifier") {
    const funcName = getNodeText(functionNode, content);

    // Check if the function name matches common API helper patterns
    const isApiHelper = API_HELPER_PATTERNS.some(p => p.test(funcName));
    if (!isApiHelper) return null;

    // Extract arguments
    const argumentsNode = node.childForFieldName("arguments");
    if (!argumentsNode) return null;

    const extracted = extractEndpointFromArgumentsTS(argumentsNode, content);
    if (!extracted) return null;
    const endpoint = extracted.endpoint;

    // Try to detect HTTP method from the options argument (e.g., { method: 'POST' })
    const httpMethod = extractHttpMethodFromArgumentsTS(argumentsNode, content) || "GET";

    // Try to find the enclosing function/method name
    const enclosingFunction = findEnclosingFunctionName(node, content);

    const { requestType, responseType } = extractTypesFromEnclosingFunction(
      node,
      content,
      httpMethod,
    );

    return {
      name: enclosingFunction || `${funcName}_${endpoint.replace(/[^a-zA-Z0-9]/g, "_")}`,
      method: httpMethod,
      endpoint,
      requestType,
      responseType,
      queryParams: extracted.queryParams.length > 0 ? extracted.queryParams : undefined,
      file: filePath,
      line: node.startPosition.row + 1,
    };
  }

  return null;
}

/**
 * Best-effort request/response type extraction.
 *
 * This is intentionally heuristic: callers use it to enrich API contract mappings,
 * not as a compiler-grade typechecker.
 */
function extractTypesFromEnclosingFunction(
  node: any,
  content: string,
  method: ServiceDefinition["method"],
): { requestType?: string; responseType?: string } {
  let current = node;
  const result: { requestType?: string; responseType?: string } = {};

  while (current) {
    // Arrow function (common in React hooks/services)
    if (current.type === "arrow_function") {
      // Response type
      const returnTypeNode = current.childForFieldName?.("return_type");
      if (returnTypeNode) {
        const returnTypeText = normalizeTypeText(getNodeText(returnTypeNode, content));
        result.responseType = unwrapCommonGenerics(returnTypeText);
      }

      // Request type (first non-primitive typed param on write methods)
      if (method === "POST" || method === "PUT" || method === "PATCH") {
        const parametersNode = current.childForFieldName?.("parameters");
        if (parametersNode) {
          const params = collectTypedParameters(parametersNode, content);
          for (const p of params) {
            if (p.type && !isPrimitiveType(p.type)) {
              result.requestType = unwrapCommonGenerics(p.type);
              break;
            }
          }
        }
      }

      return result;
    }

    // Method definition (class services)
    if (current.type === "method_definition") {
      const returnTypeNode = current.childForFieldName?.("return_type");
      if (returnTypeNode) {
        const returnTypeText = normalizeTypeText(getNodeText(returnTypeNode, content));
        result.responseType = unwrapCommonGenerics(returnTypeText);
      }

      if (method === "POST" || method === "PUT" || method === "PATCH") {
        const parametersNode = current.childForFieldName?.("parameters");
        if (parametersNode) {
          const params = collectTypedParameters(parametersNode, content);
          for (const p of params) {
            if (p.type && !isPrimitiveType(p.type)) {
              result.requestType = unwrapCommonGenerics(p.type);
              break;
            }
          }
        }
      }

      return result;
    }

    // Function declaration
    if (current.type === "function_declaration") {
      const returnTypeNode = current.childForFieldName?.("return_type");
      if (returnTypeNode) {
        const returnTypeText = normalizeTypeText(getNodeText(returnTypeNode, content));
        result.responseType = unwrapCommonGenerics(returnTypeText);
      }

      if (method === "POST" || method === "PUT" || method === "PATCH") {
        const parametersNode = current.childForFieldName?.("parameters");
        if (parametersNode) {
          const params = collectTypedParameters(parametersNode, content);
          for (const p of params) {
            if (p.type && !isPrimitiveType(p.type)) {
              result.requestType = unwrapCommonGenerics(p.type);
              break;
            }
          }
        }
      }

      return result;
    }

    current = current.parent;
  }

  return result;
}

function collectTypedParameters(
  parametersNode: any,
  content: string,
): Array<{ name: string; type?: string }> {
  const out: Array<{ name: string; type?: string }> = [];
  for (const child of parametersNode.children || []) {
    if (!child) continue;

    // tree-sitter-typescript: required_parameter / optional_parameter / identifier
    if (
      child.type === "required_parameter" ||
      child.type === "optional_parameter" ||
      child.type === "identifier"
    ) {
      const nameNode = child.childForFieldName?.("name") || child;
      const typeNode = child.childForFieldName?.("type");
      const name = nameNode ? getNodeText(nameNode, content) : "";
      const typeText = typeNode
        ? normalizeTypeText(getNodeText(typeNode, content))
        : undefined;
      if (name) out.push({ name, type: typeText });
    }
  }
  return out;
}

function normalizeTypeText(typeText: string): string {
  return typeText.replace(/^\s*:\s*/, "").trim();
}

function unwrapCommonGenerics(typeText: string): string {
  let t = typeText.trim();

  // Strip trailing array syntax
  while (t.endsWith("[]")) {
    t = t.slice(0, -2).trim();
  }

  // Common wrappers
  const wrappers = [
    "Promise",
    "AxiosResponse",
    "ApiResponse",
    "Response",
    "Array",
    "ReadonlyArray",
  ];

  for (let i = 0; i < 5; i++) {
    const m = t.match(/^([A-Za-z0-9_$.]+)\s*<\s*(.+)\s*>$/);
    if (!m) break;

    const name = m[1];
    const inner = m[2];
    if (!wrappers.includes(name.split(".").pop() || name)) break;

    t = inner.trim();
  }

  return t;
}

function isPrimitiveType(typeName: string): boolean {
  const raw = typeName.trim();
  if (!raw) return true;

  // Literal types
  if (/^['"`].*['"`]$/.test(raw)) return true;
  if (/^[0-9]+(?:\.[0-9]+)?$/.test(raw)) return true;

  // Union: only primitive if all parts are primitive
  const unionParts = raw.split("|").map((p) => p.trim()).filter(Boolean);
  if (unionParts.length > 1) {
    return unionParts.every((p) => isPrimitiveType(p));
  }

  // Arrays / generics
  const unwrapped = unwrapCommonGenerics(raw);
  const base = unwrapped.replace(/\[\]$/g, "").trim();

  const primitives = new Set([
    "string",
    "number",
    "boolean",
    "null",
    "undefined",
    "any",
    "unknown",
    "void",
    "never",
    "object",
    "Record",
  ]);

  const lower = base.toLowerCase();
  if (primitives.has(lower)) return true;

  // Sometimes TS nodes preserve casing (Record/Promise)
  const head = base.split(/[<\s]/)[0];
  if (primitives.has(head) || primitives.has(head.toLowerCase())) return true;

  return false;
}

// ============================================================================
// Fallback Regex Extraction
// ============================================================================

/**
 * Fallback regex-based extraction when AST fails
 */
function extractServicesFromFileRegex(
  content: string,
  filePath: string,
): ServiceDefinition[] {
  const services: ServiceDefinition[] = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Pattern: ApiService.post('/endpoint', data)
    // Pattern: api.get('/endpoint')
    const apiCallMatch = line.match(
      /(?:ApiService|api|axios|client|[A-Za-z]+Api|[A-Za-z]+Service)\.(get|post|put|patch|delete)\s*\(\s*["'`]([^"'`]+)["'`]/i,
    );

    if (apiCallMatch) {
      const method = apiCallMatch[1].toUpperCase() as ServiceDefinition["method"];
      const endpoint = apiCallMatch[2];

      // Try to find function name
      const funcMatch =
        line.match(/(?:export\s+)?(?:async\s+)?(?:function|const)\s+(\w+)/) ||
        lines.slice(Math.max(0, i - 5), i).join(" ").match(/(\w+)\s*[:=]\s*(?:async\s*)?\(/);

      const funcName = funcMatch ? funcMatch[1] : `api_${method.toLowerCase()}`;

      services.push({
        name: funcName,
        method,
        endpoint,
        file: filePath,
        line: lineNum,
      });
    }
  }

  return services;
}

// ============================================================================
// Type Extraction
// ============================================================================

/**
 * Extract all TypeScript types/interfaces from a project
 */
export async function extractTypes(
  projectPath: string,
): Promise<TypeDefinition[]> {
  const types: TypeDefinition[] = [];

  // Find type definition files
  const typePatterns = [
    `${projectPath}/**/types/**/*.ts`,
    `${projectPath}/**/interfaces/**/*.ts`,
    `${projectPath}/**/models/**/*.ts`,
    `${projectPath}/src/services/**/*.ts`, // Include services folder for inline types
    `${projectPath}/src/types.ts`,
    `${projectPath}/types.ts`,
  ];

  const excludePatterns = [
    "**/node_modules/**",
    "**/*.test.ts",
    "**/*.spec.ts",
    "**/dist/**",
    "**/build/**",
  ];

  for (const pattern of typePatterns) {
    const files = await glob(pattern, {
      ignore: excludePatterns,
      nodir: true,
      absolute: true,
    });

    for (const file of files) {
      try {
        const content = await fs.readFile(file, "utf-8");
        const fileTypes = extractTypesFromFile(content, file);
        types.push(...fileTypes);
      } catch (err) {
        logger.debug(`Failed to extract types from ${file}`);
      }
    }
  }

  logger.info(`Extracted ${types.length} types from ${projectPath}`);
  return types;
}

/**
 * Extract types/interfaces from a single file using AST
 */
export function extractTypesFromFile(content: string, filePath: string): TypeDefinition[] {
  const types: TypeDefinition[] = [];

  try {
    const parser = getParser("typescript");
    const tree = parser.parse(content)!;

    traverseTypes(tree.rootNode, content, filePath, types);
  } catch (err) {
    logger.debug(`AST parsing failed for ${filePath}, falling back to regex`);
    return extractTypesFromFileRegex(content, filePath);
  }

  return types;
}

/**
 * Recursively traverse AST to find type definitions
 */
function traverseTypes(
  node: any,
  content: string,
  filePath: string,
  types: TypeDefinition[],
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
    traverseTypes(child, content, filePath, types);
  }
}

/**
 * Extract interface definition
 */
function extractInterface(
  node: any,
  content: string,
  filePath: string,
): TypeDefinition | null {
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

/**
 * Extract type alias definition
 */
function extractTypeAlias(
  node: any,
  content: string,
  filePath: string,
): TypeDefinition | null {
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

/**
 * Extract fields from interface/type body
 */
function extractFieldsFromBody(bodyNode: any, content: string): TypeField[] {
  const fields: TypeField[] = [];

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

/**
 * Fallback regex-based type extraction
 */
function extractTypesFromFileRegex(content: string, filePath: string): TypeDefinition[] {
  const types: TypeDefinition[] = [];
  const lines = content.split("\n");

  let currentType: Partial<TypeDefinition> | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Interface declaration
    const interfaceMatch = line.match(
      /(?:export\s+)?interface\s+(\w+)(?:\s+extends\s+[^{]+)?\s*\{/,
    );
    if (interfaceMatch) {
      if (currentType) {
        types.push(currentType as TypeDefinition);
      }
      currentType = {
        name: interfaceMatch[1],
        kind: "interface",
        fields: [],
        file: filePath,
        line: i + 1,
      };
      continue;
    }

    // Type alias declaration
    const typeMatch = line.match(/(?:export\s+)?type\s+(\w+)\s*=\s*\{/);
    if (typeMatch) {
      if (currentType) {
        types.push(currentType as TypeDefinition);
      }
      currentType = {
        name: typeMatch[1],
        kind: "type",
        fields: [],
        file: filePath,
        line: i + 1,
      };
      continue;
    }

    // Extract field
    if (currentType) {
      const isIndented = line.startsWith("    ") || line.startsWith("\t");
      const isEmpty = line.trim() === "";
      const isComment = line.trim().startsWith("//");

      if (!isIndented && !isEmpty && !isComment) {
        types.push(currentType as TypeDefinition);
        currentType = null;
        continue;
      }

      const fieldMatch = line.match(
        /(\w+)(\?)?:\s*([^;\[\{]+)(?:\[\])?(?:\s*;)?/,
      );
      if (fieldMatch) {
        currentType.fields!.push({
          name: fieldMatch[1],
          type: fieldMatch[3].trim(),
          required: !fieldMatch[2],
          optional: !!fieldMatch[2],
        });
      }
    }
  }

  if (currentType) {
    types.push(currentType as TypeDefinition);
  }

  return types;
}

// ============================================================================
// API Configuration Extraction
// ============================================================================

/**
 * Extract API configuration from a project
 */
export async function extractApiConfig(
  projectPath: string,
): Promise<{
  apiBaseUrl: string;
  httpClient: HttpClient;
}> {
  let apiBaseUrl = "/api";
  let httpClient: HttpClient = "fetch";

  // Check for API config files
  const configPaths = [
    path.join(projectPath, "src/config/api.ts"),
    path.join(projectPath, "src/lib/api.ts"),
    path.join(projectPath, "lib/api.ts"),
    path.join(projectPath, "utils/api.ts"),
    path.join(projectPath, "src/api/client.ts"),
    path.join(projectPath, "src/services/api.ts"),
  ];

  for (const configPath of configPaths) {
    if (await fileExists(configPath)) {
      try {
        const content = await fs.readFile(configPath, "utf-8");

        // Detect HTTP client
        if (content.includes("axios")) {
          httpClient = "axios";
        } else if (content.includes("react-query") || content.includes("useQuery")) {
          httpClient = "react-query";
        } else if (content.includes("swr")) {
          httpClient = "swr";
        } else if (content.includes("ApiService")) {
          httpClient = "fetch"; // Custom service using fetch
        }

        // Extract base URL
        const baseUrlMatch =
          content.match(/baseURL\s*[:=]\s*["']([^"']+)["']/) ||
          content.match(/baseUrl\s*[:=]\s*["']([^"']+)["']/) ||
          content.match(/API_BASE_URL\s*[:=]\s*["']([^"']+)["']/);

        if (baseUrlMatch) {
          apiBaseUrl = baseUrlMatch[1];
        }

        break;
      } catch {
        // Continue to next file
      }
    }
  }

  return { apiBaseUrl, httpClient };
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const stats = await fs.stat(filePath);
    return stats.isFile();
  } catch {
    return false;
  }
}
