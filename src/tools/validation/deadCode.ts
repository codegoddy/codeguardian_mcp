/**
 * Dead Code Analyzer Module
 *
 * This module detects unused exports, orphaned files, and unused functions in a codebase.
 * It uses a multi-phase analysis approach:
 * 1. Fast import graph check (O(1) lookup)
 * 2. Selective deep AST analysis for potentially unused symbols
 * 3. Timeout protection and batch processing for large codebases
 *
 * The analyzer maintains several caches for performance:
 * - fileContentCache: Avoids re-reading files
 * - typeReferencesCache: Avoids re-parsing AST for type references
 * - symbolUsageCache: Avoids redundant symbol usage checks
 *
 * @format
 */

import * as fs from "fs/promises";
import { ProjectContext, resolveImport } from "../../context/projectContext.js";
import type { DeadCodeIssue, ASTTypeReference } from "./types.js";
import {
  extractImportsAST,
  extractUsagesAST,
  extractTypeReferencesAST,
} from "./extractors/index.js";
import { logger } from "../../utils/logger.js";
import * as path from "path";
// @ts-ignore
import { minimatch as minimatchFunc } from "minimatch";
const minimatch = minimatchFunc;

// ============================================================================
// Caches for Performance
// ============================================================================

// Cache for file contents to avoid re-reading
const fileContentCache = new Map<string, string>();

// Cache for AST type references to avoid re-parsing
const typeReferencesCache = new Map<string, ASTTypeReference[]>();

// Cache for symbol usage results to avoid redundant checks
const symbolUsageCache = new Map<string, boolean>();

// Cache for file modification times to enable incremental analysis
const fileMtimeCache = new Map<string, number>();

// Cache for string literals per file
const fileStringsCache = new Map<string, Set<string>>();

/**
 * Check if a file has been modified since last scan
 */
async function hasFileChanged(filePath: string): Promise<boolean> {
  try {
    const stats = await fs.stat(filePath);
    const currentMtime = stats.mtimeMs;
    const cachedMtime = fileMtimeCache.get(filePath);

    if (cachedMtime === undefined || cachedMtime !== currentMtime) {
      // File is new or has been modified
      fileMtimeCache.set(filePath, currentMtime);
      return true;
    }

    return false;
  } catch (err) {
    // If we can't stat the file, assume it changed
    return true;
  }
}

// ============================================================================
// Helper Functions for Dead Code Detection
// ============================================================================

/**
 * Check if a symbol is directly imported anywhere in the codebase.
 *
 * This is the fastest check - O(1) lookup in the import graph.
 * If a symbol is imported, it's definitely being used.
 *
 * @param symbolName - Name of the symbol to check
 * @param definedInFile - File path where the symbol is defined
 * @param symbolsImportedFromFile - Map of file paths to sets of imported symbol names
 * @returns true if the symbol is imported anywhere, false otherwise
 */
export function isSymbolImported(
  symbolName: string,
  definedInFile: string,
  symbolsImportedFromFile: Map<string, Set<string>>,
): boolean {
  const importedSymbols = symbolsImportedFromFile.get(definedInFile);
  return importedSymbols?.has(symbolName) ?? false;
}

/**
 * Check if a symbol is referenced as a type anywhere in the codebase.
 *
 * Uses AST-based type reference extraction with pre-loaded cache.
 * This is more expensive than import checking, so we limit the scope.
 *
 * Type references include:
 * - Type annotations (: TypeName)
 * - Generic parameters (<TypeName>)
 * - Return types
 * - Extends/implements clauses
 * - Property types in interfaces
 *
 * @param symbolName - Name of the symbol to check
 * @param definedInFile - File path where the symbol is defined
 * @param context - Project context with file information
 * @returns true if the symbol is referenced as a type anywhere, false otherwise
 */
export async function isSymbolTypeReferenced(
  symbolName: string,
  definedInFile: string,
  context: ProjectContext,
): Promise<boolean> {
  // OPTIMIZED: Use symbolGraph for fast lookup (O(1))
  if (context.symbolGraph) {
    const usage = context.symbolGraph.usage.get(symbolName);
    if (usage && usage.calledBy.size > 0) {
      return true;
    }
  }
  
  // Check if any file imports this symbol as a type
  // This is faster than parsing AST for type references
  for (const [filePath, fileInfo] of context.files) {
    for (const imp of fileInfo.imports) {
      if (imp.namedImports.includes(symbolName) || imp.defaultImport === symbolName) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Check if a symbol is used in function calls or method calls via AST.
 *
 * This checks for runtime usage of symbols (not just type references).
 * Uses cached file contents and limits scope for performance.
 *
 * @param symbolName - Name of the symbol to check
 * @param context - Project context with file information
 * @returns true if the symbol is called or instantiated anywhere, false otherwise
 */
export async function isSymbolCalledOrInstantiated(
  symbolName: string,
  context: ProjectContext,
): Promise<boolean> {
  // Signal 1: Check the pre-computed symbol graph (Secret #3)
  // This is extremely fast (O(1)) and accurate if the graph is AST-driven
  if (context.symbolGraph) {
    const usage = context.symbolGraph.usage.get(symbolName);
    // Note: calledBy in symbolGraph includes files that call it
    if (usage && usage.calledBy.size > 0) {
      return true;
    }
  }

  // Fallback: Selective AST analysis (for symbols not in graph or dynamic usages)
  let checkedFiles = 0;
  const MAX_FILES_TO_CHECK = 50; // Limit scope to prevent timeout

  for (const [filePath, fileInfo] of context.files) {
    if (checkedFiles >= MAX_FILES_TO_CHECK) break;

    const content = fileContentCache.get(filePath);
    if (!content) continue;

    checkedFiles++;

    const lang =
      fileInfo.language === "javascript" ? "javascript" : "typescript";
    const imports = extractImportsAST(content, lang);
    const usages = extractUsagesAST(content, lang, imports);

    // Check for direct function calls or instantiations
    for (const usage of usages) {
      if (usage.name === symbolName) {
        return true;
      }
      // Check for method calls on objects (e.g., api.symbolName())
      if (usage.type === "methodCall" && usage.name === symbolName) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Check if a symbol is used within other exported symbols in the same file.
 *
 * This handles cases like:
 * - ChatResponse used as return type in sendMessage()
 * - ActiveDeliverable used in ActiveProject interface
 * - PYTHON_BUILTINS used in isStandardLibrary() via PYTHON_BUILTINS.has()
 * - Methods within exported service objects (e.g., supportChatService.startNewConversation)
 *
 * If a type/constant is used by an exported function/class, it should not be flagged as unused.
 *
 * @param symbolName - Name of the symbol to check
 * @param definedInFile - File path where the symbol is defined
 * @param context - Project context with file information
 * @param symbolsImportedFromFile - Map of file paths to sets of imported symbol names
 * @returns true if the symbol is used in same-file exports, false otherwise
 */
export async function isSymbolUsedInSameFileExports(
  symbolName: string,
  definedInFile: string,
  context: ProjectContext,
  _symbolsImportedFromFile: Map<string, Set<string>>,
): Promise<boolean> {
  const fileInfo = context.files.get(definedInFile);
  if (!fileInfo) return false;

  // Check if this symbol is a method/property of an exported parent object
  // e.g., startNewConversation is a method of supportChatService which is exported
  const symbol = fileInfo.symbols.find(s => s.name === symbolName);
  if (symbol?.scope) {
    // This symbol has a scope (parent object) - check if the parent is exported
    const parentSymbol = fileInfo.symbols.find(s => s.name === symbol.scope);
    if (parentSymbol?.exported) {
      // The parent object is exported, so this method is accessible via the parent
      return true;
    }
  }

  // OPTIMIZED: Check if symbol is used by other exports in the same file
  // by examining the import/export relationships in the context
  
  // Check if any other symbol in the same file references this symbol
  for (const sym of fileInfo.symbols) {
    if (sym.name === symbolName) continue;
    // If another exported symbol exists, check if this symbol is used in its context
    if (sym.exported && sym.returnType?.includes(symbolName)) {
      return true;
    }
  }

  // Check for member access patterns by reading file content on-demand
  // This is only done when necessary (not pre-cached for all files)
  try {
    const content = await fs.readFile(definedInFile, "utf-8");
    
    // Pattern 1: symbolName followed by a dot (member access via dot notation)
    // Pattern 2: symbolName followed by [ (member access via bracket notation)
    const memberAccessPattern = new RegExp(
      `\\b${escapeRegex(symbolName)}\\s*[.\\[]`,
      "g",
    );

    // Count occurrences, excluding the definition line itself
    const matches = content.match(memberAccessPattern);
    if (matches && matches.length > 0) {
      // Found member access - the symbol is being used
      return true;
    }
  } catch {
    // File read failed, continue with other checks
  }

  return false;
}

/**
 * Escape special regex characters in a string
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Check if a symbol is used anywhere in the codebase using AST analysis.
 *
 * This is purely AST-based - no regex patterns. It checks for:
 * - Direct imports of the symbol
 * - Type annotations (: TypeName) via AST
 * - Generic parameters (<TypeName>) via AST
 * - Return types via AST
 * - Extends/implements clauses via AST
 * - Property types in interfaces via AST
 * - Function/method call usage via AST
 *
 * Uses caching to avoid redundant checks.
 *
 * @param symbolName - Name of the symbol to check
 * @param definedInFile - File path where the symbol is defined
 * @param context - Project context with file information
 * @param symbolsImportedFromFile - Map of file paths to sets of imported symbol names
 * @returns true if the symbol is used anywhere, false otherwise
 */
async function isSymbolUsedAnywhere(
  symbolName: string,
  definedInFile: string,
  context: ProjectContext,
  symbolsImportedFromFile: Map<string, Set<string>>,
): Promise<boolean> {
  // Check cache first
  const cacheKey = `${definedInFile}:${symbolName}`;
  const cached = symbolUsageCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  // Check 1: Is it directly imported anywhere? (fastest check)
  if (isSymbolImported(symbolName, definedInFile, symbolsImportedFromFile)) {
    symbolUsageCache.set(cacheKey, true);
    return true;
  }

  // Check 2: Is it referenced as a type anywhere?
  if (await isSymbolTypeReferenced(symbolName, definedInFile, context)) {
    symbolUsageCache.set(cacheKey, true);
    return true;
  }

  // Check 3: Is it called or instantiated anywhere?
  if (await isSymbolCalledOrInstantiated(symbolName, context)) {
    symbolUsageCache.set(cacheKey, true);
    return true;
  }

  // Check 4: Is it used within other exported symbols in the same file?
  if (
    await isSymbolUsedInSameFileExports(
      symbolName,
      definedInFile,
      context,
      symbolsImportedFromFile,
    )
  ) {
    symbolUsageCache.set(cacheKey, true);
    return true;
  }

  symbolUsageCache.set(cacheKey, false);
  return false;
}

// ============================================================================
// Main Dead Code Detection Function
// ============================================================================

/**
 * Detect unused exports, orphaned files, and unused functions in a codebase.
 *
 * Uses a multi-phase analysis approach:
 * 1. Build import graph and JSX component usage map
 * 2. Preload type references for files with exports (for performance)
 * 3. Phase 1: Quick filter using import graph (O(1) lookup)
 * 4. Phase 2: Deep AST analysis for potentially unused symbols (limited scope)
 * 5. Find orphaned files (files with exports but no importers)
 * 6. Check for unused functions in new code (if provided)
 *
 * Performance optimizations:
 * - Limits number of exports to check (MAX_EXPORTS_TO_CHECK = 300)
 * - Limits deep analysis scope (MAX_DEEP_ANALYSIS = 150)
 * - Uses batch processing for file preloading and analysis
 * - Maintains caches for file contents, type references, and symbol usage
 * - Returns at most 30 issues to avoid overwhelming output
 *
 * @param context - Project context with file and dependency information
 * @param newCode - Optional new code to check for unused functions
 * @returns Array of dead code issues found
 */
export async function detectDeadCode(
  context: ProjectContext,
  newCode?: string,
): Promise<DeadCodeIssue[]> {
  const issues: DeadCodeIssue[] = [];

  // Load ignore patterns
  const ignorePatterns = await loadIgnorePatterns(context.projectPath);

  // Clear only the working caches, preserve mtime cache for incremental analysis
  fileContentCache.clear();
  typeReferencesCache.clear();
  symbolUsageCache.clear();
  // fileMtimeCache is preserved to enable incremental analysis

  // Build map of which symbols are imported FROM each file
  const symbolsImportedFromFile = new Map<string, Set<string>>();
  const jsxUsedComponents = new Set<string>();

  // Track all imports across the project
  for (const dep of context.dependencies) {
    if (!symbolsImportedFromFile.has(dep.to)) {
      symbolsImportedFromFile.set(dep.to, new Set());
    }
    for (const sym of dep.importedSymbols) {
      symbolsImportedFromFile.get(dep.to)!.add(sym);
    }
  }

  // Track JSX and Wildcard usage
  const wildcardImportedModules = new Map<string, string>(); // Local Name -> Module Path

  for (const [filePath, fileInfo] of context.files) {
    for (const imp of fileInfo.imports) {
      if (imp.defaultImport && /^[A-Z]/.test(imp.defaultImport)) {
        jsxUsedComponents.add(imp.defaultImport);
      }
      for (const name of imp.namedImports) {
        if (/^[A-Z]/.test(name)) {
          jsxUsedComponents.add(name);
        }
      }

      // Track Wildcard imports: import * as utils from './utils'
      if (imp.namespaceImport) {
          const resolved = resolveImport(imp.source, filePath, Array.from(context.files.keys()));
          if (resolved) {
              wildcardImportedModules.set(imp.namespaceImport, resolved);
          }
      }
    }
  }

  // OPTIMIZED: Use cached context data instead of re-parsing files
  // The context already has imports, exports, and symbols from project analysis
  logger.debug("Using cached context data for dead code detection...");

  // Build string literal usage from cached keywords in context
  // This is much faster than re-reading and parsing all files
  const stringLiteralUsage = new Set<string>();
  for (const [filePath, fileInfo] of context.files) {
    // Use keywords from context (already extracted during project build)
    for (const keyword of fileInfo.keywords) {
      if (keyword.length >= 3) {
        stringLiteralUsage.add(keyword);
      }
    }
  }

  // Use cached imports from context for wildcard usage tracking
  // instead of re-parsing AST for every file
  for (const [filePath, fileInfo] of context.files) {
    for (const imp of fileInfo.imports) {
      if (imp.namespaceImport) {
        const resolved = resolveImport(imp.source, filePath, Array.from(context.files.keys()));
        if (resolved) {
          // Track potential wildcard usage by looking at other imports from same module
          for (const [otherPath, otherInfo] of context.files) {
            if (otherPath === filePath) continue;
            for (const otherImp of otherInfo.imports) {
              if (otherImp.source === imp.source && otherImp.namedImports.length > 0) {
                for (const sym of otherImp.namedImports) {
                  if (!symbolsImportedFromFile.has(resolved)) {
                    symbolsImportedFromFile.set(resolved, new Set());
                  }
                  symbolsImportedFromFile.get(resolved)!.add(sym);
                }
              }
            }
          }
        }
      }
    }
  }

  // Identify files that need deep analysis (have exports but not in import graph)
  const filesToPreload = new Set<string>();
  for (const [filePath, fileInfo] of context.files) {
    if (fileInfo.isTest || fileInfo.isConfig || fileInfo.isEntryPoint) continue;
    if (fileInfo.exports.length === 0 && !fileInfo.symbols.some((s) => s.exported)) continue;
    
    // Only deep-analyze if exports aren't in import graph
    const hasUnimportedExports = fileInfo.exports.some(exp => 
      !isSymbolImported(exp.name, filePath, symbolsImportedFromFile)
    );
    if (hasUnimportedExports) {
      filesToPreload.add(filePath);
    }
  }

  logger.debug(
    `Using cached context: ${stringLiteralUsage.size} keywords, ${filesToPreload.size} files need deep analysis`,
  );

  // Collect all exported symbols to check
  const exportsToCheck: Array<{
    name: string;
    file: string;
    relativePath: string;
    kind?: string;
  }> = [];

  for (const [filePath, fileInfo] of context.files) {
    if (fileInfo.isTest || fileInfo.isConfig || fileInfo.isEntryPoint) continue;

    // Check against ignore patterns
    if (isIgnored(fileInfo.relativePath, ignorePatterns)) continue;

    // SKIP common libraries - removed to allow strict validation of all project code
    // Users should use .vibeguardignore for intentional library files.
    // const isLibraryFile = ... (removed)

    // Collect from exports list
    for (const exp of fileInfo.exports) {
      const symbol = fileInfo.symbols.find((s) => s.name === exp.name);
      
      // SKIP type-only exports (interfaces, type aliases, enums)
      // These are compile-time constructs and don't generate runtime code
      // They should not be flagged as "dead code"
      if (symbol?.kind === "interface" || symbol?.kind === "type") {
        continue;
      }
      
      exportsToCheck.push({
        name: exp.name,
        file: filePath,
        relativePath: fileInfo.relativePath,
        kind: symbol?.kind,
      });
    }

    // Collect from symbols with export flag
    for (const sym of fileInfo.symbols) {
      if (!sym.exported) continue;
      if (
        exportsToCheck.some((e) => e.name === sym.name && e.file === filePath)
      )
        continue;
      
      // SKIP type-only symbols (interfaces, type aliases, enums)
      // These are compile-time constructs and don't generate runtime code
      if (sym.kind === "interface" || sym.kind === "type") {
        continue;
      }
      
      exportsToCheck.push({
        name: sym.name,
        file: filePath,
        relativePath: fileInfo.relativePath,
        kind: sym.kind,
      });
    }
  }

  // Limit the number of exports to check to prevent timeout
  const MAX_EXPORTS_TO_CHECK = 300; // Increased for better coverage
  let limitWarning = "";

  if (exportsToCheck.length > MAX_EXPORTS_TO_CHECK) {
    limitWarning = `Note: Limited analysis to ${MAX_EXPORTS_TO_CHECK} of ${exportsToCheck.length} exports for performance. Run on smaller scopes for complete coverage.`;
    logger.warn(
      `Too many exports (${exportsToCheck.length}), limiting to ${MAX_EXPORTS_TO_CHECK} for performance`,
    );
    // Prioritize checking exports from non-test, non-config files
    exportsToCheck.sort((a, b) => {
      const aIsTest = a.file.includes("test") || a.file.includes("spec");
      const bIsTest = b.file.includes("test") || b.file.includes("spec");
      if (aIsTest && !bIsTest) return 1;
      if (!aIsTest && bIsTest) return -1;
      return 0;
    });
    exportsToCheck.splice(MAX_EXPORTS_TO_CHECK);
  }

  // Check exports with a hybrid approach: fast import check + selective deep analysis
  logger.debug(
    `Checking ${exportsToCheck.length} exports using hybrid analysis...`,
  );

  // Phase 1: Quick filter - check import graph (fast, O(1) lookup)
  const potentiallyUnused: typeof exportsToCheck = [];
  for (const exp of exportsToCheck) {
    const isPascalCase = /^[A-Z][a-zA-Z0-9]*$/.test(exp.name);
    const isUsedAsJSX = isPascalCase && jsxUsedComponents.has(exp.name);

    // Skip JSX components that are used
    if (isUsedAsJSX) continue;

    // Fast check: Is it directly imported or reflectively referenced?
    const isImported = isSymbolImported(
      exp.name,
      exp.file,
      symbolsImportedFromFile,
    );
    
    // Reflective usage check: Is this symbol name used in any string literal?
    // This perfectly handles dynamic registration (e.g. tools, handlers, routes)
    const isReflective = stringLiteralUsage.has(exp.name);

    if (!isImported && !isReflective) {
      // Potentially unused - needs deeper analysis
      potentiallyUnused.push(exp);
    }
  }

  logger.debug(
    `Phase 1: ${potentiallyUnused.length}/${exportsToCheck.length} exports not imported, running deep analysis...`,
  );

  // Log if we're checking a limited set
  if (exportsToCheck.length < context.files.size * 5) {
    // Rough heuristic: if we're checking fewer exports than 5x files, we likely hit a limit
    logger.info(
      `Analyzing ${exportsToCheck.length} exports (may be limited for performance)`,
    );
  }

  // Phase 2: Deep analysis for potentially unused exports (in smaller batches with limits)
  const MAX_DEEP_ANALYSIS = 150; // Increased for better coverage
  const toAnalyze = potentiallyUnused.slice(0, MAX_DEEP_ANALYSIS);

  if (potentiallyUnused.length > MAX_DEEP_ANALYSIS) {
    const deepLimitWarning = `Limited deep analysis to ${MAX_DEEP_ANALYSIS} of ${potentiallyUnused.length} potentially unused exports.`;
    limitWarning =
      limitWarning ? `${limitWarning} ${deepLimitWarning}` : deepLimitWarning;
    logger.warn(deepLimitWarning);
  }

  // Phase 2: Deep analysis - process potentially unused exports in smaller batches
  // This prevents overwhelming the event loop and allows for periodic yielding
  const DEEP_BATCH_SIZE = 20;
  for (let i = 0; i < toAnalyze.length; i += DEEP_BATCH_SIZE) {
    const batch = toAnalyze.slice(i, i + DEEP_BATCH_SIZE);
    
    const batchResults = await Promise.all(
      batch.map(async (exp) => {
        // Check cache first to avoid redundant work
        const cacheKey = `${exp.file}:${exp.name}`;
        const cached = symbolUsageCache.get(cacheKey);
        if (cached !== undefined) {
          return cached ? null : (
              {
                type: "unusedExport" as const,
                severity: "low" as const, // Downgrade from medium to low
                name: exp.name,
                file: exp.relativePath,
                message: `Export '${exp.name}' is never used anywhere in the codebase`,
              }
            );
        }

        // Check same-file usage first (fastest - uses cached file content)
        const isUsedInSameFile = await isSymbolUsedInSameFileExports(
          exp.name,
          exp.file,
          context,
          symbolsImportedFromFile,
        );
        if (isUsedInSameFile) {
          symbolUsageCache.set(cacheKey, true);
          return null;
        }

        // Then check type references (uses preloaded cache)
        const isTypeReferenced = await isSymbolTypeReferenced(
          exp.name,
          exp.file,
          context,
        );
        if (isTypeReferenced) {
          symbolUsageCache.set(cacheKey, true);
          return null;
        }

        // Finally check function calls (most expensive)
        const isCalled = await isSymbolCalledOrInstantiated(exp.name, context);
        if (isCalled) {
          symbolUsageCache.set(cacheKey, true);
          return null;
        }

        // Truly unused
        symbolUsageCache.set(cacheKey, false);
        return {
          type: "unusedExport" as const,
          severity: "low" as const, // Downgrade from medium to low
          name: exp.name,
          file: exp.relativePath,
          message: `Export '${exp.name}' is never used anywhere in the codebase`,
        };
      }),
    );

    // Collect non-null results (truly unused exports)
    for (const result of batchResults) {
      if (
        result &&
        !issues.some((i) => i.name === result.name && i.file === result.file)
      ) {
        issues.push(result);
      }
    }

    // Yield to event loop after each batch
    await new Promise((resolve) => setImmediate(resolve));
  }

  // Find orphaned files (files with exports but never imported AND no symbols used)
  for (const [filePath, fileInfo] of context.files) {
    if (fileInfo.isTest || fileInfo.isConfig || fileInfo.isEntryPoint) continue;

    const importers = context.reverseImportGraph.get(filePath) || [];
    const hasExports =
      fileInfo.exports.length > 0 || fileInfo.symbols.some((s) => s.exported);

    if (importers.length === 0 && hasExports) {
      // Double-check: are ANY of this file's exports used anywhere?
      let anyExportUsed = false;
      for (const exp of fileInfo.exports) {
        const isUsed = await isSymbolUsedAnywhere(
          exp.name,
          filePath,
          context,
          symbolsImportedFromFile,
        );
        if (isUsed) {
          anyExportUsed = true;
          break;
        }
      }

      if (!anyExportUsed) {
        const alreadyFlagged = issues.some(
          (i) => i.type === "orphanedFile" && i.file === fileInfo.relativePath,
        );
        if (!alreadyFlagged) {
          issues.push({
            type: "orphanedFile",
            severity: "low",
            name: fileInfo.relativePath,
            file: fileInfo.relativePath,
            message: `File has exports but nothing is used anywhere`,
          });
        }
      }
    }
  }

  // Check for unused functions in new code
  if (newCode) {
    const definedSymbols = new Set<{ name: string; type: "function" | "constant" }>();
    const usedSymbols = new Set<string>();

    const defPatterns = [
      { pattern: /function\s+([a-zA-Z0-9_$]+)\s*\(/g, type: "function" as const },
      { pattern: /(?:const|let|var)\s+([a-zA-Z0-9_$]+)\s*=\s*(?:async\s*)?\(/g, type: "function" as const },
      { pattern: /(?:const|let|var)\s+([a-zA-Z0-9_$]+)\s*=\s*.*=>/g, type: "function" as const },
      { pattern: /(?:const|let|var)\s+([A-Z0-9_$]{3,})\s*=/g, type: "constant" as const },
      { pattern: /def\s+([a-zA-Z0-9_$]+)\s*\(/g, type: "function" as const },
      { pattern: /([A-Z0-9_$]{3,})\s*=\s*/g, type: "constant" as const }, // Python constants
    ];

    for (const { pattern, type } of defPatterns) {
      let match;
      while ((match = pattern.exec(newCode)) !== null) {
        definedSymbols.add({ name: match[1], type });
      }
    }

    const usagePattern = /\b([a-zA-Z0-9_$]+)\b/g;
    let match;
    while ((match = usagePattern.exec(newCode)) !== null) {
      usedSymbols.add(match[1]);
    }

    for (const sym of definedSymbols) {
      // For each defined symbol, we expect at least 2 occurrences of the name 
      // (one for definition, one for usage).
      const count = (newCode.match(new RegExp(`\\b${sym.name}\\b`, "g")) || []).length;
      if (count <= 1) {
        issues.push({
          type: sym.type === "function" ? "unusedFunction" : "unusedExport",
          severity: "medium",
          name: sym.name,
          file: "(new code)",
          message: `${sym.type === "function" ? "Function" : "Constant"} '${sym.name}' is defined but never used in this code`,
        });
      }
    }
  }

  // Clear cache after scan
  fileContentCache.clear();

  // Add informational message if we hit limits
  if (limitWarning) {
    logger.info(`Dead code analysis: ${limitWarning}`);
  }

  return issues.slice(0, 30);
}

/**
 * Clear all dead code detection caches
 * Should be called between test runs to prevent interference
 * Note: fileMtimeCache is preserved to enable incremental analysis
 */
export function clearDeadCodeCaches(): void {
  fileContentCache.clear();
  typeReferencesCache.clear();
  symbolUsageCache.clear();
  // fileMtimeCache is intentionally NOT cleared to enable incremental analysis
}

/**
 * Force clear ALL caches including mtime cache
 * Use this when you want to force a full re-scan
 */
export function forceFullScan(): void {
  fileContentCache.clear();
  typeReferencesCache.clear();
  symbolUsageCache.clear();
  fileMtimeCache.clear();
}
/**
 * Load ignore patterns from .vibeguardignore or .gitignore
 */
async function loadIgnorePatterns(projectPath: string): Promise<string[]> {
  const patterns: string[] = [
    "**/node_modules/**",
    "**/dist/**",
    "**/build/**",
    "**/.git/**",
  ];

  try {
    const ignoreFile = path.join(projectPath, ".vibeguardignore");
    const content = await fs.readFile(ignoreFile, "utf-8");
    patterns.push(...content.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#")));
  } catch {
    // Fallback to basic patterns if file doesn't exist
  }

  return patterns;
}

/**
 * Check if a file is ignored
 */
function isIgnored(relativePath: string, patterns: string[]): boolean {
  return patterns.some((pattern) => minimatch(relativePath, pattern, { dot: true }));
}
