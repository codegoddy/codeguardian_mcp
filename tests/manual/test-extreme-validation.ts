/**
 * EXTREME TEST: start_validation mode (per-directory context)
 *
 * Runs validation on report/backend (Python) and report/frontend (TypeScript)
 * separately, each with their own context — exactly like start_validation does.
 *
 * Outputs:
 *   - extreme-results/validation-backend.json
 *   - extreme-results/validation-frontend.json
 *
 * Run: node --loader ts-node/esm tests/manual/test-extreme-validation.ts
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

async function runPerDirectoryValidation(
  dirPath: string,
  language: string,
  label: string,
): Promise<{
  hallucinations: ValidationIssue[];
  deadCode: DeadCodeIssue[];
  confirmedHallucinations: ValidationIssue[];
  confirmedDeadCode: DeadCodeIssue[];
  rawHallucinationCount: number;
  rawDeadCodeCount: number;
  fpCount: number;
  context: any;
  files: string[];
  ctxTime: number;
  dcTime: number;
  verifyTime: number;
}> {
  console.log(`\n${"=".repeat(70)}`);
  console.log(`  ${label}: Per-directory validation (start_validation mode)`);
  console.log(`${"=".repeat(70)}`);
  console.log(`  Directory: ${dirPath}`);
  console.log(`  Language: ${language}\n`);

  // Phase 1: Build context for this directory only
  console.log("  Phase 1: Building per-directory context...");
  const ctxStart = Date.now();
  const orchestration = await orchestrateContext({
    projectPath: dirPath,
    language,
  });
  const context = orchestration.projectContext;
  const ctxTime = Date.now() - ctxStart;
  console.log(`    Context built in ${ctxTime}ms (${context.totalFiles} files, ${context.symbolIndex.size} symbols)`);

  // Phase 2: Load manifests
  console.log("  Phase 2: Loading manifests...");
  const manifest = await loadManifestDependencies(dirPath, language);
  const pythonExports = language === "python" ? await loadPythonModuleExports(dirPath) : new Map();
  console.log(`    Manifest packages: ${manifest.all.size}`);

  // Phase 3: Discover source files
  const exts = language === "python" ? [".py"] : [".ts", ".tsx", ".js", ".jsx"];
  const files = await getSourceFiles(dirPath, exts);
  console.log(`    Source files: ${files.length}`);

  // Phase 4: Build symbol table
  const symbolTable = buildSymbolTable(context);
  console.log(`    Symbol table: ${symbolTable.length} entries`);

  // Phase 5: Validate files
  console.log("  Phase 3: Validating files...");
  const hallucinations: ValidationIssue[] = [];
  let processed = 0;

  for (const filePath of files) {
    const fileLang = detectFileLanguage(filePath);
    if (fileLang === "unknown") continue;

    try {
      const content = await fs.readFile(filePath, "utf-8");
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

      hallucinations.push(...manifestIssues, ...symbolIssues);
      processed++;
      if (processed % 50 === 0) console.log(`    Processed ${processed}/${files.length}...`);
    } catch {
      // Skip unreadable files
    }
  }
  console.log(`    Processed ${processed}/${files.length} files, ${hallucinations.length} raw hallucinations`);

  // Phase 6: Dead code detection
  console.log("  Phase 4: Detecting dead code...");
  const dcStart = Date.now();
  const deadCode = await detectDeadCode(context);
  const dcTime = Date.now() - dcStart;
  console.log(`    Dead code: ${deadCode.length} raw issues (${dcTime}ms)`);

  // Phase 7: Verify findings
  console.log("  Phase 5: Verifying findings...");
  const vStart = Date.now();
  const verification = await verifyFindingsAutomatically(
    hallucinations, deadCode, context, dirPath, language,
  );
  const confirmed = getConfirmedFindings(verification);
  const verifyTime = Date.now() - vStart;
  console.log(`    Confirmed: ${confirmed.hallucinations.length} hallucinations, ${confirmed.deadCode.length} dead code`);
  console.log(`    False positives filtered: ${verification.stats.falsePositiveCount}`);

  return {
    hallucinations,
    deadCode,
    confirmedHallucinations: confirmed.hallucinations,
    confirmedDeadCode: confirmed.deadCode,
    rawHallucinationCount: hallucinations.length,
    rawDeadCodeCount: deadCode.length,
    fpCount: verification.stats.falsePositiveCount,
    context,
    files,
    ctxTime,
    dcTime,
    verifyTime,
  };
}

async function main() {
  const startTime = Date.now();

  console.log("=".repeat(70));
  console.log("  EXTREME TEST: start_validation (per-directory mode)");
  console.log("=".repeat(70));

  // Create output directory
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  // Run backend validation
  const backend = await runPerDirectoryValidation(BACKEND_DIR, "python", "BACKEND");

  // Run frontend validation
  const frontend = await runPerDirectoryValidation(FRONTEND_DIR, "typescript", "FRONTEND");

  const totalTime = Date.now() - startTime;

  // Write results
  const writeResult = (scope: string, data: typeof backend, dirPath: string) => {
    return {
      meta: {
        tool: "start_validation (per-directory)",
        projectPath: dirPath,
        scope,
        language: scope === "backend" ? "python" : "typescript",
        timestamp: new Date().toISOString(),
        totalTimeMs: totalTime,
        contextBuildTimeMs: data.ctxTime,
        deadCodeTimeMs: data.dcTime,
        verificationTimeMs: data.verifyTime,
      },
      context: {
        filesIndexed: data.context.totalFiles,
        symbolsInContext: data.context.symbolIndex.size,
        filesScanned: data.files.length,
      },
      summary: {
        totalConfirmedIssues: data.confirmedHallucinations.length + data.confirmedDeadCode.length,
        hallucinations: data.confirmedHallucinations.length,
        deadCode: data.confirmedDeadCode.length,
        rawHallucinations: data.rawHallucinationCount,
        rawDeadCode: data.rawDeadCodeCount,
        falsePositivesFiltered: data.fpCount,
      },
      hallucinations: data.confirmedHallucinations.map((h) => ({
        type: h.type,
        severity: h.severity,
        file: path.relative(REPORT_DIR, h.file),
        line: h.line,
        message: h.message,
        suggestion: h.suggestion,
        confidence: h.confidence,
      })),
      deadCode: data.confirmedDeadCode.map((dc) => ({
        type: dc.type,
        severity: dc.severity,
        name: dc.name,
        file: path.relative(REPORT_DIR, dc.file),
        line: dc.line,
        message: dc.message,
        suggestion: dc.suggestion,
      })),
    };
  };

  const backendResult = writeResult("backend", backend, BACKEND_DIR);
  const frontendResult = writeResult("frontend", frontend, FRONTEND_DIR);

  const backendPath = path.join(OUTPUT_DIR, "validation-backend.json");
  const frontendPath = path.join(OUTPUT_DIR, "validation-frontend.json");

  await fs.writeFile(backendPath, JSON.stringify(backendResult, null, 2));
  await fs.writeFile(frontendPath, JSON.stringify(frontendResult, null, 2));

  // Summary
  console.log(`\n${"=".repeat(70)}`);
  console.log("  RESULTS: start_validation (per-directory)");
  console.log("=".repeat(70));
  console.log(`  Total time: ${totalTime}ms\n`);
  console.log("  BACKEND (Python):");
  console.log(`    Hallucinations: ${backend.confirmedHallucinations.length} confirmed (${backend.rawHallucinationCount} raw)`);
  console.log(`    Dead Code:      ${backend.confirmedDeadCode.length} confirmed (${backend.rawDeadCodeCount} raw)`);
  console.log("\n  FRONTEND (TypeScript):");
  console.log(`    Hallucinations: ${frontend.confirmedHallucinations.length} confirmed (${frontend.rawHallucinationCount} raw)`);
  console.log(`    Dead Code:      ${frontend.confirmedDeadCode.length} confirmed (${frontend.rawDeadCodeCount} raw)`);
  console.log(`\n  Output: ${OUTPUT_DIR}/`);
  console.log("=".repeat(70));
}

main()
  .then(() => process.exit(0))
  .catch((err) => { console.error("Test failed:", err); process.exit(1); });
