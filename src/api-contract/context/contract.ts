/**
 * API Contract Guardian - Contract Context Builder
 *
 * Links frontend and backend contexts to create a unified contract view.
 *
 * @format
 */

import { logger } from "../../utils/logger.js";
import type {
  FrontendContext,
  BackendContext,
  ContractContext,
  EndpointMapping,
  TypeMapping,
  ServiceDefinition,
  RouteDefinition,
  TypeDefinition,
  ModelDefinition,
  CompatibilityScore,
} from "../types.js";

/**
 * Build contract context by linking frontend and backend
 * Matches services to routes and types to models
 */
export async function buildContractContext(
  frontendContext: FrontendContext,
  backendContext: BackendContext,
): Promise<ContractContext> {
  logger.info("Building contract context...");

  const startTime = Date.now();

  const endpoints = new Map<string, EndpointMapping>();
  const types = new Map<string, TypeMapping>();
  const unmatchedFrontend: ServiceDefinition[] = [];
  const unmatchedBackend: RouteDefinition[] = [];

  // Match frontend services to backend routes
  for (const service of frontendContext.services) {
    const matchingRoute = findMatchingRoute(service, backendContext.routes);
    if (matchingRoute) {
      const score = calculateEndpointMatchScore(service, matchingRoute);
      endpoints.set(service.endpoint, {
        frontend: service,
        backend: matchingRoute,
        score,
      });
    } else {
      unmatchedFrontend.push(service);
    }
  }

  // Find unmatched backend routes
  for (const route of backendContext.routes) {
    const isMatched = Array.from(endpoints.values()).some(
      (mapping) => mapping.backend === route,
    );
    if (!isMatched) {
      unmatchedBackend.push(route);
    }
  }

  // Match frontend types to backend models
  for (const type of frontendContext.types) {
    const matchingModel = findMatchingModel(type, backendContext.models);
    if (matchingModel) {
      const compatibility = calculateTypeCompatibility(type, matchingModel);
      types.set(type.name, {
        frontend: type,
        backend: matchingModel,
        compatibility,
      });
    }
  }

  const context: ContractContext = {
    endpoints,
    types,
    unmatchedFrontend,
    unmatchedBackend,
  };

  logger.info(
    `Contract context built in ${Date.now() - startTime}ms ` +
      `(${endpoints.size} matched endpoints, ${types.size} matched types, ` +
      `${unmatchedFrontend.length} unmatched frontend, ${unmatchedBackend.length} unmatched backend)`,
  );

  return context;
}

// ============================================================================
// Endpoint Matching
// ============================================================================

/**
 * Find a matching backend route for a frontend service
 */
function findMatchingRoute(
  service: ServiceDefinition,
  routes: RouteDefinition[],
): RouteDefinition | undefined {
  // Normalize the service endpoint
  const normalizedEndpoint = normalizePath(service.endpoint);

  // First try exact match
  const exactMatch = routes.find((route) => {
    const normalizedRoute = normalizePath(route.path);
    return (
      normalizedRoute === normalizedEndpoint &&
      route.method.toUpperCase() === service.method.toUpperCase()
    );
  });

  if (exactMatch) {
    return exactMatch;
  }

  // Try fuzzy match (handle API prefix differences)
  // Frontend: /clients, Backend: /api/clients
  const fuzzyMatch = routes.find((route) => {
    const normalizedRoute = normalizePath(route.path);
    const routeWithoutPrefix = removeApiPrefix(normalizedRoute);
    const serviceWithoutPrefix = removeApiPrefix(normalizedEndpoint);

    return (
      routeWithoutPrefix === serviceWithoutPrefix &&
      route.method.toUpperCase() === service.method.toUpperCase()
    );
  });

  return fuzzyMatch;
}

/**
 * Calculate match score for endpoint mapping
 */
function calculateEndpointMatchScore(
  service: ServiceDefinition,
  route: RouteDefinition,
): number {
  let score = 100;

  // Method match is critical
  if (service.method.toUpperCase() !== route.method.toUpperCase()) {
    score -= 50;
  }

  // Path match
  const normalizedService = normalizePath(service.endpoint);
  const normalizedRoute = normalizePath(route.path);

  if (normalizedService === normalizedRoute) {
    score += 10;
  } else if (removeApiPrefix(normalizedService) === removeApiPrefix(normalizedRoute)) {
    score += 5;
  }

  // Type name match bonus
  if (service.requestType && service.requestType === route.requestModel) {
    score += 10;
  }
  if (service.responseType && service.responseType === route.responseModel) {
    score += 10;
  }

  return Math.max(0, Math.min(100, score));
}

// ============================================================================
// Type Matching
// ============================================================================

/**
 * Find a matching backend model for a frontend type
 */
function findMatchingModel(
  type: TypeDefinition,
  models: ModelDefinition[],
): ModelDefinition | undefined {
  // Try exact name match first
  const exactMatch = models.find((m) => m.name === type.name);
  if (exactMatch) {
    return exactMatch;
  }

  // Try normalized name match (handle naming conventions)
  // ClientCreate -> client_create, clientCreate
  const normalizedTypeName = normalizeName(type.name);
  const normalizedMatch = models.find(
    (m) => normalizeName(m.name) === normalizedTypeName,
  );

  if (normalizedMatch) {
    return normalizedMatch;
  }

  // Try fuzzy match based on field similarity
  let bestMatch: ModelDefinition | undefined;
  let bestScore = 0;

  for (const model of models) {
    const score = calculateFieldSimilarity(type, model);
    if (score > bestScore && score > 0.7) {
      // 70% threshold
      bestScore = score;
      bestMatch = model;
    }
  }

  return bestMatch;
}

/**
 * Calculate type compatibility between frontend and backend
 */
function calculateTypeCompatibility(
  type: TypeDefinition,
  model: ModelDefinition,
): CompatibilityScore {
  const issues: string[] = [];
  let score = 100;

  // Check for missing required fields in frontend
  for (const modelField of model.fields) {
    if (modelField.required) {
      const frontendField = type.fields.find(
        (f) => normalizeName(f.name) === normalizeName(modelField.name),
      );

      if (!frontendField) {
        score -= 15;
        issues.push(`Missing required field: ${modelField.name}`);
      }
    }
  }

  // Check for naming convention mismatches
  for (const frontendField of type.fields) {
    const backendField = model.fields.find(
      (f) => normalizeName(f.name) === normalizeName(frontendField.name),
    );

    if (backendField && frontendField.name !== backendField.name) {
      score -= 5;
      issues.push(
        `Naming convention mismatch: ${frontendField.name} vs ${backendField.name}`,
      );
    }
  }

  // Check type compatibility
  for (const frontendField of type.fields) {
    const backendField = model.fields.find(
      (f) => normalizeName(f.name) === normalizeName(frontendField.name),
    );

    if (backendField) {
      const typeCompatible = areTypesCompatible(
        frontendField.type,
        backendField.type,
      );
      if (!typeCompatible) {
        score -= 10;
        issues.push(
          `Type mismatch: ${frontendField.name} (${frontendField.type} vs ${backendField.type})`,
        );
      }
    }
  }

  return {
    score: Math.max(0, score),
    issues,
  };
}

/**
 * Calculate field similarity between type and model
 */
function calculateFieldSimilarity(
  type: TypeDefinition,
  model: ModelDefinition,
): number {
  if (type.fields.length === 0 || model.fields.length === 0) {
    return 0;
  }

  const typeFieldNames = new Set(type.fields.map((f) => normalizeName(f.name)));
  const modelFieldNames = new Set(model.fields.map((f) => normalizeName(f.name)));

  // Calculate Jaccard similarity
  const intersection = new Set(
    [...typeFieldNames].filter((x) => modelFieldNames.has(x)),
  );
  const union = new Set([...typeFieldNames, ...modelFieldNames]);

  return intersection.size / union.size;
}

// ============================================================================
// Type Compatibility
// ============================================================================

/**
 * Check if TypeScript and Python types are compatible
 */
function areTypesCompatible(tsType: string, pyType: string): boolean {
  const typeMap: Record<string, string[]> = {
    string: ["str", "String", "text"],
    number: ["int", "float", "Number", "integer", "decimal"],
    boolean: ["bool", "Boolean"],
    Date: ["datetime", "date", "time"],
    "string[]": ["list[str]", "List[str]", "Sequence[str]"],
    "number[]": ["list[int]", "list[float]", "List[int]", "List[float]"],
    object: ["dict", "Dict", "Mapping"],
    "any[]": ["list", "List", "Sequence"],
  };

  // Normalize types
  const normalizedTsType = tsType.toLowerCase().replace(/\s+/g, "");
  const normalizedPyType = pyType.toLowerCase().replace(/\s+/g, "");

  // Direct match
  if (normalizedTsType === normalizedPyType) {
    return true;
  }

  // Check type map
  const compatibleTypes = typeMap[normalizedTsType] || [];
  if (
    compatibleTypes.some((t) =>
      normalizedPyType.includes(t.toLowerCase().replace(/\s+/g, "")),
    )
  ) {
    return true;
  }

  // Handle optional types
  if (tsType.includes("?") || tsType.includes("undefined")) {
    return true; // Optional fields are always compatible
  }

  if (pyType.toLowerCase().includes("optional")) {
    return true;
  }

  return false;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Normalize a path for comparison
 * Removes trailing slashes and ensures consistent format
 */
function normalizePath(path: string): string {
  return path
    .replace(/\/+/g, "/") // Remove duplicate slashes
    .replace(/\/$/, "") // Remove trailing slash
    .replace(/^\//, ""); // Remove leading slash
}

/**
 * Remove API prefix from path for fuzzy matching
 */
function removeApiPrefix(path: string): string {
  return path.replace(/^(api|v\d+|rest)\//, "");
}

/**
 * Normalize a name for comparison
 * Handles different naming conventions (camelCase, snake_case, PascalCase)
 */
function normalizeName(name: string): string {
  return (
    name
      // Convert camelCase/PascalCase to snake_case
      .replace(/([a-z])([A-Z])/g, "$1_$2")
      .toLowerCase()
      // Remove underscores for comparison
      .replace(/_/g, "")
  );
}

/**
 * Get contract context for a specific endpoint
 */
export function getEndpointContract(
  context: ContractContext,
  endpoint: string,
): EndpointMapping | undefined {
  return context.endpoints.get(endpoint);
}

/**
 * Get type mapping for a specific type
 */
export function getTypeContract(
  context: ContractContext,
  typeName: string,
): TypeMapping | undefined {
  return context.types.get(typeName);
}

/**
 * Check if a service has a matching backend route
 */
export function hasMatchingRoute(
  context: ContractContext,
  service: ServiceDefinition,
): boolean {
  return context.endpoints.has(service.endpoint);
}

/**
 * Get all unmatched frontend services
 */
export function getUnmatchedFrontendServices(
  context: ContractContext,
): ServiceDefinition[] {
  return context.unmatchedFrontend;
}

/**
 * Get all unmatched backend routes
 */
export function getUnmatchedBackendRoutes(
  context: ContractContext,
): RouteDefinition[] {
  return context.unmatchedBackend;
}
