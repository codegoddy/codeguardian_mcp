/**
 * API Contract Guardian - Validators Index
 *
 * Validates API contracts using the ProjectContext.
 * This version works with the integrated context system.
 *
 * @format
 */

import type { ProjectContext, ApiContractContext, ApiRouteDefinition } from "../../context/projectContext.js";
import * as fsSync from "fs";
import { getParser } from "../../tools/validation/parser.js";

// ============================================================================
// Types
// ============================================================================

export type ApiContractIssueType =
  | "apiContractMismatch"
  | "apiEndpointNotFound"
  | "apiMethodMismatch"
  | "apiPathMismatch"
  | "apiMissingRequiredField"
  | "apiNamingConventionMismatch"
  | "apiTypeMismatch"
  | "apiExtraField";

export interface ApiContractIssue {
  type: ApiContractIssueType;
  severity: "critical" | "high" | "medium" | "low";
  message: string;
  file: string;
  line: number;
  endpoint?: string;
  suggestion: string;
  confidence?: number;
}

export interface ApiContractValidationResult {
  issues: ApiContractIssue[];
  summary: {
    totalIssues: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    matchedEndpoints: number;
    matchedTypes: number;
    unmatchedFrontend: number;
    unmatchedBackend: number;
  };
}

// ============================================================================
// Main Validation Function
// ============================================================================

/**
 * Validate API contracts from the ProjectContext
 * This is the main entry point for API Contract validation
 */
export function validateApiContractsFromContext(
  context: ProjectContext,
): ApiContractValidationResult {
  if (!context.apiContract) {
    return {
      issues: [],
      summary: {
        totalIssues: 0,
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
        matchedEndpoints: 0,
        matchedTypes: 0,
        unmatchedFrontend: 0,
        unmatchedBackend: 0,
      },
    };
  }

  const apiContract = context.apiContract;
  const issues: ApiContractIssue[] = [];

  // Validate endpoint mappings
  issues.push(...validateEndpoints(apiContract));

  // Validate type mappings
  issues.push(...validateTypes(apiContract));

  // Validate unmatched frontend services
  issues.push(...validateUnmatchedFrontend(apiContract));

  // Calculate summary
  const summary = {
    totalIssues: issues.length,
    critical: issues.filter((i) => i.severity === "critical").length,
    high: issues.filter((i) => i.severity === "high").length,
    medium: issues.filter((i) => i.severity === "medium").length,
    low: issues.filter((i) => i.severity === "low").length,
    matchedEndpoints: apiContract.endpointMappings.size,
    matchedTypes: apiContract.typeMappings.size,
    unmatchedFrontend: apiContract.unmatchedFrontend.length,
    unmatchedBackend: apiContract.unmatchedBackend.length,
  };

  return { issues, summary };
}

// ============================================================================
// Endpoint Validation
// ============================================================================

function validateEndpoints(apiContract: ApiContractContext): ApiContractIssue[] {
  const issues: ApiContractIssue[] = [];

  for (const [endpoint, mapping] of apiContract.endpointMappings) {
    // Check HTTP method match
    if (mapping.frontend.method !== mapping.backend.method) {
      issues.push({
        type: "apiMethodMismatch",
        severity: "critical",
        message: `HTTP method mismatch: frontend uses ${mapping.frontend.method}, backend expects ${mapping.backend.method}`,
        file: mapping.frontend.file,
        line: mapping.frontend.line,
        endpoint,
        suggestion: `Change frontend to use ${mapping.backend.method}`,
        confidence: 95,
      });
    }

    // Check if there are multiple methods available for this endpoint
    if (mapping.hasMultipleMethods && mapping.availableMethods) {
      const currentMethod = mapping.frontend.method;
      const otherMethods = mapping.availableMethods.filter(m => m !== currentMethod);
      
      if (otherMethods.length > 0) {
        // Check if the function name suggests a different method should be used
        const functionName = mapping.frontend.name.toLowerCase();
        const suggestedMethod = inferMethodFromFunctionName(functionName);
        
        if (suggestedMethod && suggestedMethod !== currentMethod && mapping.availableMethods.includes(suggestedMethod)) {
          issues.push({
            type: "apiMethodMismatch",
            severity: "high",
            message: `Suspicious HTTP method: function '${mapping.frontend.name}' suggests ${suggestedMethod}, but frontend uses ${currentMethod}. Backend also supports: ${otherMethods.join(', ')}`,
            file: mapping.frontend.file,
            line: mapping.frontend.line,
            endpoint,
            suggestion: `Consider using ${suggestedMethod} instead of ${currentMethod} for '${mapping.frontend.name}'`,
            confidence: 85,
          });
        }
      }
    }

    // Check path compatibility
    const pathIssues = validatePathCompatibility(
      mapping.frontend.endpoint,
      mapping.backend.path,
      mapping.frontend.file,
      mapping.frontend.line,
    );
    issues.push(...pathIssues);

    // Validate request/response body types
    const bodyIssues = validateRequestResponseTypes(
      mapping,
      apiContract,
      endpoint,
    );
    issues.push(...bodyIssues);
  }

  return issues;
}

function inferMethodFromFunctionName(functionName: string): string | undefined {
  const methodPatterns: Record<string, string[]> = {
    'GET': ['get', 'fetch', 'load', 'retrieve', 'read', 'list', 'find', 'search'],
    'POST': ['create', 'add', 'post', 'submit', 'save', 'insert', 'register', 'login', 'logout'],
    'PUT': ['update', 'edit', 'modify', 'change', 'replace'],
    'PATCH': ['patch', 'partial', 'tweak'],
    'DELETE': ['delete', 'remove', 'destroy', 'clear', 'drop']
  };
  
  for (const [method, patterns] of Object.entries(methodPatterns)) {
    if (patterns.some(pattern => functionName.includes(pattern))) {
      return method;
    }
  }
  
  return undefined;
}

function validatePathCompatibility(
  frontendPath: string,
  backendPath: string,
  file: string,
  line: number,
): ApiContractIssue[] {
  const issues: ApiContractIssue[] = [];

  // Normalize both paths (converting all param formats to {param})
  const normalizedFrontend = normalizePathForComparison(frontendPath);
  const normalizedBackend = normalizePathForComparison(backendPath);

  // Check if paths match (accounting for API prefixes and param formats)
  if (!pathsMatch(normalizedFrontend, normalizedBackend)) {
    const frontendWithoutPrefix = removeApiPrefix(normalizedFrontend);
    const backendWithoutPrefix = removeApiPrefix(normalizedBackend);

    if (!pathsMatch(frontendWithoutPrefix, backendWithoutPrefix)) {
      issues.push({
        type: "apiPathMismatch",
        severity: "high",
        message: `Endpoint path mismatch: frontend calls '${frontendPath}', backend route is '${backendPath}'`,
        file,
        line,
        endpoint: frontendPath,
        suggestion: `Update frontend path to match backend: '${backendPath}'`,
        confidence: 90,
      });
    }
  }

  // Check for path parameter consistency using normalized paths
  const frontendParams = extractPathParams(frontendPath);
  const backendParams = extractPathParams(backendPath);

  // Use prefix-stripped, fully normalized paths for positional comparison
  // so frontend "roles/{role_id}/sops" matches backend "api/roles/{id}/sops"
  const feStripped = removeApiPrefix(normalizedFrontend);
  const beStripped = removeApiPrefix(normalizedBackend);
  const frontendSegments = feStripped.split('/');
  const backendSegments = beStripped.split('/');
  
  // Build positional param map: match params by their position in the path
  const positionallyMatched = new Set<string>();
  const positionallyMatchedBackend = new Set<string>();
  
  if (frontendSegments.length === backendSegments.length) {
    for (let i = 0; i < frontendSegments.length; i++) {
      const fSeg = frontendSegments[i];
      const bSeg = backendSegments[i];
      if (isPathParam(fSeg) && isPathParam(bSeg)) {
        // Both are path params at the same position — they're equivalent
        const fParam = fSeg.replace(/[{}\$:]/g, '').split(':')[0];
        const bParam = bSeg.replace(/[{}\$:]/g, '').split(':')[0];
        // Convert camelCase frontend param to snake_case for comparison
        const fParamSnake = fParam.replace(/[A-Z]/g, (letter: string) => `_${letter.toLowerCase()}`);
        positionallyMatched.add(fParam);
        positionallyMatched.add(fParamSnake);
        positionallyMatchedBackend.add(bParam);
      }
    }
  }

  // Check for missing parameters in frontend (skip positionally matched ones)
  for (const param of backendParams) {
    if (!frontendParams.includes(param) && !positionallyMatchedBackend.has(param)) {
      issues.push({
        type: "apiPathMismatch",
        severity: "high",
        message: `Missing path parameter '${param}' in frontend URL`,
        file,
        line,
        endpoint: frontendPath,
        suggestion: `Add '${param}' parameter to frontend path: '${backendPath}'`,
        confidence: 95,
      });
    }
  }

  // Check for extra parameters in frontend (skip positionally matched ones)
  for (const param of frontendParams) {
    if (!backendParams.includes(param) && !positionallyMatched.has(param)) {
      issues.push({
        type: "apiPathMismatch",
        severity: "medium",
        message: `Extra path parameter '${param}' in frontend URL not found in backend`,
        file,
        line,
        endpoint: frontendPath,
        suggestion: `Remove '${param}' parameter or update backend route`,
        confidence: 80,
      });
    }
  }

  return issues;
}

/**
 * Validate request and response body types between frontend and backend
 */
function validateRequestResponseTypes(
  mapping: any,
  apiContract: ApiContractContext,
  endpoint: string,
): ApiContractIssue[] {
  const issues: ApiContractIssue[] = [];

  // Validate request body type
  if (mapping.frontend.requestType && mapping.backend.requestModel) {
    const frontendRequestType = mapping.frontend.requestType;
    const backendRequestModel = mapping.backend.requestModel;

    // Skip validation for complex types that couldn't be extracted properly
    if (isComplexType(frontendRequestType) || isComplexType(backendRequestModel)) {
      // Complex types - skip detailed validation
    } else if (frontendRequestType !== backendRequestModel) {
      // Check if they're similar type names
      if (!areSimilarTypeNames(frontendRequestType.toLowerCase(), backendRequestModel.toLowerCase())) {
        // Check if there's a type mapping for this
        const typeMapping = apiContract.typeMappings.get(frontendRequestType);
        if (!typeMapping || typeMapping.backend?.name !== backendRequestModel) {
          // Check if FE sends an array type that the BE wraps in a model
          // e.g., FE sends PaymentMilestoneCreate[] → BE expects PaymentScheduleSetup { milestones: List[PaymentMilestoneCreate] }
          const isWrappedArray = isArrayTypeWrappedInModel(frontendRequestType, backendRequestModel, apiContract);
          if (!isWrappedArray) {
            issues.push({
              type: "apiTypeMismatch",
              severity: "high",
              message: `Request body type mismatch: frontend sends '${frontendRequestType}', backend expects '${backendRequestModel}'`,
              file: mapping.frontend.file,
              line: mapping.frontend.line,
              endpoint,
              suggestion: `Ensure frontend type '${frontendRequestType}' matches backend model '${backendRequestModel}'`,
              confidence: 85,
            });
          }
        }
      }
    }

    // Validate field compatibility if we have the type mapping
    const typeMapping = apiContract.typeMappings.get(frontendRequestType);
    if (typeMapping) {
      const backendModel = apiContract.backendModels.find(m => m.name === backendRequestModel);
      if (backendModel) {
        // Check for missing required fields
        for (const backendField of backendModel.fields) {
          if (backendField.required) {
            const frontendField = typeMapping.frontend.fields.find(
              (f: { name: string }) => normalizeName(f.name) === normalizeName(backendField.name),
            );

            if (!frontendField) {
              issues.push({
                type: "apiMissingRequiredField",
                severity: "critical",
                message: `Missing required field '${backendField.name}' in request body. Backend model '${backendRequestModel}' requires this field`,
                file: mapping.frontend.file,
                line: mapping.frontend.line,
                endpoint,
                suggestion: `Add '${backendField.name}: ${backendField.type}' to frontend type '${frontendRequestType}'`,
                confidence: 95,
              });
            }
          }
        }
      }
    }
  }

  // Validate response body type
  if (mapping.frontend.responseType && mapping.backend.responseModel) {
    const frontendResponseType = mapping.frontend.responseType;
    const backendResponseModel = mapping.backend.responseModel;

    // Handle array types (e.g., Client[])
    const normalizedFrontendType = frontendResponseType.replace(/\[\]$/, "");
    const normalizedBackendModel = backendResponseModel.replace(/\[\]$/, "");

    if (normalizedFrontendType !== normalizedBackendModel) {
      // Check if there's a type mapping for this
      const typeMapping = apiContract.typeMappings.get(normalizedFrontendType);
      if (!typeMapping || typeMapping.backend?.name !== normalizedBackendModel) {
        issues.push({
          type: "apiTypeMismatch",
          severity: "medium",
          message: `Response type mismatch: frontend expects '${frontendResponseType}', backend returns '${backendResponseModel}'`,
          file: mapping.frontend.file,
          line: mapping.frontend.line,
          endpoint,
          suggestion: `Ensure frontend type '${frontendResponseType}' is compatible with backend model '${backendResponseModel}'`,
          confidence: 80,
        });
      }
    }
  }

  // Validate query parameters
  const queryParamIssues = validateQueryParameters(mapping, endpoint);
  issues.push(...queryParamIssues);

  // Validate inline request/response field usage when types/models are missing.
  // This catches common vibecoding errors like `data.username` when backend returns `name`.
  issues.push(...validateInlineRequestResponseFields(mapping, endpoint));

  return issues;
}

function validateInlineRequestResponseFields(mapping: any, endpoint: string): ApiContractIssue[] {
  const issues: ApiContractIssue[] = [];

  const frontendFile = mapping?.frontend?.file;
  const backendFile = mapping?.backend?.file;
  const method = mapping?.backend?.method || mapping?.frontend?.method;
  const backendPath = mapping?.backend?.path;

  if (!frontendFile || !backendFile || !method || !backendPath) return issues;
  if (!fsSync.existsSync(frontendFile) || !fsSync.existsSync(backendFile)) return issues;

  let feContent = "";
  let beContent = "";
  try {
    feContent = fsSync.readFileSync(frontendFile, "utf-8");
    beContent = fsSync.readFileSync(backendFile, "utf-8");
  } catch {
    return issues;
  }

  // Best-effort TypeScript parsing. If parsers aren't ready, skip instead of failing the whole run.
  let feTree: any;
  let beTree: any;
  try {
    feTree = getParser("typescript").parse(feContent);
    beTree = getParser("typescript").parse(beContent);
  } catch {
    return issues;
  }

  const frontendFnName: string | undefined = mapping?.frontend?.name;
  const feFnNode = frontendFnName ? findFunctionLikeByName(feTree.rootNode, feContent, frontendFnName) : null;

  const feResponseFields = feFnNode ? extractResponseFieldsUsed(feFnNode, feContent) : new Set<string>();
  const feRequestFields = feFnNode ? extractRequestBodyFieldsUsed(feFnNode, feContent) : new Set<string>();

  const beRouteNode = findExpressRouteHandler(beTree.rootNode, beContent, method, backendPath);
  const beResponseFields = beRouteNode ? extractBackendResponseFields(beRouteNode, beContent) : new Set<string>();
  const beRequestFields = beRouteNode ? extractBackendRequestFields(beRouteNode, beContent) : new Set<string>();

  // Response field mismatches
  if (feResponseFields.size > 0 && beResponseFields.size > 0) {
    for (const field of feResponseFields) {
      if (!beResponseFields.has(field)) {
        issues.push({
          type: "apiMissingRequiredField",
          severity: "high",
          message: `Response field mismatch: frontend uses '${field}', but backend response for ${method.toUpperCase()} ${backendPath} does not include it`,
          file: frontendFile,
          line: mapping.frontend.line,
          endpoint,
          suggestion: `Update frontend to use one of: ${Array.from(beResponseFields).sort().join(", ")}`,
          confidence: 80,
        });
      }
    }
  }

  // Request body extra fields
  if (feRequestFields.size > 0 && beRequestFields.size > 0) {
    for (const field of feRequestFields) {
      if (!beRequestFields.has(field)) {
        issues.push({
          type: "apiExtraField",
          severity: "medium",
          message: `Request field mismatch: frontend sends '${field}', but backend handler for ${method.toUpperCase()} ${backendPath} does not read/expect it`,
          file: frontendFile,
          line: mapping.frontend.line,
          endpoint,
          suggestion: `Remove '${field}' from request payload or update backend to accept it`,
          confidence: 75,
        });
      }
    }
  }

  return issues;
}

function findFunctionLikeByName(root: any, content: string, name: string): any | null {
  let found: any | null = null;
  const target = name.trim();

  const visit = (node: any) => {
    if (!node || found) return;

    if (node.type === "function_declaration") {
      const nameNode = node.childForFieldName?.("name");
      if (nameNode && content.slice(nameNode.startIndex, nameNode.endIndex) === target) {
        found = node;
        return;
      }
    }

    // const foo = async (...) => {}
    if (node.type === "variable_declarator") {
      const nameNode = node.childForFieldName?.("name");
      const valueNode = node.childForFieldName?.("value");
      const nodeName = nameNode ? content.slice(nameNode.startIndex, nameNode.endIndex) : "";
      if (nodeName === target && (valueNode?.type === "arrow_function" || valueNode?.type === "function")) {
        found = valueNode;
        return;
      }
    }

    // { getUser: async (...) => {} }
    if (node.type === "pair") {
      const keyNode = node.childForFieldName?.("key");
      const valueNode = node.childForFieldName?.("value");
      if (keyNode && valueNode && (valueNode.type === "arrow_function" || valueNode.type === "function")) {
        const keyText = content
          .slice(keyNode.startIndex, keyNode.endIndex)
          .replace(/^['"`]/, "")
          .replace(/['"`]$/, "");
        if (keyText === target) {
          found = valueNode;
          return;
        }
      }
    }

    // { async getUser(...) { ... } }
    if (node.type === "method_definition") {
      const nameNode = node.childForFieldName?.("name");
      if (nameNode) {
        const nodeName = content
          .slice(nameNode.startIndex, nameNode.endIndex)
          .replace(/^['"`]/, "")
          .replace(/['"`]$/, "");
        if (nodeName === target) {
          found = node;
          return;
        }
      }
    }

    for (const child of node.children || []) visit(child);
  };

  visit(root);
  return found;
}

function extractResponseFieldsUsed(functionNode: any, content: string): Set<string> {
  const fields = new Set<string>();
  const jsonVars = new Set<string>();

  const visit = (node: any) => {
    if (!node) return;

    // const data = await response.json()
    if (node.type === "variable_declarator") {
      const nameNode = node.childForFieldName?.("name");
      const valueNode = node.childForFieldName?.("value");
      if (nameNode && valueNode) {
        const varName = content.slice(nameNode.startIndex, nameNode.endIndex);
        if (isAwaitedJsonCall(valueNode, content)) {
          jsonVars.add(varName);
        }
      }
    }

    // data.username
    if (node.type === "member_expression") {
      const objectNode = node.childForFieldName?.("object");
      const propertyNode = node.childForFieldName?.("property");
      if (objectNode?.type === "identifier" && propertyNode?.type === "property_identifier") {
        const obj = content.slice(objectNode.startIndex, objectNode.endIndex);
        const prop = content.slice(propertyNode.startIndex, propertyNode.endIndex);
        if (jsonVars.has(obj)) fields.add(prop);
      }
    }

    for (const child of node.children || []) visit(child);
  };

  visit(functionNode);
  return fields;
}

function isAwaitedJsonCall(node: any, content: string): boolean {
  const awaited =
    node.type === "await_expression"
      ? node.childForFieldName?.("argument") ||
        node.childForFieldName?.("expression") ||
        (node.namedChildren ? node.namedChildren[0] : null)
      : node;

  const n = awaited;
  if (!n || n.type !== "call_expression") return false;
  const fn = n.childForFieldName?.("function");
  if (!fn || fn.type !== "member_expression") return false;
  const prop = fn.childForFieldName?.("property");
  if (!prop) return false;
  const propText = content.slice(prop.startIndex, prop.endIndex);
  return propText === "json";
}

function extractRequestBodyFieldsUsed(functionNode: any, content: string): Set<string> {
  const fields = new Set<string>();

  // Find request body identifier used in `body: JSON.stringify(x)`.
  const bodyVars = new Set<string>();

  const visit = (node: any) => {
    if (!node) return;
    if (node.type === "call_expression") {
      const fn = node.childForFieldName?.("function");
      const args = node.childForFieldName?.("arguments");
      if (fn?.type === "identifier" && content.slice(fn.startIndex, fn.endIndex) === "fetch" && args) {
        // Find an object arg that contains `body:`
        for (const child of args.children || []) {
          if (child.type !== "object") continue;
          for (const pair of child.children || []) {
            if (pair.type !== "pair") continue;
            const keyNode = pair.childForFieldName?.("key");
            const valNode = pair.childForFieldName?.("value");
            if (!keyNode || !valNode) continue;
            const keyText = content.slice(keyNode.startIndex, keyNode.endIndex);
            if (keyText !== "body") continue;

            const id = extractJsonStringifyIdentifier(valNode, content);
            if (id) bodyVars.add(id);
          }
        }
      }
    }
    for (const child of node.children || []) visit(child);
  };
  visit(functionNode);

  if (bodyVars.size === 0) return fields;

  // If body var is a function parameter with an inline object type, extract fields from its type literal.
  const paramsNode = functionNode.childForFieldName?.("parameters");
  if (!paramsNode) return fields;

  for (const param of paramsNode.children || []) {
    const nameNode =
      param.childForFieldName?.("pattern") ||
      param.childForFieldName?.("name") ||
      (param.namedChildren ? param.namedChildren.find((c: any) => c.type === "identifier") : null);
    if (!nameNode) continue;
    const paramName = content.slice(nameNode.startIndex, nameNode.endIndex);
    if (!bodyVars.has(paramName)) continue;

    const typeNode =
      param.childForFieldName?.("type") ||
      (param.namedChildren ? param.namedChildren.find((c: any) => c.type === "type_annotation") : null);
    if (!typeNode) continue;
    const astKeys = extractKeysFromInlineObjectTypeNode(typeNode, content);
    if (astKeys.length > 0) {
      for (const key of astKeys) fields.add(key);
    } else {
      const typeText = content.slice(typeNode.startIndex, typeNode.endIndex);
      for (const key of extractKeysFromInlineObjectType(typeText)) fields.add(key);
    }
  }

  return fields;
}

function extractKeysFromInlineObjectTypeNode(typeNode: any, content: string): string[] {
  const keys: string[] = [];
  let objectType: any | null = null;

  const findObjectType = (node: any) => {
    if (!node || objectType) return;
    if (node.type === "object_type") {
      objectType = node;
      return;
    }
    for (const child of node.children || []) findObjectType(child);
  };
  findObjectType(typeNode);
  if (!objectType) return keys;

  for (const child of objectType.children || []) {
    if (child.type !== "property_signature") continue;
    const nameNode =
      child.childForFieldName?.("name") ||
      (child.namedChildren ? child.namedChildren.find((c: any) => c.type === "property_identifier" || c.type === "identifier" || c.type === "string") : null);
    if (!nameNode) continue;
    const raw = content.slice(nameNode.startIndex, nameNode.endIndex);
    const cleaned = raw.replace(/^['"`]/, "").replace(/['"`]$/, "");
    if (cleaned) keys.push(cleaned);
  }

  return keys;
}

function extractJsonStringifyIdentifier(node: any, content: string): string | null {
  // JSON.stringify(userData)
  if (node?.type !== "call_expression") return null;
  const fn = node.childForFieldName?.("function");
  if (!fn || fn.type !== "member_expression") return null;
  const obj = fn.childForFieldName?.("object");
  const prop = fn.childForFieldName?.("property");
  if (!obj || !prop) return null;
  const objText = content.slice(obj.startIndex, obj.endIndex);
  const propText = content.slice(prop.startIndex, prop.endIndex);
  if (objText !== "JSON" || propText !== "stringify") return null;

  const args = node.childForFieldName?.("arguments");
  if (!args) return null;
  const firstArg = (args.children || []).find((c: any) => c.type === "identifier");
  if (!firstArg) return null;
  return content.slice(firstArg.startIndex, firstArg.endIndex);
}

function extractKeysFromInlineObjectType(typeText: string): string[] {
  // Very small heuristic parser for inline object types like:
  // { name: string; email: string; phone: string; }
  const keys: string[] = [];
  let inside = typeText.trim();
  // Tree-sitter may include a leading ':' in type annotations.
  if (inside.startsWith(":")) inside = inside.slice(1).trim();
  if (!inside.startsWith("{") || !inside.endsWith("}")) return keys;
  const body = inside.slice(1, -1);
  const re = /\b([A-Za-z_][A-Za-z0-9_]*)\s*\??\s*:/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    keys.push(m[1]);
  }
  return keys;
}

function findExpressRouteHandler(root: any, content: string, method: string, backendPath: string): any | null {
  let found: any | null = null;
  const targetMethod = method.toLowerCase();
  const targetPath = normalizePathForComparison(backendPath);

  const visit = (node: any) => {
    if (!node || found) return;
    if (node.type === "call_expression") {
      const fn = node.childForFieldName?.("function");
      const args = node.childForFieldName?.("arguments");
      if (fn?.type === "member_expression" && args) {
        const obj = fn.childForFieldName?.("object");
        const prop = fn.childForFieldName?.("property");
        const propText = prop ? content.slice(prop.startIndex, prop.endIndex).toLowerCase() : "";
        if (propText === targetMethod && (obj?.type === "identifier")) {
          const firstArg = (args.children || []).find((c: any) => c.type === "string" || c.type === "template_string");
          if (firstArg && firstArg.type === "string") {
            const raw = content.slice(firstArg.startIndex, firstArg.endIndex).trim().replace(/^['"`]/, "").replace(/['"`]$/, "");
            if (normalizePathForComparison(raw) === targetPath) {
              // Find the first function-like arg after the path
              const fnArg = (args.children || []).find((c: any) => c.type === "arrow_function" || c.type === "function");
              if (fnArg) {
                found = fnArg;
                return;
              }
            }
          }
        }
      }
    }
    for (const child of node.children || []) visit(child);
  };

  visit(root);
  return found;
}

function extractBackendResponseFields(handlerFnNode: any, content: string): Set<string> {
  const fields = new Set<string>();
  const visit = (node: any) => {
    if (!node) return;
    if (node.type === "call_expression") {
      const fn = node.childForFieldName?.("function");
      const args = node.childForFieldName?.("arguments");
      if (fn?.type === "member_expression" && args) {
        const obj = fn.childForFieldName?.("object");
        const prop = fn.childForFieldName?.("property");
        const objText = obj ? content.slice(obj.startIndex, obj.endIndex) : "";
        const propText = prop ? content.slice(prop.startIndex, prop.endIndex) : "";
        if (objText === "res" && propText === "json") {
          const objArg = (args.children || []).find((c: any) => c.type === "object");
          if (objArg) {
            for (const child of objArg.children || []) {
              if (child.type === "pair") {
                const keyNode = child.childForFieldName?.("key");
                if (!keyNode) continue;
                const keyText = content
                  .slice(keyNode.startIndex, keyNode.endIndex)
                  .replace(/^['"`]/, "")
                  .replace(/['"`]$/, "");
                if (keyText) fields.add(keyText);
              }

              // Shorthand properties: { name, email }
              if (child.type === "shorthand_property_identifier" || child.type === "shorthand_property_identifier_pattern") {
                const keyText = content.slice(child.startIndex, child.endIndex);
                if (keyText) fields.add(keyText);
              }
            }
          }
        }
      }
    }
    for (const child of node.children || []) visit(child);
  };
  visit(handlerFnNode);
  return fields;
}

function extractBackendRequestFields(handlerFnNode: any, content: string): Set<string> {
  const fields = new Set<string>();
  const visit = (node: any) => {
    if (!node) return;

    // const { name, email } = req.body
    if (node.type === "variable_declarator") {
      const nameNode = node.childForFieldName?.("name");
      const valueNode = node.childForFieldName?.("value");
      if (nameNode?.type === "object_pattern" && valueNode?.type === "member_expression") {
        const obj = valueNode.childForFieldName?.("object");
        const prop = valueNode.childForFieldName?.("property");
        const objText = obj ? content.slice(obj.startIndex, obj.endIndex) : "";
        const propText = prop ? content.slice(prop.startIndex, prop.endIndex) : "";
        if (objText === "req" && propText === "body") {
          const patternText = content.slice(nameNode.startIndex, nameNode.endIndex);
          const re = /\b([A-Za-z_][A-Za-z0-9_]*)\b/g;
          let m: RegExpExecArray | null;
          while ((m = re.exec(patternText))) {
            fields.add(m[1]);
          }
        }
      }
    }

    // req.body.phone
    if (node.type === "member_expression") {
      const objectNode = node.childForFieldName?.("object");
      const propertyNode = node.childForFieldName?.("property");
      if (propertyNode?.type === "property_identifier" && objectNode?.type === "member_expression") {
        const innerObj = objectNode.childForFieldName?.("object");
        const innerProp = objectNode.childForFieldName?.("property");
        const innerObjText = innerObj ? content.slice(innerObj.startIndex, innerObj.endIndex) : "";
        const innerPropText = innerProp ? content.slice(innerProp.startIndex, innerProp.endIndex) : "";
        if (innerObjText === "req" && innerPropText === "body") {
          fields.add(content.slice(propertyNode.startIndex, propertyNode.endIndex));
        }
      }
    }

    for (const child of node.children || []) visit(child);
  };
  visit(handlerFnNode);
  return fields;
}

/**
 * Validate query parameters between frontend and backend
 */
function validateQueryParameters(
  mapping: any,
  endpoint: string,
): ApiContractIssue[] {
  const issues: ApiContractIssue[] = [];

  const frontendParams = mapping.frontend.queryParams || [];
  const backendParams = mapping.backend.queryParams || [];

  // Check for missing required query params in frontend
  for (const backendParam of backendParams) {
    if (backendParam.required) {
      const frontendParam = frontendParams.find(
        (p: { name: string }) => p.name === backendParam.name,
      );

      if (!frontendParam) {
        issues.push({
          type: "apiContractMismatch",
          severity: "medium",
          message: `Missing required query parameter '${backendParam.name}' in frontend. Backend expects ${backendParam.type}`,
          file: mapping.frontend.file,
          line: mapping.frontend.line,
          endpoint,
          suggestion: `Add query parameter '${backendParam.name}: ${backendParam.type}' to frontend request`,
          confidence: 90,
        });
      }
    }
  }

  // Check for type mismatches in query params
  for (const frontendParam of frontendParams) {
    const backendParam = backendParams.find(
      (p: { name: string }) => p.name === frontendParam.name,
    );

    if (backendParam) {
      const result = areTypesCompatible(frontendParam.type, backendParam.type);

      if (!result.compatible || result.severity) {
        issues.push({
          type: "apiTypeMismatch",
          severity: (result.severity as "high" | "medium" | "low") || "medium",
          message: result.reason || `Query parameter '${frontendParam.name}' type mismatch: frontend uses '${frontendParam.type}', backend expects '${backendParam.type}'`,
          file: mapping.frontend.file,
          line: mapping.frontend.line,
          endpoint,
          suggestion: result.suggestion || `Ensure query parameter '${frontendParam.name}' types are compatible`,
          confidence: 85,
        });
      }
    }
  }

  return issues;
}

// ============================================================================
// Type Validation
// ============================================================================

function validateTypes(apiContract: ApiContractContext): ApiContractIssue[] {
  const issues: ApiContractIssue[] = [];

  for (const [typeName, mapping] of apiContract.typeMappings) {
    const frontendType = mapping.frontend;
    const backendModel = mapping.backend;

    // Check for missing required fields in frontend
    for (const backendField of backendModel.fields) {
      if (backendField.required) {
        const frontendField = frontendType.fields.find(
          (f: { name: string }) => normalizeName(f.name) === normalizeName(backendField.name),
        );

        if (!frontendField) {
          issues.push({
            type: "apiMissingRequiredField",
            severity: "high",
            message: `Missing required field '${backendField.name}' in frontend type '${frontendType.name}'`,
            file: frontendType.file,
            line: frontendType.line,
            suggestion: `Add '${backendField.name}: ${backendField.type}' to ${frontendType.name} interface`,
            confidence: 95,
          });
        }
      }
    }

    // Check for naming convention mismatches
    // Skip if both files are TypeScript/JavaScript (same naming convention expected)
    const isSameLanguage = isSameLanguageProject(frontendType.file, backendModel.file);
    if (!isSameLanguage) {
      for (const frontendField of frontendType.fields) {
        const backendField = backendModel.fields.find(
          (f: { name: string }) => normalizeName(f.name) === normalizeName(frontendField.name),
        );

        if (backendField && frontendField.name !== backendField.name) {
          issues.push({
            type: "apiNamingConventionMismatch",
            severity: "medium",
            message: `Naming convention mismatch: '${frontendField.name}' should be '${backendField.name}'`,
            file: frontendType.file,
            line: frontendType.line,
            suggestion: `Rename to '${backendField.name}' to match backend convention`,
            confidence: 90,
          });
        }
      }
    }

    // Check type compatibility
    for (const frontendField of frontendType.fields) {
      const backendField = backendModel.fields.find(
        (f: { name: string }) => normalizeName(f.name) === normalizeName(frontendField.name),
      );

      if (backendField) {
        const result = areTypesCompatible(frontendField.type, backendField.type);

        if (!result.compatible || result.severity) {
          issues.push({
            type: "apiTypeMismatch",
            severity: (result.severity as "high" | "medium" | "low") || "medium",
            message: result.reason || `Type mismatch for field '${frontendField.name}': frontend uses '${frontendField.type}', backend expects '${backendField.type}'`,
            file: frontendType.file,
            line: frontendType.line,
            suggestion: result.suggestion || getTypeCompatibilitySuggestion(frontendField.type, backendField.type),
            confidence: 85,
          });
        }
      }
    }
  }

  return issues;
}

// ============================================================================
// Unmatched Frontend Validation
// ============================================================================

function validateUnmatchedFrontend(apiContract: ApiContractContext): ApiContractIssue[] {
  const issues: ApiContractIssue[] = [];

  for (const service of apiContract.unmatchedFrontend) {
    // Skip ignored endpoints (webhooks, admin, internal, etc.)
    if (shouldIgnoreEndpoint(service.endpoint)) {
      continue;
    }

    // Check if there's a similar endpoint with different method or path
    const similarRoute = findSimilarRoute(service, apiContract.backendRoutes);
    
    if (similarRoute) {
      // Check if it's a method mismatch
      if (similarRoute.path === service.endpoint || 
          normalizePath(similarRoute.path) === normalizePath(service.endpoint)) {
        issues.push({
          type: "apiMethodMismatch",
          severity: "critical",
          message: `HTTP method mismatch: frontend uses ${service.method}, backend expects ${similarRoute.method} for '${service.endpoint}'`,
          file: service.file,
          line: service.line,
          endpoint: service.endpoint,
          suggestion: `Change frontend to use ${similarRoute.method} instead of ${service.method}`,
          confidence: 95,
        });
      } else {
        // It's a path mismatch
        issues.push({
          type: "apiPathMismatch",
          severity: "high",
          message: `Endpoint path mismatch: frontend calls '${service.endpoint}', similar backend route is '${similarRoute.path}' (${similarRoute.method})`,
          file: service.file,
          line: service.line,
          endpoint: service.endpoint,
          suggestion: `Update frontend path to '${similarRoute.path}' to match backend, or verify the endpoint URL is correct`,
          confidence: 90,
        });
      }
    } else {
      // No similar route found
      issues.push({
        type: "apiEndpointNotFound",
        severity: "critical",
        message: `Endpoint '${service.method} ${service.endpoint}' not found in backend`,
        file: service.file,
        line: service.line,
        endpoint: service.endpoint,
        suggestion: "Check if backend route exists or verify the endpoint URL",
        confidence: 95,
      });
    }
  }

  return issues;
}

/**
 * Default ignore patterns for common false positives
 */
const DEFAULT_IGNORE_PATTERNS = [
  // Webhook endpoints
  /\/webhook/i,
  /\/webhooks/i,
  /\/stripe\/webhook/i,
  /\/paypal\/webhook/i,
  /\/github\/webhook/i,
  /\/slack\/webhook/i,
  
  // Admin routes
  /\/admin/i,
  /\/api\/admin/i,
  /\/management/i,
  /\/api\/management/i,
  
  // Internal/debug routes
  /\/debug/i,
  /\/internal/i,
  /\/api\/internal/i,
  /\/health/i,
  /\/ping/i,
  /\/metrics/i,
  /\/ready/i,
  /\/alive/i,
  
  // OAuth/Auth callbacks
  /\/auth\/callback/i,
  /\/oauth/i,
  /\/oauth2/i,
  /\/callback/i,
  
  // API documentation
  /\/docs/i,
  /\/swagger/i,
  /\/openapi/i,
  /\/redoc/i,
];

/**
 * Check if an endpoint should be ignored
 */
function shouldIgnoreEndpoint(endpoint: string): boolean {
  return DEFAULT_IGNORE_PATTERNS.some((pattern) => pattern.test(endpoint));
}

function findSimilarRoute(
  service: { method: string; endpoint: string },
  backendRoutes: ApiRouteDefinition[]
): ApiRouteDefinition | undefined {
  const normalizedEndpoint = normalizePathForComparison(service.endpoint);
  
  // First, check for exact path match with different method (normalizing params)
  const samePathDifferentMethod = backendRoutes.find(route => {
    const normalizedRoute = normalizePathForComparison(route.path);
    return normalizedRoute === normalizedEndpoint && 
           route.method.toUpperCase() !== service.method.toUpperCase();
  });
  
  if (samePathDifferentMethod) {
    return samePathDifferentMethod;
  }

  // Also check with API prefix stripped
  const endpointNoPrefix = removeApiPrefix(normalizedEndpoint);
  const samePathNoPrefixDiffMethod = backendRoutes.find(route => {
    const normalizedRoute = removeApiPrefix(normalizePathForComparison(route.path));
    return normalizedRoute === endpointNoPrefix && 
           route.method.toUpperCase() !== service.method.toUpperCase();
  });

  if (samePathNoPrefixDiffMethod) {
    return samePathNoPrefixDiffMethod;
  }
  
  // Then, check for similar paths (same number of segments, similar structure)
  // Collect ALL candidates and pick the best match (prefer literal matches over param matches)
  const endpointSegments = normalizedEndpoint.split('/');
  let bestCandidate: { route: ApiRouteDefinition; score: number } | undefined;
  
  const scoreSegments = (feSegs: string[], beSegs: string[]): number => {
    if (feSegs.length !== beSegs.length) return 0;
    let score = 0;
    for (let i = 0; i < feSegs.length; i++) {
      const feSeg = feSegs[i];
      const beSeg = beSegs[i];
      if (feSeg === beSeg) {
        score += 1.0; // Exact match
      } else if (isPathParam(feSeg) || isPathParam(beSeg)) {
        score += 0.6; // Param match — lower than literal similarity to prefer real matches
      } else {
        const similarity = segmentSimilarity(feSeg, beSeg);
        if (similarity >= 0.5) {
          score += similarity; // Partial credit for similar segments (e.g., 'statistics' vs 'stats')
        }
      }
    }
    return score / feSegs.length;
  };

  for (const route of backendRoutes) {
    const normalizedRoute = normalizePathForComparison(route.path);
    const routeSegments = normalizedRoute.split('/');
    const score = scoreSegments(endpointSegments, routeSegments);
    if (score >= 0.7 && (!bestCandidate || score > bestCandidate.score)) {
      bestCandidate = { route, score };
    }
  }

  // Try again with API prefix stripped
  const endpointSegmentsNoPrefix = endpointNoPrefix.split('/');
  for (const route of backendRoutes) {
    const normalizedRoute = removeApiPrefix(normalizePathForComparison(route.path));
    const routeSegments = normalizedRoute.split('/');
    const score = scoreSegments(endpointSegmentsNoPrefix, routeSegments);
    if (score >= 0.7 && (!bestCandidate || score > bestCandidate.score)) {
      bestCandidate = { route, score };
    }
  }

  if (bestCandidate) return bestCandidate.route;
  
  return undefined;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if frontend and backend files are in the same language family
 * (both TS/JS = same naming convention, no need to flag camelCase vs snake_case)
 */
function isSameLanguageProject(frontendFile: string, backendFile: string): boolean {
  const tsJsExtensions = [".ts", ".tsx", ".js", ".jsx", ".mjs"];
  const pyExtensions = [".py"];
  
  const feIsTs = tsJsExtensions.some(ext => frontendFile.endsWith(ext));
  const beIsTs = tsJsExtensions.some(ext => backendFile.endsWith(ext));
  const beIsPy = pyExtensions.some(ext => backendFile.endsWith(ext));
  
  // Same language if both are TS/JS
  if (feIsTs && beIsTs) return true;
  // Different languages if FE is TS and BE is Python
  if (feIsTs && beIsPy) return false;
  
  return false;
}

function normalizePath(path: string): string {
  return path.replace(/\/+/g, "/").replace(/\/$/, "").replace(/^\//, "");
}

function removeApiPrefix(path: string): string {
  return path.replace(/^(api|v\d+|rest)\//, "");
}

function normalizeName(name: string): string {
  return name
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/_/g, "");
}

function pathsMatch(path1: string, path2: string): boolean {
  // Normalize both paths to use {param} format for comparison
  const normalized1 = normalizePathForComparison(path1);
  const normalized2 = normalizePathForComparison(path2);

  if (normalized1 === normalized2) return true;

  const segments1 = normalized1.split("/");
  const segments2 = normalized2.split("/");

  if (segments1.length !== segments2.length) return false;

  for (let i = 0; i < segments1.length; i++) {
    const seg1 = segments1[i];
    const seg2 = segments2[i];

    if (isPathParam(seg1) || isPathParam(seg2)) continue;
    if (seg1 !== seg2) return false;
  }

  return true;
}

/**
 * Normalize path for comparison by converting all parameter formats to {param}
 */
function normalizePathForComparison(path: string): string {
  // First apply basic normalization
  let normalized = normalizePath(path);
  
  // Convert JavaScript ${variable} to {variable} for comparison
  normalized = normalized.replace(/\$\{(\w+)\}/g, (match, varName) => {
    // Convert camelCase to snake_case
    const snakeCase = varName.replace(/[A-Z]/g, (letter: string) => `_${letter.toLowerCase()}`);
    return `{${snakeCase}}`;
  });
  
  // Convert Express :param to {param} for comparison
  normalized = normalized.replace(/:([a-zA-Z_]\w*)/g, (match, paramName) => {
    return `{${paramName}}`;
  });
  
  return normalized;
}

/**
 * Calculate similarity between two path segments using multiple heuristics.
 * Catches cases like 'statistics' vs 'stats', 'users' vs 'user', etc.
 */
function segmentSimilarity(a: string, b: string): number {
  if (a === b) return 1.0;
  if (!a || !b) return 0;
  
  const al = a.toLowerCase();
  const bl = b.toLowerCase();
  const maxLen = Math.max(al.length, bl.length);
  const minLen = Math.min(al.length, bl.length);
  
  // Check if one contains the other (e.g., 'user' in 'users')
  if (al.includes(bl) || bl.includes(al)) return 0.8;
  
  // Longest common prefix ratio (weighted by shorter string coverage)
  let commonPrefix = 0;
  for (let i = 0; i < minLen; i++) {
    if (al[i] === bl[i]) commonPrefix++;
    else break;
  }
  // Score based on how much of the SHORTER string is covered by the common prefix
  // 'stat' covers 4/5 of 'stats' and 4/10 of 'statistics' → use shorter = 4/5 = 0.8
  const prefixByShorter = commonPrefix / minLen;
  // Also consider coverage of the longer string to penalize very different lengths
  const prefixByLonger = commonPrefix / maxLen;
  // Blend: mostly shorter-based, with a penalty for length difference
  const prefixScore = prefixByShorter * 0.7 + prefixByLonger * 0.3;
  
  // Normalized Levenshtein distance
  const dist = levenshteinDistance(al, bl);
  const levenshteinScore = 1 - (dist / maxLen);
  
  return Math.max(prefixScore, levenshteinScore);
}

/**
 * Simple Levenshtein distance implementation for short path segments
 */
function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  
  return dp[m][n];
}

function isPathParam(segment: string): boolean {
  // Python/FastAPI style: {param}
  if (segment.startsWith("{") && segment.endsWith("}")) return true;
  // JavaScript template literal style: ${variable}
  if (segment.startsWith("${") && segment.endsWith("}")) return true;
  // Express style: :param
  if (segment.startsWith(":") && /^:[a-zA-Z_]\w*$/.test(segment)) return true;
  return false;
}

function extractPathParams(path: string): string[] {
  const params: string[] = [];
  
  // Extract Python/FastAPI style params: {param} or {param:type}
  const pythonMatches = path.match(/\{([^}]+)\}/g);
  if (pythonMatches) {
    for (const match of pythonMatches) {
      const param = match.replace(/[{}]/g, "").split(":")[0];
      params.push(param);
    }
  }
  
  // Extract JavaScript template literal params: ${variable}
  const jsMatches = path.match(/\$\{(\w+)\}/g);
  if (jsMatches) {
    for (const match of jsMatches) {
      const param = match.replace(/[\${}]/g, "");
      // Convert camelCase to snake_case for comparison
      const snakeCase = param.replace(/[A-Z]/g, (letter: string) => `_${letter.toLowerCase()}`);
      params.push(snakeCase);
    }
  }

  // Extract Express style params: :param
  const expressMatches = path.match(/:([a-zA-Z_]\w*)/g);
  if (expressMatches) {
    for (const match of expressMatches) {
      const param = match.replace(/^:/, "");
      params.push(param);
    }
  }

  return params;
}

function areTypesCompatible(tsType: string, pyType: string): { compatible: boolean; severity?: string; reason?: string; suggestion?: string } {
  // Skip validation for complex/object types that couldn't be extracted properly
  if (isComplexType(tsType) || isComplexType(pyType)) {
    return { compatible: true };
  }

  const normalizedTs = normalizeType(tsType);
  const normalizedPy = normalizeType(pyType);

  // Exact match
  if (normalizedTs === normalizedPy) {
    return { compatible: true };
  }

  // Known compatible pairs
  const compatibleMap: Record<string, string[]> = {
    string: ["str", "text", "email", "uuid", "url", "slug", "char"],
    number: ["int", "float", "integer", "double", "decimal"],
    boolean: ["bool"],
    date: ["datetime", "date", "time"],
    any: ["any"],
    file: ["uploadfile", "file"],
  };

  const compatibleTypes = compatibleMap[normalizedTs] || [];
  if (compatibleTypes.includes(normalizedPy)) {
    return { compatible: true };
  }

  // Check for similar type names (e.g., Client vs ClientResponse)
  if (areSimilarTypeNames(normalizedTs, normalizedPy)) {
    return { compatible: true };
  }

  // Check for problematic pairs
  const problematicResult = checkProblematicTypePairs(tsType, pyType);
  if (problematicResult) {
    return problematicResult;
  }

  // Default: assume compatible with low confidence
  return { compatible: true };
}

/**
 * Check if a type string represents a complex/object type that couldn't be extracted properly
 */
function isComplexType(type: string): boolean {
  // If type contains newlines, braces, or is very long, it's likely a complex object literal
  if (type.includes('\n') || type.includes('{') || type.includes('}')) {
    return true;
  }
  // If type is very long (>50 chars), it's likely not a simple type name
  if (type.length > 50) {
    return true;
  }
  return false;
}

/**
 * Check if two type names are similar (e.g., Client vs ClientResponse)
 * But NOT if they differ by operation type (Create vs Update vs Delete)
 */
function areSimilarTypeNames(type1: string, type2: string): boolean {
  // If both have different CRUD operation suffixes, they're NOT similar
  // (e.g., ClientCreate vs ClientUpdate are different request body types)
  const crudSuffixes = ['create', 'update', 'delete', 'patch'];
  const suffix1 = crudSuffixes.find(s => type1.endsWith(s));
  const suffix2 = crudSuffixes.find(s => type2.endsWith(s));
  if (suffix1 && suffix2 && suffix1 !== suffix2) {
    return false;
  }

  // Remove common non-CRUD suffixes
  const clean1 = type1.replace(/(response|request|model|entity|dto|schema)$/i, '');
  const clean2 = type2.replace(/(response|request|model|entity|dto|schema)$/i, '');
  
  // If one contains the other, they're likely related
  if (clean1.includes(clean2) || clean2.includes(clean1)) {
    return true;
  }
  
  return false;
}

/**
 * Check if a frontend array type is wrapped in a backend model
 * e.g., FE sends PaymentMilestoneCreate[] → BE expects PaymentScheduleSetup { milestones: List[PaymentMilestoneCreate] }
 */
function isArrayTypeWrappedInModel(
  frontendType: string,
  backendModelName: string,
  apiContract: ApiContractContext,
): boolean {
  // Only applies when frontend type is an array
  if (!frontendType.endsWith('[]')) return false;

  const elementType = frontendType.replace(/\[\]$/, '');
  const backendModel = apiContract.backendModels.find(m => m.name === backendModelName);
  if (!backendModel) return false;

  // Check if the backend model has a field whose type is a list of the element type
  for (const field of backendModel.fields) {
    const fieldType = field.type.toLowerCase();
    const elementLower = elementType.toLowerCase();
    // Match patterns like List[PaymentMilestoneCreate], list[PaymentMilestoneCreate], Sequence[...]
    if (fieldType.includes(`list[${elementLower}]`) ||
        fieldType.includes(`sequence[${elementLower}]`) ||
        fieldType === `${elementLower}[]`) {
      return true;
    }
  }

  return false;
}

function checkProblematicTypePairs(tsType: string, pyType: string): { compatible: boolean; severity: string; reason: string; suggestion: string } | null {
  const normalizedTs = normalizeType(tsType);
  const normalizedPy = normalizeType(pyType);

  // UUID handling - UUID serializes to string in JSON, so string is compatible
  if (normalizedPy === "uuid") {
    if (normalizedTs === "string" || normalizedTs === "string_or_null") {
      return null; // Compatible — no issue
    }
    return {
      compatible: false,
      severity: "medium",
      reason: `Backend uses UUID type, frontend uses ${tsType}`,
      suggestion: `Use 'string' type for UUID (UUIDs serialize to strings in JSON)`,
    };
  }

  // Decimal/Float handling for monetary values
  if (normalizedPy === "decimal" && normalizedTs === "number") {
    return {
      compatible: true,
      severity: "medium",
      reason: `Backend uses Decimal for precision, frontend uses number`,
      suggestion: `Consider using string for monetary values to avoid floating-point precision issues`,
    };
  }

  // DateTime handling - datetime serializes to ISO string in JSON, so string is compatible
  if (normalizedPy === "datetime" || normalizedPy === "date") {
    if (normalizedTs === "string" || normalizedTs === "string_or_null") {
      return null; // Compatible — no issue
    }
    return {
      compatible: false,
      severity: "high",
      reason: `Backend uses ${pyType}, frontend uses ${tsType}`,
      suggestion: `Use 'string' type for dates (dates serialize to ISO strings)`,
    };
  }

  // String vs Number mismatch
  if (normalizedTs === "string" && ["int", "float", "integer", "decimal"].includes(normalizedPy)) {
    return {
      compatible: false,
      severity: "high",
      reason: `Type mismatch: frontend uses string, backend expects ${pyType}`,
      suggestion: `Change frontend type to 'number' or backend to accept string`,
    };
  }

  // Number vs String mismatch
  if (normalizedTs === "number" && ["str", "text", "email"].includes(normalizedPy)) {
    return {
      compatible: false,
      severity: "high",
      reason: `Type mismatch: frontend uses number, backend expects ${pyType}`,
      suggestion: `Change frontend type to 'string' or backend to accept number`,
    };
  }

  // Array/List handling
  if (tsType.includes("[]") && !(pyType.includes("List") || pyType.includes("list") || pyType.includes("Sequence"))) {
    return {
      compatible: false,
      severity: "high",
      reason: `Frontend expects array, backend uses ${pyType}`,
      suggestion: `Ensure backend field is a list/array type`,
    };
  }

  return null;
}

function normalizeType(type: string): string {
  return type
    .replace(/^[\s:]+/, "") // Strip leading colons/whitespace from extraction artifacts
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/\[\]/g, "array")
    .replace(/optional\[/g, "")
    .replace(/\]/g, "")
    .replace(/list\[/g, "array_")
    .replace(/\|/g, "_or_")
    .replace(/\?/g, ""); // Remove TypeScript optional marker
}

function getTypeCompatibilitySuggestion(tsType: string, pyType: string): string {
  const suggestions: Record<string, Record<string, string>> = {
    string: {
      uuid: "Use string type for UUID (serialization)",
      datetime: "Use string type for dates (ISO format)",
      decimal: "Use string type for decimals (precision)",
    },
    number: {
      decimal: "Use string type for monetary values (precision)",
      int: "Ensure value is an integer",
      float: "Ensure value is a number",
    },
  };

  return (
    suggestions[tsType]?.[pyType] || `Ensure types are compatible: ${tsType} vs ${pyType}`
  );
}
