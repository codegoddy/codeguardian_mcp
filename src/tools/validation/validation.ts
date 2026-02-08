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

import * as path from "path";
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
import { extractSymbolsAST, collectLocalDefinitionsAST } from "./extractors/index.js";
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

  // Phase 1: Collect all unknown packages that need registry lookup
  const unknownPackages: Array<{ imp: ASTImport; pkgName: string; scopedName: string }> = [];

  for (const imp of imports) {
    if (!imp.isExternal) continue;

    const pkgName = getPackageName(imp.module, language);

    // Skip Node.js built-ins
    if (imp.module.startsWith("node:") || NODE_BUILTIN_MODULES.has(pkgName)) {
      continue;
    }

    // Check if package is in manifest
    if (!manifest.all.has(pkgName)) {
      const scopedName =
        imp.module.startsWith("@") ?
          imp.module.split("/").slice(0, 2).join("/")
        : pkgName;

      if (!manifest.all.has(scopedName)) {
        unknownPackages.push({ imp, pkgName, scopedName });
      }
    }
  }

  if (unknownPackages.length === 0) return issues;

  // Phase 2: Batch registry lookups — deduplicate and check in parallel
  const uniquePkgNames = [...new Set(unknownPackages.map(u => u.pkgName))];
  const REGISTRY_BATCH_SIZE = 10;
  const registryResults = new Map<string, boolean>();

  for (let i = 0; i < uniquePkgNames.length; i += REGISTRY_BATCH_SIZE) {
    const batch = uniquePkgNames.slice(i, i + REGISTRY_BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (pkgName) => ({
        pkgName,
        exists: await checkPackageRegistry(pkgName, language),
      }))
    );
    for (const { pkgName, exists } of results) {
      registryResults.set(pkgName, exists);
    }
  }

  // Phase 3: Build issues from cached results
  for (const { imp, pkgName } of unknownPackages) {
    const existsInRegistry = registryResults.get(pkgName) ?? false;

    if (existsInRegistry) {
      const installCmd = language === "python"
        ? `Run: pip install ${pkgName} (or add to requirements.txt)`
        : `Run: npm install ${pkgName}`;
      issues.push({
        type: "missingDependency",
        severity: "low",
        message: `Package '${pkgName}' is not installed (but exists on registry)`,
        line: imp.line,
        file: filePath,
        code: getLineFromCode(newCode, imp.line),
        suggestion: installCmd,
        confidence: 100,
        reasoning: `Package not found in manifest, but verified to exist on ${language} registry. Safe to install.`,
      });
    } else {
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

  return issues;
}

/**
 * Extract package name from import path.
 * Handles scoped packages correctly and Python submodules.
 *
 * @param importPath - The import path (e.g., '@scope/package/path' or 'package/path' or 'package.submodule')
 * @param language - Programming language to determine submodule handling (optional)
 * @returns The base package name
 */
function getPackageName(importPath: string, language?: string): string {
  // Handle scoped packages: @scope/package/path -> @scope/package
  if (importPath.startsWith("@")) {
    const parts = importPath.split("/");
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : importPath;
  }
  
  // For Python, handle dot notation for submodules: package.submodule -> package
  // This is critical because Python uses dots for submodules (e.g., fastapi.middleware.cors)
  // while JavaScript/TypeScript uses slashes (e.g., package/submodule)
  if (language === "python") {
    return importPath.split(".")[0];
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

        // Python-specific: convert dot notation to path separators
        if (!resolvedFile && language === "python") {
          if (imp.module.startsWith(".")) {
            // Relative import: from ..models.deliverable import X
            // Count leading dots to determine how many directories to go up
            const dotMatch = imp.module.match(/^(\.+)/);
            const dotCount = dotMatch ? dotMatch[1].length : 0;
            const remainder = imp.module.slice(dotCount);
            // Go up (dotCount) directories from current file's package directory
            let baseDir = filePath.substring(0, filePath.lastIndexOf("/"));
            for (let i = 1; i < dotCount; i++) {
              baseDir = baseDir.substring(0, baseDir.lastIndexOf("/"));
            }
            if (remainder) {
              const modPath = remainder.replace(/\./g, "/");
              const pyFile = path.join(baseDir, `${modPath}.py`);
              const pyInit = path.join(baseDir, modPath, "__init__.py");
              if (context.files.has(pyFile)) {
                resolvedFile = pyFile;
              } else if (context.files.has(pyInit)) {
                resolvedFile = pyInit;
              }
            } else {
              // "from . import X" — resolve to current package's __init__.py
              const pyInit = path.join(baseDir, "__init__.py");
              if (context.files.has(pyInit)) {
                resolvedFile = pyInit;
              }
            }
          } else {
            // Absolute import: from app.core.config import X
            const modulePath = imp.module.replace(/\./g, "/");
            const basePath = context.projectPath;
            const pyFile = path.join(basePath, `${modulePath}.py`);
            const pyInit = path.join(basePath, modulePath, "__init__.py");
            if (context.files.has(pyFile)) {
              resolvedFile = pyFile;
            } else if (context.files.has(pyInit)) {
              resolvedFile = pyInit;
            }
          }
        }
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
              // For Python: ALL module-level names are importable (no export keyword)
              const symExport = fileInfo.symbols.find(
                (s) => (language === "python" || s.exported) && s.name === name.imported,
              );

              if (!symExport) {
                // For Python: check if the imported name is a sub-module file
                // e.g., "from app.api import auth" where app/api/auth.py exists
                if (language === "python" && context) {
                  const resolvedDir = resolvedFile.endsWith("__init__.py")
                    ? path.dirname(resolvedFile)
                    : path.dirname(resolvedFile);
                  const subModPy = path.join(resolvedDir, `${name.imported}.py`);
                  const subModInit = path.join(resolvedDir, name.imported, "__init__.py");
                  if (context.files.has(subModPy) || context.files.has(subModInit)) {
                    // Valid sub-module import
                    continue;
                  }
                }

                // For Python: check pythonExports (__all__) for the module
                if (language === "python") {
                  // Convert resolved file to module path for pythonExports lookup
                  const basePath = context?.projectPath || "";
                  const relPath = resolvedFile.startsWith(basePath)
                    ? resolvedFile.slice(basePath.length + 1)
                    : resolvedFile;
                  // Convert file path to Python module path: app/utils/git_providers/__init__.py -> app.utils.git_providers
                  const pyModPath = relPath
                    .replace(/__init__\.py$/, "")
                    .replace(/\.py$/, "")
                    .replace(/\//g, ".")
                    .replace(/\.$/, "");
                  const moduleAllExports = pythonExports.get(pyModPath);
                  if (moduleAllExports && moduleAllExports.has(name.imported)) {
                    continue; // Symbol is in __all__
                  }
                  if (!moduleAllExports) {
                    // No __all__ defined — all names are importable in Python
                    continue;
                  }
                  // __all__ exists but symbol not in it — still importable, just not in __all__
                  // Python allows importing any module-level name regardless of __all__
                  continue;
                }

                // This is a TRUE hallucination - module exists, but export doesn't
                const allExports = exports
                  .map((e) => e.name)
                  .concat(
                    fileInfo.symbols
                      .filter((s) => language === "python" || s.exported)
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
        // But skip this check if the imported name is a sub-module file
        if (language === "python" && projectSym) {
          // First check if it's a sub-module file (sub-modules don't need __all__)
          if (context) {
            const moduleDir = imp.module.replace(/^\.+/, "").replace(/\./g, "/");
            const basePath = context.projectPath;
            const subModPy = path.join(basePath, moduleDir, `${name.imported}.py`);
            const subModInit = path.join(basePath, moduleDir, name.imported, "__init__.py");
            if (context.files.has(subModPy) || context.files.has(subModInit)) {
              // Valid sub-module import, skip __all__ check
              validVariables.set(name.local, projectSym);
              continue;
            }
          }

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
          // For Python: check if the imported name is a sub-module file
          // e.g., "from app.api import auth" where app/api/auth.py exists
          if (language === "python" && context) {
            const modulePath = imp.module.replace(/^\.+/, "").replace(/\./g, "/");
            const basePath = context.projectPath;
            const subModulePy = path.join(basePath, modulePath, `${name.imported}.py`);
            const subModuleInit = path.join(basePath, modulePath, name.imported, "__init__.py");
            const isSubModule = context.files.has(subModulePy) || context.files.has(subModuleInit);
            if (isSubModule) {
              // It's a valid sub-module import — treat as a module variable
              validVariables.set(name.local, {
                name: name.local,
                type: "variable" as const,
                file: subModulePy,
              });
              continue;
            }
          }

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

        // For Python dotted imports (e.g., `import concurrent.futures`),
        // also register the base module name as valid since Python makes it available
        if (language === "python" && name.local.includes(".")) {
          const baseName = name.local.split(".")[0];
          const baseSym = { ...extSym, name: baseName };
          validVariables.set(baseName, baseSym);
          validFunctions.set(baseName, { ...baseSym, type: "function" });
          validClasses.set(baseName, { ...baseSym, type: "class" });
        }
      }
    }
  }

  // Build set of ALL imported names (including ones that failed resolution)
  // This prevents double-flagging: nonExistentImport + undefinedVariable for the same symbol
  const allImportedNames = new Set<string>();
  for (const imp of imports) {
    for (const name of imp.names) {
      allImportedNames.add(name.local);
      // For Python dotted imports: `import concurrent.futures` → also add `concurrent`
      if (language === "python" && name.local.includes(".")) {
        allImportedNames.add(name.local.split(".")[0]);
      }
    }
  }

  // Collect locally-defined names (function params, assignments, loop vars, etc.)
  // These are local scope variables that won't appear in the project symbol table
  // but are valid identifiers — prevents false undefinedVariable on method calls like db.execute()
  const localDefinitions = collectLocalDefinitionsAST(newCode, language);

  // Validate each used symbol
  for (const used of usedSymbols) {
    if (used.type === "call") {
      const func = validFunctions.get(used.name);
      const cls = validClasses.get(used.name);
      const method = validMethods.get(used.name);

      if (!func && !cls && !method) {
        // Skip imported names — validated via import checks, not function existence
        if (allImportedNames.has(used.name)) continue;

        // Skip locally-defined functions (nested defs, local assignments that hold callables)
        if (localDefinitions.has(used.name)) continue;

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
      // Extract the root object, handling complex expressions like:
      // - obj.property -> obj
      // - obj?.property -> obj (optional chaining)
      // - obj.method() -> obj
      // - arr[index] -> arr
      // - arr[index].property -> arr
      // - fn().property -> fn
      // - (expr as Type).property -> expr
      function extractRootObject(obj: string): string {
        if (!obj) return "";
        
        // Handle parenthesized expressions at the start: (expr).prop -> extract from expr
        if (obj.startsWith("(")) {
          // Find the matching closing parenthesis
          let depth = 1;
          let i = 1;
          while (i < obj.length && depth > 0) {
            if (obj[i] === "(") depth++;
            else if (obj[i] === ")") depth--;
            i++;
          }
          if (depth === 0) {
            // Extract the content inside the outermost parentheses
            const innerExpr = obj.slice(1, i - 1).trim();
            // Check if it's a type assertion (expr as Type) or (expr satisfies Type)
            const asMatch = innerExpr.match(/^(.+?)\s+as\s+.+$/s);
            if (asMatch) {
              return extractRootObject(asMatch[1].trim());
            }
            const satisfiesMatch = innerExpr.match(/^(.+?)\s+satisfies\s+.+$/s);
            if (satisfiesMatch) {
              return extractRootObject(satisfiesMatch[1].trim());
            }
            // Not a type assertion, extract from the inner expression
            return extractRootObject(innerExpr);
          }
        }
        
        // Split on delimiters and take the first part
        return obj
          .split("?.")[0]
          .split(".")[0]
          .split("[")[0]
          .split("(")[0]
          .trim();
      }
      
      const rootObject = extractRootObject(used.object || "");

      // CRITICAL FIX: Skip ALL 'this'/'self'/'cls' method calls - we can't validate class scope
      // The 'this' keyword (JS/TS) and 'self'/'cls' (Python) are always in scope within a class context
      // TypeScript/ESLint/mypy handle class method validation, not CodeGuardian
      if (used.object === "this" || used.object?.startsWith("this.") ||
          used.object === "self" || used.object?.startsWith("self.") ||
          used.object === "cls" || used.object?.startsWith("cls.")) {
        continue; // Trust class scope - this is not a hallucination risk
      }

      // Skip other whitelisted global objects and common patterns
      if (
        used.object?.includes(".current") ||
        (rootObject &&
          [
            // JavaScript/TypeScript globals
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
            // Python standard library modules (commonly used as objects for method calls)
            "os",
            "sys",
            "json",
            "re",
            "math",
            "logging",
            "datetime",
            "time",
            "pathlib",
            "collections",
            "itertools",
            "functools",
            "typing",
            "abc",
            "io",
            "hashlib",
            "hmac",
            "secrets",
            "base64",
            "urllib",
            "http",
            "email",
            "html",
            "xml",
            "csv",
            "sqlite3",
            "subprocess",
            "threading",
            "asyncio",
            "uuid",
            "copy",
            "shutil",
            "tempfile",
            "glob",
            "fnmatch",
            "pickle",
            "struct",
            "traceback",
            "inspect",
            "importlib",
            "contextlib",
            "dataclasses",
            "enum",
            "string",
            "textwrap",
            "random",
            "statistics",
            "decimal",
            "fractions",
            "operator",
            "warnings",
            "unittest",
            "pytest",
            "pprint",
            // Python common third-party module objects
            "logger",
            "app",
            "request",
            "response",
            "session",
            "cursor",
            "conn",
            "connection",
            "engine",
            "metadata",
            "router",
            "schema",
            "serializer",
            "queryset",
            "manager",
            "admin",
            "signals",
            "celery",
            "redis",
            "cache",
            "config",
            "settings",
            "flask",
            "django",
            "fastapi",
            "sqlalchemy",
            "pydantic",
            "httpx",
            "requests",
            "aiohttp",
            "np",
            "pd",
            "plt",
            "tf",
            "torch",
            "sk",
          ].includes(rootObject))
      ) {
        // Special Case: Still validate the method name itself if it's NOT a known builtin
        // This ensures we catch true hallucinations like toast.hallucinatedMethod()
        if (isJSBuiltin(used.name) || isPythonBuiltin(used.name)) {
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

      // 2b. Skip Python common methods on any object to avoid false positives
      if (language === "python" && isPythonBuiltin(used.name)) {
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
        (language === "python" && isPythonBuiltin(rootObject!)) ||
        // Check if the object is an imported name (including failed imports — avoids double-flagging)
        allImportedNames.has(rootObject!) ||
        // Check if the object is a locally-defined variable (function params, assignments, loop vars, etc.)
        localDefinitions.has(rootObject!) ||
        // Python: Check if rootObject is the base of a dotted import (e.g., `import concurrent.futures` → `concurrent`)
        (language === "python" && imports.some(imp =>
          imp.names.some(n => n.local.startsWith(rootObject + "."))
        )) ||
        // Always trust common short variable names in non-strict mode
        (!strictMode &&
          [
            // JS/TS common
            "z",
            "t",
            "db",
            "prisma",
            "ctx",
            "req",
            "res",
            "e",
            "i",
            // Python common
            "self",
            "cls",
            "logger",
            "app",
            "session",
            "cursor",
            "conn",
            "connection",
            "engine",
            "router",
            "config",
            "settings",
            "request",
            "response",
            "client",
            "server",
            "cache",
            "registry",
            "factory",
            "builder",
            "handler",
            "manager",
            "service",
            "controller",
            "serializer",
            "validator",
            "middleware",
            "schema",
            "model",
            "form",
            "view",
            "template",
            "context",
            "fixture",
            "mock",
            "patch",
            "monkeypatch",
          ].includes(rootObject!));

      // If the object doesn't exist at all, flag it as a hallucination
      if (!objExists) {
        // Use rootObject for checking (handles complex expressions like arr[index].method())
        const objectToCheck = rootObject || used.object;
        // ... (existing undefinedVariable check) ...
        const suggestion = suggestSimilar(objectToCheck!, [
          ...validClasses.keys(),
          ...validVariables.keys(),
          ...validFunctions.keys(),
        ]);
        const similarSymbols = extractSimilarSymbols(suggestion);
        const { confidence, reasoning } = calculateConfidence({
          issueType: "undefinedVariable",
          symbolName: objectToCheck!,
          similarSymbols,
          existsInProject:
            projectClasses.has(objectToCheck!) ||
            projectVariables.has(objectToCheck!) ||
            projectFunctions.has(objectToCheck!),
          strictMode,
        });

        issues.push({
          type: "undefinedVariable",
          severity: "critical",
          message: `Object '${objectToCheck}' is not defined or imported (used in ${used.object}.${used.name}())`,
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
            // For internal imports, only check if we have CLASS info (not just variable info)
            // This prevents false positives on imported const objects like React Query keys:
            //   import { contractKeys } from "./keys";
            //   contractKeys.all  // Don't flag - we don't know the shape of plain objects
            // But DO validate actual class instances:
            //   import { MyClass } from "./class";
            //   const instance = new MyClass();
            //   instance.method()  // Can validate if we have method info
            //
            // IMPORTANT: Use projectClasses, not validClasses, because validClasses
            // contains ALL imported symbols (added as fallback), not just actual classes
            const objClass = projectClasses.get(used.object!);
            if (objClass) {
              shouldCheck = true; // We have class info, so we can validate methods
            }
            // Note: We intentionally DON'T check based on projectVariables
            // because plain object imports (like query key factories) should
            // not have their property access validated
          }
        } else {
          // Objects not from imports (locally defined)
          // ONLY check if we have class info, otherwise we don't know the type enough to flag it
          // Use projectClasses (actual class definitions), not validClasses (which includes all imports)
          const objClass = projectClasses.get(used.object!) || projectClasses.get(rootObject!);

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

      // Skip well-known inherited methods from common frameworks
      // These methods exist on base classes (Pydantic BaseModel, SQLAlchemy Model, etc.)
      // and won't appear in the project symbol table
      const FRAMEWORK_METHODS = new Set([
        // Pydantic BaseModel methods (v1 + v2)
        "model_validate", "model_dump", "model_json_schema", "model_copy",
        "model_validate_json", "model_dump_json", "model_fields_set",
        "model_construct", "model_post_init", "model_rebuild",
        "dict", "json", "parse_obj", "parse_raw", "parse_file",
        "from_orm", "schema", "schema_json", "validate", "update_forward_refs",
        "copy", "construct",
        // SQLAlchemy Model/Query methods
        "query", "filter", "filter_by", "all", "first", "one", "one_or_none",
        "get", "count", "delete", "update", "order_by", "limit", "offset",
        "join", "outerjoin", "group_by", "having", "distinct", "subquery",
        "scalar", "scalars", "execute", "add", "flush", "commit", "rollback",
        "refresh", "expire", "expunge", "merge", "close",
        // Django ORM methods
        "objects", "create", "get_or_create", "update_or_create",
        "bulk_create", "bulk_update", "values", "values_list",
        "annotate", "aggregate", "exists", "exclude", "select_related",
        "prefetch_related", "defer", "only", "using", "raw",
        "save", "full_clean", "clean", "clean_fields",
      ]);

      if (FRAMEWORK_METHODS.has(used.name)) continue;

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
        // Skip imported names — they are validated separately
        if (allImportedNames.has(used.name)) continue;

        // Skip locally-defined variables (e.g., const ParserClass = require('pdf-parse'))
        if (localDefinitions.has(used.name)) continue;

        // Skip if it exists as a variable or function (dynamic class assignment)
        if (validVariables.has(used.name) || validFunctions.has(used.name)) continue;

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
      // CRITICAL FIX: Skip property access on 'this'/'self'/'cls' (e.g., this.ws, self.data, cls._client)
      // These are class properties and should not be validated as standalone variables
      if (used.object === "this" || used.object?.startsWith("this.") ||
          used.object === "self" || used.object?.startsWith("self.") ||
          used.object === "cls" || used.object?.startsWith("cls.")) {
        continue; // Trust class scope - properties are validated by TypeScript/mypy
      }

      const func = validFunctions.get(used.name);
      const cls = validClasses.get(used.name);
      const variable = validVariables.get(used.name);

      if (!func && !cls && !variable) {
        // Skip imported names — they are validated separately via import checks
        if (allImportedNames.has(used.name)) continue;

        // Skip locally-defined variables (function params, assignments, loop vars, etc.)
        if (localDefinitions.has(used.name)) continue;

        // Built-in check (Tier 1.5)
        if (
          (language === "python" && isPythonBuiltin(used.name)) ||
          ((language === "javascript" || language === "typescript") &&
            (isJSBuiltin(used.name) ||
              isTSBuiltinType(used.name) ||
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

  // For Python __init__.py files, all imports are re-exports — skip unused detection
  const isInitPy = language === "python" && filePath.endsWith("__init__.py");
  // Also build a set of names in __all__ for the current file's module
  let currentModuleAllExports: Set<string> | null = null;
  if (language === "python" && filePath && pythonExports.size > 0) {
    const basePath = context?.projectPath || "";
    const relPath = filePath.startsWith(basePath) ? filePath.slice(basePath.length + 1) : filePath;
    const pyModPath = relPath.replace(/__init__\.py$/, "").replace(/\.py$/, "").replace(/\//g, ".").replace(/\.$/, "");
    currentModuleAllExports = pythonExports.get(pyModPath) || null;
  }

  // For Python: Build a set of symbol names that appear in the code text as word boundaries
  // This catches usages in type annotations, decorators, attribute access, etc. that the
  // AST-based extractor might miss (e.g., `def foo(x: Optional[str])`, `logging.DEBUG`)
  let codeWordSet: Set<string> | null = null;
  if (language === "python") {
    codeWordSet = new Set<string>();
    // Extract all word-like tokens from the code (excluding comment/string lines for accuracy)
    const lines = newCode.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      // Skip pure comment lines (but still scan lines with inline code + comments)
      if (line.startsWith("#")) continue;
      // Extract all identifiers from the line
      const words = line.match(/\b[a-zA-Z_][a-zA-Z0-9_]*\b/g);
      if (words) {
        for (const w of words) codeWordSet.add(w);
      }
    }
  }

  for (const imp of imports) {
    for (const name of imp.names) {
      if (name.local === "*" || name.imported === "*") continue; // Skip wildcards
      if (name.imported.startsWith("React")) continue; // Skip React imports

      // Skip unused import checks for Python __init__.py re-export files
      if (isInitPy) continue;

      // Skip if the import is listed in the module's __all__ (it's a re-export)
      if (currentModuleAllExports && currentModuleAllExports.has(name.local)) continue;

      if (!usedNames.has(name.local)) {
        // Python fallback: Check if any non-import line in the code contains the symbol name
        // This catches type annotations, decorators, attribute access, etc. that AST misses
        if (language === "python" && codeWordSet) {
          // The symbol must appear in the code AND not only on import lines
          if (codeWordSet.has(name.local)) {
            // Verify it appears on at least one non-import line
            const importLineText = getLineFromCode(newCode, imp.line);
            const appearsElsewhere = newCode.split("\n").some((line, idx) => {
              if (idx + 1 === imp.line) return false; // Skip the import line itself
              const trimmed = line.trim();
              if (trimmed.startsWith("#")) return false; // Skip comments
              if (trimmed.startsWith("import ") || trimmed.startsWith("from ")) return false; // Skip other imports
              return new RegExp(`\\b${name.local.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(line);
            });
            if (appearsElsewhere) continue; // Used in code, skip the unused import warning
          }
        }

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
