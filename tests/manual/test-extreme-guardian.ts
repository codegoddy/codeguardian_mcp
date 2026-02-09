/**
 * EXTREME TEST: start_guardian mode (unified context)
 *
 * Runs validation on report/ with a single unified context (language="all")
 * — exactly like start_guardian does. Results split by backend/frontend.
 *
 * Outputs:
 *   - extreme-results/guardian-backend.json
 *   - extreme-results/guardian-frontend.json
 *
 * Run: node --loader ts-node/esm tests/manual/test-extreme-guardian.ts
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

const REPORT_DIR = path.join(process.cwd(), "report");
const BACKEND_DIR = path.join(REPORT_DIR, "backend");
const FRONTEND_DIR = path.join(REPORT_DIR, "frontend");
const OUTPUT_DIR = path.join(process.cwd(), "tests/manual/extreme-results");

function detectFileLanguage(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    ".js": "javascript", ".jsx": "javascript",
    ".ts": "typescript", ".tsx": "typescript",
    ".py": "python",
  };
  return map[ext] || "unknown";
}

async function getSourceFiles(dir: string, exts: string[]): Promise<string[]> {
  const patterns = exts.map((ext) => path.join(dir, `**/*${ext}`));
  const excludes = [
    "**/node_modules/**", "**/venv/**", "**/.venv/**",
    "**/__pycache__/**", "**/dist/**", "**/build/**",
    "**/.next/**", "**/coverage/**", "**/.git/**", "**/*.min.js",
  ];
  const files: string[] = [];
  for (const pattern of patterns) {
    const matched = await glob(pattern, { ignore: excludes, absolute: true });
    files.push(...matched);
  }
  return [...new Set(files)].sort();
}

function isBackendFile(fp: string): boolean { return fp.includes("/report/backend/"); }
function isFrontendFile(fp: string): boolean { return fp.includes("/report/frontend/"); }

async function main() {
  const startTime = Date.now();

  console.log("=".repeat(70));
  console.log("  EXTREME TEST: start_guardian (unified context mode)");
  console.log("=".repeat(70));
  console.log(`\nProject: ${REPORT_DIR}\n`);

  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  // Phase 1: Build UNIFIED context
  console.log("Phase 1: Building unified context (language='all')...");
  const ctxStart = Date.now();
  const orchestration = await orchestrateContext({
    projectPath: REPORT_DIR,
    language: "all",
  });
  const context = orchestration.projectContext;
  const ctxTime = Date.now() - ctxStart;
  console.log(`  Context: ${context.totalFiles} files, ${context.symbolIndex.size} symbols (${ctxTime}ms)\n`);

  // Phase 2: Load manifests from correct subdirectories (like fixed AutoValidator)
  console.log("Phase 2: Loading manifests from subdirectories...");
  const tsManifest = await loadManifestDependencies(FRONTEND_DIR, "typescript");
  const pyManifest = await loadManifestDependencies(BACKEND_DIR, "python");
  const pythonExports = await loadPythonModuleExports(BACKEND_DIR);
  console.log(`  TS packages: ${tsManifest.all.size}, Python packages: ${pyManifest.all.size}\n`);

  // Phase 3: Discover files
  console.log("Phase 3: Discovering source files...");
  const backendFiles = await getSourceFiles(BACKEND_DIR, [".py"]);
  const frontendFiles = await getSourceFiles(FRONTEND_DIR, [".ts", ".tsx", ".js", ".jsx"]);
  console.log(`  Backend: ${backendFiles.length}, Frontend: ${frontendFiles.length}\n`);

  // Phase 4: Build symbol table from unified context
  console.log("Phase 4: Building unified symbol table...");
  const symbolTable = buildSymbolTable(context);
  console.log(`  Symbol table: ${symbolTable.length} entries\n`);

  // Phase 5: Validate all files
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

      const imports = extractImportsAST(content, fileLang);
      const usages = extractUsagesAST(content, fileLang, imports);
      const typeReferences = extractTypeReferencesAST(content, fileLang);

      const manifestIssues = await validateManifest(imports, manifest, content, fileLang, filePath);
      const missingPackages = new Set<string>();
      for (const issue of manifestIssues) {
        if (issue.type === "dependencyHallucination") {
          const match = issue.message.match(/Package '([^']+)'/);
          if (match) missingPackages.add(match[1]);
        }
      }

      const symbolIssues = validateSymbols(
        usages, symbolTable, content, fileLang, false,
        imports, pythonExports, context, filePath,
        missingPackages, typeReferences,
      );

      const fileIssues = [...manifestIssues, ...symbolIssues];
      if (isBackendFile(filePath)) backendHallucinations.push(...fileIssues);
      else if (isFrontendFile(filePath)) frontendHallucinations.push(...fileIssues);

      processed++;
      if (processed % 50 === 0) console.log(`  Processed ${processed}/${allFiles.length}...`);
    } catch {
      // Skip unreadable files
    }
  }
  console.log(`  Done: ${processed}/${allFiles.length} files`);
  console.log(`  Backend raw: ${backendHallucinations.length}, Frontend raw: ${frontendHallucinations.length}\n`);

  // Phase 6: Dead code per-scope (like fixed AutoValidator)
  console.log("Phase 6: Dead code detection per-scope...");
  const dcStart = Date.now();
  console.log("  Running backend dead code...");
  const backendDeadCode = await detectDeadCode(context, undefined, (fp) => fp.startsWith(BACKEND_DIR));
  console.log(`  Backend: ${backendDeadCode.length} raw`);
  console.log("  Running frontend dead code...");
  const frontendDeadCode = await detectDeadCode(context, undefined, (fp) => fp.startsWith(FRONTEND_DIR));
  const dcTime = Date.now() - dcStart;
  console.log(`  Frontend: ${frontendDeadCode.length} raw (${dcTime}ms total)\n`);

  // Phase 7: Verify findings
  console.log("Phase 7: Verifying findings...");
  const vStart = Date.now();
  console.log("  Verifying backend...");
  const backendVerification = await verifyFindingsAutomatically(
    backendHallucinations, backendDeadCode, context, REPORT_DIR, "all",
  );
  const confirmedBackend = getConfirmedFindings(backendVerification);

  console.log("  Verifying frontend...");
  const frontendVerification = await verifyFindingsAutomatically(
    frontendHallucinations, frontendDeadCode, context, REPORT_DIR, "all",
  );
  const confirmedFrontend = getConfirmedFindings(frontendVerification);
  const verifyTime = Date.now() - vStart;
  console.log(`  Backend: ${confirmedBackend.hallucinations.length} hall, ${confirmedBackend.deadCode.length} dc (${backendVerification.stats.falsePositiveCount} FPs)`);
  console.log(`  Frontend: ${confirmedFrontend.hallucinations.length} hall, ${confirmedFrontend.deadCode.length} dc (${frontendVerification.stats.falsePositiveCount} FPs)\n`);

  // Phase 8: Write output
  console.log("Phase 8: Writing JSON output...");
  const totalTime = Date.now() - startTime;

  const buildResult = (
    scope: string, dir: string, files: string[],
    confirmed: { hallucinations: ValidationIssue[]; deadCode: DeadCodeIssue[] },
    rawH: number, rawDC: number, fpCount: number,
  ) => ({
    meta: {
      tool: "start_guardian (unified context)",
      projectPath: REPORT_DIR,
      scope,
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
      filesScanned: files.length,
      tsManifestPackages: tsManifest.all.size,
      pyManifestPackages: pyManifest.all.size,
    },
    summary: {
      totalConfirmedIssues: confirmed.hallucinations.length + confirmed.deadCode.length,
      hallucinations: confirmed.hallucinations.length,
      deadCode: confirmed.deadCode.length,
      rawHallucinations: rawH,
      rawDeadCode: rawDC,
      falsePositivesFiltered: fpCount,
    },
    hallucinations: confirmed.hallucinations.map((h) => ({
      type: h.type,
      severity: h.severity,
      file: path.relative(REPORT_DIR, h.file),
      line: h.line,
      message: h.message,
      suggestion: h.suggestion,
      confidence: h.confidence,
    })),
    deadCode: confirmed.deadCode.map((dc) => ({
      type: dc.type,
      severity: dc.severity,
      name: dc.name,
      file: path.relative(REPORT_DIR, dc.file),
      line: dc.line,
      message: dc.message,
      suggestion: dc.suggestion,
    })),
  });

  const backendResult = buildResult(
    "backend", BACKEND_DIR, backendFiles,
    confirmedBackend, backendHallucinations.length, backendDeadCode.length,
    backendVerification.stats.falsePositiveCount,
  );
  const frontendResult = buildResult(
    "frontend", FRONTEND_DIR, frontendFiles,
    confirmedFrontend, frontendHallucinations.length, frontendDeadCode.length,
    frontendVerification.stats.falsePositiveCount,
  );

  await fs.writeFile(path.join(OUTPUT_DIR, "guardian-backend.json"), JSON.stringify(backendResult, null, 2));
  await fs.writeFile(path.join(OUTPUT_DIR, "guardian-frontend.json"), JSON.stringify(frontendResult, null, 2));

  // Summary
  console.log(`\n${"=".repeat(70)}`);
  console.log("  RESULTS: start_guardian (unified context)");
  console.log("=".repeat(70));
  console.log(`  Total time: ${totalTime}ms`);
  console.log(`  Context: ${context.totalFiles} files, ${context.symbolIndex.size} symbols\n`);
  console.log("  BACKEND (Python):");
  console.log(`    Hallucinations: ${confirmedBackend.hallucinations.length} confirmed (${backendHallucinations.length} raw)`);
  console.log(`    Dead Code:      ${confirmedBackend.deadCode.length} confirmed (${backendDeadCode.length} raw)`);
  console.log("\n  FRONTEND (TypeScript):");
  console.log(`    Hallucinations: ${confirmedFrontend.hallucinations.length} confirmed (${frontendHallucinations.length} raw)`);
  console.log(`    Dead Code:      ${confirmedFrontend.deadCode.length} confirmed (${frontendDeadCode.length} raw)`);
  console.log(`\n  Output: ${OUTPUT_DIR}/`);
  console.log("=".repeat(70));
}

main()
  .then(() => process.exit(0))
  .catch((err) => { console.error("Test failed:", err); process.exit(1); });
