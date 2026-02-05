/**
 * API Contract Guardian - Validators Index
 *
 * Validates API contracts using the ProjectContext.
 * This version works with the integrated context system.
 *
 * @format
 */

import type { ProjectContext, ApiContractContext, ApiRouteDefinition } from "../../context/projectContext.js";

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

  const normalizedFrontend = normalizePath(frontendPath);
  const normalizedBackend = normalizePath(backendPath);

  // Check if paths match (accounting for API prefixes)
  if (!pathsMatch(normalizedFrontend, normalizedBackend)) {
    const frontendWithoutPrefix = removeApiPrefix(normalizedFrontend);
    const backendWithoutPrefix = removeApiPrefix(normalizedBackend);

    if (frontendWithoutPrefix !== backendWithoutPrefix) {
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

  // Check for path parameter consistency
  const frontendParams = extractPathParams(frontendPath);
  const backendParams = extractPathParams(backendPath);

  // Check for missing parameters in frontend
  for (const param of backendParams) {
    if (!frontendParams.includes(param)) {
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

  // Check for extra parameters in frontend (warning only)
  for (const param of frontendParams) {
    if (!backendParams.includes(param)) {
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

  return issues;
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
  const normalizedEndpoint = normalizePath(service.endpoint);
  
  // First, check for exact path match with different method
  const samePathDifferentMethod = backendRoutes.find(route => {
    const normalizedRoute = normalizePath(route.path);
    return normalizedRoute === normalizedEndpoint && 
           route.method.toUpperCase() !== service.method.toUpperCase();
  });
  
  if (samePathDifferentMethod) {
    return samePathDifferentMethod;
  }
  
  // Then, check for similar paths (same number of segments, similar structure)
  const endpointSegments = normalizedEndpoint.split('/');
  
  for (const route of backendRoutes) {
    const normalizedRoute = normalizePath(route.path);
    const routeSegments = normalizedRoute.split('/');
    
    // Must have same number of segments
    if (routeSegments.length !== endpointSegments.length) {
      continue;
    }
    
    // Check if most segments match (allowing for one different segment)
    let matchingSegments = 0;
    let totalSegments = endpointSegments.length;
    
    for (let i = 0; i < endpointSegments.length; i++) {
      const endpointSeg = endpointSegments[i];
      const routeSeg = routeSegments[i];
      
      // Match if they're identical, or both are parameters, or one is a parameter
      if (endpointSeg === routeSeg || 
          isPathParam(endpointSeg) || 
          isPathParam(routeSeg)) {
        matchingSegments++;
      }
    }
    
    // If at least 70% of segments match, consider it similar
    if (matchingSegments / totalSegments >= 0.7) {
      return route;
    }
  }
  
  return undefined;
}

// ============================================================================
// Utility Functions
// ============================================================================

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
  
  return normalized;
}

function isPathParam(segment: string): boolean {
  // Python/FastAPI style: {param}
  if (segment.startsWith("{") && segment.endsWith("}")) return true;
  // JavaScript template literal style: ${variable}
  if (segment.startsWith("${") && segment.endsWith("}")) return true;
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
 */
function areSimilarTypeNames(type1: string, type2: string): boolean {
  // Remove common suffixes/prefixes
  const clean1 = type1.replace(/(response|request|create|update|delete|model|entity|dto)$/i, '');
  const clean2 = type2.replace(/(response|request|create|update|delete|model|entity|dto)$/i, '');
  
  // If one contains the other, they're likely related
  if (clean1.includes(clean2) || clean2.includes(clean1)) {
    return true;
  }
  
  // Check for common patterns
  const commonPrefixes = ['api', 'app', 'user', 'client', 'project', 'item', 'data'];
  for (const prefix of commonPrefixes) {
    if ((type1.startsWith(prefix) && type2.startsWith(prefix)) ||
        (type1.endsWith(prefix) && type2.endsWith(prefix))) {
      return true;
    }
  }
  
  return false;
}

function checkProblematicTypePairs(tsType: string, pyType: string): { compatible: boolean; severity: string; reason: string; suggestion: string } | null {
  const normalizedTs = normalizeType(tsType);
  const normalizedPy = normalizeType(pyType);

  // UUID handling
  if (normalizedPy === "uuid" && normalizedTs !== "string") {
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

  // DateTime handling
  if ((normalizedPy === "datetime" || normalizedPy === "date") && normalizedTs !== "string") {
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
