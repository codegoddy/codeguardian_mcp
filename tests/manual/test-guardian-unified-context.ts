/**
 * Test: start_guardian Unified Context vs Per-Directory Validation
 *
 * Verifies that start_guardian's single unified context (language="all")
 * produces the same hallucination + dead code results as building
 * context per-directory (like start_validation does).
 *
 * Outputs:
 *   - guardian-results-backend.json  (backend issues from unified context)
 *   - guardian-results-frontend.json (frontend issues from unified context)
 *
 * Run with: node --loader ts-node/esm tests/manual/test-guardian-unified-context.ts
 *
 * @format
 */

import * as path from "path";
import * as fs from "fs/promises";
import { glob } from "glob";
import { orchestrateContext } from "../../src/context/contextOrchestrator.js";
import {
  extractUsagesAST,
  extractImportsAST,
  extractTypeReferencesAST,
} from "../../src/tools/validation/extractors/index.js";
import {
  loadManifestDependencies,
  loadPythonModuleExports,
} from "../../src/tools/validation/manifest.js";
import {
  validateManifest,
  validateSymbols,
  buildSymbolTable,
} from "../../src/tools/validation/validation.js";
import { detectDeadCode } from "../../src/tools/validation/deadCode.js";
import {
  verifyFindingsAutomatically,
  getConfirmedFindings,
} from "../../src/analyzers/findingVerifier.js";
import type { ValidationIssue, DeadCodeIssue } from "../../src/tools/validation/types.js";

// ============================================================================
// Config
// ============================================================================

const REPORT_DIR = path.join(process.cwd(), "report");
const BACKEND_DIR = path.join(REPORT_DIR, "backend");
const FRONTEND_DIR = path.join(REPORT_DIR, "frontend");
const OUTPUT_DIR = path.join(process.cwd(), "tests/manual");

// ============================================================================
// Helpers
// ============================================================================

function detectFileLanguage(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    ".js": "javascript",
    ".jsx": "javascript",
    ".mjs": "javascript",
    ".cjs": "javascript",
    ".ts": "typescript",
    ".tsx": "typescript",
    ".mts": "typescript",
    ".cts": "typescript",
    ".py": "python",
  };
  return map[ext] || "unknown";
}

async function getSourceFiles(dir: string, exts: string[]): Promise<string[]> {
  const patterns = exts.map((ext) => path.join(dir, `**/*${ext}`));
  const excludes = [
    "**/node_modules/**",
    "**/venv/**",
    "**/.venv/**",
    "**/__pycache__/**",
    "**/dist/**",
    "**/build/**",
    "**/.next/**",
    "**/coverage/**",
    "**/.git/**",
    "**/*.min.js",
  ];

  const files: string[] = [];
  for (const pattern of patterns) {
    const matched = await glob(pattern, { ignore: excludes, absolute: true });
    files.push(...matched);
  }
  return [...new Set(files)].sort();
}

function isBackendFile(filePath: string): boolean {
  return filePath.includes("/report/backend/");
}

function isFrontendFile(filePath: string): boolean {
  return filePath.includes("/report/frontend/");
}

// ============================================================================
// Main Test
// ============================================================================

async function runGuardianUnifiedContextTest() {
  const startTime = Date.now();

  console.log("=".repeat(70));
  console.log("  start_guardian Unified Context — Hallucination & Dead Code Test");
  console.log("=".repeat(70));
  console.log(`\nProject: ${REPORT_DIR}`);
  console.log(`Backend: ${BACKEND_DIR}`);
  console.log(`Frontend: ${FRONTEND_DIR}\n`);

  // ========================================================================
  // Phase 1: Build UNIFIED context (like start_guardian does)
  // ========================================================================
  console.log("Phase 1: Building unified context (language='all')...");
  const ctxStart = Date.now();

  const orchestration = await orchestrateContext({
    projectPath: REPORT_DIR,
    language: "all",
  });
  const context = orchestration.projectContext;

  const ctxTime = Date.now() - ctxStart;
  console.log(`  Context built in ${ctxTime}ms`);
  console.log(`  Total files indexed: ${context.totalFiles}`);
  console.log(`  Symbols in index: ${context.symbolIndex.size}`);
  console.log(`  Context quality: ${orchestration.contextQuality}\n`);

  // ========================================================================
  // Phase 2: Load manifests for both languages
  // ========================================================================
  // NOTE: start_guardian's AutoValidator.start() loads manifests via
  //   loadManifestDependencies(this.projectPath, "typescript")
  //   loadManifestDependencies(this.projectPath, "python")
  // When projectPath is report/, the upward search may find the WRONG
  // package.json (codeguardian root). start_validation avoids this by
  // running per-directory. We load from the correct subdirectories here
  // to isolate the context difference from the manifest lookup issue.
  console.log("Phase 2: Loading manifests...");
  console.log("  Loading TS manifest from frontend dir...");
  const tsManifest = await loadManifestDependencies(FRONTEND_DIR, "typescript");
  console.log("  Loading Python manifest from backend dir...");
  const pyManifest = await loadManifestDependencies(BACKEND_DIR, "python");
  const pythonExports = await loadPythonModuleExports(BACKEND_DIR);

  // Also load from report/ root to show the difference
  console.log("  Loading manifests from report/ root (what start_guardian actually does)...");
  const tsManifestRoot = await loadManifestDependencies(REPORT_DIR, "typescript");
  const pyManifestRoot = await loadManifestDependencies(REPORT_DIR, "python");
  console.log(`  TS packages (from frontend/): ${tsManifest.all.size}`);
  console.log(`  TS packages (from report/ root): ${tsManifestRoot.all.size} ${tsManifestRoot.all.size !== tsManifest.all.size ? '⚠️  DIFFERENT!' : '✅ same'}`);
  console.log(`  Python packages (from backend/): ${pyManifest.all.size}`);
  console.log(`  Python packages (from report/ root): ${pyManifestRoot.all.size} ${pyManifestRoot.all.size !== pyManifest.all.size ? '⚠️  DIFFERENT!' : '✅ same'}`);

  console.log(`  Python module exports: ${pythonExports.size}\n`);

  // ========================================================================
  // Phase 3: Discover all source files
  // ========================================================================
  console.log("Phase 3: Discovering source files...");
  const backendFiles = await getSourceFiles(BACKEND_DIR, [".py"]);
  const frontendFiles = await getSourceFiles(FRONTEND_DIR, [".ts", ".tsx", ".js", ".jsx"]);

  console.log(`  Backend files: ${backendFiles.length}`);
  console.log(`  Frontend files: ${frontendFiles.length}\n`);

  // ========================================================================
  // Phase 4: Build symbol table from unified context
  // ========================================================================
  console.log("Phase 4: Building symbol table from unified context...");
  const symbolTable = buildSymbolTable(context);
  console.log(`  Symbol table entries: ${symbolTable.length}\n`);

  // ========================================================================
  // Phase 5: Validate all files (hallucinations) using unified context
  // ========================================================================
  console.log("Phase 5: Validating files for hallucinations...");

  const backendHallucinations: ValidationIssue[] = [];
  const frontendHallucinations: ValidationIssue[] = [];

  const allFiles = [...backendFiles, ...frontendFiles];
  let processed = 0;

  for (const filePath of allFiles) {
    const fileLang = detectFileLanguage(filePath);
    if (fileLang === "unknown") continue;

    try {
      const content = await fs.readFile(filePath, "utf-8");
      const manifest = fileLang === "python" ? pyManifest : tsManifest;

      // Extract imports and usages
      const imports = extractImportsAST(content, fileLang);
      const usages = extractUsagesAST(content, fileLang, imports);
      const typeReferences = extractTypeReferencesAST(content, fileLang);

      // Validate manifest (dependency hallucinations)
      const manifestIssues = await validateManifest(imports, manifest, content, fileLang, filePath);

      // Collect missing packages for symbol validation
      const missingPackages = new Set<string>();
      for (const issue of manifestIssues) {
        if (issue.type === "dependencyHallucination") {
          const match = issue.message.match(/Package '([^']+)'/);
          if (match) missingPackages.add(match[1]);
        }
      }

      // Validate symbols (hallucinations)
      const symbolIssues = validateSymbols(
        usages,
        symbolTable,
        content,
        fileLang,
        false, // strictMode
        imports,
        pythonExports,
        context,
        filePath,
        missingPackages,
        typeReferences,
      );

      const fileIssues = [...manifestIssues, ...symbolIssues];

      if (isBackendFile(filePath)) {
        backendHallucinations.push(...fileIssues);
      } else if (isFrontendFile(filePath)) {
        frontendHallucinations.push(...fileIssues);
      }

      processed++;
      if (processed % 50 === 0) {
        console.log(`  Processed ${processed}/${allFiles.length} files...`);
      }
    } catch (err) {
      // Skip files we can't read
    }
  }

  console.log(`  Processed ${processed}/${allFiles.length} files`);
  console.log(`  Backend hallucinations (raw): ${backendHallucinations.length}`);
  console.log(`  Frontend hallucinations (raw): ${frontendHallucinations.length}\n`);

  // ========================================================================
  // Phase 6: Dead code detection per-scope (avoids 300-export cap)
  // ========================================================================
  console.log("Phase 6: Detecting dead code per-scope (backend + frontend separately)...");
  const dcStart = Date.now();

  const DEAD_CODE_TIMEOUT = 120000;

  // Run per-scope SEQUENTIALLY to avoid cache contention
  // (detectDeadCode clears shared caches at the start of each call)
  console.log("  Running backend dead code detection...");
  const backendDeadCode = await detectDeadCode(
    context, undefined, (fp) => fp.startsWith(BACKEND_DIR),
  );
  console.log(`  Backend done: ${backendDeadCode.length} issues`);
  console.log("  Running frontend dead code detection...");
  const frontendDeadCode = await detectDeadCode(
    context, undefined, (fp) => fp.startsWith(FRONTEND_DIR),
  );
  const dcTime = Date.now() - dcStart;

  console.log(`  Dead code detection took ${dcTime}ms`);
  console.log(`  Backend dead code (raw): ${backendDeadCode.length}`);
  console.log(`  Frontend dead code (raw): ${frontendDeadCode.length}\n`);

  // ========================================================================
  // Phase 7: Verification (eliminate false positives)
  // ========================================================================
  console.log("Phase 7: Verifying findings (eliminating false positives)...");
  const verifyStart = Date.now();

  // Verify backend
  console.log("  Verifying backend...");
  const backendVerification = await verifyFindingsAutomatically(
    backendHallucinations,
    backendDeadCode,
    context,
    REPORT_DIR,
    "all",
  );
  const confirmedBackend = getConfirmedFindings(backendVerification);

  // Verify frontend
  console.log("  Verifying frontend...");
  const frontendVerification = await verifyFindingsAutomatically(
    frontendHallucinations,
    frontendDeadCode,
    context,
    REPORT_DIR,
    "all",
  );
  const confirmedFrontend = getConfirmedFindings(frontendVerification);

  const verifyTime = Date.now() - verifyStart;
  console.log(`  Verification took ${verifyTime}ms`);
  console.log(`  Backend: ${confirmedBackend.hallucinations.length} hallucinations, ${confirmedBackend.deadCode.length} dead code (filtered ${backendVerification.stats.falsePositiveCount} FPs)`);
  console.log(`  Frontend: ${confirmedFrontend.hallucinations.length} hallucinations, ${confirmedFrontend.deadCode.length} dead code (filtered ${frontendVerification.stats.falsePositiveCount} FPs)\n`);

  // ========================================================================
  // Phase 8: Write JSON output
  // ========================================================================
  console.log("Phase 8: Writing JSON output...");

  const totalTime = Date.now() - startTime;

  const backendResult = {
    meta: {
      tool: "start_guardian (unified context)",
      projectPath: REPORT_DIR,
      scope: "backend",
      backendDir: BACKEND_DIR,
      contextLanguage: "all",
      timestamp: new Date().toISOString(),
      totalTimeMs: totalTime,
      contextBuildTimeMs: ctxTime,
      deadCodeTimeMs: dcTime,
      verificationTimeMs: verifyTime,
    },
    context: {
      totalFilesInUnifiedContext: context.totalFiles,
      symbolsInUnifiedContext: context.symbolIndex.size,
      contextQuality: orchestration.contextQuality,
      backendFilesScanned: backendFiles.length,
      tsManifestPackages: tsManifest.all.size,
      pyManifestPackages: pyManifest.all.size,
    },
    summary: {
      totalConfirmedIssues: confirmedBackend.hallucinations.length + confirmedBackend.deadCode.length,
      hallucinations: confirmedBackend.hallucinations.length,
      deadCode: confirmedBackend.deadCode.length,
      rawHallucinations: backendHallucinations.length,
      rawDeadCode: backendDeadCode.length,
      falsePositivesFiltered: backendVerification.stats.falsePositiveCount,
      uncertainCount: backendVerification.stats.uncertainCount,
    },
    hallucinations: confirmedBackend.hallucinations.map((h) => ({
      type: h.type,
      severity: h.severity,
      file: path.relative(REPORT_DIR, h.file),
      line: h.line,
      message: h.message,
      suggestion: h.suggestion,
      confidence: h.confidence,
    })),
    deadCode: confirmedBackend.deadCode.map((dc) => ({
      type: dc.type,
      severity: dc.severity,
      name: dc.name,
      file: path.relative(REPORT_DIR, dc.file),
      line: dc.line,
      message: dc.message,
      suggestion: dc.suggestion,
    })),
  };

  const frontendResult = {
    meta: {
      tool: "start_guardian (unified context)",
      projectPath: REPORT_DIR,
      scope: "frontend",
      frontendDir: FRONTEND_DIR,
      contextLanguage: "all",
      timestamp: new Date().toISOString(),
      totalTimeMs: totalTime,
      contextBuildTimeMs: ctxTime,
      deadCodeTimeMs: dcTime,
      verificationTimeMs: verifyTime,
    },
    context: {
      totalFilesInUnifiedContext: context.totalFiles,
      symbolsInUnifiedContext: context.symbolIndex.size,
      contextQuality: orchestration.contextQuality,
      frontendFilesScanned: frontendFiles.length,
      tsManifestPackages: tsManifest.all.size,
      pyManifestPackages: pyManifest.all.size,
    },
    summary: {
      totalConfirmedIssues: confirmedFrontend.hallucinations.length + confirmedFrontend.deadCode.length,
      hallucinations: confirmedFrontend.hallucinations.length,
      deadCode: confirmedFrontend.deadCode.length,
      rawHallucinations: frontendHallucinations.length,
      rawDeadCode: frontendDeadCode.length,
      falsePositivesFiltered: frontendVerification.stats.falsePositiveCount,
      uncertainCount: frontendVerification.stats.uncertainCount,
    },
    hallucinations: confirmedFrontend.hallucinations.map((h) => ({
      type: h.type,
      severity: h.severity,
      file: path.relative(REPORT_DIR, h.file),
      line: h.line,
      message: h.message,
      suggestion: h.suggestion,
      confidence: h.confidence,
    })),
    deadCode: confirmedFrontend.deadCode.map((dc) => ({
      type: dc.type,
      severity: dc.severity,
      name: dc.name,
      file: path.relative(REPORT_DIR, dc.file),
      line: dc.line,
      message: dc.message,
      suggestion: dc.suggestion,
    })),
  };

  const backendPath = path.join(OUTPUT_DIR, "guardian-results-backend.json");
  const frontendPath = path.join(OUTPUT_DIR, "guardian-results-frontend.json");

  await fs.writeFile(backendPath, JSON.stringify(backendResult, null, 2));
  await fs.writeFile(frontendPath, JSON.stringify(frontendResult, null, 2));

  console.log(`  Backend results: ${backendPath}`);
  console.log(`  Frontend results: ${frontendPath}\n`);

  // ========================================================================
  // Summary
  // ========================================================================
  console.log("=".repeat(70));
  console.log("  RESULTS SUMMARY (start_guardian unified context)");
  console.log("=".repeat(70));
  console.log(`\n  Total time: ${totalTime}ms`);
  console.log(`  Context: ${context.totalFiles} files, ${context.symbolIndex.size} symbols (quality: ${orchestration.contextQuality})`);
  console.log("");
  console.log("  BACKEND (Python):");
  console.log(`    Hallucinations: ${confirmedBackend.hallucinations.length} confirmed (${backendHallucinations.length} raw, ${backendVerification.stats.falsePositiveCount} FPs filtered)`);
  console.log(`    Dead Code:      ${confirmedBackend.deadCode.length} confirmed (${backendDeadCode.length} raw)`);
  console.log("");
  console.log("  FRONTEND (TypeScript/React):");
  console.log(`    Hallucinations: ${confirmedFrontend.hallucinations.length} confirmed (${frontendHallucinations.length} raw, ${frontendVerification.stats.falsePositiveCount} FPs filtered)`);
  console.log(`    Dead Code:      ${confirmedFrontend.deadCode.length} confirmed (${frontendDeadCode.length} raw)`);
  console.log("");
  console.log("  Compare these numbers with your start_validation results");
  console.log("  to verify unified context produces the same findings.");
  console.log("=".repeat(70));
}

runGuardianUnifiedContextTest()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Test failed:", err);
    process.exit(1);
  });
