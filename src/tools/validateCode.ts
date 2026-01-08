/**
 * Validate Code Tool
 *
 * THE UNIFIED AI CODE VALIDATOR
 *
 * Catches TWO types of AI mistakes:
 * 1. HALLUCINATIONS - References to things that don't exist
 * 2. DEAD CODE - Code that nothing uses (AI over-generation)
 *
 * Usage:
 *   validate_code({ projectPath: ".", newCode: "...", language: "typescript" })
 *   validate_code({ projectPath: ".", language: "typescript", checkDeadCode: true }) // scan only
 *
 * @format
 */

import { ToolDefinition } from "../types/tools.js";
import { logger } from "../utils/logger.js";
import {
  filterExcludedFiles,
  getExcludePatternsForPath,
} from "../utils/fileFilter.js";
import {
  getProjectContext,
  symbolExists,
  findSymbolDefinitions,
  ProjectContext,
} from "../context/projectContext.js";
import { glob } from "glob";
import * as fs from "fs/promises";
import * as path from "path";

// File extensions by language
const EXTENSIONS: Record<string, string[]> = {
  javascript: [".js", ".jsx", ".mjs"],
  typescript: [".ts", ".tsx"],
  python: [".py"],
  go: [".go"],
};

const DEFAULT_EXCLUDES = [
  "**/node_modules/**",
  "**/venv/**",
  "**/.venv/**",
  "**/dist/**",
  "**/build/**",
  "**/__pycache__/**",
  "**/.git/**",
  "**/coverage/**",
];

interface Symbol {
  name: string;
  type: "function" | "class" | "method" | "variable" | "import";
  file: string;
  line?: number;
  params?: number; // parameter count for functions
}

interface ValidationIssue {
  type:
    | "nonExistentFunction"
    | "nonExistentClass"
    | "nonExistentMethod"
    | "wrongParamCount"
    | "nonExistentImport"
    | "undefinedVariable";
  severity: "critical" | "high" | "medium" | "low";
  message: string;
  line: number;
  code: string;
  suggestion: string;
}

interface DeadCodeIssue {
  type: "unusedExport" | "orphanedFile" | "unusedFunction";
  severity: "medium" | "low";
  name: string;
  file: string;
  message: string;
}

export const validateCodeTool: ToolDefinition = {
  definition: {
    name: "validate_code",
    description: `Validate AI-generated code against your project. Catches hallucinations AND dead code.

HALLUCINATIONS (code references non-existent things):
- Functions that don't exist
- Classes not defined
- Wrong method calls

DEAD CODE (AI over-generation):
- Functions nothing calls  
- Files nothing imports
- Exports nothing uses

Examples:
- validate_code({ projectPath: ".", newCode: "const x = myFunc()", language: "typescript" })
- validate_code({ projectPath: ".", language: "typescript", checkDeadCode: true }) // dead code scan only`,
    inputSchema: {
      type: "object",
      properties: {
        projectPath: {
          type: "string",
          description: 'Path to your project (e.g., ".", "src", "backend")',
        },
        newCode: {
          type: "string",
          description:
            "The AI-generated code to validate (optional - omit for dead code scan only)",
        },
        language: {
          type: "string",
          enum: ["javascript", "typescript", "python", "go"],
          description: "Programming language",
        },
        checkDeadCode: {
          type: "boolean",
          description:
            "Also scan for unused exports and orphaned files (default: false)",
        },
        strictMode: {
          type: "boolean",
          description:
            "Flag all unresolved symbols, not just likely hallucinations (default: false)",
        },
      },
      required: ["projectPath", "language"],
    },
  },

  async handler(args: any) {
    const startTime = Date.now();
    const {
      projectPath,
      newCode,
      language,
      strictMode = false,
      checkDeadCode = false,
    } = args;

    logger.info(`Validating code against project: ${projectPath}`);

    try {
      // Try to use shared context if available (much faster)
      let symbolTable: Symbol[];
      let filesScanned: number;
      let usedSharedContext = false;
      let context: ProjectContext | null = null;

      try {
        context = await getProjectContext(projectPath, {
          language: language === "javascript" ? "typescript" : language,
          forceRebuild: false,
        });

        // Convert context symbols to our Symbol format
        symbolTable = [];
        for (const [name, definitions] of context.symbolIndex) {
          for (const def of definitions) {
            symbolTable.push({
              name,
              type:
                def.symbol.kind === "function" || def.symbol.kind === "hook" ?
                  "function"
                : (
                  def.symbol.kind === "class" || def.symbol.kind === "component"
                ) ?
                  "class"
                : (
                  def.symbol.kind === "interface" ||
                  def.symbol.kind === "type" ||
                  def.symbol.kind === "enum"
                ) ?
                  "variable"
                : "method",
              file: def.file,
              line: def.symbol.line,
              params: def.symbol.params?.length,
            });
          }
        }
        filesScanned = context.totalFiles;
        usedSharedContext = true;
        logger.info(`Using shared context with ${symbolTable.length} symbols`);
      } catch (err) {
        // Fall back to building symbol table from scratch
        logger.info("Shared context not available, building from scratch");

        // Step 1: Find all source files in project
        const extensions = EXTENSIONS[language] || EXTENSIONS.typescript;
        const patterns = extensions.map((ext) => `${projectPath}/**/*${ext}`);

        // Get exclude patterns adjusted for absolute paths
        const excludes = [
          ...DEFAULT_EXCLUDES,
          ...getExcludePatternsForPath(projectPath),
        ];

        let files = await glob(patterns, {
          ignore: excludes,
          nodir: true,
          absolute: true,
        });

        files = filterExcludedFiles(files);

        if (files.length === 0) {
          return formatResponse({
            success: true,
            validated: false,
            message: `No ${language} files found in ${projectPath}`,
          });
        }

        // Step 2: Build symbol table from project files
        symbolTable = await buildSymbolTableFromFiles(files, language);
        filesScanned = files.length;
      }

      // Step 3: Validate hallucinations if new code provided
      let issues: ValidationIssue[] = [];
      let usedSymbols: any[] = [];

      if (newCode) {
        // Extract symbols used in new code
        usedSymbols = extractUsedSymbols(newCode, language);

        // Validate each used symbol
        issues = validateSymbols(
          usedSymbols,
          symbolTable,
          newCode,
          language,
          strictMode
        );
      }

      // Step 4: Check for dead code if requested
      let deadCodeIssues: DeadCodeIssue[] = [];
      if (checkDeadCode && context) {
        deadCodeIssues = detectDeadCode(context, newCode);
      }

      // Step 5: Calculate score and recommendation
      const score = calculateScore(issues, deadCodeIssues);
      const recommendation = generateRecommendation(
        score,
        issues,
        deadCodeIssues
      );

      const elapsed = Date.now() - startTime;

      return formatResponse({
        success: true,
        validated: true,
        score,
        hallucinationDetected: issues.length > 0,
        deadCodeDetected: deadCodeIssues.length > 0,
        hallucinations: issues,
        deadCode: deadCodeIssues,
        recommendation,
        stats: {
          filesScanned,
          symbolsInProject: symbolTable.length,
          symbolsChecked: usedSymbols.length,
          hallucinationsFound: issues.length,
          deadCodeFound: deadCodeIssues.length,
          analysisTime: `${elapsed}ms`,
          usedSharedContext,
        },
      });
    } catch (error) {
      logger.error("Validation error:", error);
      return formatResponse({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
};

/**
 * Build symbol table from actual project files
 */
async function buildSymbolTableFromFiles(
  files: string[],
  language: string
): Promise<Symbol[]> {
  const symbols: Symbol[] = [];

  for (const file of files.slice(0, 200)) {
    // Limit for performance
    try {
      const content = await fs.readFile(file, "utf-8");
      const fileSymbols = extractSymbolsFromFile(content, file, language);
      symbols.push(...fileSymbols);
    } catch (err) {
      // Skip unreadable files
    }
  }

  return symbols;
}

/**
 * Extract symbol definitions from a file
 */
function extractSymbolsFromFile(
  content: string,
  filePath: string,
  language: string
): Symbol[] {
  const symbols: Symbol[] = [];
  const lines = content.split("\n");

  if (language === "javascript" || language === "typescript") {
    // Functions: function name(), const name = () =>, const name = function
    const funcPatterns = [
      /function\s+(\w+)\s*\(([^)]*)\)/g,
      /(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(([^)]*)\)\s*=>/g,
      /(?:const|let|var)\s+(\w+)\s*=\s*function\s*\(([^)]*)\)/g,
    ];

    for (const pattern of funcPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const paramCount =
          match[2] ? match[2].split(",").filter((p) => p.trim()).length : 0;
        symbols.push({
          name: match[1],
          type: "function",
          file: filePath,
          params: paramCount,
        });
      }
    }

    // Classes
    const classPattern = /class\s+(\w+)/g;
    let match: RegExpExecArray | null;
    while ((match = classPattern.exec(content)) !== null) {
      symbols.push({ name: match[1], type: "class", file: filePath });
    }

    // Class methods: methodName(...) { inside class
    const methodPattern =
      /^\s+(?:async\s+)?(\w+)\s*\(([^)]*)\)\s*(?::\s*\w+)?\s*{/gm;
    while ((match = methodPattern.exec(content)) !== null) {
      const name = match[1];
      if (
        !["if", "for", "while", "switch", "catch", "constructor"].includes(name)
      ) {
        const paramCount =
          match[2] ? match[2].split(",").filter((p) => p.trim()).length : 0;
        symbols.push({
          name,
          type: "method",
          file: filePath,
          params: paramCount,
        });
      }
    }

    // Exports: export { name }, export const name
    const exportPattern = /export\s+(?:const|let|var|function|class)\s+(\w+)/g;
    while ((match = exportPattern.exec(content)) !== null) {
      // Already captured above, but mark as exported
    }

    // Variables (top-level const/let/var)
    const varPattern = /^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=/gm;
    let varMatch: RegExpExecArray | null;
    while ((varMatch = varPattern.exec(content)) !== null) {
      const varName = varMatch[1];
      if (!symbols.find((s) => s.name === varName)) {
        symbols.push({ name: varName, type: "variable", file: filePath });
      }
    }
  } else if (language === "python") {
    // Functions: def name(
    const funcPattern = /^(?:async\s+)?def\s+(\w+)\s*\(([^)]*)\)/gm;
    let match: RegExpExecArray | null;
    while ((match = funcPattern.exec(content)) !== null) {
      const params = match[2]
        .split(",")
        .filter((p) => p.trim() && !p.trim().startsWith("self"));
      symbols.push({
        name: match[1],
        type: "function",
        file: filePath,
        params: params.length,
      });
    }

    // Classes
    const classPattern = /^class\s+(\w+)/gm;
    while ((match = classPattern.exec(content)) !== null) {
      symbols.push({ name: match[1], type: "class", file: filePath });
    }

    // Methods inside classes (indented def)
    const methodPattern = /^\s+(?:async\s+)?def\s+(\w+)\s*\(([^)]*)\)/gm;
    while ((match = methodPattern.exec(content)) !== null) {
      const name = match[1];
      if (!name.startsWith("_") || name.startsWith("__")) {
        const params = match[2]
          .split(",")
          .filter((p) => p.trim() && !p.trim().startsWith("self"));
        symbols.push({
          name,
          type: "method",
          file: filePath,
          params: params.length,
        });
      }
    }

    // Variables (top-level assignments)
    const pyVarPattern = /^(\w+)\s*=/gm;
    let pyVarMatch: RegExpExecArray | null;
    while ((pyVarMatch = pyVarPattern.exec(content)) !== null) {
      const pyVarName = pyVarMatch[1];
      if (
        !symbols.find((s) => s.name === pyVarName) &&
        pyVarName === pyVarName.toUpperCase()
      ) {
        // Only constants (ALL_CAPS)
        symbols.push({ name: pyVarName, type: "variable", file: filePath });
      }
    }
  }

  return symbols;
}

/**
 * Extract symbols USED in the new code (function calls, class instantiations, etc.)
 */
function extractUsedSymbols(
  code: string,
  language: string
): Array<{
  name: string;
  type: "call" | "methodCall" | "instantiation" | "import";
  object?: string;
  line: number;
  code: string;
  argCount?: number;
}> {
  const used: Array<{
    name: string;
    type: "call" | "methodCall" | "instantiation" | "import";
    object?: string;
    line: number;
    code: string;
    argCount?: number;
  }> = [];

  const lines = code.split("\n");

  // First, extract all imported symbols
  // We need to distinguish between external (npm/pip) and internal (project) imports
  const externalImportedSymbols = new Set<string>(); // Skip validation for these
  const internalImportedSymbols = new Map<string, string>(); // symbol -> source module (validate these)
  // Also track variables that are assigned from imported function calls
  const libraryDerivedVariables = new Set<string>();

  for (const line of lines) {
    const trimmed = line.trim();

    // JS/TS imports: import { x, y } from '...' or import x from '...'
    if (language === "javascript" || language === "typescript") {
      // Check if it's an external or internal import
      const fromMatch = trimmed.match(/from\s+['"]([^'"]+)['"]/);
      const importSource = fromMatch ? fromMatch[1] : "";
      const isExternalImport =
        importSource &&
        !importSource.startsWith(".") &&
        !importSource.startsWith("@/") &&
        !importSource.startsWith("~/");

      // Named imports: import { useQuery, useMutation } from '@tanstack/react-query'
      const namedImportMatch = trimmed.match(/import\s*\{([^}]+)\}\s*from/);
      if (namedImportMatch) {
        const imports = namedImportMatch[1].split(",");
        for (const imp of imports) {
          // Handle "type X" and "X as Y" patterns
          let name = imp.trim().replace(/^type\s+/, "");
          const asParts = name.split(/\s+as\s+/);
          name = asParts.length > 1 ? asParts[1].trim() : asParts[0].trim();
          if (name) {
            if (isExternalImport) {
              externalImportedSymbols.add(name);
            } else {
              internalImportedSymbols.set(name, importSource);
            }
          }
        }
      }

      // Default imports: import React from 'react'
      const defaultImportMatch = trimmed.match(/import\s+(\w+)\s+from/);
      if (defaultImportMatch) {
        if (isExternalImport) {
          externalImportedSymbols.add(defaultImportMatch[1]);
        } else {
          internalImportedSymbols.set(defaultImportMatch[1], importSource);
        }
      }

      // Namespace imports: import * as React from 'react'
      const namespaceImportMatch = trimmed.match(
        /import\s*\*\s*as\s+(\w+)\s+from/
      );
      if (namespaceImportMatch) {
        if (isExternalImport) {
          externalImportedSymbols.add(namespaceImportMatch[1]);
        } else {
          internalImportedSymbols.set(namespaceImportMatch[1], importSource);
        }
      }
    }

    // Python imports
    if (language === "python") {
      // from module import x, y
      const fromImportMatch = trimmed.match(/from\s+(\S+)\s+import\s+(.+)/);
      if (fromImportMatch) {
        const importSource = fromImportMatch[1];
        const importList = fromImportMatch[2];
        // Check if it's an internal import (starts with app., ., or project name)
        const isInternalImport =
          importSource.startsWith("app.") ||
          importSource.startsWith(".") ||
          importSource.startsWith("src.");

        const imports = importList.split(",");
        for (const imp of imports) {
          const parts = imp.trim().split(/\s+as\s+/);
          const name = parts.length > 1 ? parts[1].trim() : parts[0].trim();
          if (name) {
            if (isInternalImport) {
              internalImportedSymbols.set(name, importSource);
            } else {
              externalImportedSymbols.add(name);
            }
          }
        }
      }

      // import module (usually external)
      const importMatch = trimmed.match(/^import\s+(\w+)/);
      if (importMatch) {
        externalImportedSymbols.add(importMatch[1]);
      }
    }
  }

  // Second pass: track variables assigned from external imported function calls
  for (const line of lines) {
    const trimmed = line.trim();
    if (language === "javascript" || language === "typescript") {
      // e.g., const queryClient = useQueryClient();
      const varAssignMatch = trimmed.match(
        /(?:const|let|var)\s+(\w+)\s*=\s*(\w+)\s*\(/
      );
      if (varAssignMatch) {
        const [, varName, funcName] = varAssignMatch;
        if (externalImportedSymbols.has(funcName)) {
          libraryDerivedVariables.add(varName);
        }
      }
    }
  }

  lines.forEach((line, idx) => {
    const lineNum = idx + 1;
    const trimmed = line.trim();

    // Skip comments
    if (
      trimmed.startsWith("//") ||
      trimmed.startsWith("#") ||
      trimmed.startsWith("*")
    ) {
      return;
    }

    // Skip import lines themselves
    if (trimmed.startsWith("import ") || trimmed.startsWith("from ")) {
      return;
    }

    // Remove string literals to avoid false positives
    const cleanLine = line
      .replace(/"[^"]*"/g, '""')
      .replace(/'[^']*'/g, "''")
      .replace(/`[^`]*`/g, "``");

    // Method calls: object.method(...)
    const methodCallPattern = /(\w+)\.(\w+)\s*\(/g;
    let match;
    while ((match = methodCallPattern.exec(cleanLine)) !== null) {
      const [, obj, method] = match;
      // Skip if object is an external imported symbol or library-derived variable
      if (
        externalImportedSymbols.has(obj) ||
        libraryDerivedVariables.has(obj)
      ) {
        continue;
      }
      if (!isBuiltIn(obj, language) && !isKeyword(method, language)) {
        // Count arguments
        const afterCall = cleanLine.slice(match.index + match[0].length);
        const argCount = countArguments(afterCall);

        used.push({
          name: method,
          type: "methodCall",
          object: obj,
          line: lineNum,
          code: trimmed,
          argCount,
        });
      }
    }

    // Standalone function calls: functionName(...)
    const funcCallPattern = /(?:^|[^\w.])(\w+)\s*\(/g;
    while ((match = funcCallPattern.exec(cleanLine)) !== null) {
      const name = match[1];
      // Skip if this is an external imported symbol (npm/pip package)
      // But DO validate internal imports (they should exist in project)
      if (externalImportedSymbols.has(name)) {
        continue;
      }
      if (!isKeyword(name, language) && !isBuiltIn(name, language)) {
        // Make sure it's not a method call we already captured
        const beforeMatch = cleanLine.slice(0, match.index);
        if (!beforeMatch.endsWith(".")) {
          const afterCall = cleanLine.slice(match.index + match[0].length);
          const argCount = countArguments(afterCall);

          used.push({
            name,
            type: "call",
            line: lineNum,
            code: trimmed,
            argCount,
          });
        }
      }
    }

    // Class instantiation: new ClassName(...)
    const newPattern = /new\s+(\w+)\s*\(/g;
    while ((match = newPattern.exec(cleanLine)) !== null) {
      // Skip if external imported
      if (externalImportedSymbols.has(match[1])) {
        continue;
      }
      if (!isBuiltIn(match[1], language)) {
        used.push({
          name: match[1],
          type: "instantiation",
          line: lineNum,
          code: trimmed,
        });
      }
    }
  });

  return used;
}

/**
 * Count arguments in a function call (simple heuristic)
 */
function countArguments(afterOpenParen: string): number {
  let depth = 1;
  let argCount = 0;
  let hasContent = false;

  for (const char of afterOpenParen) {
    if (char === "(") depth++;
    else if (char === ")") {
      depth--;
      if (depth === 0) break;
    } else if (char === "," && depth === 1) {
      argCount++;
    } else if (char.trim() && depth === 1) {
      hasContent = true;
    }
  }

  return hasContent ? argCount + 1 : 0;
}

/**
 * Validate used symbols against the project's symbol table
 */
function validateSymbols(
  usedSymbols: Array<{
    name: string;
    type: string;
    object?: string;
    line: number;
    code: string;
    argCount?: number;
  }>,
  symbolTable: Symbol[],
  newCode: string,
  language: string,
  strictMode: boolean
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Build lookup maps for fast access
  const functionMap = new Map<string, Symbol>();
  const classMap = new Map<string, Symbol>();
  const methodMap = new Map<string, Symbol>();
  const variableMap = new Map<string, Symbol>();

  for (const sym of symbolTable) {
    if (sym.type === "function") functionMap.set(sym.name, sym);
    else if (sym.type === "class") classMap.set(sym.name, sym);
    else if (sym.type === "method") methodMap.set(sym.name, sym);
    else if (sym.type === "variable") variableMap.set(sym.name, sym);
  }

  // Also extract symbols defined in the new code itself
  const newCodeSymbols = extractSymbolsFromFile(newCode, "newCode", language);
  for (const sym of newCodeSymbols) {
    if (sym.type === "function") functionMap.set(sym.name, sym);
    else if (sym.type === "class") classMap.set(sym.name, sym);
    else if (sym.type === "method") methodMap.set(sym.name, sym);
    else if (sym.type === "variable") variableMap.set(sym.name, sym);
  }

  for (const used of usedSymbols) {
    if (used.type === "call") {
      // Check if function exists
      const func = functionMap.get(used.name);
      const cls = classMap.get(used.name); // Could be class instantiation without 'new'

      if (!func && !cls) {
        // Check if it might be a method being called on an implicit object
        const method = methodMap.get(used.name);
        if (!method) {
          // Before flagging, check if this looks like a NEW function being created
          // Pattern: if the code contains "function X" or "const X = " where X is the called name
          // then it's likely the AI is creating this function, not hallucinating
          const isBeingDefined =
            newCode.includes(`function ${used.name}`) ||
            newCode.includes(`const ${used.name} =`) ||
            newCode.includes(`let ${used.name} =`) ||
            newCode.includes(`def ${used.name}(`) ||
            newCode.includes(`class ${used.name}`);

          if (isBeingDefined) {
            // Skip - this is new code being created, not a hallucination
            continue;
          }

          issues.push({
            type: "nonExistentFunction",
            severity: "critical",
            message: `Function '${used.name}' does not exist in project`,
            line: used.line,
            code: used.code,
            suggestion: suggestSimilar(
              used.name,
              Array.from(functionMap.keys())
            ),
          });
        }
      } else if (
        func &&
        used.argCount !== undefined &&
        func.params !== undefined
      ) {
        // Check parameter count
        if (used.argCount !== func.params && strictMode) {
          issues.push({
            type: "wrongParamCount",
            severity: "high",
            message: `Function '${used.name}' expects ${func.params} args, got ${used.argCount}`,
            line: used.line,
            code: used.code,
            suggestion: `Check the function signature in ${func.file}`,
          });
        }
      }
    } else if (used.type === "methodCall") {
      // For method calls, we need to be VERY careful about false positives
      // Without full type inference, we can only flag obvious issues

      // SKIP validation for method calls in non-strict mode
      // Reason: We can't know if `user.getFullName()` is valid without knowing user's type
      // This is a conscious trade-off: fewer false positives > catching all hallucinations
      if (!strictMode) {
        continue;
      }

      // In strict mode, only flag if:
      // 1. The object is a known class AND
      // 2. We can verify the class doesn't have this method
      const method = methodMap.get(used.name);
      const func = functionMap.get(used.name);

      if (!method && !func) {
        // Only flag if object is a known class (not just any variable)
        const objClass = classMap.get(used.object!);

        if (objClass) {
          // Object is a known class - this MIGHT be a hallucination
          // But we still can't be 100% sure without full type analysis
          issues.push({
            type: "nonExistentMethod",
            severity: "medium", // Downgraded from high - we're not certain
            message: `Method '${used.name}' not found on '${used.object}' (verify manually)`,
            line: used.line,
            code: used.code,
            suggestion: suggestSimilar(used.name, Array.from(methodMap.keys())),
          });
        }
      }
    } else if (used.type === "instantiation") {
      // Check if class exists
      if (!classMap.has(used.name)) {
        // Check if this class is being defined in the new code
        const isBeingDefined =
          newCode.includes(`class ${used.name}`) ||
          newCode.includes(`interface ${used.name}`) ||
          newCode.includes(`type ${used.name}`);

        if (isBeingDefined) {
          // Skip - this is new code being created
          continue;
        }

        issues.push({
          type: "nonExistentClass",
          severity: "critical",
          message: `Class '${used.name}' does not exist in project`,
          line: used.line,
          code: used.code,
          suggestion: suggestSimilar(used.name, Array.from(classMap.keys())),
        });
      }
    }
  }

  return issues;
}

/**
 * Suggest similar symbol names
 */
function suggestSimilar(target: string, available: string[]): string {
  const similar = available
    .filter((name) => {
      const t = target.toLowerCase();
      const n = name.toLowerCase();
      return n.includes(t) || t.includes(n) || levenshteinDistance(t, n) <= 3;
    })
    .slice(0, 3);

  if (similar.length > 0) {
    return `Did you mean: ${similar.join(", ")}?`;
  }
  return "No similar symbols found. This may be a hallucination.";
}

/**
 * Simple Levenshtein distance for fuzzy matching
 */
function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Check if name is a built-in
 */
function isBuiltIn(name: string, language: string): boolean {
  const builtIns: Record<string, Set<string>> = {
    javascript: new Set([
      "console",
      "Math",
      "JSON",
      "Object",
      "Array",
      "String",
      "Number",
      "Boolean",
      "Date",
      "Promise",
      "Map",
      "Set",
      "Error",
      "RegExp",
      "parseInt",
      "parseFloat",
      "setTimeout",
      "setInterval",
      "clearTimeout",
      "clearInterval",
      "fetch",
      "document",
      "window",
      "process",
      "require",
      "module",
      "exports",
      "Buffer",
      "global",
      "__dirname",
      "__filename",
      // Common methods
      "log",
      "error",
      "warn",
      "info",
      "stringify",
      "parse",
      "floor",
      "ceil",
      "round",
      "random",
      "max",
      "min",
      "abs",
      "push",
      "pop",
      "map",
      "filter",
      "reduce",
      "forEach",
      "find",
      "includes",
      "slice",
      "splice",
      "join",
      "split",
      "then",
      "catch",
      "finally",
      "resolve",
      "reject",
      "all",
      "race",
    ]),
    typescript: new Set([
      "console",
      "Math",
      "JSON",
      "Object",
      "Array",
      "String",
      "Number",
      "Boolean",
      "Date",
      "Promise",
      "Map",
      "Set",
      "Error",
      "RegExp",
      "parseInt",
      "parseFloat",
      "setTimeout",
      "setInterval",
      "clearTimeout",
      "clearInterval",
      "fetch",
      "document",
      "window",
      "process",
      "require",
      "module",
      "exports",
      "Buffer",
      "global",
      "__dirname",
      "__filename",
      "log",
      "error",
      "warn",
      "info",
      "stringify",
      "parse",
      "floor",
      "ceil",
      "round",
      "random",
      "max",
      "min",
      "abs",
      "push",
      "pop",
      "map",
      "filter",
      "reduce",
      "forEach",
      "find",
      "includes",
      "slice",
      "splice",
      "join",
      "split",
      "then",
      "catch",
      "finally",
      "resolve",
      "reject",
      "all",
      "race",
    ]),
    python: new Set([
      "print",
      "len",
      "range",
      "str",
      "int",
      "float",
      "list",
      "dict",
      "set",
      "tuple",
      "bool",
      "type",
      "isinstance",
      "hasattr",
      "getattr",
      "setattr",
      "open",
      "input",
      "sum",
      "min",
      "max",
      "sorted",
      "reversed",
      "enumerate",
      "zip",
      "map",
      "filter",
      "any",
      "all",
      "abs",
      "round",
      "pow",
      "divmod",
      "super",
      "property",
      "staticmethod",
      "classmethod",
      "Exception",
      "ValueError",
      "TypeError",
      "KeyError",
      "IndexError",
      "AttributeError",
      "ImportError",
      "self",
      "cls",
      "None",
      "True",
      "False",
    ]),
    go: new Set([
      "make",
      "len",
      "cap",
      "append",
      "copy",
      "delete",
      "print",
      "println",
      "panic",
      "recover",
      "new",
      "close",
      "complex",
      "real",
      "imag",
      "fmt",
      "os",
      "io",
      "strings",
      "strconv",
      "time",
      "context",
      "errors",
    ]),
  };

  return builtIns[language]?.has(name) || false;
}

/**
 * Check if name is a language keyword
 */
function isKeyword(name: string, language: string): boolean {
  const keywords: Record<string, Set<string>> = {
    javascript: new Set([
      "if",
      "else",
      "for",
      "while",
      "do",
      "switch",
      "case",
      "break",
      "continue",
      "return",
      "function",
      "const",
      "let",
      "var",
      "class",
      "new",
      "this",
      "typeof",
      "instanceof",
      "try",
      "catch",
      "finally",
      "throw",
      "async",
      "await",
      "import",
      "export",
      "default",
      "from",
      "as",
      "of",
      "in",
      "delete",
      "void",
    ]),
    typescript: new Set([
      "if",
      "else",
      "for",
      "while",
      "do",
      "switch",
      "case",
      "break",
      "continue",
      "return",
      "function",
      "const",
      "let",
      "var",
      "class",
      "new",
      "this",
      "typeof",
      "instanceof",
      "try",
      "catch",
      "finally",
      "throw",
      "async",
      "await",
      "import",
      "export",
      "default",
      "from",
      "as",
      "of",
      "in",
      "delete",
      "void",
      "interface",
      "type",
      "enum",
      "implements",
      "extends",
      "public",
      "private",
      "protected",
      "readonly",
      "abstract",
      "static",
      "override",
    ]),
    python: new Set([
      "if",
      "elif",
      "else",
      "for",
      "while",
      "break",
      "continue",
      "return",
      "def",
      "class",
      "import",
      "from",
      "as",
      "try",
      "except",
      "finally",
      "raise",
      "with",
      "lambda",
      "yield",
      "global",
      "nonlocal",
      "pass",
      "assert",
      "del",
      "in",
      "is",
      "not",
      "and",
      "or",
      "async",
      "await",
    ]),
    go: new Set([
      "if",
      "else",
      "for",
      "switch",
      "case",
      "break",
      "continue",
      "return",
      "func",
      "type",
      "struct",
      "interface",
      "map",
      "chan",
      "go",
      "defer",
      "select",
      "range",
      "var",
      "const",
      "package",
      "import",
      "fallthrough",
    ]),
  };

  return keywords[language]?.has(name) || false;
}

/**
 * Detect dead code - unused exports and orphaned files
 */
function detectDeadCode(
  context: ProjectContext,
  newCode?: string
): DeadCodeIssue[] {
  const issues: DeadCodeIssue[] = [];

  // Find unused exports
  for (const [filePath, fileInfo] of context.files) {
    // Skip test files, config files, and entry points
    if (fileInfo.isTest || fileInfo.isConfig || fileInfo.isEntryPoint) {
      continue;
    }

    // Check if file is imported by anything
    const importers = context.reverseImportGraph.get(filePath) || [];

    // Check each export
    for (const exp of fileInfo.exports) {
      if (!exp.isDefault && importers.length === 0) {
        issues.push({
          type: "unusedExport",
          severity: "medium",
          name: exp.name,
          file: fileInfo.relativePath,
          message: `Export '${exp.name}' is never imported by any file`,
        });
      }
    }
  }

  // Find orphaned files (nothing imports them, but they have exports)
  for (const [filePath, fileInfo] of context.files) {
    if (fileInfo.isTest || fileInfo.isConfig || fileInfo.isEntryPoint) {
      continue;
    }

    const importers = context.reverseImportGraph.get(filePath) || [];

    // File has exports but nothing imports it
    if (importers.length === 0 && fileInfo.exports.length > 0) {
      // Don't double-report if we already flagged individual exports
      const alreadyFlagged = issues.some(
        (i) => i.file === fileInfo.relativePath
      );
      if (!alreadyFlagged) {
        issues.push({
          type: "orphanedFile",
          severity: "low",
          name: fileInfo.relativePath,
          file: fileInfo.relativePath,
          message: `File has exports but is never imported`,
        });
      }
    }
  }

  // If new code provided, check for unused functions within it
  if (newCode) {
    const definedFunctions = new Set<string>();
    const calledFunctions = new Set<string>();

    // Find function definitions
    const defPatterns = [
      /function\s+(\w+)\s*\(/g,
      /(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(/g,
      /def\s+(\w+)\s*\(/g,
    ];

    for (const pattern of defPatterns) {
      let match;
      while ((match = pattern.exec(newCode)) !== null) {
        definedFunctions.add(match[1]);
      }
    }

    // Find function calls
    const callPattern = /(?:^|[^\w.])(\w+)\s*\(/g;
    let match;
    while ((match = callPattern.exec(newCode)) !== null) {
      calledFunctions.add(match[1]);
    }

    // Find functions defined but never called
    for (const func of definedFunctions) {
      if (!calledFunctions.has(func)) {
        issues.push({
          type: "unusedFunction",
          severity: "medium",
          name: func,
          file: "(new code)",
          message: `Function '${func}' is defined but never called in this code`,
        });
      }
    }
  }

  // Limit results to avoid noise
  return issues.slice(0, 20);
}

/**
 * Calculate validation score (0-100, higher is better)
 */
function calculateScore(
  issues: ValidationIssue[],
  deadCode: DeadCodeIssue[] = []
): number {
  if (issues.length === 0 && deadCode.length === 0) return 100;

  const weights = { critical: 25, high: 15, medium: 8, low: 3 };
  let deductions = 0;

  for (const issue of issues) {
    deductions += weights[issue.severity] || 5;
  }

  // Dead code is less severe
  for (const dc of deadCode) {
    deductions += dc.severity === "medium" ? 5 : 2;
  }

  return Math.max(0, 100 - deductions);
}

/**
 * Generate recommendation based on validation results
 */
function generateRecommendation(
  score: number,
  issues: ValidationIssue[],
  deadCode: DeadCodeIssue[] = []
) {
  const critical = issues.filter((i) => i.severity === "critical");
  const high = issues.filter((i) => i.severity === "high");

  if (critical.length > 0) {
    return {
      verdict: "REJECT",
      riskLevel: "critical",
      message: `❌ DO NOT USE - ${critical.length} hallucination(s): references to non-existent code`,
      action: "Fix all critical issues before using this code",
    };
  }

  if (high.length > 2) {
    return {
      verdict: "REVIEW",
      riskLevel: "high",
      message: `⚠️ HIGH RISK - ${issues.length} hallucination(s) found`,
      action: "Manually verify each flagged symbol exists in your codebase",
    };
  }

  if (issues.length > 0) {
    return {
      verdict: "CAUTION",
      riskLevel: "medium",
      message: `⚡ ${issues.length} potential hallucination(s) detected`,
      action: "Verify flagged symbols exist in your codebase",
    };
  }

  if (deadCode.length > 0) {
    return {
      verdict: "CLEAN_UP",
      riskLevel: "low",
      message: `🧹 ${deadCode.length} dead code issue(s) - unused exports/files`,
      action: "Consider removing unused code to reduce maintenance burden",
    };
  }

  return {
    verdict: "ACCEPT",
    riskLevel: "low",
    message: "✅ LOOKS GOOD - No hallucinations or dead code detected",
    action: "Code appears consistent with your project",
  };
}

function formatResponse(data: any) {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };
}
