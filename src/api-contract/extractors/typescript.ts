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
    const tree = parser.parse(content);

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

    return {
      name: enclosingFunction || `${methodName}_${endpoint.replace(/[^a-zA-Z0-9]/g, "_")}`,
      method: httpMethod,
      endpoint,
      file: filePath,
      line: node.startPosition.row + 1,
    };
  }

  return null;
}

/**
 * Map method name to HTTP method
 */
function mapToHttpMethod(methodName: string): ServiceDefinition["method"] | null {
  const methodMap: Record<string, ServiceDefinition["method"]> = {
    get: "GET",
    post: "POST",
    put: "PUT",
    patch: "PATCH",
    delete: "DELETE",
  };

  return methodMap[methodName.toLowerCase()] || null;
}

/**
 * Extract endpoint URL from call arguments
 */
function extractEndpointFromArguments(argumentsNode: any, content: string): string | null {
  // First argument should be the endpoint
  for (const child of argumentsNode.children || []) {
    if (child.type === "string" || child.type === "template_string") {
      return extractStringValue(child, content);
    }
  }
  return null;
}

/**
 * Extract string value from string/template node
 */
function extractStringValue(node: any, content: string): string | null {
  if (node.type === "string") {
    const text = getNodeText(node, content);
    // Remove quotes
    return text.replace(/^["']|["']$/g, "");
  }

  if (node.type === "template_string") {
    // For template strings like `/api/clients/${id}`, extract the base path
    const text = getNodeText(node, content);
    // Extract the static parts
    const match = text.match(/`([^$]*)\$\{/);
    if (match) {
      return match[1].replace(/\/$/, ""); // Remove trailing slash
    }
    // If no interpolation, just return the string content
    return text.replace(/^`/, "").replace(/`$/, "");
  }

  return null;
}

/**
 * Find the enclosing function name for an API call
 */
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

    current = current.parent;
  }

  return null;
}

/**
 * Get text content of a node
 */
function getNodeText(node: any, content: string): string {
  if (!node) return "";
  return content.slice(node.startIndex, node.endIndex);
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
    const tree = parser.parse(content);

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
