/**
 * Resolve Types Tool
 *
 * Resolves the actual type of a variable, function return, or expression.
 * LLMs often guess types incorrectly, especially with generics, inference,
 * and complex type compositions.
 *
 * Now integrates with shared project context for faster analysis.
 *
 * @format
 */

import { ToolDefinition } from "../types/tools.js";
import { logger } from "../utils/logger.js";
import {
  filterExcludedFiles,
  getExcludePatternsForPath,
} from "../utils/fileFilter.js";
import { glob } from "glob";
import * as fs from "fs/promises";
import * as path from "path";
import {
  getProjectContext,
  ProjectContext,
} from "../context/projectContext.js";

interface TypeInfo {
  name: string;
  resolvedType: string;
  source: string;
  file?: string;
  line?: number;
  properties?: Record<string, string>;
  genericParams?: string[];
}

interface TypeDefinition {
  name: string;
  kind: "interface" | "type" | "class" | "enum";
  properties: Record<string, string>;
  extends?: string[];
  file: string;
  line: number;
}

export const resolveTypesTool: ToolDefinition = {
  definition: {
    name: "resolve_types",
    description: `Resolve the actual type of variables, function returns, or expressions.
Helps LLMs understand what type a variable actually is after inference and generics.

Use cases:
- "What type does getUserById() return?"
- "What properties does this object have?"
- "What is the resolved type of this generic?"`,
    inputSchema: {
      type: "object",
      properties: {
        projectPath: {
          type: "string",
          description: "Project root path",
        },
        query: {
          type: "string",
          description: "Symbol name, function name, or type to resolve",
        },
        file: {
          type: "string",
          description: "Specific file to look in (optional)",
        },
        line: {
          type: "number",
          description: "Line number for context (optional)",
        },
        code: {
          type: "string",
          description: "Code snippet to analyze types in (optional)",
        },
      },
      required: ["projectPath", "query"],
    },
  },

  async handler(args: any) {
    const startTime = Date.now();
    const { projectPath, query, file, line, code } = args;

    logger.info(`Resolving type for: ${query}`);

    try {
      // Try to use shared project context for symbol lookup
      let projectContext: ProjectContext | null = null;
      try {
        projectContext = await getProjectContext(projectPath, {
          language: "typescript",
          includeTests: false,
        });
        logger.info(
          `Using shared context for type resolution (${projectContext.files.size} files)`
        );

        // Quick lookup in context's symbol index
        const symbolDefs = projectContext.symbolIndex.get(query);
        if (symbolDefs && symbolDefs.length > 0) {
          const def = symbolDefs[0];
          return formatResponse({
            success: true,
            query,
            resolved: {
              name: def.symbol.name,
              kind: def.symbol.kind,
              file: def.file,
              line: def.symbol.line,
              returnType: def.symbol.returnType,
              params: def.symbol.params,
              exported: def.symbol.exported,
            },
            context: "from project context",
            stats: {
              analysisTime: `${Date.now() - startTime}ms`,
              usedContext: true,
            },
          });
        }
      } catch (err) {
        logger.debug(`Could not use context: ${err}`);
      }

      // Build type registry from project (fallback)
      const typeRegistry = await buildTypeRegistry(projectPath);

      // If code snippet provided, analyze it
      if (code) {
        const codeTypes = analyzeCodeTypes(code, typeRegistry);
        const matchingType = codeTypes.find(
          (t) => t.name === query || t.name.includes(query)
        );

        if (matchingType) {
          return formatResponse({
            success: true,
            query,
            resolved: matchingType,
            context: "from provided code",
          });
        }
      }

      // Search for the symbol in the registry
      const results: TypeInfo[] = [];

      // 1. Direct type/interface match
      const directMatch = typeRegistry.types.get(query);
      if (directMatch) {
        results.push({
          name: query,
          resolvedType: formatTypeDefinition(directMatch),
          source: "type definition",
          file: directMatch.file,
          line: directMatch.line,
          properties: directMatch.properties,
        });
      }

      // 2. Function return type
      const funcMatch = typeRegistry.functions.get(query);
      if (funcMatch) {
        results.push({
          name: query,
          resolvedType: funcMatch.returnType,
          source: "function return type",
          file: funcMatch.file,
          line: funcMatch.line,
          genericParams: funcMatch.genericParams,
        });
      }

      // 3. Variable type
      const varMatch = typeRegistry.variables.get(query);
      if (varMatch) {
        results.push({
          name: query,
          resolvedType: varMatch.type,
          source: "variable declaration",
          file: varMatch.file,
          line: varMatch.line,
        });
      }

      // 4. If specific file provided, search there
      if (file && results.length === 0) {
        const fileTypes = await analyzeFile(
          path.join(projectPath, file),
          typeRegistry
        );
        const fileMatch = fileTypes.find(
          (t) => t.name === query || t.name.includes(query)
        );
        if (fileMatch) {
          results.push(fileMatch);
        }
      }

      // 5. Fuzzy search if no exact match
      if (results.length === 0) {
        const fuzzyMatches = fuzzySearchTypes(query, typeRegistry);
        results.push(...fuzzyMatches);
      }

      const elapsed = Date.now() - startTime;

      if (results.length === 0) {
        return formatResponse({
          success: true,
          query,
          resolved: null,
          message: `No type information found for '${query}'`,
          suggestions: getSuggestions(query, typeRegistry),
          stats: { analysisTime: `${elapsed}ms` },
        });
      }

      return formatResponse({
        success: true,
        query,
        resolved: results.length === 1 ? results[0] : results,
        stats: {
          typesIndexed: typeRegistry.types.size,
          functionsIndexed: typeRegistry.functions.size,
          analysisTime: `${elapsed}ms`,
        },
      });
    } catch (error) {
      logger.error("Error resolving types:", error);
      return formatResponse({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
};

interface TypeRegistry {
  types: Map<string, TypeDefinition>;
  functions: Map<
    string,
    {
      name: string;
      returnType: string;
      params: Array<{ name: string; type: string }>;
      genericParams?: string[];
      file: string;
      line: number;
    }
  >;
  variables: Map<
    string,
    {
      name: string;
      type: string;
      file: string;
      line: number;
    }
  >;
}

async function buildTypeRegistry(projectPath: string): Promise<TypeRegistry> {
  const registry: TypeRegistry = {
    types: new Map(),
    functions: new Map(),
    variables: new Map(),
  };

  // Get exclude patterns adjusted for absolute paths
  const excludes = [
    "**/node_modules/**",
    "**/dist/**",
    "**/*.test.*",
    "**/*.spec.*",
    ...getExcludePatternsForPath(projectPath),
  ];

  let files = await glob(`${projectPath}/**/*.{ts,tsx}`, {
    ignore: excludes,
    nodir: true,
    absolute: true, // Use absolute paths for better ignore matching
  });

  // Additional filtering to catch any excluded directories that glob missed
  files = filterExcludedFiles(files);

  for (const file of files.slice(0, 100)) {
    try {
      const content = await fs.readFile(file, "utf-8");
      const relPath = path.relative(projectPath, file);

      // Extract interfaces and types
      extractTypeDefinitions(content, relPath, registry);

      // Extract function signatures
      extractFunctionSignatures(content, relPath, registry);

      // Extract variable declarations with types
      extractVariableTypes(content, relPath, registry);
    } catch (err) {
      // Skip unreadable files
    }
  }

  return registry;
}

function extractTypeDefinitions(
  content: string,
  file: string,
  registry: TypeRegistry
): void {
  const lines = content.split("\n");

  lines.forEach((line, idx) => {
    // Interface
    const interfaceMatch = line.match(
      /(?:export\s+)?interface\s+(\w+)(?:<([^>]+)>)?(?:\s+extends\s+([^{]+))?/
    );
    if (interfaceMatch) {
      const name = interfaceMatch[1];
      const properties = extractProperties(content, idx);

      registry.types.set(name, {
        name,
        kind: "interface",
        properties,
        extends: interfaceMatch[3]?.split(",").map((e) => e.trim()),
        file,
        line: idx + 1,
      });
    }

    // Type alias
    const typeMatch = line.match(
      /(?:export\s+)?type\s+(\w+)(?:<([^>]+)>)?\s*=\s*(.+)/
    );
    if (typeMatch) {
      const name = typeMatch[1];
      let typeValue = typeMatch[3];

      // If it's an object type, extract properties
      if (typeValue.includes("{")) {
        const properties = extractPropertiesFromType(typeValue);
        registry.types.set(name, {
          name,
          kind: "type",
          properties,
          file,
          line: idx + 1,
        });
      } else {
        registry.types.set(name, {
          name,
          kind: "type",
          properties: { _value: typeValue.replace(/;$/, "") },
          file,
          line: idx + 1,
        });
      }
    }

    // Enum
    const enumMatch = line.match(/(?:export\s+)?enum\s+(\w+)/);
    if (enumMatch) {
      const name = enumMatch[1];
      const values = extractEnumValues(content, idx);

      registry.types.set(name, {
        name,
        kind: "enum",
        properties: values,
        file,
        line: idx + 1,
      });
    }
  });
}

function extractFunctionSignatures(
  content: string,
  file: string,
  registry: TypeRegistry
): void {
  const lines = content.split("\n");

  lines.forEach((line, idx) => {
    // Function with return type
    const funcMatch = line.match(
      /(?:export\s+)?(?:async\s+)?function\s+(\w+)(?:<([^>]+)>)?\s*\(([^)]*)\)\s*:\s*([^{]+)/
    );
    if (funcMatch) {
      registry.functions.set(funcMatch[1], {
        name: funcMatch[1],
        returnType: funcMatch[4].trim(),
        params: parseParamsWithTypes(funcMatch[3]),
        genericParams: funcMatch[2]?.split(",").map((g) => g.trim()),
        file,
        line: idx + 1,
      });
    }

    // Arrow function with return type
    const arrowMatch = line.match(
      /(?:export\s+)?const\s+(\w+)(?:<([^>]+)>)?\s*=\s*(?:async\s*)?\(([^)]*)\)\s*:\s*([^=]+)\s*=>/
    );
    if (arrowMatch) {
      registry.functions.set(arrowMatch[1], {
        name: arrowMatch[1],
        returnType: arrowMatch[4].trim(),
        params: parseParamsWithTypes(arrowMatch[3]),
        genericParams: arrowMatch[2]?.split(",").map((g) => g.trim()),
        file,
        line: idx + 1,
      });
    }
  });
}

function extractVariableTypes(
  content: string,
  file: string,
  registry: TypeRegistry
): void {
  const lines = content.split("\n");

  lines.forEach((line, idx) => {
    // const/let with type annotation on same line (type and = on same line)
    const varMatch = line.match(
      /(?:export\s+)?(?:const|let)\s+(\w+)\s*:\s*([^=]+)\s*=/
    );
    if (varMatch) {
      let typeStr = varMatch[2].trim();

      // If type starts with { but doesn't end with }, it's a multi-line inline type
      if (
        typeStr === "{" ||
        (typeStr.startsWith("{") && !typeStr.endsWith("}"))
      ) {
        // Extract the full inline type by counting braces
        let braceCount = 1;
        let fullType = typeStr;
        for (let i = idx + 1; i < Math.min(idx + 20, lines.length); i++) {
          const nextLine = lines[i];
          for (const char of nextLine) {
            if (char === "{") braceCount++;
            if (char === "}") braceCount--;
          }
          fullType += " " + nextLine.trim();
          if (braceCount === 0) break;
        }
        typeStr = fullType.replace(/\s*=\s*\{[\s\S]*$/, "").trim();
      }

      registry.variables.set(varMatch[1], {
        name: varMatch[1],
        type: typeStr,
        file,
        line: idx + 1,
      });
      return;
    }

    // Handle multi-line type annotation where { is at end of line: const NAME: {
    const multiLineMatch = line.match(
      /(?:export\s+)?(?:const|let)\s+(\w+)\s*:\s*\{\s*$/
    );
    if (multiLineMatch) {
      // Extract the full inline type by counting braces
      let braceCount = 1;
      let fullType = "{";
      for (let i = idx + 1; i < Math.min(idx + 20, lines.length); i++) {
        const nextLine = lines[i];
        for (const char of nextLine) {
          if (char === "{") braceCount++;
          if (char === "}") braceCount--;
        }
        fullType += " " + nextLine.trim();
        if (braceCount === 0) break;
      }
      // Remove the = { ... } part at the end
      const typeStr = fullType.replace(/\s*=\s*\{[\s\S]*$/, "").trim();

      registry.variables.set(multiLineMatch[1], {
        name: multiLineMatch[1],
        type: typeStr,
        file,
        line: idx + 1,
      });
    }
  });
}

function extractProperties(
  content: string,
  startLine: number
): Record<string, string> {
  const properties: Record<string, string> = {};
  const lines = content.split("\n");
  let braceCount = 0;
  let started = false;

  for (let i = startLine; i < Math.min(startLine + 50, lines.length); i++) {
    const line = lines[i];

    if (line.includes("{")) {
      braceCount++;
      started = true;
    }
    if (line.includes("}")) {
      braceCount--;
      if (started && braceCount === 0) break;
    }

    if (started && braceCount > 0) {
      const propMatch = line.match(/^\s*(\w+)\??:\s*([^;]+)/);
      if (propMatch) {
        properties[propMatch[1]] = propMatch[2].trim();
      }
    }
  }

  return properties;
}

function extractPropertiesFromType(typeStr: string): Record<string, string> {
  const properties: Record<string, string> = {};
  const inner = typeStr.match(/\{([^}]+)\}/)?.[1] || "";

  const props = inner.split(";").filter((p) => p.trim());
  for (const prop of props) {
    const match = prop.match(/(\w+)\??:\s*(.+)/);
    if (match) {
      properties[match[1]] = match[2].trim();
    }
  }

  return properties;
}

function extractEnumValues(
  content: string,
  startLine: number
): Record<string, string> {
  const values: Record<string, string> = {};
  const lines = content.split("\n");
  let braceCount = 0;
  let started = false;

  for (let i = startLine; i < Math.min(startLine + 30, lines.length); i++) {
    const line = lines[i];

    if (line.includes("{")) {
      braceCount++;
      started = true;
    }
    if (line.includes("}")) {
      braceCount--;
      if (started && braceCount === 0) break;
    }

    if (started && braceCount > 0) {
      const enumMatch = line.match(/^\s*(\w+)\s*(?:=\s*([^,]+))?/);
      if (enumMatch && enumMatch[1]) {
        values[enumMatch[1]] = enumMatch[2]?.trim() || "auto";
      }
    }
  }

  return values;
}

function parseParamsWithTypes(
  paramStr: string
): Array<{ name: string; type: string }> {
  if (!paramStr.trim()) return [];

  return paramStr.split(",").map((p) => {
    const parts = p.trim().split(":");
    return {
      name: parts[0].replace(/[?]$/, "").trim(),
      type: parts[1]?.trim() || "any",
    };
  });
}

function formatTypeDefinition(def: TypeDefinition): string {
  if (def.kind === "enum") {
    return `enum { ${Object.keys(def.properties).join(", ")} }`;
  }

  const props = Object.entries(def.properties)
    .map(([k, v]) => `${k}: ${v}`)
    .join("; ");

  return `{ ${props} }`;
}

function analyzeCodeTypes(code: string, registry: TypeRegistry): TypeInfo[] {
  const types: TypeInfo[] = [];
  const lines = code.split("\n");

  lines.forEach((line, idx) => {
    // Variable with type
    const varMatch = line.match(/(?:const|let)\s+(\w+)\s*:\s*(\w+)/);
    if (varMatch) {
      const typeDef = registry.types.get(varMatch[2]);
      types.push({
        name: varMatch[1],
        resolvedType: typeDef ? formatTypeDefinition(typeDef) : varMatch[2],
        source: "variable declaration",
        line: idx + 1,
        properties: typeDef?.properties,
      });
    }

    // Function call result
    const callMatch = line.match(
      /(?:const|let)\s+(\w+)\s*=\s*(?:await\s+)?(\w+)\s*\(/
    );
    if (callMatch) {
      const funcDef = registry.functions.get(callMatch[2]);
      if (funcDef) {
        types.push({
          name: callMatch[1],
          resolvedType: funcDef.returnType,
          source: `return type of ${callMatch[2]}()`,
          line: idx + 1,
        });
      }
    }
  });

  return types;
}

async function analyzeFile(
  filePath: string,
  registry: TypeRegistry
): Promise<TypeInfo[]> {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return analyzeCodeTypes(content, registry);
  } catch {
    return [];
  }
}

function fuzzySearchTypes(query: string, registry: TypeRegistry): TypeInfo[] {
  const results: TypeInfo[] = [];
  const queryLower = query.toLowerCase();

  for (const [name, def] of registry.types) {
    if (name.toLowerCase().includes(queryLower)) {
      results.push({
        name,
        resolvedType: formatTypeDefinition(def),
        source: "type definition (fuzzy match)",
        file: def.file,
        line: def.line,
        properties: def.properties,
      });
    }
  }

  for (const [name, func] of registry.functions) {
    if (name.toLowerCase().includes(queryLower)) {
      results.push({
        name,
        resolvedType: func.returnType,
        source: "function (fuzzy match)",
        file: func.file,
        line: func.line,
      });
    }
  }

  return results.slice(0, 5);
}

function getSuggestions(query: string, registry: TypeRegistry): string[] {
  const suggestions: string[] = [];
  const queryLower = query.toLowerCase();

  for (const name of registry.types.keys()) {
    if (
      name.toLowerCase().startsWith(queryLower.charAt(0)) &&
      suggestions.length < 5
    ) {
      suggestions.push(name);
    }
  }

  for (const name of registry.functions.keys()) {
    if (
      name.toLowerCase().startsWith(queryLower.charAt(0)) &&
      suggestions.length < 10
    ) {
      suggestions.push(`${name}()`);
    }
  }

  return suggestions;
}

function formatResponse(data: any) {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };
}
