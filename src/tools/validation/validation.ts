/**
 * Core Validation Logic Module
 *
 * This module contains the core validation algorithms for detecting hallucinations
 * and validating symbols against the project context.
 *
 * Responsibilities:
 * - Validate that imported packages exist in manifest files
 * - Validate that used symbols exist in the project symbol table
 * - Check parameter counts for function calls
 * - Calculate confidence scores for validation issues
 * - Generate reasoning explanations for each issue
 * - Build symbol lookup tables from project context
 * - Handle strict mode vs. non-strict mode validation
 *
 * @format
 */

import type { ProjectContext } from "../../context/projectContext.js";
import type {
  ValidationIssue,
  ProjectSymbol,
  ManifestDependencies,
  ASTUsage,
  ASTImport,
  ASTTypeReference,
} from "./types.js";
import { resolveImport } from "../../context/projectContext.js";
import { extractSymbolsAST } from "./extractors/index.js";
import { suggestSimilar, extractSimilarSymbols } from "./scoring.js";
import { isPythonSymbolExported } from "./manifest.js";
import {
  isJSBuiltin,
  isPythonBuiltin,
  isTSBuiltinType,
  isPythonBuiltinType,
  NODE_BUILTIN_MODULES,
} from "./builtins.js";
import { logger } from "../../utils/logger.js";
import { usagePatternAnalyzer } from "../../analyzers/usagePatterns.js";
import {
  isContextuallyValid,
  getContextualReason,
} from "./contextualNaming.js";
import { checkPackageRegistry } from "./registry.js";

// ============================================================================
// Manifest Validation (Tier 0)
// ============================================================================

/**
 * Validate that all imported packages exist in manifest files.
 * Checks package.json for JavaScript/TypeScript and requirements.txt/pyproject.toml for Python.
 *
 * @param imports - Array of import statements extracted from code
 * @param manifest - Manifest dependencies loaded from package files
 * @param newCode - The source code being validated (for extracting line content)
 * @param language - Programming language (default: typescript)
 * @returns Array of validation issues for missing dependencies
 */
export async function validateManifest(
  imports: ASTImport[],
  manifest: ManifestDependencies,
  newCode: string,
  language: string = "typescript",
  filePath: string = "",
): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];

  for (const imp of imports) {
    if (!imp.isExternal) continue;

    // Get the base package name (e.g., @tanstack/react-query -> @tanstack/react-query)
    const pkgName = getPackageName(imp.module);

    // Skip Node.js built-ins
    // Also skip "bun", "deno", etc. if we supported them, but node: is standard
    if (imp.module.startsWith("node:") || NODE_BUILTIN_MODULES.has(pkgName)) {
      continue;
    }

    // Check if package is in manifest
    if (!manifest.all.has(pkgName)) {
      // Also check scoped packages
      const scopedName =
        imp.module.startsWith("@") ?
          imp.module.split("/").slice(0, 2).join("/")
        : pkgName;

      if (!manifest.all.has(scopedName)) {
        // Vibe Check: Is this a missing dependency or a hallucination?
        const existsInRegistry = await checkPackageRegistry(pkgName, language);

        if (existsInRegistry) {
          // It's a real package, just missing from package.json
          // Vibe-Centric Severity: Low / Missing Dependency
          issues.push({
            type: "missingDependency", // New type preferred, fallback to dependencyHallucination handled downstream if needed
            severity: "low",
            message: `Package '${pkgName}' is not installed (but exists on registry)`,
            line: imp.line,
            file: filePath,
            code: getLineFromCode(newCode, imp.line),
            suggestion: `Run: npm install ${pkgName} (or add to requirements.txt)`,
            confidence: 100,
            reasoning: `Package not found in manifest, but verified to exist on ${language} registry. Safe to install.`,
          });
        } else {
          // It's NOT a real package - Critical Hallucination
          issues.push({
            type: "dependencyHallucination",
            severity: "critical",
            message: `Package '${imp.module}' does not exist on ${language} registry`,
            line: imp.line,
            file: filePath,
            code: getLineFromCode(newCode, imp.line),
            suggestion: `Did you mean: ${suggestSimilar(pkgName, Array.from(manifest.all)) || "unknown"}?`,
            confidence: 99,
            reasoning: `Package not found in manifest AND lookup failed on registry. This is likely a hallucination.`,
          });
        }
      }
    }
  }

  return issues;
}

/**
 * Extract package name from import path.
 * Handles scoped packages correctly.
 *
 * @param importPath - The import path (e.g., '@scope/package/path' or 'package/path')
 * @returns The base package name
 */
function getPackageName(importPath: string): string {
  // Handle scoped packages: @scope/package/path -> @scope/package
  if (importPath.startsWith("@")) {
    const parts = importPath.split("/");
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : importPath;
  }
  // Regular packages: package/path -> package
  return importPath.split("/")[0];
}

/**
 * Extract a specific line from code by line number.
 *
 * @param code - The source code
 * @param lineNum - Line number (1-indexed)
 * @returns The trimmed line content
 */
export function getLineFromCode(code: string, lineNum: number): string {
  const lines = code.split("\n");
  return lines[lineNum - 1]?.trim() || "";
}

// ============================================================================
// Symbol Table Building
// ============================================================================

/**
 * Build a symbol table from project context for validation.
 * Converts the project context symbol index into a flat array of ProjectSymbol objects.
 *
 * @param context - The project context containing all symbols
 * @param relevantSymbols - Optional list of symbol names to include (for smart context filtering)
 * @returns Array of project symbols for validation
 */
export function buildSymbolTable(
  context: ProjectContext,
  relevantSymbols?: string[],
): ProjectSymbol[] {
  const symbols: ProjectSymbol[] = [];
  const relevantSet = relevantSymbols ? new Set(relevantSymbols) : null;

  for (const [name, definitions] of context.symbolIndex) {
    // If smart context is enabled, only include relevant symbols
    if (relevantSet && !relevantSet.has(name)) {
      continue;
    }

    for (const def of definitions) {
      symbols.push({
        name,
        type: mapSymbolKind(def.symbol.kind),
        file: def.file,
        line: def.symbol.line,
        params: def.symbol.params?.map((p) => p.name),
        paramCount: def.symbol.params?.length,
      });
    }
  }

  return symbols;
}

/**
 * Map symbol kind from project context to ProjectSymbol type.
 *
 * @param kind - The symbol kind from project context
 * @returns The mapped ProjectSymbol type
 */
function mapSymbolKind(kind: string): ProjectSymbol["type"] {
  switch (kind) {
    case "function":
    case "hook":
      return "function";
    case "class":
    case "component":
      return "class";
    case "interface":
    case "type":
    case "enum":
    case "variable":
    case "route":
      return "variable";
    default:
      return "method";
  }
}

// ============================================================================
// Confidence Scoring and Reasoning
// ============================================================================

/**
 * Calculate confidence score for a validation issue.
 * Based on multiple factors: similarity to existing symbols, context, etc.
 *
 * @param options - Configuration for confidence calculation
 * @returns Object containing confidence score (0-100) and reasoning explanation
 */
export function calculateConfidence(options: {
  issueType: ValidationIssue["type"];
  symbolName: string;
  similarSymbols: string[];
  existsInProject: boolean;
  strictMode: boolean;
}): { confidence: number; reasoning: string } {
  const { issueType, symbolName, similarSymbols, existsInProject, strictMode } =
    options;

  let confidence = 0;
  let reasoning = "";

  switch (issueType) {
    case "nonExistentFunction":
    case "nonExistentClass":
      if (existsInProject && strictMode) {
        // Symbol exists but not imported
        confidence = 90;
        reasoning = `Symbol '${symbolName}' found in project but not imported. High confidence this is a missing import.`;
      } else if (similarSymbols.length === 0) {
        // No similar symbols at all
        confidence = 95;
        reasoning = `Searched entire project, found no symbol named '${symbolName}' or similar. Very high confidence this is a hallucination.`;
      } else if (similarSymbols.length === 1) {
        // One very similar symbol (likely typo)
        confidence = 92;
        reasoning = `Found very similar symbol: ${similarSymbols[0]}. High confidence this is a typo.`;
      } else {
        // Multiple similar symbols
        confidence = 85;
        reasoning = `Found ${similarSymbols.length} similar symbols. Likely a typo or wrong function name.`;
      }
      break;

    case "dependencyHallucination":
      confidence = 95;
      reasoning = `Package not found in manifest. This will cause import errors at runtime.`;
      break;

    case "wrongParamCount":
      confidence = 88;
      reasoning = `Parameter count mismatch detected via AST analysis. High confidence this will cause runtime errors.`;
      break;

    case "nonExistentMethod":
      confidence = 70;
      reasoning = `Method not found on object. Medium confidence - may be dynamic or inherited.`;
      break;

    case "nonExistentImport":
      confidence = 93;
      reasoning = `Imported symbol not found in target module. High confidence this will fail at runtime.`;
      break;

    case "undefinedVariable":
      confidence = 90;
      reasoning = `Variable '${symbolName}' is used but not defined or imported. High confidence this is a hallucination.`;
      break;

    case "unusedImport":
      confidence = 98;
      reasoning = `Imported symbol '${symbolName}' is never used in the code. Very high confidence.`;
      break;

    default:
      confidence = 75;
      reasoning = `Issue detected via static analysis.`;
  }

  return { confidence, reasoning };
}

// ============================================================================
// Symbol Validation (Tier 1)
// ============================================================================

/**
 * Validate that all used symbols exist in the project symbol table.
 * Performs comprehensive validation including:
 * - Function calls
 * - Method calls
 * - Class instantiations
 * - Parameter count checking
 * - Import validation
 * - Python __all__ export validation
 *
 * @param usedSymbols - Array of symbol usages extracted from code
 * @param symbolTable - Array of project symbols for validation
 * @param newCode - The source code being validated
 * @param language - Programming language ('python', 'javascript', 'typescript')
 * @param strictMode - If true, requires explicit imports for all symbols
 * @param imports - Array of import statements (for internal import validation)
 * @param pythonExports - Map of Python module exports (for __all__ validation)
 * @param typeReferences - Optional array of type references (for unused import detection)
 * @returns Array of validation issues
 */
export function validateSymbols(
  usedSymbols: ASTUsage[],
  symbolTable: ProjectSymbol[],
  newCode: string,
  language: string,
  strictMode: boolean,
  imports: ASTImport[] = [],
  pythonExports: Map<string, Set<string>> = new Map(),
  context: ProjectContext | null = null, // Added context
  filePath: string = "", // Added file path
  missingPackages: Set<string> = new Set(), // Added missing packages for smart validation
  typeReferences: ASTTypeReference[] = [], // Added type references
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Build lookup maps for PROJECT symbols
  // Use arrays to handle multiple symbols with same name (different scopes)
  const projectFunctions = new Map<string, ProjectSymbol[]>();
  const projectClasses = new Map<string, ProjectSymbol>();
  const projectMethods = new Map<string, ProjectSymbol[]>();
  const projectVariables = new Map<string, ProjectSymbol>(); // includes interfaces, types, enums

  for (const sym of symbolTable) {
    if (sym.type === "function") {
      const existing = projectFunctions.get(sym.name) || [];
      existing.push(sym);
      projectFunctions.set(sym.name, existing);
    } else if (sym.type === "class") {
      projectClasses.set(sym.name, sym);
    } else if (sym.type === "method") {
      const existing = projectMethods.get(sym.name) || [];
      existing.push(sym);
      projectMethods.set(sym.name, existing);
    } else if (sym.type === "variable") {
      projectVariables.set(sym.name, sym);
    }
  }

  // Build lookup maps for VALID symbols
  const validFunctions = new Map<string, ProjectSymbol>();
  const validClasses = new Map<string, ProjectSymbol>();
  const validMethods = new Map<string, ProjectSymbol>();
  const validVariables = new Map<string, ProjectSymbol>();

  // Helper to get first matching symbol by scope
  const getMatchingSymbol = (symbols: ProjectSymbol[] | undefined, objectName?: string): ProjectSymbol | undefined => {
    if (!symbols || symbols.length === 0) return undefined;
    if (symbols.length === 1) {
      // Single symbol - check if scope matches (if it has one)
      const sym = symbols[0];
      if (!sym.scope || !objectName || sym.scope === objectName) {
        return sym;
      }
      return undefined;
    }
    // Multiple symbols - find one with matching scope, or one without scope (general method)
    for (const sym of symbols) {
      if (sym.scope === objectName) return sym; // Exact scope match
      if (!sym.scope) return sym; // General method (no scope)
    }
    return undefined;
  };

  // In non-strict mode: all project symbols are valid (backwards compatible)
  if (!strictMode) {
    for (const [name, syms] of projectFunctions) {
      validFunctions.set(name, syms[0]); // Use first function as representative
    }
    for (const [name, sym] of projectClasses) validClasses.set(name, sym);
    for (const [name, syms] of projectMethods) {
      validMethods.set(name, syms[0]); // Use first method as representative
    }
    for (const [name, sym] of projectVariables) validVariables.set(name, sym);
  }

  // Tier 1: Add symbols defined in the new code itself (including parameters, destructured variables)
  // These MUST TAKE PRECEDENCE over project symbols to avoid false positives on local scope
  const newCodeSymbols = extractSymbolsAST(newCode, "(new code)", language, {
    includeParameterSymbols: true,
  });
  for (const sym of newCodeSymbols) {
    const projectSym = {
      name: sym.name,
      type:
        sym.type === "interface" || sym.type === "type" ?
          ("variable" as const)
        : (sym.type as any),
      file: "(new code)",
      params: sym.params,
      paramCount: sym.paramCount,
    };

    switch (sym.type) {
      case "function":
        validFunctions.set(sym.name, projectSym);
        break;
      case "class":
        validClasses.set(sym.name, projectSym);
        break;
      case "method":
        validMethods.set(sym.name, projectSym);
        break;
      case "variable":
      case "interface":
      case "type":
        validVariables.set(sym.name, projectSym);
        // Variables can be called if they hold functions (e.g., destructured from hooks or params)
        validFunctions.set(sym.name, projectSym);
        break;
    }
  }

  // Tier 2: Add imported symbols (both internal and external)
  for (const imp of imports) {
    if (!imp.isExternal) {
      // Internal imports: Validate against project symbol table AND precise module resolution

      // Attempt module resolution if context is available AND we have a real file path
      // Skip resolution for empty filePath (code snippets without known location)
      let resolvedFile: string | null = null;
      if (context && filePath && filePath.trim()) {
        resolvedFile = resolveImport(
          imp.module,
          filePath,
          Array.from(context.files.keys()),
        );
      }

      for (const name of imp.names) {
        // If we resolved the file, check its exports directly (Robust Check)
        if (resolvedFile && context) {
          const fileInfo = context.files.get(resolvedFile);
          if (fileInfo) {
            // Check exact exports
            const exports = fileInfo.exports;
            const hasExport = exports.some(
              (e) =>
                e.name === name.imported ||
                (name.imported === "default" && e.isDefault),
            );

            if (!hasExport) {
              // Double check against all symbols in file marked as exported
              // (sometimes exports are implicit in simple extractors)
              // Note: SymbolInfo does not have 'isDefault', so we assume default export matches default logic elsewhere
              const symExport = fileInfo.symbols.find(
                (s) => s.exported && s.name === name.imported,
              );

              if (!symExport) {
                // This is a TRUE hallucination - module exists, but export doesn't
                const allExports = exports
                  .map((e) => e.name)
                  .concat(
                    fileInfo.symbols
                      .filter((s) => s.exported)
                      .map((s) => s.name),
                  );
                const suggestion = suggestSimilar(name.imported, allExports);

                issues.push({
                  type: "nonExistentImport",
                  severity: "critical",
                  message: `Module '${imp.module}' exists but has no export named '${name.imported}'`,
                  line: imp.line,
                  file: filePath,
                  code: getLineFromCode(newCode, imp.line),
                  suggestion,
                  confidence: 99,
                  reasoning: `Resolved module to ${resolvedFile}, but it does not export '${name.imported}'.`,
                });
                continue; // Skip further checks for this symbol
              }
            }

            // If we found the export, map it to valid symbols
            // We need to find the symbol in projectFunctions etc. to add it to 'valid' maps
            // But if we can't find it in the global map (e.g. default export unnamed),
            // we still mark the LOCAL name as valid because we verified the export exists.

            // Construct a synthetic valid symbol if not found in global map
            const validSym: ProjectSymbol = {
              name: name.local,
              type: "variable", // fallback
              file: resolvedFile,
            };

            validVariables.set(name.local, validSym);
            validFunctions.set(name.local, { ...validSym, type: "function" });
            validClasses.set(name.local, { ...validSym, type: "class" });

            // Also try to find real symbol for better type info
            const funcSyms = projectFunctions.get(name.imported);
            const realSym =
              (funcSyms && funcSyms[0]) ||
              projectClasses.get(name.imported) ||
              projectVariables.get(name.imported);

            if (realSym) {
              if (realSym.type === "function")
                validFunctions.set(name.local, realSym);
              else if (realSym.type === "class")
                validClasses.set(name.local, realSym);
              else validVariables.set(name.local, realSym);
            }

            continue; // Successfully validated
          }
        }

        // If it was a relative import and we couldn't resolve the file, THAT IS A HALLUCINATION
        // We should NOT fall back to global lookup for relative imports if context is available
        // BUT: Only enforce this if we have a real file path (not empty/scratchpad)
        if (
          context &&
          filePath &&
          filePath.trim() &&
          imp.module.startsWith(".")
        ) {
          if (!resolvedFile) {
            issues.push({
              type: "nonExistentImport",
              severity: "critical",
              message: `Module '${imp.module}' found in import does not exist`,
              line: imp.line,
              file: filePath,
              code: getLineFromCode(newCode, imp.line),
              suggestion: "Check the relative file path",
              confidence: 99,
              reasoning: `Could not resolve relative import path '${imp.module}' from '${filePath}'. File does not exist.`,
            });
            continue;
          }
        }

        // FALLBACK: Old global lookup logic (only for non-relative or if context missing)
        const importedFuncSyms = projectFunctions.get(name.imported);
        const localFuncSyms = projectFunctions.get(name.local);
        const projectSym =
          (importedFuncSyms && importedFuncSyms[0]) ||
          (localFuncSyms && localFuncSyms[0]) ||
          projectClasses.get(name.imported) ||
          projectClasses.get(name.local) ||
          projectVariables.get(name.imported) ||
          projectVariables.get(name.local);

        // For Python, also check if the symbol is in __all__ of the module
        if (language === "python" && projectSym) {
          const modulePath = imp.module
            .replace(/^\.+/, "")
            .replace(/[/\\]/g, ".");

          if (
            !isPythonSymbolExported(modulePath, name.imported, pythonExports)
          ) {
            const { confidence, reasoning } = calculateConfidence({
              issueType: "nonExistentImport",
              symbolName: name.imported,
              similarSymbols: [],
              existsInProject: true,
              strictMode,
            });

            issues.push({
              type: "nonExistentImport",
              severity: "critical",
              message: `Symbol '${name.imported}' exists but is not exported in __all__ of '${imp.module}'`,
              line: imp.line,
              file: filePath,
              code: getLineFromCode(newCode, imp.line),
              suggestion: `Add '${name.imported}' to __all__ in ${imp.module}/__init__.py, or import directly from the submodule`,
              confidence,
              reasoning: `Symbol found in module but not in __all__ export list. ${reasoning}`,
            });
            continue;
          }
        }

        if (projectSym) {
          if (projectSym.type === "function")
            validFunctions.set(name.local, projectSym);
          else if (projectSym.type === "class")
            validClasses.set(name.local, projectSym);
          else if (projectSym.type === "variable")
            validVariables.set(name.local, projectSym);
        } else {
          // Symbol not found in project - this is a hallucinated import!
          const allNames = Array.from(projectFunctions.keys())
            .concat(Array.from(projectClasses.keys()))
            .concat(Array.from(projectVariables.keys()));

          const suggestion = suggestSimilar(name.imported, allNames);
          const similarSymbols = extractSimilarSymbols(suggestion);

          const { confidence, reasoning } = calculateConfidence({
            issueType: "nonExistentImport",
            symbolName: name.imported,
            similarSymbols,
            existsInProject: false,
            strictMode,
          });

          issues.push({
            type: "nonExistentImport",
            severity: "critical",
            message: `Imported symbol '${name.imported}' does not exist in module '${imp.module}'`,
            line: imp.line,
            file: filePath,
            code: getLineFromCode(newCode, imp.line),
            suggestion,
            confidence,
            reasoning,
          });
        }
      }
    } else {
      // External imports: Treat as valid (manifest check was done in Tier 0)
      for (const name of imp.names) {
        const extSym = {
          name: name.local,
          type: "variable" as const,
          file: imp.module,
        };
        // Add to all maps as we don't know the exact type of external symbols
        validVariables.set(name.local, extSym);
        validFunctions.set(name.local, { ...extSym, type: "function" });
        validClasses.set(name.local, { ...extSym, type: "class" });
      }
    }
  }

  // Validate each used symbol
  for (const used of usedSymbols) {
    if (used.type === "call") {
      const func = validFunctions.get(used.name);
      const cls = validClasses.get(used.name);
      const method = validMethods.get(used.name);

      if (!func && !cls && !method) {
        // Built-in check (Tier 1.5) - handles browser globals, standard libraries
        if (
          (language === "python" && isPythonBuiltin(used.name)) ||
          ((language === "javascript" || language === "typescript") &&
            isJSBuiltin(used.name))
        ) {
          continue;
        }

        // SMART TEST RELAXATION:
        // In test files, we assume unknown functions/variables are globals (describe, it, expect)
        // or mocks, unless strict mode is explicitly forced.
        if (isTestFile(filePath) && !strictMode) {
          continue;
        }

        const funcSyms = projectFunctions.get(used.name);
        const existsInProject =
          (funcSyms && funcSyms.length > 0) || projectClasses.has(used.name);

        let suggestion = "";
        if (existsInProject) {
          const sym =
            (funcSyms && funcSyms[0]) || projectClasses.get(used.name);
          if (sym) {
            // Calculate a descriptive suggestion including the file
            // Note: We'd ideally calculate a relative path here, but for now,
            // telling the user the file name is a huge win.
            suggestion = `Add: import { ${used.name} } from './${sym.file.replace(/\\/g, "/")}'`;
          } else {
            suggestion = `Add: import { ${used.name} } from '...'`;
          }
        } else {
          suggestion = suggestSimilar(
            used.name,
            Array.from(projectFunctions.keys()),
          );
        }

        const similarSymbols = extractSimilarSymbols(suggestion);
        const { confidence, reasoning } = calculateConfidence({
          issueType: "nonExistentFunction",
          symbolName: used.name,
          similarSymbols,
          existsInProject,
          strictMode,
        });

        issues.push({
          type: "nonExistentFunction",
          severity: "critical",
          message:
            existsInProject ?
              `Function '${used.name}' exists in your project but is not imported in this file`
            : `Function '${used.name}' does not exist in project`,
          line: used.line,
          file: filePath,
          code: used.code,
          suggestion,
          confidence,
          reasoning,
        });
      } else if (
        func &&
        used.argCount !== undefined &&
        func.paramCount !== undefined
      ) {
        if (used.argCount !== func.paramCount && strictMode) {
          const { confidence, reasoning } = calculateConfidence({
            issueType: "wrongParamCount",
            symbolName: used.name,
            similarSymbols: [],
            existsInProject: true,
            strictMode,
          });

          issues.push({
            type: "wrongParamCount",
            severity: "high",
            message: `Function '${used.name}' expects ${func.paramCount} args, got ${used.argCount}`,
            line: used.line,
            file: filePath,
            code: used.code,
            suggestion:
              func.params ?
                `Expected params: ${func.params.join(", ")}`
              : `Check the function signature in ${func.file}`,
            confidence,
            reasoning,
          });
        }
      }
    } else if (used.type === "methodCall") {
      // 0. Skip whitelisted objects and chains (e.g., 'this.*', 'window.*', 'z.*', 'smthRef.current.*')
      const rootObject = used.object?.split(".")[0]?.split("(")[0];

      // CRITICAL FIX: Skip ALL 'this' method calls - we can't validate class scope
      // The 'this' keyword is always in scope within a class/function context
      // TypeScript/ESLint handle class method validation, not CodeGuardian
      if (used.object === "this" || used.object?.startsWith("this.")) {
        continue; // Trust class scope - this is not a hallucination risk
      }

      // Skip other whitelisted global objects and common patterns
      if (
        used.object?.includes(".current") ||
        (rootObject &&
          [
            "window",
            "navigator",
            "document",
            "location",
            "history",
            "localStorage",
            "sessionStorage",
            "console",
            "process",
            "global",
            "globalThis",
            "Intl",
            "z",
            "t",
            "db",
            "prisma",
            "ctx",
            "supabase",
            "api",
            "client",
            "auth",
          ].includes(rootObject))
      ) {
        // Special Case: Still validate the method name itself if it's NOT a known builtin
        // This ensures we catch true hallucinations like toast.hallucinatedMethod()
        if (isJSBuiltin(used.name)) {
          continue;
        }
        // If the method is NOT whitelisted, we still proceed to check if it exists in the project
        // but we've already validated the object.
      }

      // 1. Check contextual naming patterns first (e.preventDefault(), req.body, etc.)
      if (isContextuallyValid(used)) {
        continue; // Trust the vibe - this is a standard pattern
      }

      // 2. Skip standard built-in methods (toString, map, etc.) to avoid false positives
      if (
        (language === "javascript" || language === "typescript") &&
        isJSBuiltin(used.name)
      ) {
        continue;
      }

      // SMART TEST RELAXATION:
      // Skip method checks in test files (mocks/spies often have magic methods)
      if (isTestFile(filePath) && !strictMode) {
        continue;
      }

      // 3. Check if the object itself exists
      const objExists =
        validClasses.has(rootObject!) ||
        validVariables.has(rootObject!) ||
        validFunctions.has(rootObject!) ||
        isJSBuiltin(rootObject!) ||
        // Always trust common short variable names in non-strict mode
        (!strictMode &&
          [
            "z",
            "t",
            "db",
            "prisma",
            "ctx",
            "req",
            "res",
            "e",
            "i",
            "req",
            "res",
          ].includes(rootObject!));

      // If the object doesn't exist at all, flag it as a hallucination
      if (!objExists) {
        // ... (existing undefinedVariable check) ...
        const suggestion = suggestSimilar(used.object!, [
          ...validClasses.keys(),
          ...validVariables.keys(),
          ...validFunctions.keys(),
        ]);
        const similarSymbols = extractSimilarSymbols(suggestion);
        const { confidence, reasoning } = calculateConfidence({
          issueType: "undefinedVariable",
          symbolName: used.object!,
          similarSymbols,
          existsInProject:
            projectClasses.has(used.object!) ||
            projectVariables.has(used.object!) ||
            projectFunctions.has(used.object!),
          strictMode,
        });

        issues.push({
          type: "undefinedVariable",
          severity: "critical",
          message: `Object '${used.object}' is not defined or imported (used in ${used.object}.${used.name}())`,
          line: used.line,
          file: filePath,
          code: used.code,
          suggestion,
          confidence,
          reasoning,
        });
        continue; // Skip method validation if object doesn't exist
      }

      // 3. Determine if we should check the method call itself
      // In strict mode, we check everything.
      // In auto mode, we check:
      //   - Imports from missing/hallucinated packages (we know the package is gone)
      //   - Internal imports where we have class/method information
      //   - Locally defined variables where the method is NOT a known builtin
      let shouldCheck = strictMode;

      if (!shouldCheck) {
        const imp = imports.find((i) =>
          i.names.some((n) => n.local === used.object),
        );
        if (imp) {
          if (missingPackages.has(imp.module)) {
            shouldCheck = true; // Hallucinated import - definitely flag usages!
          } else if (!imp.isExternal) {
            // For internal imports, only check if we have class/method/variable info
            // This prevents skipping validation for instances (const logger = new Logger())
            const objClass =
              validClasses.get(used.object!) ||
              validVariables.get(used.object!);
            if (objClass) {
              shouldCheck = true; // We have symbol info, so we can validate methods
            }
          }
        } else {
          // Objects not from imports (locally defined)
          // ONLY check if we have class info, otherwise we don't know the type enough to flag it
          const objClass = validClasses.get(used.object!) || validClasses.get(rootObject!);

          if (objClass && objClass.file !== "(new code)") {
            shouldCheck = true;
          }
        }
      }

      // console.log(`DEBUG: Method ${used.object}.${used.name} - shouldCheck: ${shouldCheck}`);
      if (!shouldCheck) continue;

      // Look up method by name, but also check if it has a matching scope
      // This handles object literal methods: const api = { method: () => {} }
      const methodSym = validMethods.get(used.name);
      const funcSym = validFunctions.get(used.name);
      
      // Check if method exists with matching scope (e.g., timeEntriesApi.getPending)
      // If the method has a scope, it must match the object name
      // If no scope, it's a general method (like class methods)
      const methodMatches = methodSym && (!methodSym.scope || methodSym.scope === used.object);
      const funcMatches = funcSym && (!funcSym.scope || funcSym.scope === used.object);

      if (!methodMatches && !funcMatches) {
        const objClass =
          validClasses.get(used.object!) || validVariables.get(used.object!);
        if (objClass) {
          // Build list of valid methods for this object type
          const objectMethods: string[] = [];
          for (const [name, sym] of validMethods) {
            // Include methods that either have no scope (general) or match the object
            if (!sym.scope || sym.scope === used.object) {
              objectMethods.push(name);
            }
          }
          
          const suggestion = suggestSimilar(used.name, objectMethods);
          const similarSymbols = extractSimilarSymbols(suggestion);
          const { confidence, reasoning } = calculateConfidence({
            issueType: "nonExistentMethod",
            symbolName: used.name,
            similarSymbols,
            existsInProject: false,
            strictMode,
          });

          issues.push({
            type: "nonExistentMethod",
            severity: "medium",
            message: `Method '${used.name}' not found on '${used.object}' (verify manually)`,
            line: used.line,
            file: filePath,
            code: used.code,
            suggestion,
            confidence,
            reasoning,
          });
        }
      }
    } else if (used.type === "instantiation") {
      if (!validClasses.has(used.name)) {
        // Built-in check (Tier 1.5)
        if (
          (language === "python" && isPythonBuiltin(used.name)) ||
          ((language === "javascript" || language === "typescript") &&
            isJSBuiltin(used.name))
        ) {
          continue;
        }

        // SMART TEST RELAXATION:
        if (isTestFile(filePath) && !strictMode) {
          continue;
        }

        const existsInProject = projectClasses.has(used.name);
        let suggestion = "";
        if (existsInProject) {
          const sym = projectClasses.get(used.name);
          if (sym) {
            suggestion = `Add: import { ${used.name} } from './${sym.file.replace(/\\/g, "/")}'`;
          } else {
            suggestion = `Add: import { ${used.name} } from '...'`;
          }
        } else {
          suggestion = suggestSimilar(
            used.name,
            Array.from(projectClasses.keys()),
          );
        }

        const similarSymbols = extractSimilarSymbols(suggestion);
        const { confidence, reasoning } = calculateConfidence({
          issueType: "nonExistentClass",
          symbolName: used.name,
          similarSymbols,
          existsInProject,
          strictMode,
        });

        issues.push({
          type: "nonExistentClass",
          severity: "critical",
          message:
            existsInProject ?
              `Class '${used.name}' exists in your project but is not imported in this file`
            : `Class '${used.name}' does not exist in project`,
          line: used.line,
          file: filePath,
          code: used.code,
          suggestion,
          confidence,
          reasoning,
        });
      }
    } else if (used.type === "reference") {
      // CRITICAL FIX: Skip property access on 'this' (e.g., this.ws, this.data)
      // These are class properties and should not be validated as standalone variables
      if (used.object === "this" || used.object?.startsWith("this.")) {
        continue; // Trust class scope - properties are validated by TypeScript
      }

      const func = validFunctions.get(used.name);
      const cls = validClasses.get(used.name);
      const variable = validVariables.get(used.name);

      if (!func && !cls && !variable) {
        // Built-in check (Tier 1.5)
        if (
          (language === "python" && isPythonBuiltin(used.name)) ||
          ((language === "javascript" || language === "typescript") &&
            (isJSBuiltin(used.name) ||
              [
                "this",
                "props",
                "state",
                "window",
                "navigator",
                "document",
                "location",
                "Intl",
                "JSON",
                "Math",
                "Date",
                "Array",
                "Object",
                "String",
                "Number",
                "Boolean",
                "Promise",
                "Error",
                "process",
                "global",
                "globalThis",
                "self",
              ].includes(used.name)))
        ) {
          continue;
        }

        // SMART TEST RELAXATION:
        if (isTestFile(filePath) && !strictMode) {
          continue;
        }

        const existsInProject =
          projectFunctions.has(used.name) ||
          projectClasses.has(used.name) ||
          projectVariables.has(used.name);

        let suggestion = "";
        if (existsInProject) {
          const funcSymsForRef = projectFunctions.get(used.name);
          const sym =
            (funcSymsForRef && funcSymsForRef[0]) ||
            projectClasses.get(used.name) ||
            projectVariables.get(used.name);
          if (sym) {
            suggestion = `Add: import { ${used.name} } from './${sym.file.replace(/\\/g, "/")}'`;
          } else {
            suggestion = `Add: import { ${used.name} } from '...'`;
          }
        } else {
          suggestion = suggestSimilar(used.name, [
            ...projectFunctions.keys(),
            ...projectClasses.keys(),
            ...projectVariables.keys(),
          ]);
        }

        const similarSymbols = extractSimilarSymbols(suggestion);
        const { confidence, reasoning } = calculateConfidence({
          issueType: "undefinedVariable",
          symbolName: used.name,
          similarSymbols,
          existsInProject,
          strictMode,
        });

        issues.push({
          type: "undefinedVariable",
          severity: "critical",
          message:
            existsInProject ?
              `Variable '${used.name}' exists in your project but is not imported in this file`
            : `Variable '${used.name}' is not defined or imported`,
          line: used.line,
          file: filePath,
          code: used.code,
          suggestion,
          confidence,
          reasoning,
        });
      }
    }
  }

  // Tier 3: Unused Import Detection
  const usedNames = new Set(usedSymbols.map((u) => u.name));
  // Also include object names from method calls (e.g., 'logger' in 'logger.info()')
  for (const used of usedSymbols) {
    if (used.type === "methodCall" && used.object) {
      usedNames.add(used.object);
    }
  }

  // Include type references (e.g., function(req: Request))
  for (const typeRef of typeReferences) {
    usedNames.add(typeRef.name);
  }

  for (const imp of imports) {
    for (const name of imp.names) {
      if (name.local === "*" || name.imported === "*") continue; // Skip wildcards
      if (name.imported.startsWith("React")) continue; // Skip React imports

      if (!usedNames.has(name.local)) {
        const { confidence, reasoning } = calculateConfidence({
          issueType: "unusedImport",
          symbolName: name.local,
          similarSymbols: [],
          existsInProject: true,
          strictMode,
        });

        issues.push({
          type: "unusedImport",
          severity: "warning",
          message: `Imported symbol '${name.local}' is never used`,
          line: imp.line,
          file: filePath,
          code: getLineFromCode(newCode, imp.line),
          suggestion: `Remove the unused import: ${name.local}`,
          confidence,
          reasoning,
        });
      }
    }
  }

  // Tier 3.5: Type-only import misuse detection
  // Check if something imported with "import type" is used as a value
  for (const imp of imports) {
    if (!imp.isTypeOnly) continue; // Only check type-only imports
    
    for (const name of imp.names) {
      // Check if this type-imported symbol is used as a value (not just in type positions)
      const usages = usedSymbols.filter(u => u.name === name.local);
      const typeUsages = typeReferences.filter(t => t.name === name.local);
      
      // If used in runtime contexts (call, instantiation, etc.) but imported as type
      const runtimeUsages = usages.filter(u => 
        u.type === "call" || 
        u.type === "instantiation" || 
        u.type === "methodCall"
      );
      
      if (runtimeUsages.length > 0) {
        issues.push({
          type: "typeOnlyImportMisuse",
          severity: "high",
          message: `'${name.local}' is imported as a type but used as a value at runtime`,
          line: runtimeUsages[0].line,
          file: filePath,
          code: getLineFromCode(newCode, runtimeUsages[0].line),
          suggestion: `Change to regular import: import { ${name.local} } from '${imp.module}'`,
          confidence: 95,
          reasoning: `Type-only imports are erased at compile time and cannot be used for runtime values like function calls or instantiation.`,
        });
      }
    }
  }

  return issues;
}

/**
 * Validate that usage of symbols follows established project patterns (Secret #5).
 * Detects "ritual" deviations such as missing co-occurring calls.
 *
 * @param usedSymbols - Symbols used in the new code
 * @param projectContext - Project context with symbol graph and patterns
 * @returns Array of pattern deviation issues
 */
export function validateUsagePatterns(
  usedSymbols: ASTUsage[],
  projectContext: ProjectContext,
  filePath: string = "",
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!projectContext.symbolGraph) return issues;

  // Initialize analyzer if not already done for this graph
  // (In a real system, patterns would be cached/pre-computed)
  // usagePatternAnalyzer.analyze(projectContext.symbolGraph);

  const usedNames = usedSymbols.map((u) => u.name);

  for (const used of usedSymbols) {
    if (used.type !== "call") continue;

    const deviations = usagePatternAnalyzer.checkDeviations(
      used.name,
      usedNames,
    );

    for (const msg of deviations) {
      issues.push({
        type: "architecturalDeviation",
        severity: "warning", // Patterns are suggestions, not necessarily hard errors
        message: msg,
        line: used.line,
        file: filePath || projectContext.projectPath, // Best effort for patterns
        code: used.code,
        suggestion: "Verify if this ritual call is required in your context.",
        confidence: 70,
        reasoning: `Learned from ${projectContext.totalFiles} files in your project that these symbols usually appear together.`,
      });
    }
  }

  return issues;
}

/**
 * Helper to identify test files.
 * Test files often contain "hallucinated" globals (describe, it, expect) and mocks.
 */
function isTestFile(filePath: string): boolean {
  if (!filePath) return false;
  const lower = filePath.toLowerCase();
  return (
    lower.includes(".test.") ||
    lower.includes(".spec.") ||
    lower.includes("/tests/") ||
    lower.includes("/__tests__/") ||
    lower.includes("/test-utils/")
  );
}
