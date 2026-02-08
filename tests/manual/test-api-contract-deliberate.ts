/**
 * Test 3: API Contract Validation - Deliberate Contract Violations
 *
 * Tests that CodeGuardian catches deliberate API contract mismatches
 * between frontend and backend in the report project.
 *
 * Deliberate bugs are in: report/frontend/src/features/__test_bugs__/apiContractBugs.ts
 *   - GET /phantom-endpoint/data  (non-existent endpoint)
 *   - DELETE /dashboard/stats      (wrong HTTP method - backend has GET only)
 *   - POST /ghost-records/sync     (non-existent endpoint)
 *
 * Run with: node --loader ts-node/esm tests/manual/test-api-contract-deliberate.ts
 *
 * @format
 */

import { validateApiContracts } from "../../src/api-contract/index.js";
import * as path from "path";
import * as fs from "fs";

const REPORT_DIR = path.join(process.cwd(), "report");

// Clear context cache so the new bug file is picked up
function clearCache() {
  const cacheDirs = [
    path.join(REPORT_DIR, ".codeguardian"),
    path.join(REPORT_DIR, "frontend", ".codeguardian"),
    path.join(REPORT_DIR, "backend", ".codeguardian"),
  ];
  for (const dir of cacheDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}

async function testApiContractDeliberate() {
  console.log("🧪 Test 3: API Contract Validation (Deliberate Bugs)");
  console.log(`📁 Project: ${REPORT_DIR}`);

  // Verify bug file exists
  const bugFile = path.join(
    REPORT_DIR,
    "frontend/src/features/__test_bugs__/apiContractBugs.ts",
  );
  if (!fs.existsSync(bugFile)) {
    console.error(`❌ Bug fixture not found: ${bugFile}`);
    process.exit(1);
  }
  console.log(`🐛 Bug fixture: ${bugFile}`);

  // Clear cache for fresh extraction
  clearCache();
  console.log("🗑️  Cleared context cache");
  console.log("⏳ Running validation...\n");

  const startTime = Date.now();

  try {
    const result = await validateApiContracts(REPORT_DIR);
    const duration = Date.now() - startTime;

    console.log("✅ Validation Complete!");
    console.log(`⏱️  Duration: ${duration}ms\n`);

    console.log("📊 Summary:");
    console.log(`   Total Issues: ${result.issues.length}`);
    console.log(`   🔴 Critical: ${result.summary.critical}`);
    console.log(`   🟠 High: ${result.summary.high}`);
    console.log(`   🟡 Medium: ${result.summary.medium}`);
    console.log(`   🟢 Low: ${result.summary.low}`);
    console.log(`\n   ✅ Matched Endpoints: ${result.summary.matchedEndpoints}`);
    console.log(`   ✅ Matched Types: ${result.summary.matchedTypes}`);
    console.log(`   ⚠️  Unmatched Frontend: ${result.summary.unmatchedFrontend}`);
    console.log(`   ⚠️  Unmatched Backend: ${result.summary.unmatchedBackend}`);

    // Check for deliberate bugs
    const expectedBugs = [
      {
        name: "Non-existent endpoint: GET /phantom-endpoint/data",
        check: (issues: any[]) =>
          issues.some(
            (i) =>
              i.endpoint?.includes("phantom-endpoint") ||
              i.message?.includes("phantom-endpoint"),
          ),
      },
      {
        name: "Wrong method: DELETE /dashboard/stats (backend has GET)",
        check: (issues: any[]) =>
          issues.some(
            (i) =>
              i.message?.includes("dashboard/stats") &&
              (i.type === "apiMethodMismatch" ||
                i.type === "apiEndpointNotFound" ||
                i.type === "apiPathMismatch"),
          ),
      },
      {
        name: "Non-existent endpoint: POST /ghost-records/sync",
        check: (issues: any[]) =>
          issues.some(
            (i) =>
              i.endpoint?.includes("ghost-records") ||
              i.message?.includes("ghost-records"),
          ),
      },
    ];

    console.log("\n🔍 Deliberate Bug Detection:");
    let caught = 0;
    let missed = 0;

    for (const bug of expectedBugs) {
      const found = bug.check(result.issues);
      if (found) {
        console.log(`   ✅ CAUGHT: ${bug.name}`);
        caught++;
      } else {
        console.log(`   ❌ MISSED: ${bug.name}`);
        missed++;
      }
    }

    console.log(
      `\n📈 Score: ${caught}/${expectedBugs.length} deliberate API contract bugs caught`,
    );
    if (missed > 0) {
      console.log(`⚠️  ${missed} deliberate bug(s) were not detected`);
    } else {
      console.log("🎉 All deliberate API contract bugs were caught!");
    }

    // Show all issues
    if (result.issues.length > 0) {
      console.log("\n🔍 All Issues:");
      result.issues.forEach((issue: any, i: number) => {
        console.log(
          `\n${i + 1}. [${issue.severity.toUpperCase()}] ${issue.type}`,
        );
        console.log(
          `   📄 ${issue.file || "N/A"}${issue.line ? `:${issue.line}` : ""}`,
        );
        console.log(`   📝 ${issue.message}`);
        if (issue.suggestion) {
          console.log(`   💡 ${issue.suggestion}`);
        }
      });
    }

    // Write report
    fs.writeFileSync(
      "api-contract-report.json",
      JSON.stringify(result, null, 2),
      "utf-8",
    );
    console.log("\n📁 Full report written to api-contract-report.json");
  } catch (error) {
    console.error("❌ Validation failed:", error);
    process.exit(1);
  }

  process.exit(0);
}

testApiContractDeliberate();
