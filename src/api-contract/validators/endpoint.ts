/**
 * API Contract Guardian - Endpoint Validator
 *
 * Validates endpoint existence and HTTP method compatibility.
 *
 * @format
 */

import type {
  ServiceDefinition,
  RouteDefinition,
  EndpointMapping,
  ApiContractIssue,
  ContractContext,
} from "../types.js";

/**
 * Validate an endpoint mapping for issues
 */
export function validateEndpoint(
  mapping: EndpointMapping,
): ApiContractIssue[] {
  const issues: ApiContractIssue[] = [];

  // Check HTTP method match
  if (mapping.frontend.method !== mapping.backend.method) {
    issues.push({
      type: "apiMethodMismatch",
      severity: "critical",
      message: `HTTP method mismatch: frontend uses ${mapping.frontend.method}, backend expects ${mapping.backend.method}`,
      file: mapping.frontend.file,
      line: mapping.frontend.line,
      endpoint: mapping.frontend.endpoint,
      suggestion: `Change frontend to use ${mapping.backend.method}`,
      confidence: 95,
    });
  }

  // Check path pattern compatibility
  const pathIssues = validatePathCompatibility(
    mapping.frontend.endpoint,
    mapping.backend.path,
    mapping.frontend.file,
    mapping.frontend.line,
  );
  issues.push(...pathIssues);

  return issues;
}

/**
 * Validate path compatibility between frontend and backend
 */
function validatePathCompatibility(
  frontendPath: string,
  backendPath: string,
  file: string,
  line: number,
): ApiContractIssue[] {
  const issues: ApiContractIssue[] = [];

  // Normalize paths for comparison
  const normalizedFrontend = normalizePath(frontendPath);
  const normalizedBackend = normalizePath(backendPath);

  // Check if paths match (accounting for API prefixes)
  if (!pathsMatch(normalizedFrontend, normalizedBackend)) {
    // Check if it's just an API prefix difference
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
 * Check if a service has a matching backend route
 */
export function validateEndpointExists(
  service: ServiceDefinition,
  context: ContractContext,
): ApiContractIssue | null {
  const mapping = context.endpoints.get(service.endpoint);

  if (!mapping) {
    // Check if there might be a route with different API prefix
    for (const [endpoint, map] of context.endpoints) {
      const normalizedService = removeApiPrefix(service.endpoint);
      const normalizedEndpoint = removeApiPrefix(endpoint);

      if (
        normalizedService === normalizedEndpoint &&
        service.method.toUpperCase() === map.backend.method.toUpperCase()
      ) {
        // Found a match with different prefix
        return {
          type: "apiPathMismatch",
          severity: "medium",
          message: `Endpoint found with different path: '${endpoint}'`,
          file: service.file,
          line: service.line,
          endpoint: service.endpoint,
          suggestion: `Update path from '${service.endpoint}' to '${endpoint}'`,
          confidence: 85,
        };
      }
    }

    // No match found at all
    return {
      type: "apiEndpointNotFound",
      severity: "critical",
      message: `Endpoint '${service.method} ${service.endpoint}' not found in backend`,
      file: service.file,
      line: service.line,
      endpoint: service.endpoint,
      suggestion: "Check if backend route exists or verify the endpoint URL",
      confidence: 95,
    };
  }

  return null;
}

/**
 * Validate all endpoints in the contract context
 */
export function validateAllEndpoints(
  context: ContractContext,
): ApiContractIssue[] {
  const issues: ApiContractIssue[] = [];

  // Validate matched endpoints
  for (const mapping of context.endpoints.values()) {
    const endpointIssues = validateEndpoint(mapping);
    issues.push(...endpointIssues);
  }

  // Validate unmatched frontend services
  for (const service of context.unmatchedFrontend) {
    const existsIssue = validateEndpointExists(service, context);
    if (existsIssue) {
      issues.push(existsIssue);
    }
  }

  return issues;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Normalize a path for comparison
 */
function normalizePath(path: string): string {
  return path
    .replace(/\/+/g, "/") // Remove duplicate slashes
    .replace(/\/$/, "") // Remove trailing slash
    .replace(/^\//, ""); // Remove leading slash
}

/**
 * Remove API prefix from path for comparison
 */
function removeApiPrefix(path: string): string {
  return path.replace(/^(api|v\d+|rest)\//, "");
}

/**
 * Check if two paths match (accounting for parameters)
 */
function pathsMatch(path1: string, path2: string): boolean {
  const normalized1 = normalizePath(path1);
  const normalized2 = normalizePath(path2);

  // Direct match
  if (normalized1 === normalized2) {
    return true;
  }

  // Split into segments
  const segments1 = normalized1.split("/");
  const segments2 = normalized2.split("/");

  if (segments1.length !== segments2.length) {
    return false;
  }

  // Compare segments, treating parameters as wildcards
  for (let i = 0; i < segments1.length; i++) {
    const seg1 = segments1[i];
    const seg2 = segments2[i];

    // Both are parameters - match
    if (isPathParam(seg1) && isPathParam(seg2)) {
      continue;
    }

    // One is parameter, one is not - still match (different naming)
    if (isPathParam(seg1) || isPathParam(seg2)) {
      continue;
    }

    // Neither is parameter - must match exactly
    if (seg1 !== seg2) {
      return false;
    }
  }

  return true;
}

/**
 * Check if a path segment is a parameter
 */
function isPathParam(segment: string): boolean {
  return segment.startsWith("{") && segment.endsWith("}");
}

/**
 * Extract path parameters from a URL
 */
function extractPathParams(path: string): string[] {
  const params: string[] = [];
  const matches = path.match(/\{([^}]+)\}/g);

  if (matches) {
    for (const match of matches) {
      // Remove braces and any type hints like :int
      const param = match.replace(/[{}]/g, "").split(":")[0];
      params.push(param);
    }
  }

  return params;
}
