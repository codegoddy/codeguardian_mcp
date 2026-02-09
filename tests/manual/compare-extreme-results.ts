/**
 * Compare extreme test results from both tools against the ground truth manifest.
 *
 * Reads:
 *   - extreme-results/validation-backend.json
 *   - extreme-results/validation-frontend.json
 *   - extreme-results/guardian-backend.json
 *   - extreme-results/guardian-frontend.json
 *   - extreme-test-manifest.json
 *
 * Run: node --loader ts-node/esm tests/manual/compare-extreme-results.ts
 *
 * @format
 */

import * as fs from "fs/promises";
import * as path from "path";

const BASE = path.join(process.cwd(), "tests/manual");
const RESULTS = path.join(BASE, "extreme-results");

interface ResultFile {
  meta: { tool: string; scope: string };
  summary: {
    hallucinations: number;
    deadCode: number;
    rawHallucinations: number;
    rawDeadCode: number;
    falsePositivesFiltered: number;
  };
  hallucinations: Array<{
    type: string;
    file: string;
    line: number;
    message: string;
  }>;
  deadCode: Array<{
    type: string;
    name: string;
    file: string;
    line: number;
    message: string;
  }>;
}

// Test file paths (relative to report/)
const TEST_FILES = {
  backend: [
    "backend/app/api/test_hallucinations_extreme.py",
    "backend/app/services/phantom_analytics_service.py",
  ],
  frontend: [
    "frontend/src/services/test-hallucinations-extreme.ts",
    "frontend/src/services/broken-api-contracts.ts",
    "frontend/src/components/PhantomDashboard.tsx",
    "frontend/src/utils/phantom-helpers.ts",
  ],
};

function filterToTestFiles(items: Array<{ file: string; type: string; [key: string]: any }>, testFiles: string[]): typeof items {
  return items.filter((item) => testFiles.some((tf) => item.file.includes(tf) || tf.includes(item.file)));
}

function countByType(items: Array<{ type: string; [key: string]: any }>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    counts[item.type] = (counts[item.type] || 0) + 1;
  }
  return counts;
}

function checkManifestItem(
  items: Array<{ type: string; message: string; file: string }>,
  name: string,
  type: string,
): boolean {
  return items.some((item) => {
    if (item.type !== type) return false;
    const msg = item.message.toLowerCase();
    const lname = name.toLowerCase();
    // Direct match
    if (msg.includes(lname) || item.message.includes(`'${name}'`) || item.message.includes(`"${name}"`)) return true;
    // Dotted method name: "ApiService.graphql" → check "'graphql'" + "'ApiService'"
    if (name.includes(".")) {
      const parts = name.split(".");
      const methodName = parts[parts.length - 1];
      const objName = parts[0];
      if (msg.includes(methodName.toLowerCase()) && msg.includes(objName.toLowerCase())) return true;
    }
    return false;
  });
}

function checkDeadCodeItem(
  items: Array<{ type: string; name: string; file: string }>,
  name: string,
): boolean {
  // Strip path components — just match the base filename or symbol name
  const baseName = name.replace(/.*\//, "");
  return items.some(
    (item) =>
      item.name === name ||
      item.name.includes(name) ||
      item.file.includes(name) ||
      item.name.includes(baseName) ||
      item.file.includes(baseName),
  );
}

async function main() {
  // Load manifest
  const manifest = JSON.parse(await fs.readFile(path.join(BASE, "extreme-test-manifest.json"), "utf-8"));

  // Load result files
  const files: Record<string, ResultFile> = {};
  const fileNames = [
    "validation-backend", "validation-frontend",
    "guardian-backend", "guardian-frontend",
  ];

  for (const name of fileNames) {
    try {
      files[name] = JSON.parse(await fs.readFile(path.join(RESULTS, `${name}.json`), "utf-8"));
    } catch {
      console.error(`Missing: ${name}.json — run the corresponding test first`);
      process.exit(1);
    }
  }

  console.log("=".repeat(80));
  console.log("  EXTREME TEST: COMPARISON REPORT");
  console.log("  start_validation (per-directory) vs start_guardian (unified context)");
  console.log("=".repeat(80));

  // =========================================================================
  // Overall summary
  // =========================================================================
  console.log("\n## OVERALL SUMMARY\n");
  console.log("| Metric                    | Validation Backend | Guardian Backend | Validation Frontend | Guardian Frontend |");
  console.log("|---------------------------|-------------------|-----------------|--------------------|--------------------|");
  for (const metric of ["hallucinations", "deadCode", "rawHallucinations", "rawDeadCode", "falsePositivesFiltered"] as const) {
    const label = metric.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase());
    console.log(
      `| ${label.padEnd(25)} | ${String(files["validation-backend"].summary[metric]).padStart(17)} | ${String(files["guardian-backend"].summary[metric]).padStart(15)} | ${String(files["validation-frontend"].summary[metric]).padStart(18)} | ${String(files["guardian-frontend"].summary[metric]).padStart(18)} |`,
    );
  }

  // =========================================================================
  // Issues from TEST FILES only
  // =========================================================================
  console.log("\n## ISSUES FROM INJECTED TEST FILES ONLY\n");

  for (const scope of ["backend", "frontend"] as const) {
    const valKey = `validation-${scope}` as keyof typeof files;
    const guardKey = `guardian-${scope}` as keyof typeof files;
    const testFiles = TEST_FILES[scope];

    const valHall = filterToTestFiles(files[valKey].hallucinations, testFiles);
    const guardHall = filterToTestFiles(files[guardKey].hallucinations, testFiles);
    const valDC = filterToTestFiles(files[valKey].deadCode, testFiles);
    const guardDC = filterToTestFiles(files[guardKey].deadCode, testFiles);

    console.log(`### ${scope.toUpperCase()}`);
    console.log(`  Test files: ${testFiles.join(", ")}`);
    console.log(`  Hallucinations from test files:  Validation=${valHall.length}  Guardian=${guardHall.length}`);
    console.log(`  Dead code from test files:       Validation=${valDC.length}    Guardian=${guardDC.length}`);

    // Type breakdown
    console.log(`\n  Hallucination type breakdown:`);
    const valTypes = countByType(valHall);
    const guardTypes = countByType(guardHall);
    const allTypes = new Set([...Object.keys(valTypes), ...Object.keys(guardTypes)]);
    for (const t of [...allTypes].sort()) {
      const v = valTypes[t] || 0;
      const g = guardTypes[t] || 0;
      const match = v === g ? "✅" : v > g ? "⚠️  validation found more" : "⚠️  guardian found more";
      console.log(`    ${t.padEnd(25)} Validation=${String(v).padStart(3)}  Guardian=${String(g).padStart(3)}  ${match}`);
    }

    // Dead code type breakdown
    console.log(`\n  Dead code type breakdown:`);
    const valDCTypes = countByType(valDC);
    const guardDCTypes = countByType(guardDC);
    const allDCTypes = new Set([...Object.keys(valDCTypes), ...Object.keys(guardDCTypes)]);
    for (const t of [...allDCTypes].sort()) {
      const v = valDCTypes[t] || 0;
      const g = guardDCTypes[t] || 0;
      const match = v === g ? "✅" : "⚠️";
      console.log(`    ${t.padEnd(25)} Validation=${String(v).padStart(3)}  Guardian=${String(g).padStart(3)}  ${match}`);
    }
    console.log("");
  }

  // =========================================================================
  // Check specific manifest items
  // =========================================================================
  console.log("\n## MANIFEST DETECTION CHECK\n");
  console.log("Checking if each injected issue was caught by each tool...\n");

  const manifestIssues = manifest.injectedIssues;
  let totalChecks = 0;
  let valCaught = 0;
  let guardCaught = 0;

  // Backend hallucinations
  console.log("### BACKEND HALLUCINATIONS");
  for (const [type, info] of Object.entries(manifestIssues.backend.hallucinations) as [string, any][]) {
    const issueType = type === "missingDependency" ? "missingDependency" : type;
    console.log(`\n  ${type} (expected: ${info.count}):`);
    for (const name of info.items as string[]) {
      totalChecks++;
      // For missingDependency, check both missingDependency and dependencyHallucination types
      const vFound = type === "missingDependency"
        ? (checkManifestItem(files["validation-backend"].hallucinations, name, "missingDependency") ||
           checkManifestItem(files["validation-backend"].hallucinations, name, "dependencyHallucination"))
        : checkManifestItem(files["validation-backend"].hallucinations, name, issueType);
      const gFound = type === "missingDependency"
        ? (checkManifestItem(files["guardian-backend"].hallucinations, name, "missingDependency") ||
           checkManifestItem(files["guardian-backend"].hallucinations, name, "dependencyHallucination"))
        : checkManifestItem(files["guardian-backend"].hallucinations, name, issueType);

      if (vFound) valCaught++;
      if (gFound) guardCaught++;
      const vIcon = vFound ? "✅" : "❌";
      const gIcon = gFound ? "✅" : "❌";
      console.log(`    ${name.padEnd(35)} Val: ${vIcon}  Guard: ${gIcon}`);
    }
  }

  // Frontend hallucinations
  console.log("\n### FRONTEND HALLUCINATIONS");
  for (const [type, info] of Object.entries(manifestIssues.frontend.hallucinations) as [string, any][]) {
    console.log(`\n  ${type} (expected: ${info.count}):`);
    for (const name of info.items as string[]) {
      totalChecks++;
      const vFound = type === "missingDependency"
        ? (checkManifestItem(files["validation-frontend"].hallucinations, name, "missingDependency") ||
           checkManifestItem(files["validation-frontend"].hallucinations, name, "dependencyHallucination"))
        : checkManifestItem(files["validation-frontend"].hallucinations, name, type);
      const gFound = type === "missingDependency"
        ? (checkManifestItem(files["guardian-frontend"].hallucinations, name, "missingDependency") ||
           checkManifestItem(files["guardian-frontend"].hallucinations, name, "dependencyHallucination"))
        : checkManifestItem(files["guardian-frontend"].hallucinations, name, type);

      if (vFound) valCaught++;
      if (gFound) guardCaught++;
      const vIcon = vFound ? "✅" : "❌";
      const gIcon = gFound ? "✅" : "❌";
      console.log(`    ${name.padEnd(35)} Val: ${vIcon}  Guard: ${gIcon}`);
    }
  }

  // Dead code checks (orphaned files)
  console.log("\n### DEAD CODE (ORPHANED FILES)");
  const orphanedBackend = manifestIssues.backend.deadCode.orphanedFile.items as string[];
  const orphanedFrontend = manifestIssues.frontend.deadCode.orphanedFile.items as string[];

  for (const name of orphanedBackend) {
    totalChecks++;
    const vFound = checkDeadCodeItem(files["validation-backend"].deadCode, name);
    const gFound = checkDeadCodeItem(files["guardian-backend"].deadCode, name);
    if (vFound) valCaught++;
    if (gFound) guardCaught++;
    console.log(`  ${name.padEnd(40)} Val: ${vFound ? "✅" : "❌"}  Guard: ${gFound ? "✅" : "❌"}`);
  }
  for (const name of orphanedFrontend) {
    totalChecks++;
    const vFound = checkDeadCodeItem(files["validation-frontend"].deadCode, name);
    const gFound = checkDeadCodeItem(files["guardian-frontend"].deadCode, name);
    if (vFound) valCaught++;
    if (gFound) guardCaught++;
    console.log(`  ${name.padEnd(40)} Val: ${vFound ? "✅" : "❌"}  Guard: ${gFound ? "✅" : "❌"}`);
  }

  // Final score
  const valPct = ((valCaught / totalChecks) * 100).toFixed(1);
  const guardPct = ((guardCaught / totalChecks) * 100).toFixed(1);

  console.log(`\n${"=".repeat(80)}`);
  console.log("  FINAL SCORE");
  console.log("=".repeat(80));
  console.log(`\n  Total manifest checks: ${totalChecks}`);
  console.log(`  start_validation caught: ${valCaught}/${totalChecks} (${valPct}%)`);
  console.log(`  start_guardian   caught: ${guardCaught}/${totalChecks} (${guardPct}%)`);
  console.log(`\n  Difference: ${Math.abs(valCaught - guardCaught)} items`);
  if (valCaught === guardCaught) {
    console.log("  ✅ BOTH TOOLS DETECTED THE SAME INJECTED ISSUES");
  } else if (valCaught > guardCaught) {
    console.log("  ⚠️  start_validation found more issues than start_guardian");
  } else {
    console.log("  ⚠️  start_guardian found more issues than start_validation");
  }
  console.log("=".repeat(80));
}

main()
  .then(() => process.exit(0))
  .catch((err) => { console.error("Compare failed:", err); process.exit(1); });
