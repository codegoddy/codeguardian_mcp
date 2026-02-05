/**
 * API Contract Guardian - Context Integration
 *
 * Integrates API Contract extraction into the existing ProjectContext system.
 * This module extracts frontend services/backend routes and adds them to the context.
 *
 * @format
 */

import * as fs from "fs/promises";
import * as path from "path";
import { glob } from "glob";
import { logger } from "../utils/logger.js";
import {
  extractServicesFromFileAST,
  extractTypesFromFileAST,
  extractRoutesFromFile,
  extractModelsFromFile,
} from "./apiContractExtraction.js";
import type {
  ProjectContext,
  ApiContractContext,
  ApiServiceDefinition,
  ApiTypeDefinition,
  ApiRouteDefinition,
  ApiModelDefinition,
  ApiEndpointMapping,
  ApiTypeMapping,
  ApiParameter,
} from "./projectContext.js";

// ============================================================================
// Main Extraction Function
// ============================================================================

/**
 * Extract API Contract information and add it to the project context
 * This is called during context building when API contract validation is enabled
 */
export async function extractApiContractContext(
  context: ProjectContext,
): Promise<ApiContractContext | undefined> {
  const startTime = Date.now();
  logger.info("Extracting API Contract context...");

  try {
    // Step 1: Detect project structure (frontend/backend)
    const projectStructure = await detectProjectStructure(context.projectPath);

    if (!projectStructure.frontend && !projectStructure.backend) {
      logger.info("No frontend or backend detected - skipping API Contract extraction");
      return undefined;
    }

    // Step 2: Extract frontend services and types
    let frontendServices: ApiServiceDefinition[] = [];
    let frontendTypes: ApiTypeDefinition[] = [];

    if (projectStructure.frontend) {
      const frontendPath = projectStructure.frontend.path;
      [frontendServices, frontendTypes] = await Promise.all([
        extractFrontendServices(context, frontendPath),
        extractFrontendTypes(context, frontendPath),
      ]);
    }

    // Step 3: Extract backend routes and models
    let backendRoutes: ApiRouteDefinition[] = [];
    let backendModels: ApiModelDefinition[] = [];

    if (projectStructure.backend) {
      const backendPath = projectStructure.backend.path;
      
      // Extract router prefixes from main.py/app.py
      const routerPrefixes = await extractRouterPrefixes(backendPath);
      
      [backendRoutes, backendModels] = await Promise.all([
        extractBackendRoutes(context, backendPath, projectStructure.backend.framework, routerPrefixes),
        extractBackendModels(context, backendPath),
      ]);
    }

    // Step 4: Build mappings
    const { endpointMappings, typeMappings, unmatchedFrontend, unmatchedBackend } =
      buildContractMappings(frontendServices, frontendTypes, backendRoutes, backendModels);

    const apiContractContext: ApiContractContext = {
      projectStructure,
      frontendServices,
      frontendTypes,
      backendRoutes,
      backendModels,
      endpointMappings,
      typeMappings,
      unmatchedFrontend,
      unmatchedBackend,
      lastUpdated: new Date().toISOString(),
    };

    const duration = Date.now() - startTime;
    logger.info(
      `API Contract context extracted in ${duration}ms: ` +
        `${frontendServices.length} services, ${frontendTypes.length} types, ` +
        `${backendRoutes.length} routes, ${backendModels.length} models, ` +
        `${endpointMappings.size} matched endpoints`,
    );

    return apiContractContext;
  } catch (error) {
    logger.error("Failed to extract API Contract context:", error);
    return undefined;
  }
}

// ============================================================================
// Project Structure Detection
// ============================================================================

async function detectProjectStructure(projectPath: string): Promise<ApiContractContext["projectStructure"]> {
  const result: ApiContractContext["projectStructure"] = {
    relationship: "frontend-only",
  };

  // Resolve to absolute path for consistent comparison
  const absoluteProjectPath = path.resolve(projectPath);

  // Check for common folder structures
  const commonFrontendPaths = ["frontend", "client", "web", "app", "src"];
  const commonBackendPaths = ["backend", "server", "api", "services"];

  let frontendPath: string | null = null;
  let backendPath: string | null = null;

  // Try to find frontend in common locations
  for (const dir of commonFrontendPaths) {
    const fullPath = path.join(absoluteProjectPath, dir);
    if (await isDirectory(fullPath)) {
      const detection = await detectFrontend(fullPath);
      if (detection.confidence > 0.5) {
        frontendPath = fullPath;
        break;
      }
    }
  }

  // Try to find backend in common locations
  for (const dir of commonBackendPaths) {
    const fullPath = path.join(absoluteProjectPath, dir);
    if (await isDirectory(fullPath)) {
      const detection = await detectBackend(fullPath);
      if (detection.confidence > 0.5) {
        backendPath = fullPath;
        break;
      }
    }
  }

  // If not found in common locations, check root
  if (!frontendPath) {
    const rootDetection = await detectFrontend(absoluteProjectPath);
    if (rootDetection.confidence > 0.5) {
      frontendPath = absoluteProjectPath;
    }
  }

  if (!backendPath) {
    const rootDetection = await detectBackend(absoluteProjectPath);
    if (rootDetection.confidence > 0.5) {
      backendPath = projectPath;
    }
  }

  // Build result
  if (frontendPath) {
    const detection = await detectFrontend(frontendPath);
    result.frontend = {
      path: frontendPath,
      framework: detection.framework || "react",
      apiPattern: detection.apiPattern || "rest",
      httpClient: detection.httpClient || "fetch",
      apiBaseUrl: detection.apiBaseUrl,
    };
  }

  if (backendPath) {
    const detection = await detectBackend(backendPath);
    result.backend = {
      path: backendPath,
      framework: detection.framework || "fastapi",
      apiPattern: detection.apiPattern || "rest",
      apiPrefix: "/api",
    };
  }

  // Determine relationship
  if (result.frontend && result.backend) {
    result.relationship =
      frontendPath === projectPath || backendPath === projectPath ? "monorepo" : "separate";
  } else if (result.backend) {
    result.relationship = "backend-only";
  } else if (result.frontend) {
    result.relationship = "frontend-only";
  }

  return result;
}

interface DetectionResult {
  confidence: number;
  framework?: string;
  apiPattern?: string;
  httpClient?: string;
  apiBaseUrl?: string;
}

async function detectFrontend(projectPath: string): Promise<DetectionResult> {
  let confidence = 0;
  let framework = "react";
  let apiPattern = "rest";
  let httpClient = "fetch";
  let apiBaseUrl: string | undefined;

  // Check for package.json
  const packageJsonPath = path.join(projectPath, "package.json");
  const hasPackageJson = await fileExists(packageJsonPath);

  if (!hasPackageJson) {
    return { confidence: 0 };
  }

  confidence += 0.3;

  try {
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, "utf-8"));
    const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

    // Detect framework
    if (deps["next"]) {
      framework = "nextjs";
      confidence += 0.4;
    } else if (deps["react"]) {
      framework = "react";
      confidence += 0.3;
    } else if (deps["vue"]) {
      framework = "vue";
      confidence += 0.3;
    }

    // Detect HTTP client
    if (deps["axios"]) {
      httpClient = "axios";
    } else if (deps["@tanstack/react-query"] || deps["react-query"]) {
      httpClient = "react-query";
    }

    // Check for services folder
    const servicesPaths = [
      path.join(projectPath, "src/services"),
      path.join(projectPath, "services"),
      path.join(projectPath, "app/services"),
    ];

    for (const servicesPath of servicesPaths) {
      if (await isDirectory(servicesPath)) {
        confidence += 0.2;
        break;
      }
    }
  } catch {
    // Ignore errors
  }

  return { confidence: Math.min(confidence, 1), framework, apiPattern, httpClient, apiBaseUrl };
}

async function detectBackend(projectPath: string): Promise<DetectionResult> {
  let confidence = 0;
  let framework = "fastapi";
  let apiPattern = "rest";

  // Check for Python backend
  const requirementsPath = path.join(projectPath, "requirements.txt");
  const pyprojectPath = path.join(projectPath, "pyproject.toml");
  const hasPython = (await fileExists(requirementsPath)) || (await fileExists(pyprojectPath));

  if (hasPython) {
    confidence += 0.3;

    try {
      let deps = "";
      if (await fileExists(requirementsPath)) {
        deps = await fs.readFile(requirementsPath, "utf-8");
      } else if (await fileExists(pyprojectPath)) {
        deps = await fs.readFile(pyprojectPath, "utf-8");
      }

      if (deps.includes("fastapi")) {
        framework = "fastapi";
        confidence += 0.4;
      } else if (deps.includes("flask")) {
        framework = "flask";
        confidence += 0.4;
      } else if (deps.includes("django")) {
        framework = "django";
        confidence += 0.4;
      }
    } catch {
      // Ignore errors
    }
  }

  // Check for Node.js backend
  const packageJsonPath = path.join(projectPath, "package.json");
  const hasNode = await fileExists(packageJsonPath);

  if (hasNode) {
    confidence += 0.3;

    try {
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, "utf-8"));
      const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

      if (deps["express"]) {
        framework = "express";
        confidence += 0.4;
      } else if (deps["@nestjs/core"]) {
        framework = "nestjs";
        confidence += 0.4;
      }
    } catch {
      // Ignore errors
    }
  }

  // Check for routes folder
  const routesPaths = [
    path.join(projectPath, "app/routes"),
    path.join(projectPath, "routes"),
    path.join(projectPath, "src/routes"),
    path.join(projectPath, "api"),
  ];

  for (const routesPath of routesPaths) {
    if (await isDirectory(routesPath)) {
      confidence += 0.2;
      break;
    }
  }

  return { confidence: Math.min(confidence, 1), framework, apiPattern };
}

// ============================================================================
// Frontend Extraction (TypeScript Services & Types)
// ============================================================================

async function extractFrontendServices(
  context: ProjectContext,
  frontendPath: string,
): Promise<ApiServiceDefinition[]> {
  const services: ApiServiceDefinition[] = [];

  // Find service files using the context's file index
  const serviceFiles = Array.from(context.files.values()).filter(
    (f) =>
      f.path.startsWith(frontendPath) &&
      (f.path.includes("/services/") ||
        f.path.includes("/api/") ||
        f.path.includes("/clients/")),
  );

  console.log(`[API Contract] Found ${serviceFiles.length} service files in ${frontendPath}`);

  for (const fileInfo of serviceFiles) {
    try {
      console.log(`[API Contract] Extracting from: ${fileInfo.path}`);
      // Use AST-based extraction
      const fileServices = await extractServicesFromFileAST(fileInfo.path);
      console.log(`[API Contract] Extracted ${fileServices.length} services from ${fileInfo.path}`);
      services.push(...fileServices);
    } catch (err) {
      console.log(`[API Contract] Failed to extract services from ${fileInfo.path}: ${err}`);
    }
  }

  return services;
}

async function extractFrontendTypes(
  context: ProjectContext,
  frontendPath: string,
): Promise<ApiTypeDefinition[]> {
  const types: ApiTypeDefinition[] = [];

  // Find type definition files using the context's file index
  // Also extract types from service files since many projects define types there
  const typeFiles = Array.from(context.files.values()).filter(
    (f) =>
      f.path.startsWith(frontendPath) &&
      (f.path.includes("/types/") ||
        f.path.includes("/interfaces/") ||
        f.path.includes("/models/") ||
        f.path.includes("/services/") ||
        f.path.includes("/api/") ||
        f.path.includes("/clients/")),
  );

  console.log(`[API Contract] Found ${typeFiles.length} type files in ${frontendPath}`);

  for (const fileInfo of typeFiles) {
    try {
      console.log(`[API Contract] Extracting types from: ${fileInfo.path}`);
      // Use AST-based extraction
      const fileTypes = await extractTypesFromFileAST(fileInfo.path);
      console.log(`[API Contract] Extracted ${fileTypes.length} types from ${fileInfo.path}`);
      types.push(...fileTypes);
    } catch (err) {
      console.log(`[API Contract] Failed to extract types from ${fileInfo.path}: ${err}`);
    }
  }

  return types;
}

// ============================================================================
// Backend Extraction (Python Routes & Models)
// ============================================================================

async function extractBackendRoutes(
  context: ProjectContext,
  backendPath: string,
  framework: string,
  routerPrefixes: Map<string, string>,
): Promise<ApiRouteDefinition[]> {
  const routes: ApiRouteDefinition[] = [];

  // Find route files using the context's file index
  const routeFiles = Array.from(context.files.values()).filter((f) => f.path.startsWith(backendPath),
  );

  for (const fileInfo of routeFiles) {
    if (!fileInfo.path.endsWith(".py")) continue;

    try {
      const content = await fs.readFile(fileInfo.path, "utf-8");
      const fileRoutes = extractRoutesFromPythonContent(content, fileInfo.path, framework, routerPrefixes);
      routes.push(...fileRoutes);
    } catch (err) {
      logger.debug(`Failed to extract routes from ${fileInfo.path}`);
    }
  }

  return routes;
}

function extractRoutesFromPythonContent(
  content: string,
  filePath: string,
  framework: string,
  routerPrefixes: Map<string, string>,
): ApiRouteDefinition[] {
  const routes: ApiRouteDefinition[] = [];
  const lines = content.split("\n");

  // Extract module name from file path (e.g., "clients" from ".../api/clients.py")
  const moduleMatch = filePath.match(/\/(\w+)\.py$/);
  const moduleName = moduleMatch ? moduleMatch[1] : "";
  const mainPrefix = routerPrefixes.get(moduleName) || "";
  
  // Extract router's internal prefix (e.g., router = APIRouter(prefix="/time-entries"))
  let routerPrefix = "";
  for (const line of lines) {
    const routerPrefixMatch = line.match(/APIRouter\s*\(\s*.*prefix\s*=\s*["']([^"']+)["']/);
    if (routerPrefixMatch) {
      routerPrefix = routerPrefixMatch[1];
      break;
    }
  }
  
  // Combine prefixes: main.py prefix + router internal prefix
  const prefix = mainPrefix + routerPrefix;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    if (framework === "fastapi") {
      // FastAPI: @app.post("/api/clients") or @router.delete("")
      const fastapiMatch = line.match(/@(?:app|router)\.(get|post|put|patch|delete)\s*\(\s*["']([^"']*)["']/i);
      if (fastapiMatch) {
        const routePath = prefix + fastapiMatch[2];
        const route = extractFastAPIRouteDetails(lines, i, fastapiMatch[1], routePath, filePath, lineNum);
        if (route) routes.push(route);
      }
    } else if (framework === "flask") {
      // Flask: @app.route("/api/clients", methods=["POST"])
      const flaskMatch = line.match(/@app\.route\s*\(\s*["']([^"']+)["']/i);
      if (flaskMatch) {
        const routePath = prefix + flaskMatch[1];
        const route = extractFlaskRouteDetails(lines, i, routePath, filePath, lineNum);
        if (route) routes.push(route);
      }
    }
  }

  return routes;
}

function extractFastAPIRouteDetails(
  lines: string[],
  decoratorLine: number,
  method: string,
  path: string,
  filePath: string,
  lineNum: number,
): ApiRouteDefinition | null {
  const searchRange = Math.min(decoratorLine + 10, lines.length);
  let funcName = "";
  let requestModel: string | undefined;
  let responseModel: string | undefined;
  let queryParams: ApiParameter[] | undefined;

  for (let i = decoratorLine + 1; i < searchRange; i++) {
    const line = lines[i];

    const funcMatch = line.match(/(?:async\s+)?def\s+(\w+)\s*\(/);
    if (funcMatch) {
      funcName = funcMatch[1];

      // Collect the full function signature (may span multiple lines)
      let signature = line;
      let j = i;
      while (!signature.includes(")") && j < searchRange - 1) {
        j++;
        signature += " " + lines[j].trim();
      }

      // Extract request model from parameter type hint (non-primitive types are request bodies)
      const paramMatches = signature.matchAll(/(\w+)\s*:\s*(\w+)(?:\s*=\s*([^,\)]+))?/g);
      for (const match of paramMatches) {
        const paramName = match[1];
        const paramType = match[2];
        const defaultValue = match[3];

        // Skip common non-body parameters
        if (["db", "session", "request", "response", "user", "current_user"].includes(paramName)) {
          continue;
        }

        // Check if it's a query parameter (primitive type with default value)
        const primitiveTypes = ["str", "int", "float", "bool", "uuid", "datetime", "date"];
        if (primitiveTypes.includes(paramType.toLowerCase())) {
          if (!queryParams) queryParams = [];
          queryParams.push({
            name: paramName,
            type: paramType,
            required: !defaultValue, // Has default value = optional
          });
        } else if (!requestModel && !["str", "int", "float", "bool"].includes(paramType)) {
          // Non-primitive type without default is likely the request body model
          requestModel = paramType;
        }
      }

      // Extract response model from return type
      const returnMatch = signature.match(/-\s*>\s*(\w+)/);
      if (returnMatch && !["str", "int", "float", "bool", "dict", "list", "none"].includes(returnMatch[1].toLowerCase())) {
        responseModel = returnMatch[1];
      }

      break;
    }
  }

  if (!funcName) return null;

  return {
    method: method.toUpperCase() as ApiRouteDefinition["method"],
    path,
    handler: funcName,
    requestModel,
    responseModel,
    queryParams,
    file: filePath,
    line: lineNum,
  };
}

function extractFlaskRouteDetails(
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

/**
 * Extract router prefixes from main.py or app.py
 * This maps router module names to their URL prefixes
 */
async function extractRouterPrefixes(backendPath: string): Promise<Map<string, string>> {
  const prefixes = new Map<string, string>();

  // Try to find main.py or app.py
  const mainFiles = [
    path.join(backendPath, "app/main.py"),
    path.join(backendPath, "main.py"),
    path.join(backendPath, "app.py"),
  ];

  let mainFile: string | null = null;
  for (const file of mainFiles) {
    try {
      await fs.access(file);
      mainFile = file;
      break;
    } catch {
      // File doesn't exist, try next
    }
  }

  if (!mainFile) {
    logger.debug("No main.py/app.py found for router prefix extraction");
    return prefixes;
  }

  try {
    const content = await fs.readFile(mainFile, "utf-8");
    const lines = content.split("\n");

    for (const line of lines) {
      // Match: app.include_router(clients.router, prefix="/api", tags=["clients"])
      // Match: app.include_router(contracts.router, prefix="/api/contracts", tags=["contracts"])
      const match = line.match(
        /app\.include_router\(\s*(\w+)\.router\s*,\s*prefix\s*=\s*["']([^"']+)["']/,
      );

      if (match) {
        const moduleName = match[1];
        const prefix = match[2];
        prefixes.set(moduleName, prefix);
        logger.debug(`Found router prefix: ${moduleName} -> ${prefix}`);
      }
    }
  } catch (err) {
    logger.debug(`Failed to extract router prefixes from ${mainFile}: ${err}`);
  }

  return prefixes;
}

async function extractBackendModels(context: ProjectContext, backendPath: string): Promise<ApiModelDefinition[]> {
  const models: ApiModelDefinition[] = [];

  // Find model files using the context's file index
  const modelFiles = Array.from(context.files.values()).filter(
    (f) => f.path.startsWith(backendPath) && f.path.endsWith(".py"),
  );

  for (const fileInfo of modelFiles) {
    try {
      const content = await fs.readFile(fileInfo.path, "utf-8");
      const fileModels = extractModelsFromPythonContent(content, fileInfo.path);
      models.push(...fileModels);
    } catch (err) {
      logger.debug(`Failed to extract models from ${fileInfo.path}`);
    }
  }

  return models;
}

function extractModelsFromPythonContent(content: string, filePath: string): ApiModelDefinition[] {
  const models: ApiModelDefinition[] = [];
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
          if (fieldDefault === "None" || fieldDefault.startsWith('"') || fieldDefault.startsWith("'")) {
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

  return models;
}

// ============================================================================
// Contract Mapping
// ============================================================================

function buildContractMappings(
  frontendServices: ApiServiceDefinition[],
  frontendTypes: ApiTypeDefinition[],
  backendRoutes: ApiRouteDefinition[],
  backendModels: ApiModelDefinition[],
): {
  endpointMappings: Map<string, ApiEndpointMapping>;
  typeMappings: Map<string, ApiTypeMapping>;
  unmatchedFrontend: ApiServiceDefinition[];
  unmatchedBackend: ApiRouteDefinition[];
} {
  const endpointMappings = new Map<string, ApiEndpointMapping>();
  const typeMappings = new Map<string, ApiTypeMapping>();
  const unmatchedFrontend: ApiServiceDefinition[] = [];
  const unmatchedBackend: ApiRouteDefinition[] = [];

  // Match frontend services to backend routes
  for (const service of frontendServices) {
    const matchResult = findMatchingRoute(service, backendRoutes);
    if (matchResult) {
      const score = calculateEndpointMatchScore(service, matchResult.route);
      // If it's a method mismatch, reduce the score significantly
      const finalScore = matchResult.isMethodMismatch ? 50 : score;
      
      // Check if there are multiple backend routes with the same path (different methods)
      const samePathRoutes = backendRoutes.filter(r => {
        const normalizedRoute = normalizePath(r.path);
        const normalizedService = normalizePath(service.endpoint);
        return normalizedRoute === normalizedService;
      });
      
      endpointMappings.set(service.endpoint, {
        frontend: service,
        backend: matchResult.route,
        score: finalScore,
        hasMultipleMethods: samePathRoutes.length > 1,
        availableMethods: samePathRoutes.map(r => r.method),
      });
    } else {
      unmatchedFrontend.push(service);
    }
  }

  // Find unmatched backend routes
  for (const route of backendRoutes) {
    const isMatched = Array.from(endpointMappings.values()).some((m) => m.backend === route);
    if (!isMatched) {
      unmatchedBackend.push(route);
    }
  }

  // Match frontend types to backend models
  for (const type of frontendTypes) {
    const matchingModel = findMatchingModel(type, backendModels);
    if (matchingModel) {
      const compatibility = calculateTypeCompatibility(type, matchingModel);
      typeMappings.set(type.name, {
        frontend: type,
        backend: matchingModel,
        compatibility,
      });
    }
  }

  return { endpointMappings, typeMappings, unmatchedFrontend, unmatchedBackend };
}

function findMatchingRoute(
  service: ApiServiceDefinition,
  routes: ApiRouteDefinition[],
): { route: ApiRouteDefinition; isMethodMismatch: boolean } | undefined {
  const normalizedEndpoint = normalizePath(service.endpoint);

  // First try exact match (path + method)
  const exactMatch = routes.find((route) => {
    const normalizedRoute = normalizePath(route.path);
    return (
      normalizedRoute === normalizedEndpoint &&
      route.method.toUpperCase() === service.method.toUpperCase()
    );
  });

  if (exactMatch) return { route: exactMatch, isMethodMismatch: false };

  // Check if there's a route with same path but DIFFERENT method
  // This is a method mismatch we need to flag
  const samePathDifferentMethod = routes.find((route) => {
    const normalizedRoute = normalizePath(route.path);
    return (
      normalizedRoute === normalizedEndpoint &&
      route.method.toUpperCase() !== service.method.toUpperCase()
    );
  });

  if (samePathDifferentMethod) {
    return { route: samePathDifferentMethod, isMethodMismatch: true };
  }

  // Try fuzzy match (handle API prefix differences)
  const fuzzyMatch = routes.find((route) => {
    const normalizedRoute = normalizePath(route.path);
    const routeWithoutPrefix = removeApiPrefix(normalizedRoute);
    const serviceWithoutPrefix = removeApiPrefix(normalizedEndpoint);

    return (
      routeWithoutPrefix === serviceWithoutPrefix &&
      route.method.toUpperCase() === service.method.toUpperCase()
    );
  });

  if (fuzzyMatch) return { route: fuzzyMatch, isMethodMismatch: false };

  // Try matching with path parameters
  const paramMatch = routes.find((route) => {
    if (route.method.toUpperCase() !== service.method.toUpperCase()) return false;
    
    const normalizedRoute = normalizePath(route.path);
    const normalizedServiceEndpoint = normalizePath(service.endpoint);
    
    // Replace backend params {id} and frontend params ${id} with generic {param} for comparison
    const routeWithGenericParams = normalizedRoute.replace(/\{[^}]+\}/g, "{param}");
    // Handle both Python {param} and JavaScript ${param} formats
    const endpointWithGenericParams = normalizedServiceEndpoint
      .replace(/\{[^}]+\}/g, "{param}")
      .replace(/\$\{\w+\}/g, "{param}");
    
    return endpointWithGenericParams === routeWithGenericParams;
  });

  if (paramMatch) return { route: paramMatch, isMethodMismatch: false };

  return undefined;
}

function calculateEndpointMatchScore(service: ApiServiceDefinition, route: ApiRouteDefinition): number {
  let score = 100;

  if (service.method.toUpperCase() !== route.method.toUpperCase()) {
    score -= 50;
  }

  const normalizedService = normalizePath(service.endpoint);
  const normalizedRoute = normalizePath(route.path);

  if (normalizedService === normalizedRoute) {
    score += 10;
  } else if (removeApiPrefix(normalizedService) === removeApiPrefix(normalizedRoute)) {
    score += 5;
  }

  if (service.requestType && service.requestType === route.requestModel) {
    score += 10;
  }
  if (service.responseType && service.responseType === route.responseModel) {
    score += 10;
  }

  return Math.max(0, Math.min(100, score));
}

function findMatchingModel(type: ApiTypeDefinition, models: ApiModelDefinition[]): ApiModelDefinition | undefined {
  // Try exact name match first
  const exactMatch = models.find((m) => m.name === type.name);
  if (exactMatch) return exactMatch;

  // Try normalized name match
  const normalizedTypeName = normalizeName(type.name);
  const normalizedMatch = models.find((m) => normalizeName(m.name) === normalizedTypeName);

  if (normalizedMatch) return normalizedMatch;

  // Try fuzzy match based on field similarity
  let bestMatch: ApiModelDefinition | undefined;
  let bestScore = 0;

  for (const model of models) {
    const score = calculateFieldSimilarity(type, model);
    if (score > bestScore && score > 0.7) {
      bestScore = score;
      bestMatch = model;
    }
  }

  return bestMatch;
}

function calculateTypeCompatibility(
  type: ApiTypeDefinition,
  model: ApiModelDefinition,
): { score: number; issues: string[] } {
  const issues: string[] = [];
  let score = 100;

  // Check for missing required fields in frontend
  for (const modelField of model.fields) {
    if (modelField.required) {
      const frontendField = type.fields.find((f) => normalizeName(f.name) === normalizeName(modelField.name));

      if (!frontendField) {
        score -= 15;
        issues.push(`Missing required field: ${modelField.name}`);
      }
    }
  }

  // Check for naming convention mismatches
  for (const frontendField of type.fields) {
    const backendField = model.fields.find((f) => normalizeName(f.name) === normalizeName(frontendField.name));

    if (backendField && frontendField.name !== backendField.name) {
      score -= 5;
      issues.push(`Naming convention mismatch: ${frontendField.name} vs ${backendField.name}`);
    }
  }

  return { score: Math.max(0, score), issues };
}

function calculateFieldSimilarity(type: ApiTypeDefinition, model: ApiModelDefinition): number {
  if (type.fields.length === 0 || model.fields.length === 0) return 0;

  const typeFieldNames = new Set(type.fields.map((f) => normalizeName(f.name)));
  const modelFieldNames = new Set(model.fields.map((f) => normalizeName(f.name)));

  const intersection = new Set([...typeFieldNames].filter((x) => modelFieldNames.has(x)));
  const union = new Set([...typeFieldNames, ...modelFieldNames]);

  return intersection.size / union.size;
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

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const stats = await fs.stat(filePath);
    return stats.isFile();
  } catch {
    return false;
  }
}

async function isDirectory(dirPath: string): Promise<boolean> {
  try {
    const stats = await fs.stat(dirPath);
    return stats.isDirectory();
  } catch {
    return false;
  }
}
