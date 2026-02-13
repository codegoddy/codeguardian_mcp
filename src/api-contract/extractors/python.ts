/**
 * API Contract Guardian - Python Extractor
 *
 * Extracts API routes and Pydantic models from Python backend code.
 *
 * @format
 */

import * as fs from "fs/promises";
import * as path from "path";
import { glob } from "glob";
import { logger } from "../../utils/logger.js";
import type {
  RouteDefinition,
  ModelDefinition,
  ModelField,
  BackendFramework,
} from "../types.js";
import {
  extractPydanticModelsFromPythonAST,
  extractRoutesFromPythonAST,
} from "./pythonAstUtils.js";

// ============================================================================
// Route Extraction
// ============================================================================

/**
 * Extract all API routes from a Python project
 */
export async function extractRoutes(
  projectPath: string,
  framework: BackendFramework,
): Promise<RouteDefinition[]> {
  const routes: RouteDefinition[] = [];

  // Find route files based on framework
  const routePatterns = getRoutePatterns(projectPath, framework);
  const excludePatterns = [
    "**/venv/**",
    "**/.venv/**",
    "**/env/**",
    "**/__pycache__/**",
    "**/tests/**",
    "**/test_*.py",
    "**/*_test.py",
  ];

  for (const pattern of routePatterns) {
    const files = await glob(pattern, {
      ignore: excludePatterns,
      nodir: true,
      absolute: true,
    });

    for (const file of files) {
      try {
        const content = await fs.readFile(file, "utf-8");
        const fileRoutes = extractRoutesFromFile(content, file, framework);
        routes.push(...fileRoutes);
      } catch (err) {
        logger.debug(`Failed to extract routes from ${file}`);
      }
    }
  }

  logger.info(`Extracted ${routes.length} API routes from ${projectPath}`);
  return routes;
}

/**
 * Get file patterns for route files based on framework
 */
function getRoutePatterns(projectPath: string, framework: BackendFramework): string[] {
  switch (framework) {
    case "fastapi":
      return [
        `${projectPath}/**/routes/**/*.py`,
        `${projectPath}/**/routers/**/*.py`,
        `${projectPath}/**/api/**/*.py`,
        `${projectPath}/app/main.py`,
        `${projectPath}/main.py`,
      ];
    case "flask":
      return [
        `${projectPath}/**/routes/**/*.py`,
        `${projectPath}/**/views/**/*.py`,
        `${projectPath}/app.py`,
        `${projectPath}/main.py`,
      ];
    case "django":
      return [
        `${projectPath}/**/views.py`,
        `${projectPath}/**/views/**/*.py`,
        `${projectPath}/**/api/**/*.py`,
      ];
    case "express":
    case "nestjs":
      // These are Node.js frameworks, handled separately
      return [];
    default:
      return [
        `${projectPath}/**/routes/**/*.py`,
        `${projectPath}/**/api/**/*.py`,
        `${projectPath}/**/*route*.py`,
      ];
  }
}

/**
 * Extract routes from a Python file
 */
export function extractRoutesFromFile(
  content: string,
  filePath: string,
  framework: BackendFramework,
): RouteDefinition[] {
  // Prefer AST-based extraction for supported frameworks
  try {
    const astRoutes = extractRoutesFromPythonAST(content, filePath, framework);
    if (astRoutes.length > 0) {
      return astRoutes.map((r) => ({
        method: r.method,
        path: r.path,
        handler: r.handler,
        requestModel: r.requestModel,
        responseModel: r.responseModel,
        file: filePath,
        line: r.line,
      }));
    }
  } catch {
    // Fall through to regex
  }

  const routes: RouteDefinition[] = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    if (framework === "fastapi") {
      // FastAPI: @app.post("/api/clients")
      // FastAPI: @router.post("/api/clients")
      const fastapiMatch = line.match(
        /@(?:app|router)\.(get|post|put|patch|delete)\s*\(\s*["']([^"']+)["']/i,
      );
      if (fastapiMatch) {
        const route = extractFastAPIRoute(
          content,
          lines,
          i,
          fastapiMatch[1].toUpperCase(),
          fastapiMatch[2],
          filePath,
          lineNum,
        );
        if (route) {
          routes.push(route);
        }
        continue;
      }
    }

    if (framework === "flask") {
      // Flask: @app.route("/api/clients", methods=["POST"])
      const flaskMatch = line.match(/@app\.route\s*\(\s*["']([^"']+)["']/i);
      if (flaskMatch) {
        const route = extractFlaskRoute(
          content,
          lines,
          i,
          flaskMatch[1],
          filePath,
          lineNum,
        );
        if (route) {
          routes.push(route);
        }
        continue;
      }
    }

    // Generic: @route("/api/clients", methods=["POST"])
    const genericMatch = line.match(
      /@route\s*\(\s*["']([^"']+)["']\s*,\s*methods\s*=\s*\[(.+?)\]/i,
    );
    if (genericMatch) {
      const methods = genericMatch[2]
        .split(",")
        .map((m) => m.trim().replace(/["']/g, ""));
      for (const method of methods) {
        const route = extractGenericRoute(
          content,
          lines,
          i,
          method.toUpperCase(),
          genericMatch[1],
          filePath,
          lineNum,
        );
        if (route) {
          routes.push(route);
        }
      }
    }
  }

  return routes;
}

/**
 * Extract FastAPI route details
 */
function extractFastAPIRoute(
  content: string,
  lines: string[],
  decoratorLine: number,
  method: string,
  path: string,
  filePath: string,
  lineNum: number,
): RouteDefinition | null {
  // Look for function definition in next few lines
  const searchRange = Math.min(decoratorLine + 5, lines.length);
  let funcName = "";
  let requestModel: string | undefined;
  let responseModel: string | undefined;

  for (let i = decoratorLine + 1; i < searchRange; i++) {
    const line = lines[i];

    // Find function name
    // async def create_client(data: ClientCreate) -> Client:
    // def create_client(data: ClientCreate) -> Client:
    const funcMatch = line.match(/(?:async\s+)?def\s+(\w+)\s*\(/);
    if (funcMatch) {
      funcName = funcMatch[1];

      // Extract request model from parameter type hint
      // data: ClientCreate
      const paramMatch = line.match(/\w+\s*:\s*(\w+)(?:\s*[,\)])/) ||
                        line.match(/\w+\s*:\s*([\w\[\]]+)(?:\s*[,\)])/);
      if (paramMatch) {
        const typeName = paramMatch[1];
        // Filter out primitive types
        if (!isPrimitiveType(typeName)) {
          requestModel = typeName;
        }
      }

      // Extract response model from return type
      // -> Client
      const returnMatch = line.match(/-\s*\u003e\s*(\w+)/);
      if (returnMatch) {
        const returnType = returnMatch[1];
        if (!isPrimitiveType(returnType)) {
          responseModel = returnType;
        }
      }

      break;
    }
  }

  if (!funcName) {
    return null;
  }

  return {
    method: method as RouteDefinition["method"],
    path,
    handler: funcName,
    requestModel,
    responseModel,
    file: filePath,
    line: lineNum,
  };
}

/**
 * Extract Flask route details
 */
function extractFlaskRoute(
  content: string,
  lines: string[],
  decoratorLine: number,
  path: string,
  filePath: string,
  lineNum: number,
): RouteDefinition | null {
  // Look for function definition and methods
  const searchRange = Math.min(decoratorLine + 5, lines.length);
  let funcName = "";
  let method = "GET"; // Default for Flask

  // Check decorator line for methods parameter
  const decoratorLineContent = lines[decoratorLine];
  const methodsMatch = decoratorLineContent.match(/methods\s*=\s*\[(.+?)\]/);
  if (methodsMatch) {
    const methods = methodsMatch[1]
      .split(",")
      .map((m) => m.trim().replace(/["']/g, ""));
    if (methods.length > 0) {
      method = methods[0].toUpperCase();
    }
  }

  for (let i = decoratorLine + 1; i < searchRange; i++) {
    const line = lines[i];

    // Find function name
    const funcMatch = line.match(/def\s+(\w+)\s*\(/);
    if (funcMatch) {
      funcName = funcMatch[1];
      break;
    }
  }

  if (!funcName) {
    return null;
  }

  return {
    method: method as RouteDefinition["method"],
    path,
    handler: funcName,
    file: filePath,
    line: lineNum,
  };
}

/**
 * Extract generic route details
 */
function extractGenericRoute(
  content: string,
  lines: string[],
  decoratorLine: number,
  method: string,
  path: string,
  filePath: string,
  lineNum: number,
): RouteDefinition | null {
  // Look for function definition
  const searchRange = Math.min(decoratorLine + 5, lines.length);
  let funcName = "";

  for (let i = decoratorLine + 1; i < searchRange; i++) {
    const line = lines[i];

    const funcMatch = line.match(/(?:async\s+)?def\s+(\w+)\s*\(/);
    if (funcMatch) {
      funcName = funcMatch[1];
      break;
    }
  }

  if (!funcName) {
    return null;
  }

  return {
    method: method as RouteDefinition["method"],
    path,
    handler: funcName,
    file: filePath,
    line: lineNum,
  };
}

// ============================================================================
// Model Extraction
// ============================================================================

/**
 * Extract all Pydantic models from a Python project
 */
export async function extractModels(
  projectPath: string,
): Promise<ModelDefinition[]> {
  const models: ModelDefinition[] = [];

  // Find model files
  const modelPatterns = [
    `${projectPath}/**/models/**/*.py`,
    `${projectPath}/**/schemas/**/*.py`,
    `${projectPath}/**/pydantic/**/*.py`,
    `${projectPath}/**/models.py`,
    `${projectPath}/**/schemas.py`,
  ];

  const excludePatterns = [
    "**/venv/**",
    "**/.venv/**",
    "**/env/**",
    "**/__pycache__/**",
    "**/tests/**",
    "**/test_*.py",
  ];

  for (const pattern of modelPatterns) {
    const files = await glob(pattern, {
      ignore: excludePatterns,
      nodir: true,
      absolute: true,
    });

    for (const file of files) {
      try {
        const content = await fs.readFile(file, "utf-8");
        const fileModels = extractModelsFromFile(content, file);
        models.push(...fileModels);
      } catch (err) {
        logger.debug(`Failed to extract models from ${file}`);
      }
    }
  }

  logger.info(`Extracted ${models.length} models from ${projectPath}`);
  return models;
}

/**
 * Extract Pydantic models from a Python file
 */
export function extractModelsFromFile(
  content: string,
  filePath: string,
): ModelDefinition[] {
  // Prefer AST-based extraction
  try {
    const astModels = extractPydanticModelsFromPythonAST(content, filePath);
    if (astModels.length > 0) {
      return astModels.map((m) => ({
        name: m.name,
        fields: m.fields.map((f) => ({
          name: f.name,
          type: f.type,
          required: f.required,
          default: f.default,
        })),
        file: filePath,
        line: m.line,
        baseClasses: m.baseClasses,
      }));
    }
  } catch {
    // Fall through to regex
  }

  const models: ModelDefinition[] = [];
  const lines = content.split("\n");

  let currentModel: Partial<ModelDefinition> | null = null;
  let braceCount = 0;
  let startLine = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Class definition
    // class ClientCreate(BaseModel):
    // class ClientCreate(BaseModel, extra="forbid"):
    const classMatch = line.match(/class\s+(\w+)\s*\(\s*(\w+)\s*\)/);
    if (classMatch) {
      // Save previous model if exists
      if (currentModel) {
        models.push(currentModel as ModelDefinition);
        currentModel = null;
      }

      const className = classMatch[1];
      const baseClass = classMatch[2];

      // Only process Pydantic models (BaseModel subclasses)
      if (isPydanticBaseClass(baseClass)) {
        currentModel = {
          name: className,
          fields: [],
          file: filePath,
          line: i + 1,
          baseClasses: [baseClass],
        };
        braceCount = 1;
        startLine = i;
      }
      continue;
    }

    // Inside a model class
    if (currentModel) {
      // Count indentation-based blocks (Python doesn't use braces)
      // Simple heuristic: check if line is indented
      const isIndented = line.startsWith("    ") || line.startsWith("\t");
      const isEmpty = line.trim() === "";
      const isComment = line.trim().startsWith("#");

      if (!isIndented && !isEmpty && !isComment) {
        // End of class
        models.push(currentModel as ModelDefinition);
        currentModel = null;
        continue;
      }

      // Extract field
      // name: str
      // email: str = Field(...)
      // user_id: str = Field(default=...)
      // age: int = Field(default=0)
      const fieldMatch = line.match(
        /^(?:\s+)(\w+)\s*:\s*([\w\[\],\s]+?)(?:\s*=\s*(.+))?$/,
      );
      if (fieldMatch) {
        const fieldName = fieldMatch[1];
        const fieldType = fieldMatch[2].trim();
        const fieldDefault = fieldMatch[3]?.trim();

        // Check if field is required
        // Required: name: str, name: str = Field(...)
        // Optional: name: Optional[str], name: str = None, name: str = "default"
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

        const field: ModelField = {
          name: fieldName,
          type: fieldType,
          required,
          default: fieldDefault,
        };
        currentModel.fields!.push(field);
      }
    }
  }

  // Don't forget the last model
  if (currentModel) {
    models.push(currentModel as ModelDefinition);
  }

  return models;
}

/**
 * Check if a class is a Pydantic base class
 */
function isPydanticBaseClass(className: string): boolean {
  const pydanticBases = [
    "BaseModel",
    "BaseConfig",
    "RootModel",
    "pydantic.BaseModel",
  ];
  return pydanticBases.includes(className);
}

/**
 * Check if a type is a primitive type
 */
function isPrimitiveType(typeName: string): boolean {
  const primitives = [
    "str",
    "int",
    "float",
    "bool",
    "dict",
    "list",
    "tuple",
    "set",
    "None",
    "Any",
    "Optional",
    "Union",
    "Dict",
    "List",
    "Tuple",
  ];
  return primitives.includes(typeName) || typeName.startsWith("typing.");
}

// ============================================================================
// API Configuration Extraction
// ============================================================================

/**
 * Extract API configuration from a Python project
 */
export async function extractApiConfig(
  projectPath: string,
): Promise<{
  apiPrefix: string;
  framework: string;
}> {
  let apiPrefix = "/api";
  let framework = "unknown";

  // Check for main app file
  const configPaths = [
    path.join(projectPath, "app/main.py"),
    path.join(projectPath, "main.py"),
    path.join(projectPath, "app.py"),
    path.join(projectPath, "server.py"),
  ];

  for (const configPath of configPaths) {
    if (await fileExists(configPath)) {
      try {
        const content = await fs.readFile(configPath, "utf-8");

        // Detect framework
        if (content.includes("FastAPI")) {
          framework = "fastapi";
        } else if (content.includes("Flask")) {
          framework = "flask";
        } else if (content.includes("Django")) {
          framework = "django";
        }

        // Extract API prefix
        // app = FastAPI(root_path="/api")
        // app = Flask(__name__, root_path="/api")
        const prefixMatch =
          content.match(/root_path\s*=\s*["']([^"']+)["']/) ||
          content.match(/prefix\s*=\s*["']([^"']+)["']/);

        if (prefixMatch) {
          apiPrefix = prefixMatch[1];
        }

        break;
      } catch {
        // Continue to next file
      }
    }
  }

  return { apiPrefix, framework };
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const stats = await fs.stat(filePath);
    return stats.isFile();
  } catch {
    return false;
  }
}
