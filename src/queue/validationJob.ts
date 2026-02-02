/**
 * Validation Job Handler
 *
 * Handles long-running validation jobs in the background.
 *
 * @format
 */

import { logger } from "../utils/logger.js";
import { jobQueue, JobProgress } from "./jobQueue.js";
import { orchestrateContext } from "../context/contextOrchestrator.js";
import {
  extractUsagesAST,
  extractImportsAST,
} from "../tools/validation/extractors/index.js";
import {
  loadManifestDependencies,
  loadPythonModuleExports,
} from "../tools/validation/manifest.js";
import {
  validateManifest,
  validateSymbols,
  buildSymbolTable,
} from "../tools/validation/validation.js";
import { getRelevantSymbolsForValidation } from "../analyzers/relevanceScorer.js";
import { detectDeadCode } from "../tools/validation/deadCode.js";
import {
  calculateScore,
  generateRecommendation,
} from "../tools/validation/scoring.js";
import { enrichIssuesWithAntiPatterns, generateAntiPatternContext } from "../analyzers/antiPatterns.js";
import {
  verifyFindingsAutomatically,
  getConfirmedFindings,
  type VerificationResult,
  type VerificationProgress,
} from "../analyzers/findingVerifier.js";
import type {
  ValidationIssue,
  DeadCodeIssue,
} from "../tools/validation/types.js";
import { glob } from "glob";
import * as fs from "fs/promises";
import * as path from "path";

// ============================================================================
// Types
// ============================================================================

export interface ValidationJobInput {
  projectPath: string;
  language: string;
  batchSize?: number;
  strictMode?: boolean;
  includeTests?: boolean;
  recentlyEditedFiles?: string[];
}

export interface ValidationJobResult {
  success: boolean;
  validated: boolean;
  score: number;
  hallucinationDetected: boolean;
  deadCodeDetected: boolean;
  hallucinations: ValidationIssue[];
  deadCode: DeadCodeIssue[];
  recommendation: any;
  summary: {
    totalIssues: number;
    criticalIssues: number;
    highIssues: number;
    mediumIssues: number;
    deadCodeIssues: number;
  };
  stats: {
    filesScanned: number;
    filesProcessed: number;
    batchCount: number;
    batchSize: number;
    symbolsInProject: number;
    symbolsValidatedAgainst: number;
    manifestPackages: number;
    contextBuildTime: string;
    validationTime: string;
    deadCodeTime: string;
    verificationTime: string;
    totalTime: string;
  };
  /**
   * Automated verification results - eliminates false positives without human intervention
   */
  verification?: {
    /** Findings confirmed to be real issues */
    confirmedCount: number;
    /** Findings determined to be false positives */
    falsePositiveCount: number;
    /** Findings that couldn't be automatically verified */
    uncertainCount: number;
    /** Whether verification timed out */
    timedOut?: boolean;
    /** Detailed breakdown of what was filtered */
    details: VerificationResult;
  };
}

// ============================================================================
// Job Handler
// ============================================================================

async function handleValidationJob(
  input: ValidationJobInput,
  updateProgress: (progress: JobProgress) => void,
): Promise<ValidationJobResult> {
  const startTime = Date.now();
  const {
    projectPath,
    language,
    batchSize = 50,
    strictMode = false,
    includeTests = true,
    recentlyEditedFiles = [],
  } = input;

  const validBatchSize = Math.min(Math.max(batchSize, 10), 100);

  logger.info(
    `Starting validation job for ${projectPath} (batch size: ${validBatchSize})`,
  );

  // Phase 1: Build context
  updateProgress({
    phase: "context_building",
    percent: 0,
    message: "Building project context...",
  });

  const contextStartTime = Date.now();
  const orchestration = await orchestrateContext({
    projectPath,
    language,
    recentlyEditedFiles,
  });
  const projectContext = orchestration.projectContext;
  const contextTime = Date.now() - contextStartTime;

  updateProgress({
    phase: "context_building",
    percent: 20,
    message: `Context built: ${projectContext.totalFiles} files indexed`,
    details: {
      files: projectContext.totalFiles,
      symbols: projectContext.symbolIndex.size,
    },
  });

  // Phase 2: Load dependencies
  updateProgress({
    phase: "loading_dependencies",
    percent: 25,
    message: "Loading manifest dependencies...",
  });

  const manifest = await loadManifestDependencies(projectPath, language);

  let pythonExports = new Map<string, Set<string>>();
  if (language === "python") {
    pythonExports = await loadPythonModuleExports(projectPath);
  }

  // Phase 2.5: Build symbol table with relevance filtering
  const relevantSymbols =
    recentlyEditedFiles.length > 0 ?
      getRelevantSymbolsForValidation(projectContext, {
        recentFiles: recentlyEditedFiles,
      })
    : undefined;

  const symbolTable = buildSymbolTable(projectContext, relevantSymbols);

  // Phase 3: Get source files
  updateProgress({
    phase: "discovering_files",
    percent: 30,
    message: "Discovering source files...",
  });

  const sourceFiles = await getSourceFiles(projectPath, language, includeTests);

  updateProgress({
    phase: "discovering_files",
    percent: 35,
    message: `Found ${sourceFiles.length} files to validate`,
    details: { fileCount: sourceFiles.length },
  });

  // Phase 4: Process files in batches
  const allIssues: ValidationIssue[] = [];
  const batchCount = Math.ceil(sourceFiles.length / validBatchSize);
  let filesProcessed = 0;

  const validationStartTime = Date.now();

  for (let i = 0; i < batchCount; i++) {
    const batchStart = i * validBatchSize;
    const batchEnd = Math.min(batchStart + validBatchSize, sourceFiles.length);
    const batch = sourceFiles.slice(batchStart, batchEnd);

    const batchPercent = 35 + Math.floor((i / batchCount) * 50);
    updateProgress({
      phase: "validating",
      percent: batchPercent,
      message: `Processing batch ${i + 1}/${batchCount} (${batch.length} files)`,
      details: {
        currentBatch: i + 1,
        totalBatches: batchCount,
        filesInBatch: batch.length,
        filesProcessed,
        totalFiles: sourceFiles.length,
      },
    });

    const batchIssues = await processBatch(
      batch,
      symbolTable,
      manifest,
      pythonExports,
      language,
      strictMode,
      projectContext,
    );

    allIssues.push(...batchIssues);
    filesProcessed += batch.length;

    logger.info(
      `Batch ${i + 1}/${batchCount} complete: ${batchIssues.length} issues found (${filesProcessed}/${sourceFiles.length} files)`,
    );

    // Yield to event loop after each batch to allow MCP requests to be processed
    await new Promise((resolve) => setImmediate(resolve));
  }

  const validationTime = Date.now() - validationStartTime;

  // Phase 5: Detect dead code
  updateProgress({
    phase: "dead_code_detection",
    percent: 85,
    message: "Detecting dead code...",
  });

  const deadCodeStartTime = Date.now();
  const DEAD_CODE_TIMEOUT = 120000; // 120 seconds max (increased for large projects)
  const deadCodePromise = detectDeadCode(projectContext);
  const timeoutPromise = new Promise<DeadCodeIssue[]>((resolve) => {
    setTimeout(() => {
      logger.warn(`Dead code detection timed out after ${DEAD_CODE_TIMEOUT}ms`);
      resolve([]);
    }, DEAD_CODE_TIMEOUT);
  });

  const deadCodeIssues = await Promise.race([deadCodePromise, timeoutPromise]);
  const deadCodeTime = Date.now() - deadCodeStartTime;

  updateProgress({
    phase: "dead_code_detection",
    percent: 85,
    message: `Dead code detection complete: ${deadCodeIssues.length} issues found`,
    details: { deadCodeCount: deadCodeIssues.length },
  });

  // Phase 6: Automated Verification (eliminates false positives)
  updateProgress({
    phase: "verification",
    percent: 90,
    message: "Verifying findings to eliminate false positives...",
  });

  const verificationStartTime = Date.now();
  const VERIFICATION_TIMEOUT = 120000; // 120 seconds max (2x expected for large projects)
  
  const verificationPromise = verifyFindingsAutomatically(
    allIssues,
    deadCodeIssues,
    projectContext,
    projectPath,
    language,
    (progress: VerificationProgress) => {
      // Report progress every few files
      if (progress.processedFiles % 5 === 0 || progress.processedFiles === progress.totalFiles) {
        updateProgress({
          phase: "verification",
          percent: 90 + Math.floor((progress.processedFiles / progress.totalFiles) * 4),
          message: `Verifying findings... ${progress.processedFiles}/${progress.totalFiles} files (${progress.processedFindings}/${progress.totalFindings} findings)`,
          details: {
            filesProcessed: progress.processedFiles,
            totalFiles: progress.totalFiles,
            findingsProcessed: progress.processedFindings,
            totalFindings: progress.totalFindings,
          },
        });
      }
    }
  );
  
  const verificationTimeoutPromise = new Promise<VerificationResult>((resolve) => {
    setTimeout(() => {
      logger.warn(`Verification timed out after ${VERIFICATION_TIMEOUT}ms`);
      // Return empty result - we'll use original findings
      resolve({
        confirmed: [],
        falsePositives: [],
        uncertain: [],
        stats: {
          totalAnalyzed: allIssues.length + deadCodeIssues.length,
          confirmedCount: 0,
          falsePositiveCount: 0,
          uncertainCount: allIssues.length + deadCodeIssues.length,
        },
      });
    }, VERIFICATION_TIMEOUT);
  });
  
  const verificationResult = await Promise.race([verificationPromise, verificationTimeoutPromise]);
  const verificationTime = Date.now() - verificationStartTime;

  // Check if verification timed out (no findings processed)
  const verificationTimedOut = verificationResult.stats.totalAnalyzed > 0 && 
    verificationResult.stats.confirmedCount === 0 && 
    verificationResult.stats.falsePositiveCount === 0 &&
    allIssues.length + deadCodeIssues.length > 0;

  // Get filtered findings (only confirmed, no false positives)
  // If verification timed out, fall back to using all findings
  const { hallucinations: confirmedHallucinations, deadCode: confirmedDeadCode } = 
    verificationTimedOut 
      ? { hallucinations: allIssues, deadCode: deadCodeIssues }
      : getConfirmedFindings(verificationResult);

  updateProgress({
    phase: "verification",
    percent: 95,
    message: `Verification complete: ${verificationResult.stats.confirmedCount} confirmed, ${verificationResult.stats.falsePositiveCount} filtered`,
    details: { 
      confirmed: verificationResult.stats.confirmedCount,
      falsePositives: verificationResult.stats.falsePositiveCount,
      uncertain: verificationResult.stats.uncertainCount,
    },
  });

  // Phase 7: Calculate results
  updateProgress({
    phase: "finalizing",
    percent: 98,
    message: "Calculating scores and recommendations...",
  });

  // Enrich issues with anti-pattern context
  updateProgress({
    phase: "finalizing",
    percent: 99,
    message: "Enriching with anti-pattern context...",
  });

  // Enrich only CONFIRMED issues with anti-pattern context
  const enrichedConfirmedIssues = await enrichIssuesWithAntiPatterns(confirmedHallucinations, language);

  const score = calculateScore(enrichedConfirmedIssues, confirmedDeadCode);
  const recommendation = generateRecommendation(
    score,
    enrichedConfirmedIssues,
    confirmedDeadCode,
  );

  const totalTime = Date.now() - startTime;

  updateProgress({
    phase: "complete",
    percent: 100,
    message: `Validation complete: ${enrichedConfirmedIssues.length + confirmedDeadCode.length} confirmed issues (filtered ${verificationResult.stats.falsePositiveCount} false positives)`,
    details: {
      score,
      totalIssues: enrichedConfirmedIssues.length + confirmedDeadCode.length,
      confirmedHallucinations: enrichedConfirmedIssues.length,
      confirmedDeadCode: confirmedDeadCode.length,
      falsePositivesFiltered: verificationResult.stats.falsePositiveCount,
    },
  });

  return {
    success: true,
    validated: true,
    score,
    hallucinationDetected: enrichedConfirmedIssues.length > 0,
    deadCodeDetected: confirmedDeadCode.length > 0,
    // Return ONLY confirmed findings (no false positives)
    hallucinations: enrichedConfirmedIssues,
    deadCode: confirmedDeadCode,
    recommendation,
    summary: {
      totalIssues: enrichedConfirmedIssues.length + confirmedDeadCode.length,
      criticalIssues: enrichedConfirmedIssues.filter((i) => (i.confidence ?? 0) >= 85).length,
      highIssues: enrichedConfirmedIssues.filter((i) => (i.confidence ?? 0) >= 70 && (i.confidence ?? 0) < 85).length,
      mediumIssues: enrichedConfirmedIssues.filter((i) => (i.confidence ?? 0) >= 50 && (i.confidence ?? 0) < 70).length,
      deadCodeIssues: deadCodeIssues.length,
    },
    stats: {
      filesScanned: sourceFiles.length,
      filesProcessed,
      batchCount,
      batchSize: validBatchSize,
      symbolsInProject: projectContext.symbolIndex.size,
      symbolsValidatedAgainst: symbolTable.length,
      manifestPackages: manifest.all.size,
      contextBuildTime: `${contextTime}ms`,
      validationTime: `${validationTime}ms`,
      deadCodeTime: `${deadCodeTime}ms`,
      verificationTime: `${verificationTime}ms`,
      totalTime: `${totalTime}ms`,
    },
    /**
     * Automated verification results - shows what was filtered and why
     */
    verification: {
      confirmedCount: verificationTimedOut ? allIssues.length + deadCodeIssues.length : verificationResult.stats.confirmedCount,
      falsePositiveCount: verificationTimedOut ? 0 : verificationResult.stats.falsePositiveCount,
      uncertainCount: verificationTimedOut ? 0 : verificationResult.stats.uncertainCount,
      timedOut: verificationTimedOut,
      details: verificationResult,
    },
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

export async function processBatch(
  files: string[],
  symbolTable: any[],
  manifest: any,
  pythonExports: Map<string, Set<string>>,
  language: string,
  strictMode: boolean,
  context: any, // Added context
): Promise<ValidationIssue[]> {
  const batchIssues: ValidationIssue[] = [];

  for (let i = 0; i < files.length; i++) {
    const filePath = files[i];

    try {
      const content = await fs.readFile(filePath, "utf-8");

      const imports = extractImportsAST(content, language);
      const manifestIssues = await validateManifest(imports, manifest, content, language, filePath);
      batchIssues.push(...manifestIssues);

      const usages = extractUsagesAST(content, language, []);
      
      const missingPackages = new Set<string>();
      for (const issue of manifestIssues) {
        if (issue.type === "dependencyHallucination") {
          const match = issue.message.match(/Package '([^']+)'/);
          if (match) missingPackages.add(match[1]);
        }
      }

      const symbolIssues = validateSymbols(
        usages,
        symbolTable,
        content,
        language,
        strictMode,
        imports,
        pythonExports,
        context,
        filePath,
        missingPackages
      );
      batchIssues.push(...symbolIssues);
    } catch (error) {
      logger.warn(`Error processing file ${filePath}:`, error);
    }

    // Yield to event loop every 2 files (increased frequency for reliability)
    if (i % 2 === 0 && i > 0) {
      await new Promise((resolve) => setImmediate(resolve));
    }
  }

  return batchIssues;
}

async function getSourceFiles(
  projectPath: string,
  language: string,
  includeTests: boolean,
): Promise<string[]> {
  const extensions: Record<string, string[]> = {
    javascript: [".js", ".jsx", ".mjs", ".cjs"],
    typescript: [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx"], // Include JS in TS projects
    python: [".py"],
    go: [".go"],
  };

  const exts = extensions[language] || extensions.typescript;
  
  // Intelligence: Auto-detect source roots (src, app, pages, etc.)
  const commonDirs = language === "python" ? ["app", "src", "server"] : ["src", "app", "pages", "lib", "components"];
  const foundDirs: string[] = [];
  
  for (const dir of commonDirs) {
    const fullPath = path.join(projectPath, dir);
    try {
      await fs.access(fullPath);
      foundDirs.push(dir);
    } catch {
      // Not found
    }
  }

  const sourceDirs = foundDirs.length > 0 ? foundDirs : ["."];
  const patterns: string[] = [];
  
  for (const dir of sourceDirs) {
    for (const ext of exts) {
      patterns.push(path.join(projectPath, dir, `**/*${ext}`));
    }
  }

  const excludes = [
    "**/node_modules/**",
    "**/venv/**",
    "**/.venv/**",
    "**/env/**",
    "**/__pycache__/**",
    "**/dist/**",
    "**/build/**",
    "**/.next/**",
    "**/coverage/**",
    "**/.git/**",
    "**/vendor/**",
    "**/*.min.js",
  ];

  if (!includeTests) {
    excludes.push(
      "**/*.test.*",
      "**/*.spec.*",
      "**/test/**",
      "**/__tests__/**",
      "**/tests/**",
    );
  }

  const files = await glob(patterns, {
    ignore: excludes,
    nodir: true,
    absolute: true,
  });

  return files;
}

// ============================================================================
// Register Handler
// ============================================================================

export function registerValidationJob(): void {
  jobQueue.registerHandler<ValidationJobInput, ValidationJobResult>(
    "validation",
    handleValidationJob,
  );
  logger.info("Registered validation job handler");
}
