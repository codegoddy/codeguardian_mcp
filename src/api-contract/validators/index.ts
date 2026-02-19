/**
 * API Contract Guardian - Validators Index
 *
 * Validates API contracts using the ProjectContext.
 * This version works with the integrated context system.
 *
 * @format
 */

import type {
  ProjectContext,
  ApiContractContext,
  ApiRouteDefinition,
} from "../../context/projectContext.js";
import * as fsSync from "fs";
import * as path from "path";
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

interface FrontendServiceUsageCache {
  sourceFilesByRoot: Map<string, string[]>;
  fileContents: Map<string, string>;
  serviceUsage: Map<string, boolean>;
}

function validatePotentialDoubleApiPrefix(
  frontendFile: string,
  frontendEndpoint: string,
  line: number,
  cache: Map<string, boolean>,
): ApiContractIssue | null {
  const normalizedEndpoint = normalizePathForComparison(frontendEndpoint);
  if (!normalizedEndpoint.startsWith("api/")) return null;

  let apiBaseHasPrefix = cache.get(frontendFile);
  if (apiBaseHasPrefix === undefined) {
    apiBaseHasPrefix = false;
    try {
      if (fsSync.existsSync(frontendFile)) {
        const content = fsSync.readFileSync(frontendFile, "utf-8");
        apiBaseHasPrefix =
          /(?:API_BASE_URL|baseURL|baseUrl)\s*[:=][^\n]*\/api(?:['"`]|\/|\b)/i.test(
            content,
          ) || /VITE_API_URL[^\n]*\/api(?:['"`]|\/|\b)/i.test(content);
      }
    } catch {
      apiBaseHasPrefix = false;
    }
    cache.set(frontendFile, apiBaseHasPrefix);
  }

  if (!apiBaseHasPrefix) return null;

  return {
    type: "apiPathMismatch",
    severity: "high",
    message: `Potential double '/api' prefix: endpoint '${frontendEndpoint}' may resolve to '/api/api/...' because API base URL already includes '/api'`,
    file: frontendFile,
    line,
    endpoint: frontendEndpoint,
    suggestion: `Remove '/api' prefix from '${frontendEndpoint}' or use a base URL without '/api'`,
    confidence: 80,
  };
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

  // Validate unmatched backend routes (endpoints implemented in backend but not used by frontend)
  issues.push(...validateUnmatchedBackend(apiContract));

  // Validate backend handler implementations (missing responses, unused locals,
  // unknown Prisma models, and hallucinations on unmatched routes).
  issues.push(...validateBackendHandlerImplementations(apiContract));

  const dedupedIssues = dedupeIssues(issues);

  // Calculate summary
  const summary = {
    totalIssues: dedupedIssues.length,
    critical: dedupedIssues.filter((i) => i.severity === "critical").length,
    high: dedupedIssues.filter((i) => i.severity === "high").length,
    medium: dedupedIssues.filter((i) => i.severity === "medium").length,
    low: dedupedIssues.filter((i) => i.severity === "low").length,
    matchedEndpoints: apiContract.endpointMappings.size,
    matchedTypes: apiContract.typeMappings.size,
    unmatchedFrontend: apiContract.unmatchedFrontend.length,
    unmatchedBackend: apiContract.unmatchedBackend.length,
  };

  return { issues: dedupedIssues, summary };
}

// ============================================================================
// Endpoint Validation
// ============================================================================

function validateEndpoints(
  apiContract: ApiContractContext,
): ApiContractIssue[] {
  const issues: ApiContractIssue[] = [];
  const apiBasePrefixCache = new Map<string, boolean>();
  const frontendServiceUsageCache: FrontendServiceUsageCache = {
    sourceFilesByRoot: new Map(),
    fileContents: new Map(),
    serviceUsage: new Map(),
  };

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
      const otherMethods = mapping.availableMethods.filter(
        (m) => m !== currentMethod,
      );

      if (otherMethods.length > 0) {
        // Check if the function name suggests a different method should be used
        const functionName = mapping.frontend.name.toLowerCase();
        const suggestedMethod = inferMethodFromFunctionName(functionName);

        if (
          suggestedMethod &&
          suggestedMethod !== currentMethod &&
          mapping.availableMethods.includes(suggestedMethod)
        ) {
          issues.push({
            type: "apiMethodMismatch",
            severity: "high",
            message: `Suspicious HTTP method: function '${mapping.frontend.name}' suggests ${suggestedMethod}, but frontend uses ${currentMethod}. Backend also supports: ${otherMethods.join(", ")}`,
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

    const doubleApiPrefixIssue = validatePotentialDoubleApiPrefix(
      mapping.frontend.file,
      mapping.frontend.endpoint,
      mapping.frontend.line,
      apiBasePrefixCache,
    );
    if (doubleApiPrefixIssue) {
      issues.push(doubleApiPrefixIssue);
    }

    // Validate request/response body types
    const bodyIssues = validateRequestResponseTypes(
      mapping,
      apiContract,
      endpoint,
      frontendServiceUsageCache,
    );
    issues.push(...bodyIssues);
  }

  return issues;
}

function validateUnmatchedBackend(
  apiContract: ApiContractContext,
): ApiContractIssue[] {
  const issues: ApiContractIssue[] = [];

  if (apiContract.unmatchedBackend.length === 0) return issues;

  // If no frontend services were found at all, this is a backend-only project
  // (guardian was started on the backend directory without a paired frontend).
  // Flagging every backend route as "no matching frontend service" produces 100%
  // false positives in this case, so we skip the check entirely.
  if (apiContract.frontendServices.length === 0) {
    return issues;
  }

  const frontendRoots = new Set<string>();
  for (const service of apiContract.frontendServices) {
    const normalized = removeApiPrefix(
      normalizePathForComparison(service.endpoint),
    );
    const root = normalized.split("/")[0];
    if (root) frontendRoots.add(root);
  }

  for (const route of apiContract.unmatchedBackend) {
    if (shouldIgnoreEndpoint(route.path)) continue;

    const normalizedRoutePath = normalizePathForComparison(route.path);

    if (isLikelyUnregisteredExpressRoute(route, normalizedRoutePath)) {
      issues.push({
        type: "apiEndpointNotFound",
        severity: "high",
        message: `Potential unregistered backend route: '${route.method} ${route.path}' appears to be defined in a router file but is not mounted under the API prefix`,
        file: route.file,
        line: route.line,
        endpoint: route.path,
        suggestion: `Mount the router containing '${route.method} ${route.path}' in the backend entrypoint (e.g., app.use('/api/...', router)) or remove the dead route`,
        confidence: 85,
      });
    }

    const normalizedRoute = removeApiPrefix(normalizedRoutePath);
    const routeRoot = normalizedRoute.split("/")[0];
    if (!routeRoot) continue;

    // Only flag within API domains the frontend already appears to use,
    // reducing noise from internal/admin domains.
    if (frontendRoots.size > 0 && !frontendRoots.has(routeRoot)) {
      continue;
    }

    // If frontend already references this path (even with a different method),
    // that relationship is surfaced as a method mismatch on the frontend side.
    if (hasFrontendPathMatch(route, apiContract.frontendServices)) {
      continue;
    }

    // Skip routes that appear to be method mismatches or near-matches already
    // represented from the frontend side.
    const nearFrontend = findSimilarFrontendService(
      route,
      apiContract.frontendServices,
    );
    if (nearFrontend) continue;

    issues.push({
      type: "apiEndpointNotFound",
      severity: "medium",
      message: `Backend endpoint '${route.method} ${route.path}' has no matching frontend service`,
      file: route.file,
      line: route.line,
      endpoint: route.path,
      suggestion: `Add a frontend service for '${route.method} ${route.path}' or remove unused backend route`,
      confidence: 85,
    });
  }

  return issues;
}

function findSimilarFrontendService(
  route: ApiRouteDefinition,
  frontendServices: Array<{ method: string; endpoint: string }>,
): { method: string; endpoint: string } | undefined {
  const normalizedRoute = normalizePathForComparison(route.path);
  const routeNoPrefix = removeApiPrefix(normalizedRoute);

  return frontendServices.find((service) => {
    if (service.method.toUpperCase() !== route.method.toUpperCase()) {
      return false;
    }

    const normalizedService = normalizePathForComparison(service.endpoint);
    const serviceNoPrefix = removeApiPrefix(normalizedService);

    return (
      pathsMatchStrict(normalizedService, normalizedRoute) ||
      pathsMatchStrict(serviceNoPrefix, routeNoPrefix)
    );
  });
}

function isLikelyUnregisteredExpressRoute(
  route: ApiRouteDefinition,
  normalizedRoutePath: string,
): boolean {
  if (!route?.file || !normalizedRoutePath) return false;
  const isRouterFile = /[\\/]routes[\\/]/.test(route.file);
  if (!isRouterFile) return false;

  // In this codebase, mounted API routes are expected to be extracted as '/api/...'.
  // Paths still rooted at '/...' from a routes module usually indicate an unmounted router.
  return !normalizedRoutePath.startsWith("api/");
}

function validateBackendHandlerImplementations(
  apiContract: ApiContractContext,
): ApiContractIssue[] {
  const issues: ApiContractIssue[] = [];
  if (apiContract.backendRoutes.length === 0) return issues;

  const routeFileCache = new Map<string, { content: string; tree: any }>();
  const analyzedHandlers = new Set<string>();
  const mappedBackendRouteKeys = new Set<string>();

  for (const mapping of apiContract.endpointMappings.values()) {
    const backendMethod = mapping?.backend?.method;
    const backendPath = mapping?.backend?.path;
    if (!backendMethod || !backendPath) continue;
    mappedBackendRouteKeys.add(
      buildBackendRouteKey(backendMethod, backendPath),
    );
  }

  for (const route of apiContract.backendRoutes) {
    if (!route?.file || !fsSync.existsSync(route.file)) continue;

    let cached = routeFileCache.get(route.file);
    if (!cached) {
      try {
        const content = fsSync.readFileSync(route.file, "utf-8");
        const tree = getParser("typescript").parse(content);
        cached = { content, tree };
        routeFileCache.set(route.file, cached);
      } catch {
        continue;
      }
    }

    if (!cached?.tree?.rootNode) continue;

    const backendHandler = resolveExpressBackendHandler(
      cached.tree.rootNode,
      cached.content,
      route.file,
      route.method,
      route.path,
      route.handler,
    );
    if (!backendHandler?.node) continue;

    const handlerKey = `${backendHandler.filePath}:${backendHandler.node.startIndex}:${backendHandler.node.endIndex}`;
    if (analyzedHandlers.has(handlerKey)) continue;
    analyzedHandlers.add(handlerKey);

    const endpointLabel = `${route.method.toUpperCase()} ${route.path}`;

    issues.push(
      ...detectMissingBackendResponse(
        backendHandler.node,
        backendHandler.content,
        backendHandler.filePath,
        endpointLabel,
        route.line,
      ),
    );

    issues.push(
      ...detectUnusedLocalVariables(
        backendHandler.node,
        backendHandler.content,
        backendHandler.filePath,
        endpointLabel,
        route.line,
      ),
    );

    issues.push(
      ...detectUnknownPrismaModelQueries(
        backendHandler.node,
        backendHandler.content,
        backendHandler.filePath,
        apiContract.backendModels,
        endpointLabel,
        route.line,
      ),
    );

    const routeKey = buildBackendRouteKey(route.method, route.path);
    if (!mappedBackendRouteKeys.has(routeKey)) {
      issues.push(
        ...detectBackendPropertyHallucinations(
          backendHandler.node,
          backendHandler.content,
          backendHandler.filePath,
          apiContract.backendModels,
          endpointLabel,
          route.line,
        ),
      );
    }
  }

  return issues;
}

function buildBackendRouteKey(method: string, routePath: string): string {
  return `${method.toUpperCase()} ${normalizePathForComparison(routePath)}`;
}

function dedupeIssues(issues: ApiContractIssue[]): ApiContractIssue[] {
  const seen = new Set<string>();
  const deduped: ApiContractIssue[] = [];

  for (const issue of issues) {
    const key = `${issue.type}|${issue.file}|${issue.line}|${issue.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(issue);
  }

  return deduped;
}

function hasFrontendPathMatch(
  route: ApiRouteDefinition,
  frontendServices: Array<{ endpoint: string }>,
): boolean {
  const normalizedRoute = normalizePathForComparison(route.path);
  const routeNoPrefix = removeApiPrefix(normalizedRoute);

  return frontendServices.some((service) => {
    const normalizedService = normalizePathForComparison(service.endpoint);
    const serviceNoPrefix = removeApiPrefix(normalizedService);

    return (
      pathsMatchStrict(normalizedService, normalizedRoute) ||
      pathsMatchStrict(serviceNoPrefix, routeNoPrefix)
    );
  });
}

function inferMethodFromFunctionName(functionName: string): string | undefined {
  const methodPatterns: Record<string, string[]> = {
    GET: ["get", "fetch", "load", "retrieve", "read", "list", "find", "search"],
    POST: [
      "create",
      "add",
      "post",
      "submit",
      "save",
      "insert",
      "register",
      "login",
      "logout",
    ],
    PUT: ["update", "edit", "modify", "change", "replace"],
    PATCH: ["patch", "partial", "tweak"],
    DELETE: ["delete", "remove", "destroy", "clear", "drop"],
  };

  for (const [method, patterns] of Object.entries(methodPatterns)) {
    if (patterns.some((pattern) => functionName.includes(pattern))) {
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
  const frontendSegments = feStripped.split("/");
  const backendSegments = beStripped.split("/");

  // Build positional param map: match params by their position in the path
  const positionallyMatched = new Set<string>();
  const positionallyMatchedBackend = new Set<string>();

  if (frontendSegments.length === backendSegments.length) {
    for (let i = 0; i < frontendSegments.length; i++) {
      const fSeg = frontendSegments[i];
      const bSeg = backendSegments[i];
      if (isPathParam(fSeg) && isPathParam(bSeg)) {
        // Both are path params at the same position — they're equivalent
        const fParam = fSeg.replace(/[{}\$:]/g, "").split(":")[0];
        const bParam = bSeg.replace(/[{}\$:]/g, "").split(":")[0];
        // Convert camelCase frontend param to snake_case for comparison
        const fParamSnake = fParam.replace(
          /[A-Z]/g,
          (letter: string) => `_${letter.toLowerCase()}`,
        );
        positionallyMatched.add(fParam);
        positionallyMatched.add(fParamSnake);
        positionallyMatchedBackend.add(bParam);
      }
    }
  }

  // Check for missing parameters in frontend (skip positionally matched ones)
  for (const param of backendParams) {
    if (
      !frontendParams.includes(param) &&
      !positionallyMatchedBackend.has(param)
    ) {
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
  frontendServiceUsageCache: FrontendServiceUsageCache,
): ApiContractIssue[] {
  const issues: ApiContractIssue[] = [];

  // Validate request body type
  if (mapping.frontend.requestType && mapping.backend.requestModel) {
    const frontendRequestType = mapping.frontend.requestType;
    const backendRequestModel = mapping.backend.requestModel;

    // Skip validation for complex types that couldn't be extracted properly
    if (
      isComplexType(frontendRequestType) ||
      isComplexType(backendRequestModel)
    ) {
      // Complex types - skip detailed validation
    } else if (frontendRequestType !== backendRequestModel) {
      // Check if they're similar type names
      if (
        !areSimilarTypeNames(
          frontendRequestType.toLowerCase(),
          backendRequestModel.toLowerCase(),
        )
      ) {
        // Check if there's a type mapping for this
        const typeMapping = apiContract.typeMappings.get(frontendRequestType);
        if (!typeMapping || typeMapping.backend?.name !== backendRequestModel) {
          // Check if FE sends an array type that the BE wraps in a model
          // e.g., FE sends PaymentMilestoneCreate[] → BE expects PaymentScheduleSetup { milestones: List[PaymentMilestoneCreate] }
          const isWrappedArray = isArrayTypeWrappedInModel(
            frontendRequestType,
            backendRequestModel,
            apiContract,
          );
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
      const backendModel = apiContract.backendModels.find(
        (m) => m.name === backendRequestModel,
      );
      if (backendModel) {
        // Check for missing required fields
        for (const backendField of backendModel.fields) {
          if (backendField.required) {
            const frontendField = typeMapping.frontend.fields.find(
              (f: { name: string }) =>
                normalizeName(f.name) === normalizeName(backendField.name),
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
      if (
        !typeMapping ||
        typeMapping.backend?.name !== normalizedBackendModel
      ) {
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
  issues.push(
    ...validateInlineRequestResponseFields(
      mapping,
      endpoint,
      apiContract,
      frontendServiceUsageCache,
    ),
  );

  return issues;
}

function validateInlineRequestResponseFields(
  mapping: any,
  endpoint: string,
  apiContract: ApiContractContext,
  frontendServiceUsageCache: FrontendServiceUsageCache,
): ApiContractIssue[] {
  const issues: ApiContractIssue[] = [];

  const frontendFile = mapping?.frontend?.file;
  const backendFile = mapping?.backend?.file;
  const method = mapping?.backend?.method || mapping?.frontend?.method;
  const backendPath = mapping?.backend?.path;
  const backendHandlerName = mapping?.backend?.handler;

  if (!frontendFile || !backendFile || !method || !backendPath) return issues;
  if (!fsSync.existsSync(frontendFile) || !fsSync.existsSync(backendFile))
    return issues;

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
  const feFnNode = frontendFnName
    ? findFunctionLikeByName(
        feTree.rootNode,
        feContent,
        frontendFnName,
        mapping?.frontend?.line,
      )
    : null;
  const shouldValidateFrontendFieldMismatches =
    shouldValidateInlineFrontendFieldMismatches(
      mapping,
      feTree.rootNode,
      feFnNode,
      feContent,
      apiContract,
      frontendServiceUsageCache,
    );

  const feResponseFields = feFnNode
    ? extractResponseFieldsUsed(feFnNode, feContent)
    : new Set<string>();
  const feRequestFields = feFnNode
    ? extractRequestBodyFieldsUsed(feFnNode, feContent)
    : new Set<string>();
  const feRequestTypeFields = feFnNode
    ? inferRequestBodyFieldsFromTypedParams(
        feFnNode,
        feContent,
        apiContract.frontendTypes,
      )
    : new Set<string>();
  for (const field of feRequestTypeFields) {
    feRequestFields.add(field);
  }
  const feRequestBodyHasSpread = feFnNode
    ? requestBodyHasSpreadLiteral(feFnNode, feContent)
    : false;

  const backendHandler = resolveExpressBackendHandler(
    beTree.rootNode,
    beContent,
    backendFile,
    method,
    backendPath,
    backendHandlerName,
  );
  const beResponseFields = backendHandler
    ? extractBackendResponseFields(backendHandler.node, backendHandler.content)
    : new Set<string>();
  const beRequestFields = backendHandler
    ? extractBackendRequestFields(backendHandler.node, backendHandler.content)
    : new Set<string>();
  const feQueryFields = new Set<string>(
    (mapping?.frontend?.queryParams || []).map((p: any) => p.name),
  );
  const beDeclaredQueryFields = new Set<string>(
    (mapping?.backend?.queryParams || []).map((p: any) => p.name),
  );
  const beHandlerQueryFields = backendHandler
    ? extractBackendQueryFields(backendHandler.node, backendHandler.content)
    : new Set<string>();

  // Response field mismatches
  if (
    shouldValidateFrontendFieldMismatches &&
    feResponseFields.size > 0 &&
    beResponseFields.size > 0
  ) {
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
  if (shouldValidateFrontendFieldMismatches && beRequestFields.size > 0) {
    if (feRequestFields.size > 0) {
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

    // Only infer missing backend-read fields when the frontend payload shape is explicit.
    // Object spreads (e.g. { ...data, extra: 1 }) often hide fields that static extraction
    // cannot reliably enumerate, which would create noisy false positives.
    if (!feRequestBodyHasSpread && feRequestFields.size > 0) {
      for (const backendField of beRequestFields) {
        if (!feRequestFields.has(backendField)) {
          issues.push({
            type: "apiMissingRequiredField",
            severity: "high",
            message: `Request field mismatch: backend handler for ${method.toUpperCase()} ${backendPath} reads/expects '${backendField}', but frontend payload does not include it`,
            file: frontendFile,
            line: mapping.frontend.line,
            endpoint,
            suggestion: `Include '${backendField}' in frontend request payload or update backend handler expectations`,
            confidence: 78,
          });
        }
      }
    }
  }

  // Express route extraction does not always include query params in route metadata.
  // If frontend declares query params and backend handler clearly reads req.query
  // fields, validate them here to catch mismatches like extra frontend status filters.
  if (
    shouldValidateFrontendFieldMismatches &&
    feQueryFields.size > 0 &&
    beDeclaredQueryFields.size === 0 &&
    beHandlerQueryFields.size > 0
  ) {
    for (const frontendQuery of feQueryFields) {
      if (!beHandlerQueryFields.has(frontendQuery)) {
        issues.push({
          type: "apiExtraField",
          severity: "medium",
          message: `Query parameter mismatch: frontend sends '${frontendQuery}', but backend handler for ${method.toUpperCase()} ${backendPath} does not read/expect it`,
          file: frontendFile,
          line: mapping.frontend.line,
          endpoint,
          suggestion: `Remove query parameter '${frontendQuery}' from frontend request or update backend handler to support it`,
          confidence: 80,
        });
      }
    }
  }

  if (backendHandler) {
    issues.push(
      ...detectBackendPropertyHallucinations(
        backendHandler.node,
        backendHandler.content,
        backendHandler.filePath,
        apiContract.backendModels,
        endpoint,
        mapping?.backend?.line,
      ),
    );
  }

  return issues;
}

function detectBackendPropertyHallucinations(
  handlerNode: any,
  content: string,
  handlerFilePath: string,
  backendModels: Array<{ name: string; fields: Array<{ name: string }> }>,
  endpoint: string,
  fallbackLine?: number,
): ApiContractIssue[] {
  const issues: ApiContractIssue[] = [];
  if (!handlerNode || backendModels.length === 0) return issues;

  const knownModelFieldSets = new Map<string, Set<string>>();
  for (const model of backendModels) {
    knownModelFieldSets.set(
      normalizeName(model.name),
      new Set(model.fields.map((field) => normalizeName(field.name))),
    );
  }

  const variableToModel = new Map<
    string,
    { modelName: string; modelFields: Set<string>; isCollection: boolean }
  >();
  const prismaMethods = new Set([
    "findunique",
    "findfirst",
    "findmany",
    "create",
    "update",
    "upsert",
    "delete",
  ]);
  const arrayMethodNames = new Set([
    "map",
    "forEach",
    "some",
    "every",
    "filter",
    "reduce",
    "find",
    "flatMap",
    "sort",
    "slice",
    "concat",
    "includes",
    "indexOf",
    "lastIndexOf",
    "at",
    "entries",
    "values",
    "keys",
    "length",
  ]);

  const registerModelVariables = (node: any) => {
    if (!node) return;
    if (node.type === "variable_declarator") {
      const nameNode = node.childForFieldName?.("name");
      const valueNode = node.childForFieldName?.("value");
      if (nameNode?.type === "identifier" && valueNode) {
        const variableName = content.slice(
          nameNode.startIndex,
          nameNode.endIndex,
        );
        const callNode = unwrapAwaitExpression(valueNode);
        if (callNode?.type === "call_expression") {
          const fnNode = callNode.childForFieldName?.("function");
          const prismaRef = extractPrismaModelReference(fnNode, content);
          if (prismaRef && prismaMethods.has(prismaRef.method.toLowerCase())) {
            const modelFields = knownModelFieldSets.get(
              normalizeName(prismaRef.model),
            );
            if (modelFields) {
              variableToModel.set(variableName, {
                modelName: prismaRef.model,
                modelFields,
                isCollection: prismaRef.method.toLowerCase() === "findmany",
              });
            }
          }
        }
      }
    }

    for (const child of node.children || []) registerModelVariables(child);
  };

  registerModelVariables(handlerNode);
  const extractFirstCallbackParamName = (callbackNode: any): string | null => {
    if (!callbackNode) return null;
    const paramsNode =
      callbackNode.childForFieldName?.("parameters") ||
      callbackNode.childForFieldName?.("parameter");
    if (!paramsNode) return null;

    if (paramsNode.type === "identifier") {
      const paramName = content.slice(
        paramsNode.startIndex,
        paramsNode.endIndex,
      );
      return paramName || null;
    }

    for (const param of paramsNode.namedChildren || paramsNode.children || []) {
      if (param?.type === "identifier") {
        const identifierName = content.slice(param.startIndex, param.endIndex);
        if (identifierName) return identifierName;
      }

      const nameNode =
        param.childForFieldName?.("pattern") ||
        param.childForFieldName?.("name") ||
        (param.namedChildren
          ? param.namedChildren.find((c: any) => c.type === "identifier")
          : null);
      if (!nameNode || nameNode.type !== "identifier") continue;

      const paramName = content.slice(nameNode.startIndex, nameNode.endIndex);
      if (paramName) return paramName;
    }

    return null;
  };

  const registerCollectionElementAliases = (node: any) => {
    if (!node) return;

    if (node.type === "call_expression") {
      const fnNode = node.childForFieldName?.("function");
      const argsNode = node.childForFieldName?.("arguments");

      if (fnNode?.type === "member_expression" && argsNode) {
        const objectNode = fnNode.childForFieldName?.("object");
        const propertyNode = fnNode.childForFieldName?.("property");

        if (
          objectNode?.type === "identifier" &&
          propertyNode?.type === "property_identifier"
        ) {
          const collectionName = content.slice(
            objectNode.startIndex,
            objectNode.endIndex,
          );
          const iterateMethod = content.slice(
            propertyNode.startIndex,
            propertyNode.endIndex,
          );
          const modelRef = variableToModel.get(collectionName);

          if (modelRef?.isCollection && arrayMethodNames.has(iterateMethod)) {
            const callbackNode = (argsNode.namedChildren || []).find(
              (child: any) =>
                child.type === "arrow_function" || child.type === "function",
            );
            const callbackParam = extractFirstCallbackParamName(callbackNode);
            if (callbackParam && !variableToModel.has(callbackParam)) {
              variableToModel.set(callbackParam, {
                modelName: modelRef.modelName,
                modelFields: modelRef.modelFields,
                isCollection: false,
              });
            }
          }
        }
      }
    }

    for (const child of node.children || [])
      registerCollectionElementAliases(child);
  };

  registerCollectionElementAliases(handlerNode);
  if (variableToModel.size === 0) return issues;

  const seen = new Set<string>();
  const scanPropertyAccess = (node: any) => {
    if (!node) return;

    if (node.type === "member_expression") {
      const objectNode = node.childForFieldName?.("object");
      const propertyNode = node.childForFieldName?.("property");
      if (
        objectNode?.type === "identifier" &&
        propertyNode?.type === "property_identifier"
      ) {
        const variableName = content.slice(
          objectNode.startIndex,
          objectNode.endIndex,
        );
        const modelRef = variableToModel.get(variableName);
        if (modelRef) {
          const propertyName = content.slice(
            propertyNode.startIndex,
            propertyNode.endIndex,
          );

          if (modelRef.isCollection && arrayMethodNames.has(propertyName)) {
            // `findMany()` returns arrays, so collection methods/properties are valid.
            for (const child of node.children || []) scanPropertyAccess(child);
            return;
          }

          const normalizedProperty = normalizeName(propertyName);
          if (!modelRef.modelFields.has(normalizedProperty)) {
            const issueLine =
              typeof node?.startPosition?.row === "number"
                ? node.startPosition.row + 1
                : fallbackLine || 1;
            const key = `${variableName}.${propertyName}`;
            if (!seen.has(key)) {
              seen.add(key);
              issues.push({
                type: "apiContractMismatch",
                severity: "high",
                message: `Potential backend property hallucination: '${variableName}.${propertyName}' is accessed in handler but '${propertyName}' is not defined on model '${modelRef.modelName}'`,
                file: handlerFilePath,
                line: issueLine,
                endpoint,
                suggestion: `Use a valid '${modelRef.modelName}' property or update the model schema to include '${propertyName}'`,
                confidence: 80,
              });
            }
          }
        }
      }
    }

    for (const child of node.children || []) scanPropertyAccess(child);
  };

  scanPropertyAccess(handlerNode);
  return issues;
}

function unwrapAwaitExpression(node: any): any {
  if (!node) return null;
  if (node.type !== "await_expression") return node;
  return (
    node.childForFieldName?.("argument") ||
    node.childForFieldName?.("expression") ||
    (node.namedChildren ? node.namedChildren[0] : null)
  );
}

function extractPrismaModelReference(
  functionNode: any,
  content: string,
): { model: string; method: string } | null {
  if (!functionNode || functionNode.type !== "member_expression") return null;

  const methodNode = functionNode.childForFieldName?.("property");
  const objectNode = functionNode.childForFieldName?.("object");
  if (!methodNode || !objectNode || objectNode.type !== "member_expression")
    return null;

  const prismaRootNode = objectNode.childForFieldName?.("object");
  const modelNode = objectNode.childForFieldName?.("property");
  if (!prismaRootNode || !modelNode) return null;

  const prismaRoot = content.slice(
    prismaRootNode.startIndex,
    prismaRootNode.endIndex,
  );
  if (prismaRoot !== "prisma") return null;

  const model = content.slice(modelNode.startIndex, modelNode.endIndex);
  const method = content.slice(methodNode.startIndex, methodNode.endIndex);
  if (!model || !method) return null;

  return { model, method };
}

function findFunctionLikeByName(
  root: any,
  content: string,
  name: string,
  preferredLine?: number,
): any | null {
  const candidates: any[] = [];
  const target = name.trim();

  const visit = (node: any) => {
    if (!node) return;

    if (node.type === "function_declaration") {
      const nameNode = node.childForFieldName?.("name");
      if (
        nameNode &&
        content.slice(nameNode.startIndex, nameNode.endIndex) === target
      ) {
        candidates.push(node);
      }
    }

    // const foo = async (...) => {}
    if (node.type === "variable_declarator") {
      const nameNode = node.childForFieldName?.("name");
      const valueNode = node.childForFieldName?.("value");
      const nodeName = nameNode
        ? content.slice(nameNode.startIndex, nameNode.endIndex)
        : "";
      if (
        nodeName === target &&
        (valueNode?.type === "arrow_function" || valueNode?.type === "function")
      ) {
        candidates.push(valueNode);
      }
    }

    // { getUser: async (...) => {} }
    if (node.type === "pair") {
      const keyNode = node.childForFieldName?.("key");
      const valueNode = node.childForFieldName?.("value");
      if (
        keyNode &&
        valueNode &&
        (valueNode.type === "arrow_function" || valueNode.type === "function")
      ) {
        const keyText = content
          .slice(keyNode.startIndex, keyNode.endIndex)
          .replace(/^['"`]/, "")
          .replace(/['"`]$/, "");
        if (keyText === target) {
          candidates.push(valueNode);
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
          candidates.push(node);
        }
      }
    }

    for (const child of node.children || []) visit(child);
  };

  visit(root);
  if (candidates.length === 0) return null;

  if (typeof preferredLine !== "number" || Number.isNaN(preferredLine)) {
    return candidates[0];
  }

  let best = candidates[0];
  let bestScore = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const start = candidate?.startPosition?.row;
    const end = candidate?.endPosition?.row;
    if (typeof start !== "number") continue;

    const startLine = start + 1;
    const endLine = typeof end === "number" ? end + 1 : startLine;

    if (preferredLine >= startLine && preferredLine <= endLine) {
      return candidate;
    }

    const distance = Math.abs(startLine - preferredLine);
    if (distance < bestScore) {
      bestScore = distance;
      best = candidate;
    }
  }

  return best;
}

function shouldValidateInlineFrontendFieldMismatches(
  mapping: any,
  frontendTreeRoot: any,
  frontendFnNode: any,
  frontendContent: string,
  apiContract: ApiContractContext,
  frontendServiceUsageCache: FrontendServiceUsageCache,
): boolean {
  const frontendFile: string | undefined = mapping?.frontend?.file;
  if (!frontendFile) return true;

  const expectedMethodName = mapping?.frontend?.name?.trim();

  let serviceReference = frontendFnNode
    ? extractFrontendServiceReference(frontendFnNode, frontendContent)
    : null;
  if (serviceReference && expectedMethodName) {
    const extractedMethodName = serviceReference.split(".").slice(-1)[0];
    if (extractedMethodName !== expectedMethodName) {
      serviceReference = null;
    }
  }
  if (!serviceReference) {
    serviceReference = findFrontendServiceReferenceByName(
      frontendTreeRoot,
      frontendContent,
      mapping?.frontend?.name,
      mapping?.frontend?.line,
    );
  }
  if (!serviceReference) return true;

  const isUsed = isFrontendServiceReferenceUsed(
    serviceReference,
    frontendFile,
    apiContract,
    frontendServiceUsageCache,
  );

  return isUsed;
}

function extractFrontendServiceReference(
  frontendFnNode: any,
  frontendContent: string,
): string | null {
  let pairNode = frontendFnNode;
  while (pairNode && pairNode.type !== "pair") {
    pairNode = pairNode.parent;
  }
  if (!pairNode || pairNode.type !== "pair") return null;

  const keyNode = pairNode.childForFieldName?.("key");
  if (!keyNode) return null;

  const methodName = frontendContent
    .slice(keyNode.startIndex, keyNode.endIndex)
    .replace(/^['"`]/, "")
    .replace(/['"`]$/, "");
  if (!methodName) return null;

  const objectName = extractServiceObjectNameFromPair(
    pairNode,
    frontendContent,
  );
  if (!objectName) return null;

  return `${objectName}.${methodName}`;
}

function findFrontendServiceReferenceByName(
  frontendTreeRoot: any,
  frontendContent: string,
  methodName: string | undefined,
  preferredLine?: number,
): string | null {
  const target = methodName?.trim();
  if (!target || !frontendTreeRoot) return null;

  const candidates: Array<{ reference: string; line: number }> = [];

  const visit = (node: any) => {
    if (!node) return;

    if (node.type === "pair") {
      const keyNode = node.childForFieldName?.("key");
      if (keyNode) {
        const keyText = frontendContent
          .slice(keyNode.startIndex, keyNode.endIndex)
          .replace(/^['"`]/, "")
          .replace(/['"`]$/, "");

        if (keyText === target) {
          const objectName = extractServiceObjectNameFromPair(
            node,
            frontendContent,
          );
          if (objectName) {
            const line =
              typeof keyNode?.startPosition?.row === "number"
                ? keyNode.startPosition.row + 1
                : 1;
            candidates.push({ reference: `${objectName}.${target}`, line });
          }
        }
      }
    }

    for (const child of node.children || []) visit(child);
  };

  visit(frontendTreeRoot);
  if (candidates.length === 0) return null;
  if (typeof preferredLine !== "number" || Number.isNaN(preferredLine)) {
    return candidates[0].reference;
  }

  let best = candidates[0];
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const distance = Math.abs(candidate.line - preferredLine);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }

  return best.reference;
}

function extractServiceObjectNameFromPair(
  pairNode: any,
  frontendContent: string,
): string | null {
  let current = pairNode?.parent;
  while (current) {
    if (current.type === "variable_declarator") {
      const nameNode = current.childForFieldName?.("name");
      if (nameNode?.type !== "identifier") return null;

      const objectName = frontendContent.slice(
        nameNode.startIndex,
        nameNode.endIndex,
      );
      return objectName || null;
    }
    current = current.parent;
  }

  return null;
}

function isFrontendServiceReferenceUsed(
  serviceReference: string,
  frontendFile: string,
  apiContract: ApiContractContext,
  frontendServiceUsageCache: FrontendServiceUsageCache,
): boolean {
  const usageCacheKey = `${frontendFile}|${serviceReference}`;
  const cachedUsage = frontendServiceUsageCache.serviceUsage.get(usageCacheKey);
  if (typeof cachedUsage === "boolean") return cachedUsage;

  const [serviceObject, serviceMethod] = serviceReference.split(".");
  if (!serviceObject || !serviceMethod) {
    frontendServiceUsageCache.serviceUsage.set(usageCacheKey, true);
    return true;
  }

  const frontendRoot = resolveFrontendSourceRoot(apiContract, frontendFile);
  if (!frontendRoot) {
    frontendServiceUsageCache.serviceUsage.set(usageCacheKey, true);
    return true;
  }

  const sourceFiles = getFrontendSourceFiles(
    frontendRoot,
    frontendServiceUsageCache,
  );
  if (sourceFiles.length === 0) {
    frontendServiceUsageCache.serviceUsage.set(usageCacheKey, true);
    return true;
  }

  const directMemberCallPattern = new RegExp(
    `\\b${escapeRegexLiteral(serviceObject)}\\s*\\.\\s*${escapeRegexLiteral(serviceMethod)}\\s*\\(`,
  );
  const anyMemberCallPattern = new RegExp(
    `\\b${escapeRegexLiteral(serviceObject)}\\s*\\.\\s*[A-Za-z_$][\\w$]*\\s*\\(`,
  );

  let methodUsed = false;
  let objectUsedByAnyMethod = false;
  for (const filePath of sourceFiles) {
    const sourceContent = readCachedFileContent(
      filePath,
      frontendServiceUsageCache,
    );
    if (!sourceContent) continue;

    if (anyMemberCallPattern.test(sourceContent)) {
      objectUsedByAnyMethod = true;
    }

    if (directMemberCallPattern.test(sourceContent)) {
      methodUsed = true;
      break;
    }

    const aliases = extractDestructuredMethodAliases(
      sourceContent,
      serviceObject,
      serviceMethod,
    );
    if (
      aliases.some((alias) => {
        const aliasCallPattern = new RegExp(
          `\\b${escapeRegexLiteral(alias)}\\s*\\(`,
        );
        return aliasCallPattern.test(sourceContent);
      })
    ) {
      methodUsed = true;
      break;
    }
  }

  // Conservative rule:
  // - If this exact method is used, validate it.
  // - If the service object is used but this method is not, skip noisy inline mismatch checks.
  // - If the whole service object appears unused, keep validation (could still be an intended public API contract).
  const shouldValidate = methodUsed || !objectUsedByAnyMethod;

  frontendServiceUsageCache.serviceUsage.set(usageCacheKey, shouldValidate);
  return shouldValidate;
}

function extractDestructuredMethodAliases(
  sourceContent: string,
  serviceObject: string,
  serviceMethod: string,
): string[] {
  const aliases = new Set<string>();
  const destructurePattern = new RegExp(
    `\\{([^}]*)\\}\\s*=\\s*${escapeRegexLiteral(serviceObject)}\\b`,
    "g",
  );

  let match: RegExpExecArray | null;
  while ((match = destructurePattern.exec(sourceContent))) {
    const entries = match[1].split(",");
    for (const entryRaw of entries) {
      const entry = entryRaw.trim();
      if (!entry) continue;

      if (entry === serviceMethod) {
        aliases.add(serviceMethod);
        continue;
      }

      const aliasMatch = entry.match(
        new RegExp(
          `^${escapeRegexLiteral(serviceMethod)}\\s*:\\s*([A-Za-z_$][\\w$]*)$`,
        ),
      );
      if (aliasMatch) {
        aliases.add(aliasMatch[1]);
      }
    }
  }

  return Array.from(aliases);
}

function resolveFrontendSourceRoot(
  apiContract: ApiContractContext,
  frontendFile: string,
): string | null {
  const configuredRoot = apiContract?.projectStructure?.frontend?.path;
  if (configuredRoot && fsSync.existsSync(configuredRoot)) {
    return configuredRoot;
  }

  if (!frontendFile) return null;

  const normalizedFilePath = frontendFile.replace(/\\/g, "/");
  const marker = "/src/";
  const markerIndex = normalizedFilePath.lastIndexOf(marker);
  if (markerIndex >= 0) {
    return normalizedFilePath.slice(0, markerIndex + marker.length - 1);
  }

  return path.dirname(frontendFile);
}

function getFrontendSourceFiles(
  frontendRoot: string,
  frontendServiceUsageCache: FrontendServiceUsageCache,
): string[] {
  const resolvedRoot = path.resolve(frontendRoot);
  const cached = frontendServiceUsageCache.sourceFilesByRoot.get(resolvedRoot);
  if (cached) return cached;

  const files: string[] = [];
  const visitDir = (dirPath: string) => {
    let entries: fsSync.Dirent[] = [];
    try {
      entries = fsSync.readdirSync(dirPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;

      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        visitDir(fullPath);
        continue;
      }

      if (!entry.isFile()) continue;
      if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
        files.push(fullPath);
      }
    }
  };

  visitDir(resolvedRoot);
  frontendServiceUsageCache.sourceFilesByRoot.set(resolvedRoot, files);
  return files;
}

function readCachedFileContent(
  filePath: string,
  frontendServiceUsageCache: FrontendServiceUsageCache,
): string {
  const cached = frontendServiceUsageCache.fileContents.get(filePath);
  if (typeof cached === "string") return cached;

  try {
    const content = fsSync.readFileSync(filePath, "utf-8");
    frontendServiceUsageCache.fileContents.set(filePath, content);
    return content;
  } catch {
    frontendServiceUsageCache.fileContents.set(filePath, "");
    return "";
  }
}

function escapeRegexLiteral(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractResponseFieldsUsed(
  functionNode: any,
  content: string,
): Set<string> {
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
      if (
        objectNode?.type === "identifier" &&
        propertyNode?.type === "property_identifier"
      ) {
        const obj = content.slice(objectNode.startIndex, objectNode.endIndex);
        const prop = content.slice(
          propertyNode.startIndex,
          propertyNode.endIndex,
        );
        if (jsonVars.has(obj)) fields.add(prop);
      }
    }

    for (const child of node.children || []) visit(child);
  };

  visit(functionNode);
  return fields;
}

function inferRequestBodyFieldsFromTypedParams(
  functionNode: any,
  content: string,
  frontendTypes: Array<{ name: string; fields: Array<{ name: string }> }>,
): Set<string> {
  const inferred = new Set<string>();
  if (!functionNode || frontendTypes.length === 0) return inferred;

  const bodyVars = extractRequestBodyVariableNames(functionNode, content);
  if (bodyVars.size === 0) return inferred;

  const paramsNode = functionNode.childForFieldName?.("parameters");
  if (!paramsNode) return inferred;

  for (const param of paramsNode.children || []) {
    const nameNode =
      param.childForFieldName?.("pattern") ||
      param.childForFieldName?.("name") ||
      (param.namedChildren
        ? param.namedChildren.find((c: any) => c.type === "identifier")
        : null);
    if (!nameNode) continue;

    const paramName = content.slice(nameNode.startIndex, nameNode.endIndex);
    if (!bodyVars.has(paramName)) continue;

    const typeNode =
      param.childForFieldName?.("type") ||
      (param.namedChildren
        ? param.namedChildren.find((c: any) => c.type === "type_annotation")
        : null);
    if (!typeNode) continue;

    const typeText = content.slice(typeNode.startIndex, typeNode.endIndex);
    const typeFields = resolveNamedTypeFieldNames(typeText, frontendTypes);
    for (const field of typeFields) {
      inferred.add(field);
    }
  }

  return inferred;
}

function extractRequestBodyVariableNames(
  functionNode: any,
  content: string,
): Set<string> {
  const bodyVars = new Set<string>();

  const collectSpreadIdentifiers = (objectNode: any) => {
    if (!objectNode || objectNode.type !== "object") return;
    for (const child of objectNode.children || []) {
      if (child.type !== "spread_element") continue;
      const argNode =
        child.childForFieldName?.("argument") ||
        (child.namedChildren ? child.namedChildren[0] : null);
      if (argNode?.type !== "identifier") continue;
      const spreadVar = content.slice(argNode.startIndex, argNode.endIndex);
      if (spreadVar) bodyVars.add(spreadVar);
    }
  };

  const visit = (node: any) => {
    if (!node) return;

    if (node.type === "call_expression") {
      const args = node.childForFieldName?.("arguments");
      if (args) {
        for (const arg of args.children || []) {
          if (arg.type !== "object") continue;

          for (const pair of arg.children || []) {
            if (pair.type !== "pair") continue;
            const keyNode = pair.childForFieldName?.("key");
            const valNode = pair.childForFieldName?.("value");
            if (!keyNode || !valNode) continue;

            const keyText = content
              .slice(keyNode.startIndex, keyNode.endIndex)
              .replace(/^['"`]/, "")
              .replace(/['"`]$/, "");
            if (keyText !== "body") continue;

            if (valNode.type === "identifier") {
              const id = content.slice(valNode.startIndex, valNode.endIndex);
              if (id) bodyVars.add(id);
              continue;
            }

            if (valNode.type === "object") {
              collectSpreadIdentifiers(valNode);
            }

            const jsonArg = extractJsonStringifyArgument(valNode, content);
            if (!jsonArg) continue;

            if (jsonArg.type === "identifier") {
              const id = content.slice(jsonArg.startIndex, jsonArg.endIndex);
              if (id) bodyVars.add(id);
            } else if (jsonArg.type === "object") {
              collectSpreadIdentifiers(jsonArg);
            }
          }
        }
      }
    }

    for (const child of node.children || []) visit(child);
  };

  visit(functionNode);
  return bodyVars;
}

function resolveNamedTypeFieldNames(
  typeText: string,
  frontendTypes: Array<{ name: string; fields: Array<{ name: string }> }>,
): Set<string> {
  const cleaned = typeText.replace(/^\s*:\s*/, "").trim();
  if (!cleaned) return new Set<string>();

  const lookupTypeFields = (rawTypeName: string): Set<string> => {
    const typeName = rawTypeName.split(".").pop() || rawTypeName;
    const target = frontendTypes.find(
      (typeDef) => normalizeName(typeDef.name) === normalizeName(typeName),
    );
    return new Set((target?.fields || []).map((field) => field.name));
  };

  const unwrapArray = (text: string): string =>
    text.replace(/\[\]$/, "").trim();
  const baseText = unwrapArray(cleaned);

  const passthroughWrapper = baseText.match(
    /^(?:Partial|Required|Readonly|NonNullable|Promise|Array)<\s*([^>]+)\s*>$/,
  );
  if (passthroughWrapper) {
    return resolveNamedTypeFieldNames(passthroughWrapper[1], frontendTypes);
  }

  const omitMatch = baseText.match(/^Omit<\s*([^,>]+)\s*,\s*(.+)\s*>$/);
  if (omitMatch) {
    const fields = resolveNamedTypeFieldNames(omitMatch[1], frontendTypes);
    const omitted = new Set<string>();
    const keyRegex = /['"`]([A-Za-z_][A-Za-z0-9_]*)['"`]/g;
    let match: RegExpExecArray | null;
    while ((match = keyRegex.exec(omitMatch[2])) !== null) {
      omitted.add(match[1]);
      omitted.add(normalizeName(match[1]));
    }

    return new Set(
      Array.from(fields).filter(
        (field) => !omitted.has(field) && !omitted.has(normalizeName(field)),
      ),
    );
  }

  const pickMatch = baseText.match(/^Pick<\s*([^,>]+)\s*,\s*(.+)\s*>$/);
  if (pickMatch) {
    const fields = resolveNamedTypeFieldNames(pickMatch[1], frontendTypes);
    const picked = new Set<string>();
    const keyRegex = /['"`]([A-Za-z_][A-Za-z0-9_]*)['"`]/g;
    let match: RegExpExecArray | null;
    while ((match = keyRegex.exec(pickMatch[2])) !== null) {
      picked.add(match[1]);
      picked.add(normalizeName(match[1]));
    }

    return new Set(
      Array.from(fields).filter(
        (field) => picked.has(field) || picked.has(normalizeName(field)),
      ),
    );
  }

  return lookupTypeFields(baseText);
}

function requestBodyHasSpreadLiteral(
  functionNode: any,
  content: string,
): boolean {
  let hasSpread = false;

  const objectHasSpread = (node: any): boolean => {
    if (!node || node.type !== "object") return false;
    return (node.children || []).some(
      (child: any) => child.type === "spread_element",
    );
  };

  const visit = (node: any) => {
    if (!node || hasSpread) return;

    if (node.type === "call_expression") {
      const args = node.childForFieldName?.("arguments");
      if (args) {
        for (const arg of args.children || []) {
          if (arg.type !== "object") continue;

          for (const pair of arg.children || []) {
            if (pair.type !== "pair") continue;
            const keyNode = pair.childForFieldName?.("key");
            const valNode = pair.childForFieldName?.("value");
            if (!keyNode || !valNode) continue;

            const keyText = content
              .slice(keyNode.startIndex, keyNode.endIndex)
              .replace(/^['"`]/, "")
              .replace(/['"`]$/, "");
            if (keyText !== "body") continue;

            if (objectHasSpread(valNode)) {
              hasSpread = true;
              return;
            }

            const jsonArg = extractJsonStringifyArgument(valNode, content);
            if (objectHasSpread(jsonArg)) {
              hasSpread = true;
              return;
            }
          }
        }
      }
    }

    for (const child of node.children || []) visit(child);
  };

  visit(functionNode);
  return hasSpread;
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

function extractRequestBodyFieldsUsed(
  functionNode: any,
  content: string,
): Set<string> {
  const fields = new Set<string>();
  const bodyVars = new Set<string>();

  const addObjectLiteralFields = (objectNode: any) => {
    for (const child of objectNode.children || []) {
      if (child.type === "pair") {
        const keyNode = child.childForFieldName?.("key");
        if (!keyNode) continue;
        const raw = content.slice(keyNode.startIndex, keyNode.endIndex);
        const cleaned = raw.replace(/^['"`]/, "").replace(/['"`]$/, "");
        if (cleaned) fields.add(cleaned);
        continue;
      }

      if (
        child.type === "shorthand_property_identifier" ||
        child.type === "shorthand_property_identifier_pattern"
      ) {
        const keyText = content.slice(child.startIndex, child.endIndex);
        if (keyText) fields.add(keyText);
        continue;
      }

      if (child.type === "spread_element") {
        const argNode =
          child.childForFieldName?.("argument") ||
          (child.namedChildren ? child.namedChildren[0] : null);
        if (argNode?.type === "identifier") {
          const spreadVar = content.slice(argNode.startIndex, argNode.endIndex);
          if (spreadVar) bodyVars.add(spreadVar);
        }
      }
    }
  };

  const visit = (node: any) => {
    if (!node) return;
    if (node.type === "call_expression") {
      const args = node.childForFieldName?.("arguments");
      if (args) {
        for (const arg of args.children || []) {
          if (arg.type !== "object") continue;
          for (const pair of arg.children || []) {
            if (pair.type !== "pair") continue;
            const keyNode = pair.childForFieldName?.("key");
            const valNode = pair.childForFieldName?.("value");
            if (!keyNode || !valNode) continue;

            const keyText = content
              .slice(keyNode.startIndex, keyNode.endIndex)
              .replace(/^['"`]/, "")
              .replace(/['"`]$/, "");
            if (keyText !== "body") continue;

            if (valNode.type === "object") {
              addObjectLiteralFields(valNode);
              continue;
            }

            if (valNode.type === "identifier") {
              const id = content.slice(valNode.startIndex, valNode.endIndex);
              if (id) bodyVars.add(id);
              continue;
            }

            const jsonArg = extractJsonStringifyArgument(valNode, content);
            if (!jsonArg) continue;

            if (jsonArg.type === "identifier") {
              const id = content.slice(jsonArg.startIndex, jsonArg.endIndex);
              if (id) bodyVars.add(id);
            } else if (jsonArg.type === "object") {
              addObjectLiteralFields(jsonArg);
            }
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
      (param.namedChildren
        ? param.namedChildren.find((c: any) => c.type === "identifier")
        : null);
    if (!nameNode) continue;
    const paramName = content.slice(nameNode.startIndex, nameNode.endIndex);
    if (!bodyVars.has(paramName)) continue;

    const typeNode =
      param.childForFieldName?.("type") ||
      (param.namedChildren
        ? param.namedChildren.find((c: any) => c.type === "type_annotation")
        : null);
    if (!typeNode) continue;
    const astKeys = extractKeysFromInlineObjectTypeNode(typeNode, content);
    if (astKeys.length > 0) {
      for (const key of astKeys) fields.add(key);
    } else {
      const typeText = content.slice(typeNode.startIndex, typeNode.endIndex);
      for (const key of extractKeysFromInlineObjectType(typeText))
        fields.add(key);
    }
  }

  return fields;
}

function extractKeysFromInlineObjectTypeNode(
  typeNode: any,
  content: string,
): string[] {
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
      (child.namedChildren
        ? child.namedChildren.find(
            (c: any) =>
              c.type === "property_identifier" ||
              c.type === "identifier" ||
              c.type === "string",
          )
        : null);
    if (!nameNode) continue;
    const raw = content.slice(nameNode.startIndex, nameNode.endIndex);
    const cleaned = raw.replace(/^['"`]/, "").replace(/['"`]$/, "");
    if (cleaned) keys.push(cleaned);
  }

  return keys;
}

function extractJsonStringifyArgument(node: any, content: string): any | null {
  // JSON.stringify(userData) or JSON.stringify({ ... })
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
  const firstArg = (args.namedChildren || [])[0];
  if (!firstArg) return null;
  return firstArg;
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

function resolveExpressBackendHandler(
  routeTreeRoot: any,
  routeFileContent: string,
  routeFilePath: string,
  method: string,
  backendPath: string,
  preferredHandlerName?: string,
): { node: any; content: string; filePath: string } | null {
  if (preferredHandlerName) {
    const localFn = findFunctionLikeByName(
      routeTreeRoot,
      routeFileContent,
      preferredHandlerName,
    );
    if (localFn) {
      return {
        node: localFn,
        content: routeFileContent,
        filePath: routeFilePath,
      };
    }

    const importedFile = resolveImportedHandlerFile(
      routeFilePath,
      routeFileContent,
      preferredHandlerName,
    );
    if (importedFile && fsSync.existsSync(importedFile)) {
      try {
        const importedContent = fsSync.readFileSync(importedFile, "utf-8");
        const importedTree = getParser("typescript").parse(importedContent);
        if (!importedTree) {
          // Fall through to path-based resolution below.
          throw new Error("Failed to parse imported handler file");
        }
        const importedFn = findFunctionLikeByName(
          importedTree.rootNode,
          importedContent,
          preferredHandlerName,
        );
        if (importedFn) {
          return {
            node: importedFn,
            content: importedContent,
            filePath: importedFile,
          };
        }
      } catch {
        // Fall through to path-based resolution below.
      }
    }
  }

  const inlineHandler = findExpressRouteHandler(
    routeTreeRoot,
    routeFileContent,
    method,
    backendPath,
  );
  if (inlineHandler) {
    return {
      node: inlineHandler,
      content: routeFileContent,
      filePath: routeFilePath,
    };
  }

  const namedHandler = findExpressRouteHandlerIdentifier(
    routeTreeRoot,
    routeFileContent,
    method,
    backendPath,
  );
  if (!namedHandler) return null;

  const handlerFile = resolveImportedHandlerFile(
    routeFilePath,
    routeFileContent,
    namedHandler,
  );
  if (!handlerFile || !fsSync.existsSync(handlerFile)) return null;

  let handlerContent = "";
  try {
    handlerContent = fsSync.readFileSync(handlerFile, "utf-8");
  } catch {
    return null;
  }

  let handlerTree: any;
  try {
    handlerTree = getParser("typescript").parse(handlerContent);
  } catch {
    return null;
  }

  const handlerNode = findFunctionLikeByName(
    handlerTree.rootNode,
    handlerContent,
    namedHandler,
  );
  if (!handlerNode) return null;

  return {
    node: handlerNode,
    content: handlerContent,
    filePath: handlerFile,
  };
}

function findExpressRouteHandlerIdentifier(
  root: any,
  content: string,
  method: string,
  backendPath: string,
): string | null {
  let found: string | null = null;
  const targetMethod = method.toLowerCase();

  const visit = (node: any) => {
    if (!node || found) return;
    if (node.type === "call_expression") {
      const fn = node.childForFieldName?.("function");
      const args = node.childForFieldName?.("arguments");
      if (fn?.type === "member_expression" && args) {
        const obj = fn.childForFieldName?.("object");
        const prop = fn.childForFieldName?.("property");
        const propText = prop
          ? content.slice(prop.startIndex, prop.endIndex).toLowerCase()
          : "";
        if (propText === targetMethod && obj?.type === "identifier") {
          const firstArg = (args.children || []).find(
            (c: any) => c.type === "string" || c.type === "template_string",
          );
          if (firstArg && firstArg.type === "string") {
            const raw = content
              .slice(firstArg.startIndex, firstArg.endIndex)
              .trim()
              .replace(/^['"`]/, "")
              .replace(/['"`]$/, "");
            if (isRoutePathMatchForHandler(raw, backendPath)) {
              const inlineFnArg = (args.children || []).find(
                (c: any) =>
                  c.type === "arrow_function" || c.type === "function",
              );
              if (inlineFnArg) {
                return;
              }

              const identifierArgs = (args.children || []).filter(
                (c: any) => c.type === "identifier",
              );
              if (identifierArgs.length > 0) {
                const handlerNode = identifierArgs[identifierArgs.length - 1];
                found = content.slice(
                  handlerNode.startIndex,
                  handlerNode.endIndex,
                );
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

function resolveImportedHandlerFile(
  routeFilePath: string,
  routeFileContent: string,
  handlerName: string,
): string | null {
  const namedImportRegex = /import\s*{([\s\S]*?)}\s*from\s*['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;

  while ((match = namedImportRegex.exec(routeFileContent))) {
    const importedList = match[1]
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    for (const imported of importedList) {
      const [original, alias] = imported
        .split(/\s+as\s+/i)
        .map((part) => part.trim());
      const localName = alias || original;
      if (localName === handlerName) {
        const resolved = resolveImportTarget(routeFilePath, match[2]);
        if (resolved) return resolved;
      }
    }
  }

  const defaultImportRegex =
    /import\s+([A-Za-z_][A-Za-z0-9_]*)\s+from\s*['"]([^'"]+)['"]/g;
  while ((match = defaultImportRegex.exec(routeFileContent))) {
    if (match[1] === handlerName) {
      const resolved = resolveImportTarget(routeFilePath, match[2]);
      if (resolved) return resolved;
    }
  }

  const requireNamedRegex =
    /const\s*{([^}]+)}\s*=\s*require\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = requireNamedRegex.exec(routeFileContent))) {
    const importedList = match[1]
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    for (const imported of importedList) {
      if (imported === handlerName) {
        const resolved = resolveImportTarget(routeFilePath, match[2]);
        if (resolved) return resolved;
      }
    }
  }

  return null;
}

function resolveImportTarget(
  routeFilePath: string,
  importPath: string,
): string | null {
  if (!importPath.startsWith(".")) return null;

  const baseDir = path.dirname(routeFilePath);
  const rawTarget = path.resolve(baseDir, importPath);
  const hasExtension = /\.[a-zA-Z0-9]+$/.test(rawTarget);
  const extensions = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];

  const candidates: string[] = [];
  if (hasExtension) {
    candidates.push(rawTarget);
  } else {
    candidates.push(rawTarget);
    for (const ext of extensions) {
      candidates.push(`${rawTarget}${ext}`);
      candidates.push(path.join(rawTarget, `index${ext}`));
    }
  }

  for (const candidate of candidates) {
    try {
      if (fsSync.existsSync(candidate) && fsSync.statSync(candidate).isFile()) {
        return candidate;
      }
    } catch {
      // Continue checking candidates
    }
  }

  return null;
}

function isRoutePathMatchForHandler(
  routePath: string,
  targetBackendPath: string,
): boolean {
  const normalizedRoutePath = normalizePathForComparison(routePath);
  const normalizedTargetPath = normalizePathForComparison(targetBackendPath);

  if (normalizedRoutePath === normalizedTargetPath) {
    return true;
  }

  // Route files often register local router paths that are suffixes of mounted paths
  // (e.g., '/:id' in file vs '/api/users/:id' in extracted full route path).
  if (normalizedTargetPath.endsWith(`/${normalizedRoutePath}`)) {
    return true;
  }

  const routeNoPrefix = removeApiPrefix(normalizedRoutePath);
  const targetNoPrefix = removeApiPrefix(normalizedTargetPath);

  if (routeNoPrefix === targetNoPrefix) {
    return true;
  }
  if (routeNoPrefix && targetNoPrefix.endsWith(`/${routeNoPrefix}`)) {
    return true;
  }

  return false;
}

function findExpressRouteHandler(
  root: any,
  content: string,
  method: string,
  backendPath: string,
): any | null {
  let found: any | null = null;
  const targetMethod = method.toLowerCase();

  const visit = (node: any) => {
    if (!node || found) return;
    if (node.type === "call_expression") {
      const fn = node.childForFieldName?.("function");
      const args = node.childForFieldName?.("arguments");
      if (fn?.type === "member_expression" && args) {
        const obj = fn.childForFieldName?.("object");
        const prop = fn.childForFieldName?.("property");
        const propText = prop
          ? content.slice(prop.startIndex, prop.endIndex).toLowerCase()
          : "";
        if (propText === targetMethod && obj?.type === "identifier") {
          const firstArg = (args.children || []).find(
            (c: any) => c.type === "string" || c.type === "template_string",
          );
          if (firstArg && firstArg.type === "string") {
            const raw = content
              .slice(firstArg.startIndex, firstArg.endIndex)
              .trim()
              .replace(/^['"`]/, "")
              .replace(/['"`]$/, "");
            if (isRoutePathMatchForHandler(raw, backendPath)) {
              // Find the first function-like arg after the path
              const fnArg = (args.children || []).find(
                (c: any) =>
                  c.type === "arrow_function" || c.type === "function",
              );
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

function detectMissingBackendResponse(
  handlerFnNode: any,
  content: string,
  handlerFilePath: string,
  endpoint: string,
  fallbackLine?: number,
): ApiContractIssue[] {
  const issues: ApiContractIssue[] = [];
  if (!handlerFnNode) return issues;

  const responseMethods = new Set([
    "json",
    "send",
    "end",
    "sendstatus",
    "redirect",
    "render",
    "download",
  ]);

  let hasResponse = false;
  let delegatesToNext = false;

  const visit = (node: any) => {
    if (!node || hasResponse) return;

    if (node.type === "call_expression") {
      const fnNode = node.childForFieldName?.("function");

      if (fnNode?.type === "identifier") {
        const fnText = content.slice(fnNode.startIndex, fnNode.endIndex);
        if (fnText === "next") {
          delegatesToNext = true;
        }
      }

      if (fnNode?.type === "member_expression") {
        const objectNode = fnNode.childForFieldName?.("object");
        const propertyNode = fnNode.childForFieldName?.("property");
        const propertyText = propertyNode
          ? content
              .slice(propertyNode.startIndex, propertyNode.endIndex)
              .toLowerCase()
          : "";

        if (responseMethods.has(propertyText)) {
          if (objectNode?.type === "identifier") {
            const objectText = content.slice(
              objectNode.startIndex,
              objectNode.endIndex,
            );
            if (objectText === "res") {
              hasResponse = true;
              return;
            }
          }

          if (objectNode?.type === "call_expression") {
            const nestedFn = objectNode.childForFieldName?.("function");
            if (nestedFn?.type === "member_expression") {
              const nestedObj = nestedFn.childForFieldName?.("object");
              const nestedProp = nestedFn.childForFieldName?.("property");
              const nestedObjText = nestedObj
                ? content.slice(nestedObj.startIndex, nestedObj.endIndex)
                : "";
              const nestedPropText = nestedProp
                ? content
                    .slice(nestedProp.startIndex, nestedProp.endIndex)
                    .toLowerCase()
                : "";
              if (nestedObjText === "res" && nestedPropText === "status") {
                hasResponse = true;
                return;
              }
            }
          }
        }
      }
    }

    for (const child of node.children || []) visit(child);
  };

  visit(handlerFnNode);

  if (!hasResponse && !delegatesToNext) {
    const issueLine =
      typeof handlerFnNode?.startPosition?.row === "number"
        ? handlerFnNode.startPosition.row + 1
        : fallbackLine || 1;
    issues.push({
      type: "apiContractMismatch",
      severity: "high",
      message: `Potential missing response: backend handler for ${endpoint} does not send a response (e.g., res.json/res.send)`,
      file: handlerFilePath,
      line: issueLine,
      endpoint,
      suggestion:
        "Ensure every execution path sends a response or delegates to middleware with next(err)",
      confidence: 75,
    });
  }

  return issues;
}

function detectUnusedLocalVariables(
  handlerFnNode: any,
  content: string,
  handlerFilePath: string,
  endpoint: string,
  fallbackLine?: number,
): ApiContractIssue[] {
  const issues: ApiContractIssue[] = [];
  if (!handlerFnNode) return issues;

  const declarations = new Map<string, number[]>();
  const identifierCounts = new Map<string, number>();

  const collectDeclarations = (node: any) => {
    if (!node) return;

    if (node.type === "variable_declarator") {
      const nameNode = node.childForFieldName?.("name");
      if (nameNode?.type === "identifier") {
        const variableName = content.slice(
          nameNode.startIndex,
          nameNode.endIndex,
        );
        if (variableName && !variableName.startsWith("_")) {
          const declarationLine =
            typeof nameNode?.startPosition?.row === "number"
              ? nameNode.startPosition.row + 1
              : fallbackLine || 1;
          const lines = declarations.get(variableName) || [];
          lines.push(declarationLine);
          declarations.set(variableName, lines);
        }
      }
    }

    for (const child of node.children || []) collectDeclarations(child);
  };

  const collectIdentifierUsage = (node: any) => {
    if (!node) return;

    if (
      node.type === "identifier" ||
      node.type === "shorthand_property_identifier" ||
      node.type === "shorthand_property_identifier_pattern"
    ) {
      const identifier = content.slice(node.startIndex, node.endIndex);
      identifierCounts.set(
        identifier,
        (identifierCounts.get(identifier) || 0) + 1,
      );
    }

    for (const child of node.children || []) collectIdentifierUsage(child);
  };

  collectDeclarations(handlerFnNode);
  if (declarations.size === 0) return issues;

  collectIdentifierUsage(handlerFnNode);

  const seen = new Set<string>();
  for (const [variableName, declarationLines] of declarations) {
    const totalIdentifierHits = identifierCounts.get(variableName) || 0;
    const declarationCount = declarationLines.length;

    if (totalIdentifierHits > declarationCount) continue;

    for (const declarationLine of declarationLines) {
      const key = `${variableName}:${declarationLine}`;
      if (seen.has(key)) continue;
      seen.add(key);

      issues.push({
        type: "apiContractMismatch",
        severity: "medium",
        message: `Unused local variable: '${variableName}' is declared in backend handler for ${endpoint} but never used`,
        file: handlerFilePath,
        line: declarationLine,
        endpoint,
        suggestion: `Remove unused variable '${variableName}' or use it in handler logic`,
        confidence: 78,
      });
    }
  }

  return issues;
}

function detectUnknownPrismaModelQueries(
  handlerFnNode: any,
  content: string,
  handlerFilePath: string,
  backendModels: Array<{ name: string; fields: Array<{ name: string }> }>,
  endpoint: string,
  fallbackLine?: number,
): ApiContractIssue[] {
  const issues: ApiContractIssue[] = [];
  if (!handlerFnNode) return issues;

  const knownModelNames = new Set<string>(
    backendModels.map((model) => normalizeName(model.name)),
  );
  const prismaQueryMethods = new Set([
    "findunique",
    "finduniquethrow",
    "findfirst",
    "findfirstthrow",
    "findmany",
    "create",
    "createmany",
    "update",
    "upsert",
    "delete",
    "deletemany",
    "updatemany",
    "count",
    "aggregate",
    "groupby",
  ]);
  const seen = new Set<string>();

  const visit = (node: any) => {
    if (!node) return;

    if (node.type === "call_expression") {
      const fnNode = node.childForFieldName?.("function");
      const prismaRef = extractPrismaModelReference(fnNode, content);
      if (prismaRef) {
        const methodName = prismaRef.method.toLowerCase();
        const modelName = normalizeName(prismaRef.model);
        if (
          prismaQueryMethods.has(methodName) &&
          !knownModelNames.has(modelName)
        ) {
          const issueLine =
            typeof node?.startPosition?.row === "number"
              ? node.startPosition.row + 1
              : fallbackLine || 1;
          const key = `${modelName}:${methodName}:${issueLine}`;
          if (!seen.has(key)) {
            seen.add(key);
            issues.push({
              type: "apiContractMismatch",
              severity: "high",
              message: `Potential backend query hallucination: prisma.${prismaRef.model}.${prismaRef.method} is called in handler but model '${prismaRef.model}' is not defined in backend schema/models`,
              file: handlerFilePath,
              line: issueLine,
              endpoint,
              suggestion: `Use a valid Prisma model name or add model '${prismaRef.model}' to backend schema`,
              confidence: 85,
            });
          }
        }
      }
    }

    for (const child of node.children || []) visit(child);
  };

  visit(handlerFnNode);
  return issues;
}

function extractBackendResponseFields(
  handlerFnNode: any,
  content: string,
): Set<string> {
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
        const propText = prop
          ? content.slice(prop.startIndex, prop.endIndex)
          : "";
        if (objText === "res" && propText === "json") {
          const objArg = (args.children || []).find(
            (c: any) => c.type === "object",
          );
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
              if (
                child.type === "shorthand_property_identifier" ||
                child.type === "shorthand_property_identifier_pattern"
              ) {
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

function extractBackendQueryFields(
  handlerFnNode: any,
  content: string,
): Set<string> {
  const fields = new Set<string>();
  const queryVars = new Set<string>();

  const collectPatternIdentifiers = (patternNode: any) => {
    const patternText = content.slice(
      patternNode.startIndex,
      patternNode.endIndex,
    );
    const re = /\b([A-Za-z_][A-Za-z0-9_]*)\b/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(patternText))) {
      fields.add(m[1]);
    }
  };

  const visit = (node: any) => {
    if (!node) return;

    if (node.type === "variable_declarator") {
      const nameNode = node.childForFieldName?.("name");
      const valueNode = node.childForFieldName?.("value");

      // const { category } = req.query
      if (
        nameNode?.type === "object_pattern" &&
        valueNode?.type === "member_expression"
      ) {
        const obj = valueNode.childForFieldName?.("object");
        const prop = valueNode.childForFieldName?.("property");
        const objText = obj ? content.slice(obj.startIndex, obj.endIndex) : "";
        const propText = prop
          ? content.slice(prop.startIndex, prop.endIndex)
          : "";
        if (objText === "req" && propText === "query") {
          collectPatternIdentifiers(nameNode);
        }
      }

      // const query = req.query
      if (
        nameNode?.type === "identifier" &&
        valueNode?.type === "member_expression"
      ) {
        const obj = valueNode.childForFieldName?.("object");
        const prop = valueNode.childForFieldName?.("property");
        const objText = obj ? content.slice(obj.startIndex, obj.endIndex) : "";
        const propText = prop
          ? content.slice(prop.startIndex, prop.endIndex)
          : "";
        if (objText === "req" && propText === "query") {
          const varName = content.slice(nameNode.startIndex, nameNode.endIndex);
          if (varName) queryVars.add(varName);
        }
      }

      // const { category } = query
      if (
        nameNode?.type === "object_pattern" &&
        valueNode?.type === "identifier"
      ) {
        const valueText = content.slice(
          valueNode.startIndex,
          valueNode.endIndex,
        );
        if (queryVars.has(valueText)) {
          collectPatternIdentifiers(nameNode);
        }
      }
    }

    // req.query.status
    if (node.type === "member_expression") {
      const objectNode = node.childForFieldName?.("object");
      const propertyNode = node.childForFieldName?.("property");
      if (
        propertyNode?.type === "property_identifier" &&
        objectNode?.type === "member_expression"
      ) {
        const innerObj = objectNode.childForFieldName?.("object");
        const innerProp = objectNode.childForFieldName?.("property");
        const innerObjText = innerObj
          ? content.slice(innerObj.startIndex, innerObj.endIndex)
          : "";
        const innerPropText = innerProp
          ? content.slice(innerProp.startIndex, innerProp.endIndex)
          : "";
        if (innerObjText === "req" && innerPropText === "query") {
          fields.add(
            content.slice(propertyNode.startIndex, propertyNode.endIndex),
          );
        }
      }

      // query.status (where query = req.query)
      if (
        objectNode?.type === "identifier" &&
        propertyNode?.type === "property_identifier"
      ) {
        const objText = content.slice(
          objectNode.startIndex,
          objectNode.endIndex,
        );
        if (queryVars.has(objText)) {
          fields.add(
            content.slice(propertyNode.startIndex, propertyNode.endIndex),
          );
        }
      }
    }

    for (const child of node.children || []) visit(child);
  };

  visit(handlerFnNode);
  return fields;
}

function extractBackendRequestFields(
  handlerFnNode: any,
  content: string,
): Set<string> {
  const fields = new Set<string>();
  const visit = (node: any) => {
    if (!node) return;

    // const { name, email } = req.body
    if (node.type === "variable_declarator") {
      const nameNode = node.childForFieldName?.("name");
      const valueNode = node.childForFieldName?.("value");
      if (
        nameNode?.type === "object_pattern" &&
        valueNode?.type === "member_expression"
      ) {
        const obj = valueNode.childForFieldName?.("object");
        const prop = valueNode.childForFieldName?.("property");
        const objText = obj ? content.slice(obj.startIndex, obj.endIndex) : "";
        const propText = prop
          ? content.slice(prop.startIndex, prop.endIndex)
          : "";
        if (objText === "req" && propText === "body") {
          const patternText = content.slice(
            nameNode.startIndex,
            nameNode.endIndex,
          );
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
      if (
        propertyNode?.type === "property_identifier" &&
        objectNode?.type === "member_expression"
      ) {
        const innerObj = objectNode.childForFieldName?.("object");
        const innerProp = objectNode.childForFieldName?.("property");
        const innerObjText = innerObj
          ? content.slice(innerObj.startIndex, innerObj.endIndex)
          : "";
        const innerPropText = innerProp
          ? content.slice(innerProp.startIndex, innerProp.endIndex)
          : "";
        if (innerObjText === "req" && innerPropText === "body") {
          fields.add(
            content.slice(propertyNode.startIndex, propertyNode.endIndex),
          );
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
  const method = (
    mapping?.backend?.method ||
    mapping?.frontend?.method ||
    "REQUEST"
  ).toUpperCase();
  const backendPath =
    mapping?.backend?.path || mapping?.frontend?.endpoint || endpoint;

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

    if (!backendParam) {
      // Only flag extra frontend query params when backend explicitly defines
      // at least one query parameter for this endpoint; this avoids noisy
      // false positives on routes where backend query extraction is unavailable.
      if (backendParams.length > 0) {
        issues.push({
          type: "apiExtraField",
          severity: "medium",
          message: `Query parameter mismatch: frontend sends '${frontendParam.name}', but backend handler for ${method} ${backendPath} does not read/expect it`,
          file: mapping.frontend.file,
          line: mapping.frontend.line,
          endpoint,
          suggestion: `Remove query parameter '${frontendParam.name}' from frontend request or update backend handler to support it`,
          confidence: 80,
        });
      }
      continue;
    }

    const result = areTypesCompatible(frontendParam.type, backendParam.type);

    if (!result.compatible || result.severity) {
      issues.push({
        type: "apiTypeMismatch",
        severity: (result.severity as "high" | "medium" | "low") || "medium",
        message:
          result.reason ||
          `Query parameter '${frontendParam.name}' type mismatch: frontend uses '${frontendParam.type}', backend expects '${backendParam.type}'`,
        file: mapping.frontend.file,
        line: mapping.frontend.line,
        endpoint,
        suggestion:
          result.suggestion ||
          `Ensure query parameter '${frontendParam.name}' types are compatible`,
        confidence: 85,
      });
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
          (f: { name: string }) =>
            normalizeName(f.name) === normalizeName(backendField.name),
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
    const isSameLanguage = isSameLanguageProject(
      frontendType.file,
      backendModel.file,
    );
    if (!isSameLanguage) {
      for (const frontendField of frontendType.fields) {
        const backendField = backendModel.fields.find(
          (f: { name: string }) =>
            normalizeName(f.name) === normalizeName(frontendField.name),
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
        (f: { name: string }) =>
          normalizeName(f.name) === normalizeName(frontendField.name),
      );

      if (backendField) {
        const result = areTypesCompatible(
          frontendField.type,
          backendField.type,
        );

        if (!result.compatible || result.severity) {
          issues.push({
            type: "apiTypeMismatch",
            severity:
              (result.severity as "high" | "medium" | "low") || "medium",
            message:
              result.reason ||
              `Type mismatch for field '${frontendField.name}': frontend uses '${frontendField.type}', backend expects '${backendField.type}'`,
            file: frontendType.file,
            line: frontendType.line,
            suggestion:
              result.suggestion ||
              getTypeCompatibilitySuggestion(
                frontendField.type,
                backendField.type,
              ),
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

function validateUnmatchedFrontend(
  apiContract: ApiContractContext,
): ApiContractIssue[] {
  const issues: ApiContractIssue[] = [];

  for (const service of apiContract.unmatchedFrontend) {
    // Skip ignored endpoints (webhooks, admin, internal, etc.)
    if (shouldIgnoreEndpoint(service.endpoint)) {
      continue;
    }

    // Check if there's a similar endpoint with different method or path
    const similarRoute = findSimilarRoute(service, apiContract.backendRoutes);

    if (similarRoute) {
      const servicePathNormalized = normalizePathForComparison(
        service.endpoint,
      );
      const routePathNormalized = normalizePathForComparison(similarRoute.path);
      const samePathIgnoringPrefix =
        pathsMatchStrict(servicePathNormalized, routePathNormalized) ||
        pathsMatchStrict(
          removeApiPrefix(servicePathNormalized),
          removeApiPrefix(routePathNormalized),
        );

      // Check if it's a method mismatch
      if (samePathIgnoringPrefix) {
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
  backendRoutes: ApiRouteDefinition[],
): ApiRouteDefinition | undefined {
  const normalizedEndpoint = normalizePathForComparison(service.endpoint);

  // First, check for exact path match with different method (normalizing params)
  const samePathDifferentMethod = backendRoutes.find((route) => {
    const normalizedRoute = normalizePathForComparison(route.path);
    return (
      normalizedRoute === normalizedEndpoint &&
      route.method.toUpperCase() !== service.method.toUpperCase()
    );
  });

  if (samePathDifferentMethod) {
    return samePathDifferentMethod;
  }

  // Also check with API prefix stripped
  const endpointNoPrefix = removeApiPrefix(normalizedEndpoint);
  const samePathNoPrefixDiffMethod = backendRoutes.find((route) => {
    const normalizedRoute = removeApiPrefix(
      normalizePathForComparison(route.path),
    );
    return (
      normalizedRoute === endpointNoPrefix &&
      route.method.toUpperCase() !== service.method.toUpperCase()
    );
  });

  if (samePathNoPrefixDiffMethod) {
    return samePathNoPrefixDiffMethod;
  }

  // Then, check for similar paths (same number of segments, similar structure)
  // Collect ALL candidates and pick the best match (prefer literal matches over param matches)
  const endpointSegments = normalizedEndpoint.split("/");
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
    const routeSegments = normalizedRoute.split("/");
    const score = scoreSegments(endpointSegments, routeSegments);
    if (score >= 0.7 && (!bestCandidate || score > bestCandidate.score)) {
      bestCandidate = { route, score };
    }
  }

  // Try again with API prefix stripped
  const endpointSegmentsNoPrefix = endpointNoPrefix.split("/");
  for (const route of backendRoutes) {
    const normalizedRoute = removeApiPrefix(
      normalizePathForComparison(route.path),
    );
    const routeSegments = normalizedRoute.split("/");
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
function isSameLanguageProject(
  frontendFile: string,
  backendFile: string,
): boolean {
  const tsJsExtensions = [".ts", ".tsx", ".js", ".jsx", ".mjs"];
  const pyExtensions = [".py"];

  const feIsTs = tsJsExtensions.some((ext) => frontendFile.endsWith(ext));
  const beIsTs = tsJsExtensions.some((ext) => backendFile.endsWith(ext));
  const beIsPy = pyExtensions.some((ext) => backendFile.endsWith(ext));

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

function pathsMatchStrict(path1: string, path2: string): boolean {
  const normalized1 = normalizePathForComparison(path1);
  const normalized2 = normalizePathForComparison(path2);

  if (normalized1 === normalized2) return true;

  const segments1 = normalized1.split("/");
  const segments2 = normalized2.split("/");
  if (segments1.length !== segments2.length) return false;

  for (let i = 0; i < segments1.length; i++) {
    const seg1 = segments1[i];
    const seg2 = segments2[i];

    const seg1IsParam = isPathParam(seg1);
    const seg2IsParam = isPathParam(seg2);

    // Param-vs-literal usually indicates different endpoints
    // (e.g., /shopping/{id} vs /shopping/bulk-add).
    if (seg1IsParam !== seg2IsParam) return false;

    if (seg1IsParam && seg2IsParam) continue;
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
    const snakeCase = varName.replace(
      /[A-Z]/g,
      (letter: string) => `_${letter.toLowerCase()}`,
    );
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
  const levenshteinScore = 1 - dist / maxLen;

  return Math.max(prefixScore, levenshteinScore);
}

/**
 * Simple Levenshtein distance implementation for short path segments
 */
function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0),
  );

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
      const snakeCase = param.replace(
        /[A-Z]/g,
        (letter: string) => `_${letter.toLowerCase()}`,
      );
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

function areTypesCompatible(
  tsType: string,
  pyType: string,
): {
  compatible: boolean;
  severity?: string;
  reason?: string;
  suggestion?: string;
} {
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
  if (type.includes("\n") || type.includes("{") || type.includes("}")) {
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
  const crudSuffixes = ["create", "update", "delete", "patch"];
  const suffix1 = crudSuffixes.find((s) => type1.endsWith(s));
  const suffix2 = crudSuffixes.find((s) => type2.endsWith(s));
  if (suffix1 && suffix2 && suffix1 !== suffix2) {
    return false;
  }

  // Remove common non-CRUD suffixes
  const clean1 = type1.replace(
    /(response|request|model|entity|dto|schema)$/i,
    "",
  );
  const clean2 = type2.replace(
    /(response|request|model|entity|dto|schema)$/i,
    "",
  );

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
  if (!frontendType.endsWith("[]")) return false;

  const elementType = frontendType.replace(/\[\]$/, "");
  const backendModel = apiContract.backendModels.find(
    (m) => m.name === backendModelName,
  );
  if (!backendModel) return false;

  // Check if the backend model has a field whose type is a list of the element type
  for (const field of backendModel.fields) {
    const fieldType = field.type.toLowerCase();
    const elementLower = elementType.toLowerCase();
    // Match patterns like List[PaymentMilestoneCreate], list[PaymentMilestoneCreate], Sequence[...]
    if (
      fieldType.includes(`list[${elementLower}]`) ||
      fieldType.includes(`sequence[${elementLower}]`) ||
      fieldType === `${elementLower}[]`
    ) {
      return true;
    }
  }

  return false;
}

function checkProblematicTypePairs(
  tsType: string,
  pyType: string,
): {
  compatible: boolean;
  severity: string;
  reason: string;
  suggestion: string;
} | null {
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
  if (
    normalizedTs === "string" &&
    ["int", "float", "integer", "decimal"].includes(normalizedPy)
  ) {
    return {
      compatible: false,
      severity: "high",
      reason: `Type mismatch: frontend uses string, backend expects ${pyType}`,
      suggestion: `Change frontend type to 'number' or backend to accept string`,
    };
  }

  // Number vs String mismatch
  if (
    normalizedTs === "number" &&
    ["str", "text", "email"].includes(normalizedPy)
  ) {
    return {
      compatible: false,
      severity: "high",
      reason: `Type mismatch: frontend uses number, backend expects ${pyType}`,
      suggestion: `Change frontend type to 'string' or backend to accept number`,
    };
  }

  // Array/List handling
  if (
    tsType.includes("[]") &&
    !(
      pyType.includes("List") ||
      pyType.includes("list") ||
      pyType.includes("Sequence")
    )
  ) {
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

function getTypeCompatibilitySuggestion(
  tsType: string,
  pyType: string,
): string {
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
    suggestions[tsType]?.[pyType] ||
    `Ensure types are compatible: ${tsType} vs ${pyType}`
  );
}
