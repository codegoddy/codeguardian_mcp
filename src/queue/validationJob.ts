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
import type {
  ValidationIssue,
  DeadCodeIssue,
} from "../tools/validation/types.js";
import { glob } from "glob";
import * as fs from "fs/promises";

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
    totalTime: string;
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
  const DEAD_CODE_TIMEOUT = 30000; // 30 seconds max
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
    percent: 95,
    message: `Dead code detection complete: ${deadCodeIssues.length} issues found`,
    details: { deadCodeCount: deadCodeIssues.length },
  });

  // Phase 6: Calculate results
  updateProgress({
    phase: "finalizing",
    percent: 98,
    message: "Calculating scores and recommendations...",
  });

  const score = calculateScore(allIssues, deadCodeIssues);
  const recommendation = generateRecommendation(
    score,
    allIssues,
    deadCodeIssues,
  );

  const totalTime = Date.now() - startTime;

  // Group issues by severity
  const criticalIssues = allIssues.filter((i) => (i.confidence ?? 0) >= 85);
  const highIssues = allIssues.filter(
    (i) => (i.confidence ?? 0) >= 70 && (i.confidence ?? 0) < 85,
  );
  const mediumIssues = allIssues.filter(
    (i) => (i.confidence ?? 0) >= 50 && (i.confidence ?? 0) < 70,
  );

  updateProgress({
    phase: "complete",
    percent: 100,
    message: "Validation complete",
    details: {
      score,
      totalIssues: allIssues.length,
      deadCodeIssues: deadCodeIssues.length,
    },
  });

  return {
    success: true,
    validated: true,
    score,
    hallucinationDetected: allIssues.length > 0,
    deadCodeDetected: deadCodeIssues.length > 0,
    hallucinations: allIssues,
    deadCode: deadCodeIssues,
    recommendation,
    summary: {
      totalIssues: allIssues.length,
      criticalIssues: criticalIssues.length,
      highIssues: highIssues.length,
      mediumIssues: mediumIssues.length,
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
      totalTime: `${totalTime}ms`,
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
      const manifestIssues = validateManifest(imports, manifest, content);
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
  const patterns = exts.map((ext) => `${projectPath}/**/*${ext}`);

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
