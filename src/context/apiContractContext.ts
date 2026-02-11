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
        extractBackendModels(context, backendPath, projectStructure.backend.framework),
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
  // Include /features/, /hooks/, /lib/ since many React projects make API calls there
  const serviceFiles = Array.from(context.files.values()).filter(
    (f) =>
      f.path.startsWith(frontendPath) &&
      (f.path.endsWith(".ts") || f.path.endsWith(".tsx")) &&
      (f.path.includes("/services/") ||
        f.path.includes("/api/") ||
        f.path.includes("/clients/") ||
        f.path.includes("/features/") ||
        f.path.includes("/hooks/") ||
        f.path.includes("/lib/")),
  );

  logger.debug(`[API Contract] Found ${serviceFiles.length} service files in ${frontendPath}`);

  for (const fileInfo of serviceFiles) {
    try {
      logger.debug(`[API Contract] Extracting from: ${fileInfo.path}`);
      // Use AST-based extraction
      const fileServices = await extractServicesFromFileAST(fileInfo.path);
      logger.debug(`[API Contract] Extracted ${fileServices.length} services from ${fileInfo.path}`);
      services.push(...fileServices);
    } catch (err) {
      logger.warn(`[API Contract] Failed to extract services from ${fileInfo.path}: ${err}`);
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
      (f.path.endsWith(".ts") || f.path.endsWith(".tsx")) &&
      (f.path.includes("/types/") ||
        f.path.includes("/interfaces/") ||
        f.path.includes("/models/") ||
        f.path.includes("/services/") ||
        f.path.includes("/api/") ||
        f.path.includes("/clients/") ||
        f.path.includes("/features/") ||
        f.path.includes("/hooks/") ||
        f.path.includes("/lib/")),
  );

  logger.debug(`[API Contract] Found ${typeFiles.length} type files in ${frontendPath}`);

  for (const fileInfo of typeFiles) {
    try {
      logger.debug(`[API Contract] Extracting types from: ${fileInfo.path}`);
      // Use AST-based extraction
      const fileTypes = await extractTypesFromFileAST(fileInfo.path);
      logger.debug(`[API Contract] Extracted ${fileTypes.length} types from ${fileInfo.path}`);
      types.push(...fileTypes);
    } catch (err) {
      logger.warn(`[API Contract] Failed to extract types from ${fileInfo.path}: ${err}`);
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

  if (framework === "express" || framework === "nestjs") {
    // Express/Node.js backend — process TS/JS files
    for (const fileInfo of routeFiles) {
      if (!fileInfo.path.endsWith(".ts") && !fileInfo.path.endsWith(".js")) continue;
      // Only process route files (in routes/ or controllers/ directories, or files with .routes. or .controller. in name)
      const isRouteFile = fileInfo.path.includes("/routes/") ||
        fileInfo.path.includes("/controllers/") ||
        fileInfo.path.includes(".routes.") ||
        fileInfo.path.includes(".controller.");
      if (!isRouteFile) continue;

      try {
        const content = await fs.readFile(fileInfo.path, "utf-8");
        const fileRoutes = extractRoutesFromExpressContent(content, fileInfo.path, routerPrefixes);
        routes.push(...fileRoutes);
      } catch (err) {
        logger.debug(`Failed to extract routes from ${fileInfo.path}`);
      }
    }
  } else {
    // Python backend — process .py files
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
      // Strip inline comments to avoid regex matching comment text as parameters
      signature = signature.replace(/#.*$/gm, "");

      // Extract path parameter names from the route path (e.g., {project_id} -> "project_id")
      const pathParamNames = new Set<string>();
      const pathParamMatches = path.matchAll(/\{(\w+)(?::\w+)?\}/g);
      for (const pm of pathParamMatches) {
        pathParamNames.add(pm[1]);
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

        // Skip path parameters — they are NOT query parameters
        if (pathParamNames.has(paramName)) {
          continue;
        }

        // Check if it's a query parameter (primitive type)
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

      // If no request model found from params (e.g., function reads request.json() manually),
      // scan the function body for Pydantic model instantiation patterns:
      //   ModelName(**body_json)  or  ModelName.model_validate(body)  or  ModelName.parse_obj(body)
      if (!requestModel && (method.toUpperCase() === "POST" || method.toUpperCase() === "PUT" || method.toUpperCase() === "PATCH")) {
        const bodySearchEnd = Math.min(decoratorLine + 40, lines.length);
        for (let k = i + 1; k < bodySearchEnd; k++) {
          const bodyLine = lines[k];
          // Match: variable = ModelName(**anything)
          const instantiationMatch = bodyLine.match(/=\s*([A-Z]\w+)\s*\(\s*\*\*/);
          if (instantiationMatch) {
            requestModel = instantiationMatch[1];
            break;
          }
          // Match: variable = ModelName.model_validate(anything) or .parse_obj(anything)
          const validateMatch = bodyLine.match(/=\s*([A-Z]\w+)\s*\.(?:model_validate|parse_obj)\s*\(/);
          if (validateMatch) {
            requestModel = validateMatch[1];
            break;
          }
        }
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

// ============================================================================
// Express/TypeScript Backend Route Extraction
// ============================================================================

function extractRoutesFromExpressContent(
  content: string,
  filePath: string,
  routerPrefixes: Map<string, string>,
): ApiRouteDefinition[] {
  const routes: ApiRouteDefinition[] = [];
  const lines = content.split("\n");

  // Determine the mount prefix for this file
  // routerPrefixes maps file basenames (e.g. "scan.routes") -> mount prefix (e.g. "/api/scans")
  const fileBasename = path.basename(filePath).replace(/\.(ts|js|mjs)$/, "");
  const mountPrefix = routerPrefixes.get(fileBasename) || "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Match Express route patterns:
    //   router.get("/", handler)
    //   router.post("/upload", requireAuth, uploadLimiter, upload.array("files", 100), async (req, res) => {
    //   router.delete("/:id/sops/:sopId", async (req, res) => {
    const routeMatch = line.match(
      /router\.(get|post|put|patch|delete)\s*\(\s*["']([^"']*)["']/i,
    );
    if (!routeMatch) continue;

    const method = routeMatch[1].toUpperCase();
    const routePath = mountPrefix + routeMatch[2];

    // Try to find handler name
    let handler = "";

    // Check if the handler is a named function reference on the same line
    // Pattern: router.get("/", requireAuth, getEmployees);
    // The handler is the last non-middleware argument
    const argsAfterPath = line.substring(line.indexOf(routeMatch[2]) + routeMatch[2].length + 1);
    const namedHandlerMatch = argsAfterPath.match(/,\s*(\w+)\s*\)\s*;?\s*$/);
    if (namedHandlerMatch) {
      handler = namedHandlerMatch[1];
    }

    // If no named handler found, check for inline async (req, res) => { pattern
    if (!handler) {
      const inlineMatch = line.match(/async\s*\(\s*\w+\s*,\s*\w+\s*\)/);
      if (inlineMatch) {
        // Use route path as handler name
        handler = `${method.toLowerCase()}_${routePath.replace(/[^a-zA-Z0-9]/g, "_")}`;
      }
    }

    // If handler still not found, search the next few lines
    if (!handler) {
      for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
        const nextLine = lines[j];
        const asyncMatch = nextLine.match(/async\s*\(\s*\w+\s*,\s*\w+\s*\)/);
        if (asyncMatch) {
          handler = `${method.toLowerCase()}_${routePath.replace(/[^a-zA-Z0-9]/g, "_")}`;
          break;
        }
        const namedMatch = nextLine.match(/^\s*(\w+)\s*\)\s*;?\s*$/);
        if (namedMatch) {
          handler = namedMatch[1];
          break;
        }
      }
    }

    if (!handler) {
      handler = `${method.toLowerCase()}_${routePath.replace(/[^a-zA-Z0-9]/g, "_")}`;
    }

    routes.push({
      method: method as ApiRouteDefinition["method"],
      path: routePath,
      handler,
      file: filePath,
      line: lineNum,
    });
  }

  return routes;
}

/**
 * Extract router prefixes from main.py/app.py (Python) or app.ts/server.ts (Express)
 * This maps router module names to their URL prefixes
 */
async function extractRouterPrefixes(backendPath: string): Promise<Map<string, string>> {
  const prefixes = new Map<string, string>();

  // Try to find the main entry file
  const mainFiles = [
    // Express/Node.js
    path.join(backendPath, "src/app.ts"),
    path.join(backendPath, "src/server.ts"),
    path.join(backendPath, "src/index.ts"),
    path.join(backendPath, "app.ts"),
    path.join(backendPath, "server.ts"),
    path.join(backendPath, "index.ts"),
    path.join(backendPath, "src/app.js"),
    path.join(backendPath, "src/server.js"),
    path.join(backendPath, "app.js"),
    path.join(backendPath, "server.js"),
    // Python
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
    logger.debug("No main entry file found for router prefix extraction");
    return prefixes;
  }

  try {
    const content = await fs.readFile(mainFile, "utf-8");
    const lines = content.split("\n");

    if (mainFile.endsWith(".py")) {
      // Python: app.include_router(clients.router, prefix="/api", tags=["clients"])
      for (const line of lines) {
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
    } else {
      // Express: app.use("/api/scans", scanRoutes);
      // Also need to build a map from import variable name -> source file basename
      const importMap = new Map<string, string>();

      for (const line of lines) {
        // Match: import scanRoutes from "./routes/scan.routes";
        // Match: import authRoutes from "./routes/auth.routes";
        // Match: const scanRoutes = require("./routes/scan.routes");
        const importMatch = line.match(
          /import\s+(\w+)\s+from\s+["']([^"']+)["']/,
        );
        if (importMatch) {
          const varName = importMatch[1];
          const importPath = importMatch[2];
          // Extract basename without extension: "./routes/scan.routes" -> "scan.routes"
          const basename = path.basename(importPath).replace(/\.(ts|js|mjs)$/, "");
          importMap.set(varName, basename);
        }
      }

      for (const line of lines) {
        // Match: app.use("/api/scans", scanRoutes);
        // Match: app.use("/api/auth", authLimiter, authRoutes);
        // The route variable is the LAST identifier before the closing paren
        const useMatch = line.match(
          /app\.use\(\s*["']([^"']+)["']\s*,(.+)\)/,
        );
        if (useMatch) {
          const mountPrefix = useMatch[1];
          const argsStr = useMatch[2].trim();
          // The route handler is the last argument: split by comma, take last, trim
          const args = argsStr.split(",").map(a => a.trim());
          const routeVar = args[args.length - 1];

          if (routeVar && /^\w+$/.test(routeVar)) {
            // Map both the variable name AND the source file basename to the prefix
            // so we can match route files by their filename
            const sourceBasename = importMap.get(routeVar);
            if (sourceBasename) {
              prefixes.set(sourceBasename, mountPrefix);
              logger.debug(`Found Express router prefix: ${sourceBasename} -> ${mountPrefix}`);
            }
            // Also store by variable name as fallback
            prefixes.set(routeVar, mountPrefix);
          }
        }
      }
    }
  } catch (err) {
    logger.debug(`Failed to extract router prefixes from ${mainFile}: ${err}`);
  }

  return prefixes;
}

async function extractBackendModels(context: ProjectContext, backendPath: string, framework?: string): Promise<ApiModelDefinition[]> {
  const models: ApiModelDefinition[] = [];

  if (framework === "express" || framework === "nestjs") {
    // For TS backends, extract types/interfaces from type definition files, schema files, etc.
    const modelFiles = Array.from(context.files.values()).filter(
      (f) => f.path.startsWith(backendPath) &&
        (f.path.endsWith(".ts") || f.path.endsWith(".js")) &&
        (f.path.includes("/types/") ||
          f.path.includes("/models/") ||
          f.path.includes("/schemas/") ||
          f.path.includes("/interfaces/") ||
          f.path.includes("/db/") ||
          f.path.includes(".types.") ||
          f.path.includes(".schema.") ||
          f.path.includes(".model.")),
    );

    for (const fileInfo of modelFiles) {
      try {
        // Reuse the frontend type extraction for TS interfaces
        const fileTypes = await extractTypesFromFileAST(fileInfo.path);
        for (const t of fileTypes) {
          models.push({
            name: t.name,
            fields: t.fields.map(f => ({
              name: f.name,
              type: f.type,
              required: f.required,
            })),
            file: t.file,
            line: t.line,
            baseClasses: [],
          });
        }
      } catch (err) {
        logger.debug(`Failed to extract models from ${fileInfo.path}`);
      }
    }
  } else {
    // Python backend — find model files
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
  }

  return models;
}

function extractModelsFromPythonContent(content: string, filePath: string): ApiModelDefinition[] {
  const lines = content.split("\n");

  // Pass 1: Extract all classes with their directly declared fields and base class names
  const rawModels: (Partial<ApiModelDefinition> & { parentName?: string })[] = [];
  let currentModel: (Partial<ApiModelDefinition> & { parentName?: string }) | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Class definition: class ClientCreate(BaseModel): or class ClientCreate(ClientBase):
    const classMatch = line.match(/class\s+(\w+)\s*\(\s*([\w.]+)\s*\)/);
    if (classMatch) {
      if (currentModel) {
        rawModels.push(currentModel);
        currentModel = null;
      }

      const className = classMatch[1];
      const baseClass = classMatch[2];

      // Track all classes that could be Pydantic models
      // We'll resolve inheritance in pass 2 to determine which are real models
      currentModel = {
        name: className,
        fields: [],
        file: filePath,
        line: i + 1,
        baseClasses: [baseClass],
        parentName: baseClass,
      };
      continue;
    }

    // Inside a model class
    if (currentModel) {
      const isIndented = line.startsWith("    ") || line.startsWith("\t");
      const isEmpty = line.trim() === "";
      const isComment = line.trim().startsWith("#");

      if (!isIndented && !isEmpty && !isComment) {
        rawModels.push(currentModel);
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
    rawModels.push(currentModel);
  }

  // Pass 2: Resolve Pydantic inheritance
  // Build a map of class names to their raw models for lookup
  const PYDANTIC_BASES = ["BaseModel", "BaseConfig", "RootModel"];
  const modelMap = new Map<string, typeof rawModels[0]>();
  for (const m of rawModels) {
    if (m.name) modelMap.set(m.name, m);
  }

  // Check if a class is a Pydantic model (directly or transitively)
  function isPydanticModel(className: string, visited = new Set<string>()): boolean {
    if (PYDANTIC_BASES.includes(className)) return true;
    if (visited.has(className)) return false;
    visited.add(className);
    const model = modelMap.get(className);
    if (!model || !model.parentName) return false;
    return isPydanticModel(model.parentName, visited);
  }

  // Collect inherited fields by walking up the chain
  function getInheritedFields(className: string, visited = new Set<string>()): ApiModelDefinition["fields"] {
    if (PYDANTIC_BASES.includes(className) || visited.has(className)) return [];
    visited.add(className);
    const model = modelMap.get(className);
    if (!model) return [];
    // Get parent fields first, then own fields (own fields override parent)
    const parentFields = model.parentName ? getInheritedFields(model.parentName, visited) : [];
    const ownFieldNames = new Set((model.fields || []).map(f => f.name));
    // Include parent fields that aren't overridden
    const inherited = parentFields.filter(f => !ownFieldNames.has(f.name));
    return [...inherited, ...(model.fields || [])];
  }

  // Build final models with inherited fields
  const models: ApiModelDefinition[] = [];
  for (const raw of rawModels) {
    if (!raw.name || !raw.parentName) continue;
    if (!isPydanticModel(raw.parentName)) continue;

    const allFields = getInheritedFields(raw.name);
    models.push({
      name: raw.name,
      fields: allFields,
      file: raw.file || filePath,
      line: raw.line || 0,
      baseClasses: raw.baseClasses,
    } as ApiModelDefinition);
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
      
      const mapKey = `${service.method} ${service.endpoint}`;
      endpointMappings.set(mapKey, {
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

  // Try matching with path parameters (normalize all param formats to {param})
  const paramMatch = routes.find((route) => {
    if (route.method.toUpperCase() !== service.method.toUpperCase()) return false;
    
    const normalizedRoute = normalizePath(route.path);
    const normalizedServiceEndpoint = normalizePath(service.endpoint);
    
    // Replace all param formats with generic {param}:
    // - Python/FastAPI: {id}, {project_id}
    // - Express: :id, :projectId
    // - JavaScript template: ${id}, ${projectId}
    const routeWithGenericParams = normalizedRoute
      .replace(/\{[^}]+\}/g, "{param}")
      .replace(/:([a-zA-Z_]\w*)/g, "{param}");
    const endpointWithGenericParams = normalizedServiceEndpoint
      .replace(/\{[^}]+\}/g, "{param}")
      .replace(/\$\{\w+\}/g, "{param}")
      .replace(/:([a-zA-Z_]\w*)/g, "{param}");
    
    return endpointWithGenericParams === routeWithGenericParams;
  });

  if (paramMatch) return { route: paramMatch, isMethodMismatch: false };

  // Try matching with API prefix stripped AND path parameters normalized
  const prefixParamMatch = routes.find((route) => {
    if (route.method.toUpperCase() !== service.method.toUpperCase()) return false;
    
    const normalizedRoute = removeApiPrefix(normalizePath(route.path));
    const normalizedServiceEndpoint = removeApiPrefix(normalizePath(service.endpoint));
    
    const routeWithGenericParams = normalizedRoute
      .replace(/\{[^}]+\}/g, "{param}")
      .replace(/:([a-zA-Z_]\w*)/g, "{param}");
    const endpointWithGenericParams = normalizedServiceEndpoint
      .replace(/\{[^}]+\}/g, "{param}")
      .replace(/\$\{\w+\}/g, "{param}")
      .replace(/:([a-zA-Z_]\w*)/g, "{param}");
    
    return endpointWithGenericParams === routeWithGenericParams;
  });

  if (prefixParamMatch) return { route: prefixParamMatch, isMethodMismatch: false };

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
  // Try exact name match first, but validate field overlap to avoid
  // matching types that share a name but are semantically different
  // (e.g., FE TimeEntryResponse = action response vs BE TimeEntryResponse = data model)
  const exactMatch = models.find((m) => m.name === type.name);
  if (exactMatch) {
    const fieldOverlap = calculateFieldSimilarity(type, exactMatch);
    if (type.fields.length > 0 && exactMatch.fields.length > 0 && fieldOverlap < 0.10) {
      // Very low overlap despite same name — likely different concepts, skip
    } else {
      return exactMatch;
    }
  }

  // Try normalized name match with same field overlap guard
  const normalizedTypeName = normalizeName(type.name);
  const normalizedMatch = models.find((m) => normalizeName(m.name) === normalizedTypeName);

  if (normalizedMatch) {
    const fieldOverlap = calculateFieldSimilarity(type, normalizedMatch);
    if (type.fields.length > 0 && normalizedMatch.fields.length > 0 && fieldOverlap < 0.10) {
      // Very low overlap despite similar name — skip
    } else {
      return normalizedMatch;
    }
  }

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
