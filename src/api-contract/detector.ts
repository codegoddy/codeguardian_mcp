/**
 * API Contract Guardian - Project Detector
 *
 * Auto-detects project structure (frontend/backend) without configuration.
 *
 * @format
 */

import * as fs from "fs/promises";
import * as path from "path";
import { logger } from "../utils/logger.js";
import type {
  ProjectStructure,
  FrontendProject,
  BackendProject,
  FrontendFramework,
  BackendFramework,
  ApiPattern,
  HttpClient,
  ProjectRelationship,
} from "./types.js";

// ============================================================================
// Detection Heuristics
// ============================================================================

interface DetectionResult {
  confidence: number;
  framework?: FrontendFramework | BackendFramework;
  apiPattern?: ApiPattern;
  httpClient?: HttpClient;
  apiBaseUrl?: string;
}

// ============================================================================
// Main Detection Function
// ============================================================================

/**
 * Detect project structure automatically
 * Scans for frontend and backend projects in the given root path
 */
export async function detectProjectStructure(
  rootPath: string,
): Promise<ProjectStructure> {
  logger.info(`Detecting project structure in ${rootPath}...`);

  const result: ProjectStructure = {
    relationship: "frontend-only",
  };

  // Check for common folder structures
  const commonFrontendPaths = ["frontend", "client", "web", "app", "src"];
  const commonBackendPaths = ["backend", "server", "api", "services"];

  let frontendPath: string | null = null;
  let backendPath: string | null = null;

  // Try to find frontend in common locations
  for (const dir of commonFrontendPaths) {
    const fullPath = path.join(rootPath, dir);
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
    const fullPath = path.join(rootPath, dir);
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
    const rootDetection = await detectFrontend(rootPath);
    if (rootDetection.confidence > 0.5) {
      frontendPath = rootPath;
    }
  }

  if (!backendPath) {
    const rootDetection = await detectBackend(rootPath);
    if (rootDetection.confidence > 0.5) {
      backendPath = rootPath;
    }
  }

  // Build result
  if (frontendPath) {
    const detection = await detectFrontend(frontendPath);
    result.frontend = {
      path: frontendPath,
      framework: detection.framework as FrontendFramework,
      apiPattern: detection.apiPattern || "rest",
      httpClient: detection.httpClient || "fetch",
      apiBaseUrl: detection.apiBaseUrl,
    };
  }

  if (backendPath) {
    const detection = await detectBackend(backendPath);
    result.backend = {
      path: backendPath,
      framework: detection.framework as BackendFramework,
      apiPattern: detection.apiPattern || "rest",
      apiPrefix: "/api",
    };
  }

  // Determine relationship
  if (result.frontend && result.backend) {
    result.relationship =
      frontendPath === rootPath || backendPath === rootPath
        ? "monorepo"
        : "separate";
  } else if (result.backend) {
    result.relationship = "backend-only";
  } else if (result.frontend) {
    result.relationship = "frontend-only";
  }

  logger.info(
    `Project structure detected: ${result.relationship}` +
      (result.frontend ? ` (frontend: ${result.frontend.framework})` : "") +
      (result.backend ? ` (backend: ${result.backend.framework})` : ""),
  );

  return result;
}

// ============================================================================
// Frontend Detection
// ============================================================================

async function detectFrontend(projectPath: string): Promise<DetectionResult> {
  let confidence = 0;
  let framework: FrontendFramework | undefined;
  let apiPattern: ApiPattern = "rest";
  let httpClient: HttpClient = "fetch";
  let apiBaseUrl: string | undefined;

  // Check for package.json (preferred signal)
  const packageJsonPath = path.join(projectPath, "package.json");
  const hasPackageJson = await fileExists(packageJsonPath);

  if (hasPackageJson) {
    confidence += 0.3;
  } else {
    // Vibecoding/scratch projects often don't start with package.json.
    // Use lightweight folder/file heuristics so API contract validation still works.
    const commonDirs = ["src", "app", "components", "pages", "views", "hooks", "services"];
    for (const d of commonDirs) {
      if (await isDirectory(path.join(projectPath, d))) {
        confidence += 0.08;
        break;
      }
    }

    const commonFiles = ["api.ts", "api.tsx", "client.ts", "client.tsx", "services.ts"];
    for (const f of commonFiles) {
      if (await fileExists(path.join(projectPath, f))) {
        confidence += 0.12;
        break;
      }
    }

    // If we see TSX/JSX anywhere in typical locations, assume React-like frontend.
    // Avoid deep scanning: only check a couple of well-known paths.
    const tsxCandidates = [
      path.join(projectPath, "src"),
      path.join(projectPath, "app"),
      path.join(projectPath, "components"),
      path.join(projectPath, "pages"),
    ];
    for (const dir of tsxCandidates) {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        if (entries.some((e) => e.isFile() && (e.name.endsWith(".tsx") || e.name.endsWith(".jsx")))) {
          framework = framework || "react";
          confidence += 0.15;
          break;
        }
      } catch {
        // Ignore
      }
    }
  }

  try {
    const packageJson = hasPackageJson
      ? JSON.parse(await fs.readFile(packageJsonPath, "utf-8"))
      : null;
    const deps = packageJson ? { ...packageJson.dependencies, ...packageJson.devDependencies } : {};

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
    } else if (deps["@angular/core"]) {
      framework = "angular";
      confidence += 0.3;
    } else if (deps["svelte"]) {
      framework = "svelte";
      confidence += 0.3;
    }

    // Detect HTTP client
    if (deps["axios"]) {
      httpClient = "axios";
    } else if (deps["@tanstack/react-query"] || deps["react-query"]) {
      httpClient = "react-query";
      apiPattern = "rest";
    } else if (deps["swr"]) {
      httpClient = "swr";
    }

    // Detect API pattern
    if (deps["@trpc/client"] || deps["@trpc/server"]) {
      apiPattern = "trpc";
    } else if (deps["graphql"] || deps["apollo-client"]) {
      apiPattern = "graphql";
    } else if (deps["socket.io-client"]) {
      apiPattern = "websocket";
    }

    // Check for services folder
    const servicesPaths = [
      path.join(projectPath, "src/services"),
      path.join(projectPath, "services"),
      path.join(projectPath, "app/services"),
      path.join(projectPath, "lib/services"),
    ];

    for (const servicesPath of servicesPaths) {
      if (await isDirectory(servicesPath)) {
        confidence += 0.2;
        break;
      }
    }

    // Check for API config
    const configPaths = [
      path.join(projectPath, "src/config/api.ts"),
      path.join(projectPath, "src/lib/api.ts"),
      path.join(projectPath, "lib/api.ts"),
      path.join(projectPath, "utils/api.ts"),
    ];

    for (const configPath of configPaths) {
      if (await fileExists(configPath)) {
        confidence += 0.1;
        // Try to extract API base URL
        apiBaseUrl = await extractApiBaseUrl(configPath);
        break;
      }
    }
  } catch (err) {
    logger.debug(`Failed to parse package.json in ${projectPath}`);
  }

  // If no package.json, still try to infer basic HTTP client usage from common files
  if (!hasPackageJson) {
    const candidateFiles = [
      path.join(projectPath, "api.ts"),
      path.join(projectPath, "src/api.ts"),
      path.join(projectPath, "src/lib/api.ts"),
    ];
    for (const f of candidateFiles) {
      try {
        if (!(await fileExists(f))) continue;
        const content = await fs.readFile(f, "utf-8");
        if (content.includes("axios")) httpClient = "axios";
        if (content.includes("fetch(")) httpClient = "fetch";
        if (content.includes("/api")) apiBaseUrl = apiBaseUrl || "/api";
        confidence += 0.05;
        break;
      } catch {
        // Ignore
      }
    }
  }

  return {
    confidence: Math.min(confidence, 1),
    framework,
    apiPattern,
    httpClient,
    apiBaseUrl,
  };
}

// ============================================================================
// Backend Detection
// ============================================================================

async function detectBackend(projectPath: string): Promise<DetectionResult> {
  let confidence = 0;
  let framework: BackendFramework | undefined;
  let apiPattern: ApiPattern = "rest";

  // Check for Python backend
  const requirementsPath = path.join(projectPath, "requirements.txt");
  const pyprojectPath = path.join(projectPath, "pyproject.toml");
  const hasPython =
    (await fileExists(requirementsPath)) || (await fileExists(pyprojectPath));

  if (hasPython) {
    confidence += 0.3;

    // Detect Python framework
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

      if (deps.includes("graphene") || deps.includes("strawberry")) {
        apiPattern = "graphql";
      }
    } catch (err) {
      logger.debug(`Failed to read Python deps in ${projectPath}`);
    }
  }

  // Check for Node.js backend
  const packageJsonPath = path.join(projectPath, "package.json");
  const hasNode = await fileExists(packageJsonPath);

  if (hasNode) {
    confidence += 0.3;

    try {
      const packageJson = JSON.parse(
        await fs.readFile(packageJsonPath, "utf-8"),
      );
      const deps = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies,
      };

      if (deps["express"]) {
        framework = "express";
        confidence += 0.4;
      } else if (deps["@nestjs/core"]) {
        framework = "nestjs";
        confidence += 0.4;
      }

      if (deps["apollo-server"] || deps["graphql"]) {
        apiPattern = "graphql";
      } else if (deps["socket.io"]) {
        apiPattern = "websocket";
      }
    } catch (err) {
      logger.debug(`Failed to parse package.json in ${projectPath}`);
    }
  }

  // Vibecoding/scratch backend may not have package.json yet.
  // Infer Express/NestJS from entrypoint file contents.
  if (!hasNode) {
    const entryCandidates = [
      path.join(projectPath, "server.ts"),
      path.join(projectPath, "app.ts"),
      path.join(projectPath, "index.ts"),
      path.join(projectPath, "server.js"),
      path.join(projectPath, "app.js"),
      path.join(projectPath, "index.js"),
      path.join(projectPath, "src/server.ts"),
      path.join(projectPath, "src/app.ts"),
      path.join(projectPath, "src/index.ts"),
    ];

    for (const entry of entryCandidates) {
      try {
        if (!(await fileExists(entry))) continue;
        const content = await fs.readFile(entry, "utf-8");
        if (content.includes("from 'express'") || content.includes("require('express')") || content.includes("express()")) {
          framework = framework || "express";
          confidence += 0.35;
          break;
        }
        if (content.includes("@nestjs/core") || content.includes("NestFactory")) {
          framework = framework || "nestjs";
          confidence += 0.35;
          break;
        }
      } catch {
        // Ignore
      }
    }
  }

  // Check for routes folder
  const routesPaths = [
    path.join(projectPath, "app/routes"),
    path.join(projectPath, "routes"),
    path.join(projectPath, "src/routes"),
    path.join(projectPath, "api"),
    path.join(projectPath, "routers"),
  ];

  for (const routesPath of routesPaths) {
    if (await isDirectory(routesPath)) {
      confidence += 0.2;
      break;
    }
  }

  // Check for main app file
  const mainPaths = [
    path.join(projectPath, "app/main.py"),
    path.join(projectPath, "main.py"),
    path.join(projectPath, "server.py"),
    path.join(projectPath, "app.py"),
    path.join(projectPath, "src/index.ts"),
    path.join(projectPath, "index.ts"),
    path.join(projectPath, "server.ts"),
    path.join(projectPath, "app.ts"),
  ];

  for (const mainPath of mainPaths) {
    if (await fileExists(mainPath)) {
      confidence += 0.1;
      break;
    }
  }

  return {
    confidence: Math.min(confidence, 1),
    framework,
    apiPattern,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

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

async function extractApiBaseUrl(configPath: string): Promise<string | undefined> {
  try {
    const content = await fs.readFile(configPath, "utf-8");

    // Look for common patterns
    const patterns = [
      /baseURL\s*[:=]\s*["']([^"']+)["']/,
      /baseUrl\s*[:=]\s*["']([^"']+)["']/,
      /API_BASE_URL\s*[:=]\s*["']([^"']+)["']/,
      /apiBaseUrl\s*[:=]\s*["']([^"']+)["']/,
      /createAxios\s*\(\s*["']([^"']+)["']/,
    ];

    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match) {
        return match[1];
      }
    }
  } catch {
    // Ignore errors
  }

  return undefined;
}

// ============================================================================
// Manual Configuration
// ============================================================================

/**
 * Create project structure from manual configuration
 * Used when auto-detection fails or is disabled
 */
export function createProjectStructureFromConfig(config: {
  frontend?: { path: string; framework: FrontendFramework };
  backend?: { path: string; framework: BackendFramework };
}): ProjectStructure {
  const result: ProjectStructure = {
    relationship: "frontend-only",
  };

  if (config.frontend) {
    result.frontend = {
      path: config.frontend.path,
      framework: config.frontend.framework,
      apiPattern: "rest",
      httpClient: "fetch",
    };
  }

  if (config.backend) {
    result.backend = {
      path: config.backend.path,
      framework: config.backend.framework,
      apiPattern: "rest",
      apiPrefix: "/api",
    };
  }

  if (result.frontend && result.backend) {
    result.relationship = "separate";
  } else if (result.backend) {
    result.relationship = "backend-only";
  }

  return result;
}
