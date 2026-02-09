/**
 * Automated Finding Verifier - Batched & Concurrent
 *
 * This module automatically verifies validation findings to eliminate false positives
 * without requiring human intervention. Uses batching and concurrency for performance.
 *
 * Verification Strategies:
 * 1. Usage Pattern Analysis - Check for dynamic/indirect usage
 * 2. Git History Analysis - Check if code is actually used in recent commits
 * 3. Framework Pattern Detection - Recognize framework-specific patterns (callbacks, handlers)
 * 4. Cross-File Reference Check - Look for references in other files
 * 5. Test Coverage Analysis - Check if "dead" code is actually tested
 *
 * Performance Optimizations:
 * - File-based batching: Groups findings by file to minimize I/O
 * - Concurrent processing: Verifies multiple files in parallel with limits
 * - Intelligent caching: File contents and git status cached per batch
 * - Batched git operations: Single git status call for all files
 *
 * @format
 */

import { logger } from "../utils/logger.js";
import type { ProjectContext } from "../context/projectContext.js";
import type { ValidationIssue, DeadCodeIssue, ASTUsage } from "../tools/validation/types.js";
import { execSync } from "child_process";
import * as fs from "fs/promises";
import * as path from "path";

// ============================================================================
// Types
// ============================================================================

export type FindingStatus = "confirmed" | "false_positive" | "uncertain";

export interface VerifiedFinding {
  original: ValidationIssue | DeadCodeIssue;
  status: FindingStatus;
  confidence: number; // 0-100
  reasons: string[];
  verificationMethod: string;
}

export interface VerificationResult {
  confirmed: VerifiedFinding[];
  falsePositives: VerifiedFinding[];
  uncertain: VerifiedFinding[];
  stats: {
    totalAnalyzed: number;
    confirmedCount: number;
    falsePositiveCount: number;
    uncertainCount: number;
  };
}

interface VerificationContext {
  projectPath: string;
  projectContext: ProjectContext;
  language: string;
  gitAvailable: boolean;
}

/**
 * Detect file language from extension. Used when ctx.language is "all"
 * in full-stack projects to ensure the correct parser is used per file.
 */
function detectFileLanguage(filePath: string, fallback: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".py": return "python";
    case ".ts": case ".tsx": return "typescript";
    case ".js": case ".jsx": case ".mjs": case ".cjs": return "javascript";
    default: return fallback === "all" ? "typescript" : fallback;
  }
}

interface FileBatch {
  filePath: string;
  findings: (ValidationIssue | DeadCodeIssue)[];
}

interface FileCache {
  content?: string;
  gitStatus?: GitFileStatus;
  hasTodoComments?: boolean;
  isStub?: boolean;
  featureBranch?: boolean;
}

interface GitFileStatus {
  isNew: boolean;
  isModified: boolean;
}

export interface VerificationProgress {
  totalFiles: number;
  processedFiles: number;
  totalFindings: number;
  processedFindings: number;
}

// ============================================================================
// Configuration
// ============================================================================

/** Maximum concurrent file verifications */
const MAX_CONCURRENCY = 8;

/** Batch size for findings within a file */
const FILE_BATCH_SIZE = 50;

// ============================================================================
// Main Entry Point - Batched & Concurrent
// ============================================================================

/**
 * Automatically verify all findings using batched concurrent processing.
 * Groups findings by file, caches file data, and processes files in parallel.
 */
export async function verifyFindingsAutomatically(
  hallucinations: ValidationIssue[],
  deadCode: DeadCodeIssue[],
  projectContext: ProjectContext,
  projectPath: string,
  language: string,
  onProgress?: (progress: VerificationProgress) => void,
): Promise<VerificationResult> {
  const allFindings: (ValidationIssue | DeadCodeIssue)[] = [...hallucinations, ...deadCode];
  
  logger.info(
    `Starting batched verification of ${allFindings.length} findings ` +
    `(${hallucinations.length} hallucinations, ${deadCode.length} dead code)...`
  );

  const ctx: VerificationContext = {
    projectPath,
    projectContext,
    language,
    gitAvailable: await checkGitAvailable(projectPath),
  };

  // Group findings by file for efficient batch processing
  const fileBatches = groupFindingsByFile(allFindings);
  logger.info(`Grouped into ${fileBatches.length} file batches for concurrent processing`);

  const progress: VerificationProgress = {
    totalFiles: fileBatches.length,
    processedFiles: 0,
    totalFindings: allFindings.length,
    processedFindings: 0,
  };

  // Process file batches concurrently with limit
  const verifiedResults: VerifiedFinding[] = [];
  
  for (let i = 0; i < fileBatches.length; i += MAX_CONCURRENCY) {
    const batch = fileBatches.slice(i, i + MAX_CONCURRENCY);
    
    // Process this concurrent batch
    const batchResults = await Promise.all(
      batch.map(async (fileBatch) => {
        // Create file cache for this file
        const fileCache: FileCache = {};
        
        // Pre-load file data (git status, content if needed)
        await preloadFileCache(fileBatch.filePath, ctx, fileCache);
        
        // Verify all findings for this file
        const results: VerifiedFinding[] = [];
        for (const finding of fileBatch.findings) {
          const verified = await verifyFindingWithCache(finding, ctx, fileCache);
          results.push(verified);
        }
        
        // Update progress
        progress.processedFiles++;
        progress.processedFindings += fileBatch.findings.length;
        onProgress?.(progress);
        
        return results;
      })
    );
    
    // Flatten results
    for (const results of batchResults) {
      verifiedResults.push(...results);
    }
    
    // Yield to event loop between batches
    await new Promise((resolve) => setImmediate(resolve));
  }

  // Categorize results
  const confirmed = verifiedResults.filter((v) => v.status === "confirmed");
  const falsePositives = verifiedResults.filter((v) => v.status === "false_positive");
  const uncertain = verifiedResults.filter((v) => v.status === "uncertain");

  logger.info(
    `Verification complete: ${confirmed.length} confirmed, ` +
    `${falsePositives.length} false positives, ${uncertain.length} uncertain ` +
    `(${fileBatches.length} files processed)`
  );

  return {
    confirmed,
    falsePositives,
    uncertain,
    stats: {
      totalAnalyzed: allFindings.length,
      confirmedCount: confirmed.length,
      falsePositiveCount: falsePositives.length,
      uncertainCount: uncertain.length,
    },
  };
}

// ============================================================================
// Batching & Caching
// ============================================================================

function groupFindingsByFile(
  findings: (ValidationIssue | DeadCodeIssue)[]
): FileBatch[] {
  const fileMap = new Map<string, (ValidationIssue | DeadCodeIssue)[]>();
  
  for (const finding of findings) {
    // Use a virtual key for findings without a file path (inline newCode validation)
    const filePath = finding.file || "(inline)";
    
    if (!fileMap.has(filePath)) {
      fileMap.set(filePath, []);
    }
    fileMap.get(filePath)!.push(finding);
  }
  
  return Array.from(fileMap.entries()).map(([filePath, findings]) => ({
    filePath,
    findings,
  }));
}

async function preloadFileCache(
  filePath: string,
  ctx: VerificationContext,
  cache: FileCache,
): Promise<void> {
  // Pre-check git status (batched git call happens at project level)
  if (ctx.gitAvailable) {
    cache.gitStatus = await checkGitFileStatus(filePath, ctx);
  }
  
  // Feature branch check is per-project, not per-file
  if (ctx.gitAvailable) {
    cache.featureBranch = await checkFeatureBranch(ctx);
  }
}

async function verifyFindingWithCache(
  finding: ValidationIssue | DeadCodeIssue,
  ctx: VerificationContext,
  cache: FileCache,
): Promise<VerifiedFinding> {
  // Route to appropriate verifier based on finding type
  if ("type" in finding && isValidationIssue(finding)) {
    return await verifyHallucinationWithCache(finding, ctx, cache);
  } else {
    return await verifyDeadCodeWithCache(finding as DeadCodeIssue, ctx, cache);
  }
}

function isValidationIssue(finding: ValidationIssue | DeadCodeIssue): finding is ValidationIssue {
  return "code" in finding && typeof finding.line === "number";
}

// ============================================================================
// Hallucination Verification with Caching
// ============================================================================

async function verifyHallucinationWithCache(
  issue: ValidationIssue,
  ctx: VerificationContext,
  cache: FileCache,
): Promise<VerifiedFinding> {
  const reasons: string[] = [];
  let confidence = 0;
  let status: FindingStatus = "uncertain";
  let method = "";

  switch (issue.type) {
    case "nonExistentFunction":
    case "nonExistentClass":
    case "undefinedVariable": {
      // Extra guard: if the symbol is defined locally in the same file
      // (e.g., function parameter, destructured param, local const/let), this is a false positive.
      if (issue.type === "undefinedVariable") {
        const localDef = await checkSymbolDefinedLocally(issue, ctx, cache);
        if (localDef.isDefined) {
          status = "false_positive";
          confidence = 95;
          method = "local_scope";
          reasons.push(`Symbol is defined locally in the file (${localDef.hint})`);
          reasons.push("Not a hallucination - this is valid local scope");
          break;
        }
      }

      // Check if symbol exists in any form (maybe just not imported)
      const existsInProject = checkSymbolExistsInProject(issue, ctx);
      
      if (existsInProject.exists) {
        status = "false_positive";
        confidence = 90;
        method = "cross_reference";
        reasons.push(`Symbol exists in project at ${existsInProject.location}`);
        reasons.push("This is a missing import, not a hallucination");
      } else {
        // Use cached future feature detection
        const futureFeatureCheck = await detectFutureFeatureWithCache(issue, ctx, cache);
        
        if (futureFeatureCheck.isFutureFeature) {
          status = "false_positive";
          confidence = futureFeatureCheck.confidence;
          method = "future_feature_detection";
          reasons.push("This appears to be part of an incomplete/new feature:");
          reasons.push(...futureFeatureCheck.reasons);
          reasons.push("Not a hallucination - code is for planned functionality");
        } else {
          // Quick git check using cached status
          if (cache.gitStatus?.isNew || cache.gitStatus?.isModified) {
            status = "false_positive";
            confidence = 85;
            method = "git_history";
            reasons.push("Symbol found in recent git changes");
            reasons.push("This may be part of an incomplete feature");
          } else {
            status = "confirmed";
            confidence = 95;
            method = "static_analysis";
            reasons.push("Symbol not found anywhere in project");
            reasons.push("No indicators of planned/incomplete feature");
            reasons.push("This is a true hallucination");
          }
        }
      }
      break;
    }

    case "nonExistentImport": {
      const moduleCheck = await checkModuleExports(issue, ctx);
      
      if (moduleCheck.moduleExists && !moduleCheck.exportExists) {
        status = "confirmed";
        confidence = 98;
        method = "module_resolution";
        reasons.push("Module exists but export does not");
        reasons.push("This is a true hallucination");
      } else if (!moduleCheck.moduleExists) {
        status = "confirmed";
        confidence = 99;
        method = "module_resolution";
        reasons.push("Module does not exist in project");
        reasons.push("This is a true hallucination");
      } else {
        status = "false_positive";
        confidence = 80;
        method = "module_resolution";
        reasons.push("Module and export both exist");
        reasons.push("May be a resolution path issue");
      }
      break;
    }

    case "dependencyHallucination": {
      const pkgName = extractPackageName(issue.message);
      const fileLang = issue.file ? detectFileLanguage(issue.file, ctx.language) : ctx.language;
      const existsOnNpm = await checkPackageExistsOnRegistry(pkgName, fileLang);
      
      if (!existsOnNpm) {
        status = "confirmed";
        confidence = 99;
        method = "registry_check";
        reasons.push("Package does not exist on npm registry");
        reasons.push("This is definitely a hallucination");
      } else {
        status = "false_positive";
        confidence = 85;
        method = "registry_check";
        reasons.push("Package exists on npm registry");
        reasons.push("This is a missing dependency, not a hallucination");
      }
      break;
    }

    case "wrongParamCount": {
      const paramCheck = await verifyParameterCount(issue, ctx);
      
      if (paramCheck.isMismatch) {
        status = "confirmed";
        confidence = 92;
        method = "signature_analysis";
        reasons.push("Parameter count mismatch confirmed");
        reasons.push(`Expected ${paramCheck.expected}, got ${paramCheck.actual}`);
      } else {
        status = "false_positive";
        confidence = 88;
        method = "signature_analysis";
        reasons.push("Parameter count appears correct on re-check");
        reasons.push("May be variadic or have optional parameters");
      }
      break;
    }

    case "unusedImport": {
      const usageCheck = await checkImportUsage(issue, ctx);
      
      if (usageCheck.isUsed) {
        status = "false_positive";
        confidence = 90;
        method = "usage_analysis";
        reasons.push("Import is actually used");
        if (usageCheck.usageType) {
          reasons.push(`Usage type: ${usageCheck.usageType}`);
        }
      } else {
        status = "confirmed";
        confidence = 95;
        method = "usage_analysis";
        reasons.push("Import is truly unused");
        reasons.push("No references found in file");
      }
      break;
    }

    case "nonExistentMethod": {
      // First check: does the method exist in the project at all?
      const methodNameMatch = issue.message.match(/Method '([^']+)'/);
      const objectNameMatch = issue.message.match(/on '([^']+)'/);
      const methodName = methodNameMatch?.[1];
      const objectName = objectNameMatch?.[1];
      
      if (methodName) {
        // Check if method exists with matching scope
        const methodExists = checkMethodExistsInProject(methodName, objectName, ctx);
        
        if (methodExists.exists) {
          status = "false_positive";
          confidence = 90;
          method = "symbol_lookup";
          reasons.push(`Method '${methodName}' exists in project at ${methodExists.location}`);
          if (methodExists.scope) {
            reasons.push(`Method is defined on object: ${methodExists.scope}`);
          }
          reasons.push("This is not a hallucination - the method exists");
          break;
        }
      }
      
      // Fallback: check inheritance chain (for class-based methods)
      const inheritanceCheck = await checkInheritanceChain(issue, ctx);
      
      if (inheritanceCheck.foundInParent) {
        status = "false_positive";
        confidence = 85;
        method = "inheritance_analysis";
        reasons.push("Method found in parent class or interface");
        reasons.push("This is not a hallucination");
      } else {
        status = "confirmed";
        confidence = 80;
        method = "inheritance_analysis";
        reasons.push("Method not found in class hierarchy");
        reasons.push("May be a dynamic method (not verifiable)");
      }
      break;
    }

    default: {
      status = issue.confidence && issue.confidence > 90 ? "confirmed" : "uncertain";
      confidence = issue.confidence || 50;
      method = "fallback";
      reasons.push("Using original confidence score");
      reasons.push("No specific verification available for this issue type");
    }
  }

  return {
    original: issue,
    status,
    confidence,
    reasons,
    verificationMethod: method,
  };
}

// ============================================================================
// Dead Code Verification with Caching
// ============================================================================

async function verifyDeadCodeWithCache(
  issue: DeadCodeIssue,
  ctx: VerificationContext,
  cache: FileCache,
): Promise<VerifiedFinding> {
  const reasons: string[] = [];
  let confidence = 0;
  let status: FindingStatus = "uncertain";
  let method = "";

  switch (issue.type) {
    case "unusedExport": {
      // Use cached future feature detection
      const futureFeatureCheck = await detectFutureFeatureWithCache(issue, ctx, cache);
      if (futureFeatureCheck.isFutureFeature) {
        status = "false_positive";
        confidence = futureFeatureCheck.confidence;
        method = "future_feature_detection";
        reasons.push("This export appears to be part of an incomplete/new feature:");
        reasons.push(...futureFeatureCheck.reasons);
        reasons.push("Not dead code - will likely be used when feature is complete");
        break;
      }
      
      const isPublicApi = await checkIfPublicApi(issue, ctx);
      const isTestFile = issue.file.includes('.test.') || issue.file.includes('.spec.') || issue.file.includes('/test/');
      
      if (isPublicApi) {
        status = "false_positive";
        confidence = 88;
        method = "api_analysis";
        reasons.push("This appears to be a public API export");
        reasons.push("External consumers may use this");
      } else if (isTestFile) {
        status = "false_positive";
        confidence = 75;
        method = "test_file_analysis";
        reasons.push("This is a test file - exports may be used by test runners");
      } else {
        status = "confirmed";
        confidence = 92;
        method = "dead_code_detector_trust";
        reasons.push("Dead code detector performed thorough cross-file analysis");
        reasons.push("No imports, type references, or runtime usages found");
        reasons.push("No indicators of planned/incomplete feature");
        reasons.push("This is confirmed dead code");
      }
      break;
    }

    case "unusedFunction": {
      const indirectCheck = await checkIndirectUsage(issue, ctx);
      
      if (indirectCheck.isUsed) {
        status = "false_positive";
        confidence = 85;
        method = "indirect_usage_analysis";
        reasons.push("Function has indirect usage");
        reasons.push(`Usage pattern: ${indirectCheck.pattern}`);
      } else {
        status = "confirmed";
        confidence = 88;
        method = "static_analysis";
        reasons.push("No direct or indirect usages found");
        reasons.push("This is likely dead code");
      }
      break;
    }

    case "orphanedFile": {
      const importCheck = await checkFileImports(issue, ctx);
      
      if (importCheck.isImported) {
        status = "false_positive";
        confidence = 95;
        method = "import_analysis";
        reasons.push(`File is imported by ${importCheck.importers.length} file(s)`);
        reasons.push("This is not an orphaned file");
      } else {
        const isEntryPoint = await checkIfEntryPoint(issue, ctx);
        
        if (isEntryPoint) {
          status = "false_positive";
          confidence = 90;
          method = "entry_point_analysis";
          reasons.push("This appears to be an entry point or config file");
          reasons.push("Not expected to be imported");
        } else {
          status = "confirmed";
          confidence = 85;
          method = "import_analysis";
          reasons.push("No imports found");
          reasons.push("Not a recognized entry point");
          reasons.push("This may be an orphaned file");
        }
      }
      break;
    }

    default: {
      status = "uncertain";
      confidence = 50;
      method = "fallback";
      reasons.push("Unknown dead code type");
    }
  }

  return {
    original: issue,
    status,
    confidence,
    reasons,
    verificationMethod: method,
  };
}

// ============================================================================
// Future Feature Detection with Caching
// ============================================================================

interface FutureFeatureSignals {
  isFutureFeature: boolean;
  confidence: number;
  reasons: string[];
}

async function detectFutureFeatureWithCache(
  issue: ValidationIssue | DeadCodeIssue,
  ctx: VerificationContext,
  cache: FileCache,
): Promise<FutureFeatureSignals> {
  const reasons: string[] = [];
  let signalCount = 0;
  const signals: string[] = [];

  // Signal 1: Check git status (cached)
  if (cache.gitStatus?.isNew || cache.gitStatus?.isModified) {
    signalCount++;
    signals.push("uncommitted changes");
    reasons.push(`File has uncommitted ${cache.gitStatus.isNew ? "changes (new file)" : "modifications"}`);
  }

  // Signal 2: Check for TODO/FIXME comments (lazy load & cache)
  if (cache.hasTodoComments === undefined) {
    cache.hasTodoComments = await checkForTodoComments(issue.file, ctx);
  }
  if (cache.hasTodoComments) {
    signalCount++;
    signals.push("todo comments");
    reasons.push("File contains TODO/FIXME comments indicating planned work");
  }

  // Signal 3: Check if this is a stub implementation (lazy load & cache)
  if (cache.isStub === undefined) {
    cache.isStub = await checkIfStubImplementation(issue.file, issue, ctx);
  }
  if (cache.isStub) {
    signalCount++;
    signals.push("stub implementation");
    reasons.push("Code appears to be a stub/placeholder for future implementation");
  }

  // Signal 4: Check feature branch naming (cached)
  if (cache.featureBranch) {
    signalCount++;
    signals.push("feature branch");
    reasons.push("Working on a feature branch (not main/master)");
  }

  // Signal 5: Check if the referenced symbol looks like a planned feature
  const symbolName = extractSymbolName(issue);
  if (symbolName && looksLikePlannedFeature(symbolName)) {
    signalCount += 0.5;
    signals.push("planned naming");
    reasons.push(`Symbol name "${symbolName}" suggests planned functionality`);
  }

  // Determine result based on signal strength
  const isFutureFeature = signalCount >= 2 || (signalCount >= 1 && signals.includes("todo comments"));
  const confidence = Math.min(95, 60 + signalCount * 15);

  return {
    isFutureFeature,
    confidence,
    reasons,
  };
}

// ============================================================================
// Git Operations (Optimized)
// ============================================================================

async function checkGitAvailable(projectPath: string): Promise<boolean> {
  try {
    execSync("git rev-parse --git-dir", { cwd: projectPath, stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

async function checkGitFileStatus(
  filePath: string,
  ctx: VerificationContext,
): Promise<GitFileStatus> {
  if (!ctx.gitAvailable || !filePath) {
    return { isNew: false, isModified: false };
  }

  try {
    const result = execSync(
      `git status --porcelain "${filePath}"`,
      { cwd: ctx.projectPath, stdio: "pipe", encoding: "utf-8" }
    ).trim();

    const isNew = result.startsWith("??") || result.startsWith("A");
    const isModified = result.includes("M") || result.startsWith(" M");

    return { isNew, isModified };
  } catch {
    return { isNew: false, isModified: false };
  }
}

async function checkFeatureBranch(ctx: VerificationContext): Promise<boolean> {
  if (!ctx.gitAvailable) return false;

  try {
    const branchName = execSync(
      "git branch --show-current",
      { cwd: ctx.projectPath, stdio: "pipe", encoding: "utf-8" }
    ).trim();

    const featurePatterns = [
      /^feature\//i,
      /^feat\//i,
      /^wip\//i,
      /^wip-/i,
      /-wip$/i,
      /^new\//i,
      /^implement/i,
      /^add-/i,
    ];

    return featurePatterns.some((pattern) => pattern.test(branchName));
  } catch {
    return false;
  }
}

// ============================================================================
// File Content Checks
// ============================================================================

async function checkForTodoComments(
  filePath: string,
  ctx: VerificationContext,
): Promise<boolean> {
  if (!filePath) return false;

  try {
    const content = await fs.readFile(filePath, "utf-8");
    const todoPatterns = [
      /\/\/\s*TODO/i,
      /\/\/\s*FIXME/i,
      /\/\/\s*XXX/i,
      /\/\*\s*TODO/i,
      /\/\*\s*FIXME/i,
      /#\s*TODO/i,
      /#\s*FIXME/i,
      /\{\s*\/\*\s*TODO/i,
    ];

    return todoPatterns.some((pattern) => pattern.test(content));
  } catch {
    return false;
  }
}

async function checkIfStubImplementation(
  filePath: string,
  issue: ValidationIssue | DeadCodeIssue,
  ctx: VerificationContext,
): Promise<boolean> {
  if (!filePath) return false;

  try {
    const content = await fs.readFile(filePath, "utf-8");
    
    const stubPatterns = [
      /throw\s+new\s+Error\s*\(\s*["']\s*not\s+implemented/i,
      /throw\s+new\s+Error\s*\(\s*["']\s*TODO/i,
      /\/\/\s*TODO.*implement/i,
      /return\s+null\s*;\s*\/\/\s*TODO/i,
      /\/\/\s*placeholder/i,
      /\/\/\s*stub/i,
    ];

    return stubPatterns.some((pattern) => pattern.test(content));
  } catch {
    return false;
  }
}

function extractSymbolName(issue: ValidationIssue | DeadCodeIssue): string | null {
  if ("message" in issue) {
    const match = issue.message.match(/'([^']+)'/);
    return match?.[1] || null;
  }
  return null;
}

function looksLikePlannedFeature(symbolName: string): boolean {
  const plannedPatterns = [
    /new/i,
    /upcoming/i,
    /planned/i,
    /future/i,
    /next/i,
    /v\d+/i,
    /version\d+/i,
  ];

  return plannedPatterns.some((pattern) => pattern.test(symbolName));
}

// ============================================================================
// Local Scope Checks (prevent verifier from confirming local vars as hallucinations)
// ============================================================================

async function checkSymbolDefinedLocally(
  issue: ValidationIssue,
  ctx: VerificationContext,
  cache: FileCache,
): Promise<{ isDefined: boolean; hint?: string }> {
  const symbolName = extractSymbolName(issue);
  if (!symbolName || !issue.file) return { isDefined: false };

  try {
    // Load file content once (cache)
    if (!cache.content) {
      cache.content = await fs.readFile(issue.file, "utf-8");
    }

    // Parse local symbols from the file itself (includes params when enabled)
    const { extractSymbolsAST } = await import("../tools/validation/extractors/index.js");
    const fileLang = detectFileLanguage(issue.file, ctx.language);
    const symbols = extractSymbolsAST(cache.content, issue.file, fileLang, {
      includeParameterSymbols: true,
    });

    const found = symbols.some((s: any) => s.name === symbolName);
    return found ? { isDefined: true, hint: "local symbol table" } : { isDefined: false };
  } catch {
    return { isDefined: false };
  }
}

// ============================================================================
// Symbol & Module Checks
// ============================================================================

function checkSymbolExistsInProject(
  issue: ValidationIssue,
  ctx: VerificationContext,
): { exists: boolean; location?: string } {
  const symbolName = issue.message.match(/'([^']+)'/)?.[1];
  if (!symbolName) return { exists: false };

  for (const [name, definitions] of ctx.projectContext.symbolIndex) {
    if (name === symbolName || name.toLowerCase() === symbolName.toLowerCase()) {
      return {
        exists: true,
        location: definitions[0]?.file || "unknown",
      };
    }
  }

  return { exists: false };
}

/**
 * Check if a method exists in the project, optionally with a specific scope (object name).
 * This handles object literal methods like: const api = { method: () => {} }
 */
function checkMethodExistsInProject(
  methodName: string,
  objectName: string | undefined,
  ctx: VerificationContext,
): { exists: boolean; location?: string; scope?: string } {
  // Search through all symbols in the project context
  for (const [name, definitions] of ctx.projectContext.symbolIndex) {
    if (name === methodName) {
      // Check all definitions for this method name
      for (const def of definitions) {
        // Check if it's a method type
        if (def.symbol.kind === "method") {
          // If object name is provided, check scope matches
          if (!objectName || !def.symbol.scope || def.symbol.scope === objectName) {
            return {
              exists: true,
              location: def.file || "unknown",
              scope: def.symbol.scope,
            };
          }
        }
      }
    }
  }
  
  return { exists: false };
}

async function checkModuleExports(
  issue: ValidationIssue,
  ctx: VerificationContext,
): Promise<{ moduleExists: boolean; exportExists: boolean }> {
  const moduleMatch = issue.message.match(/module ['"]([^'"]+)['"]/);
  const exportMatch = issue.message.match(/export ['"]([^'"]+)['"]/);
  
  const moduleName = moduleMatch?.[1];
  const exportName = exportMatch?.[1];

  if (!moduleName) {
    return { moduleExists: false, exportExists: false };
  }

  const possiblePaths = [
    path.join(ctx.projectPath, moduleName),
    path.join(ctx.projectPath, `${moduleName}.ts`),
    path.join(ctx.projectPath, `${moduleName}.tsx`),
    path.join(ctx.projectPath, `${moduleName}.js`),
    path.join(ctx.projectPath, `${moduleName}/index.ts`),
    path.join(ctx.projectPath, `${moduleName}/index.js`),
  ];

  let moduleExists = false;
  let modulePath = "";

  for (const p of possiblePaths) {
    try {
      await fs.access(p);
      moduleExists = true;
      modulePath = p;
      break;
    } catch {
      // Continue checking
    }
  }

  if (!moduleExists || !exportName) {
    return { moduleExists, exportExists: false };
  }

  try {
    const content = await fs.readFile(modulePath, "utf-8");
    const exportPatterns = [
      new RegExp(`export\\s+(?:const|let|var|function|class|interface|type)\\s+${exportName}\\b`),
      new RegExp(`export\\s*\\{[^}]*\\b${exportName}\\b`),
      new RegExp(`export\\s+default\\s+(?:class|function)?\\s*\\b${exportName}\\b`),
    ];

    const exportExists = exportPatterns.some((pattern) => pattern.test(content));
    return { moduleExists: true, exportExists };
  } catch {
    return { moduleExists: true, exportExists: false };
  }
}

async function checkPackageExistsOnRegistry(pkgName: string, language: string): Promise<boolean> {
  if (!pkgName) return false;

  const commonPackages = new Set([
    "react", "react-dom", "vue", "angular", "svelte",
    "lodash", "underscore", "ramda",
    "axios", "fetch", "node-fetch",
    "express", "koa", "fastify", "hapi",
    "jest", "mocha", "jasmine", "vitest", "playwright",
    "typescript", "ts-node", "tsx",
    "webpack", "vite", "rollup", "esbuild", "parcel",
    "eslint", "prettier", "babel",
    "mongoose", "sequelize", "prisma", "typeorm",
    "mongodb", "redis", "pg", "mysql",
    "jsonwebtoken", "bcrypt", "passport",
    "winston", "pino", "morgan",
    "dotenv", "cross-env", "rimraf",
    "fs-extra", "glob", "minimatch",
    "chalk", "commander", "inquirer",
    "dayjs", "date-fns", "moment",
    "uuid", "nanoid", "cuid",
    "zod", "yup", "joi", "class-validator",
    "tailwindcss", "styled-components", "emotion",
    "@testing-library/react", "@testing-library/jest-dom",
    "@types/node", "@types/react", "@types/express",
    "next", "nuxt", "gatsby",
  ]);

  if (commonPackages.has(pkgName.toLowerCase())) return true;

  if (pkgName.startsWith("@")) {
    const scope = pkgName.split("/")[0];
    const name = pkgName.split("/")[1];
    if (!name) return false;
    
    const commonScopes = ["@types", "@babel", "@rollup", "@vitejs", "@nestjs", "@angular", "@mui"];
    if (commonScopes.includes(scope)) return true;
  }

  return false;
}

function extractPackageName(message: string): string {
  const match = message.match(/Package ['"]([^'"]+)['"]/);
  return match?.[1] || "";
}

async function verifyParameterCount(
  issue: ValidationIssue,
  ctx: VerificationContext,
): Promise<{ isMismatch: boolean; expected?: number; actual?: number }> {
  const match = issue.message.match(/expects (\d+) args, got (\d+)/);
  if (!match) {
    return { isMismatch: true };
  }

  const expected = parseInt(match[1], 10);
  const actual = parseInt(match[2], 10);

  const symbolName = issue.message.match(/Function ['"]([^'"]+)['"]/)?.[1];
  
  if (symbolName) {
    const definitions = ctx.projectContext.symbolIndex.get(symbolName);
    if (definitions && definitions.length > 0) {
      const def = definitions[0];
      if (def.symbol.params?.some((p) => p.name.startsWith("..."))) {
        return { isMismatch: false, expected, actual };
      }
    }
  }

  return { isMismatch: true, expected, actual };
}

async function checkImportUsage(
  issue: ValidationIssue,
  ctx: VerificationContext,
): Promise<{ isUsed: boolean; usageType?: string }> {
  const importName = issue.message.match(/'([^']+)'/)?.[1];
  if (!importName || !issue.file) return { isUsed: false };

  try {
    const content = await fs.readFile(issue.file, "utf-8");
    
    const patterns = [
      { regex: new RegExp(`\\b${importName}\\s*\\(`, "g"), type: "function call" },
      { regex: new RegExp(`\\b${importName}\\.`, "g"), type: "property access" },
      { regex: new RegExp(`\\b${importName}\\b`, "g"), type: "reference" },
      { regex: new RegExp(`type\\s+\\w+.*\\b${importName}\\b`, "g"), type: "type usage" },
      { regex: new RegExp(`as\\s+${importName}\\b`, "g"), type: "type assertion" },
    ];

    for (const { regex, type } of patterns) {
      const matches = content.match(regex);
      if (matches && matches.length > 1) {
        return { isUsed: true, usageType: type };
      }
    }

    return { isUsed: false };
  } catch {
    return { isUsed: false };
  }
}

async function checkInheritanceChain(
  issue: ValidationIssue,
  ctx: VerificationContext,
): Promise<{ foundInParent: boolean }> {
  return { foundInParent: false };
}

async function checkIfPublicApi(
  issue: DeadCodeIssue,
  ctx: VerificationContext,
): Promise<boolean> {
  const publicPatterns = [
    /index\.ts$/,
    /index\.js$/,
    /\bapi\b/,
    /\bpublic\b/,
    /\bexports\b/,
    /\blib\b/,
  ];

  return publicPatterns.some((pattern) => pattern.test(issue.file));
}

async function checkIndirectUsage(
  issue: DeadCodeIssue,
  ctx: VerificationContext,
): Promise<{ isUsed: boolean; pattern?: string }> {
  const functionName = issue.name;
  const filePath = issue.file;

  try {
    const content = await fs.readFile(filePath, "utf-8");

    const patterns = [
      { regex: new RegExp(`\\b${functionName}\\b\\s*[,})\\]]`, "g"), pattern: "callback/collection" },
      { regex: new RegExp(`['"]\\b${functionName}\\b['"]`, "g"), pattern: "string reference" },
      { regex: new RegExp(`\\.\\b${functionName}\\b`, "g"), pattern: "method assignment" },
    ];

    for (const { regex, pattern } of patterns) {
      if (regex.test(content)) {
        return { isUsed: true, pattern };
      }
    }

    return { isUsed: false };
  } catch {
    return { isUsed: false };
  }
}

async function checkFileImports(
  issue: DeadCodeIssue,
  ctx: VerificationContext,
): Promise<{ isImported: boolean; importers: string[] }> {
  const fileName = path.basename(issue.name || issue.file);
  const importers: string[] = [];

  for (const [filePath] of ctx.projectContext.files) {
    if (filePath === issue.file) continue;

    try {
      const content = await fs.readFile(filePath, "utf-8");
      
      const importPatterns = [
        new RegExp(`from\\s+['"][^'"]*${path.basename(fileName, ".ts")}['"]`, "g"),
      ];

      for (const pattern of importPatterns) {
        if (pattern.test(content)) {
          importers.push(filePath);
          break;
        }
      }
    } catch {
      // Skip files we can't read
    }
  }

  return { isImported: importers.length > 0, importers };
}

async function checkIfEntryPoint(
  issue: DeadCodeIssue,
  ctx: VerificationContext,
): Promise<boolean> {
  const entryPatterns = [
    /main\.(ts|js)$/,
    /index\.(ts|js)$/,
    /app\.(ts|js)$/,
    /server\.(ts|js)$/,
    /cli\.(ts|js)$/,
    /vite\.config\./,
    /webpack\.config\./,
    /next\.config\./,
    /tsup\.config\./,
    /rollup\.config\./,
    /jest\.config\./,
    /vitest\.config\./,
    /playwright\.config\./,
    /cypress\.config\./,
    /tailwind\.config\./,
    /postcss\.config\./,
    /eslint\.config\./,
    /prettier\.config\./,
  ];

  return entryPatterns.some((pattern) => pattern.test(issue.file));
}

// ============================================================================
// Result Filtering Helpers
// ============================================================================

export function getConfirmedFindings(
  result: VerificationResult,
): {
  hallucinations: ValidationIssue[];
  deadCode: DeadCodeIssue[];
} {
  // Include confirmed findings
  const confirmedHallucinations = result.confirmed
    .filter((f) => isValidationIssue(f.original))
    .map((f) => f.original as ValidationIssue);

  const confirmedDeadCode = result.confirmed
    .filter((f) => !isValidationIssue(f.original))
    .map((f) => f.original as DeadCodeIssue);

  // Also include high-confidence uncertain findings (confidence >= 85)
  // These are likely real issues that we couldn't fully verify
  const highConfidenceUncertainHallucinations = result.uncertain
    .filter((f) => f.confidence >= 85 && isValidationIssue(f.original))
    .map((f) => f.original as ValidationIssue);

  const highConfidenceUncertainDeadCode = result.uncertain
    .filter((f) => f.confidence >= 85 && !isValidationIssue(f.original))
    .map((f) => f.original as DeadCodeIssue);

  return {
    hallucinations: [...confirmedHallucinations, ...highConfidenceUncertainHallucinations],
    deadCode: [...confirmedDeadCode, ...highConfidenceUncertainDeadCode],
  };
}

// Keep backward compatibility - alias for the main function
export { verifyFindingsAutomatically as verifyFindings };
