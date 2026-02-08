/**
 * Test 1: Frontend Validation - Hallucinations + Dead Code
 *
 * Tests that CodeGuardian catches deliberate hallucinations and dead code
 * in the report/frontend project.
 *
 * Run with: node --loader ts-node/esm tests/manual/test-frontend-validation.ts
 *
 * @format
 */

import { validateCodeTool } from "../../src/tools/validateCode.js";
import * as path from "path";

const FRONTEND_DIR = path.join(process.cwd(), "report/frontend");

// Deliberate hallucination bugs embedded as newCode
const BUGGY_CODE = `
// Bug 1: Dependency hallucination - package does NOT exist on npm
import { GhostGrid } from '@phantom-nonexistent/ghost-grid';

// Bug 2: Dependency hallucination - package does NOT exist on npm
import { usePhantomForm } from '@phantom-nonexistent/form-wizard';

// Bug 3: Unused import - useReducer imported but never used
import { useState, useReducer } from 'react';

// Bug 4: Unused import - toast imported but never used
import toast from 'react-hot-toast';

// Some actual code that uses useState (so it's NOT unused)
export function BuggyComponent() {
  const [data, setData] = useState<string[]>([]);

  // Use the hallucinated packages so they aren't flagged as unused
  const grid = GhostGrid;
  const form = usePhantomForm();

  return { data, grid, form };
}
`;

async function testFrontendValidation() {
  console.log("🧪 Test 1: Frontend Validation (Hallucinations + Dead Code)");
  console.log(`📁 Project: ${FRONTEND_DIR}`);
  console.log("⏳ Running validation...\n");

  const startTime = Date.now();

  try {
    const result = await validateCodeTool.handler({
      projectPath: FRONTEND_DIR,
      newCode: BUGGY_CODE,
      language: "typescript",
    });

    const duration = Date.now() - startTime;
    const output = result.content[0].text;

    console.log("✅ Validation Complete!");
    console.log(`⏱️  Duration: ${duration}ms\n`);

    // Parse results
    const hallucinationMatch = output.match(/hallucinationsFound["\s:]+(\d+)/);
    const deadCodeMatch = output.match(/deadCodeFound["\s:]+(\d+)/);
    const hallucinationCount = hallucinationMatch ? parseInt(hallucinationMatch[1]) : 0;
    const deadCodeCount = deadCodeMatch ? parseInt(deadCodeMatch[1]) : 0;

    console.log("📊 Results:");
    console.log(`   Hallucination issues: ${hallucinationCount}`);
    console.log(`   Dead code issues: ${deadCodeCount}`);

    // Expected bugs to catch
    const expectedBugs = [
      { name: "Dependency: @phantom-nonexistent/ghost-grid", pattern: /phantom-nonexistent\/ghost-grid|ghost.grid/i },
      { name: "Dependency: @phantom-nonexistent/form-wizard", pattern: /phantom-nonexistent\/form-wizard|form.wizard/i },
      { name: "Unused import: useReducer", pattern: /useReducer.*unused|unused.*useReducer/i },
      { name: "Unused import: toast", pattern: /toast.*unused|unused.*toast/i },
    ];

    console.log("\n🔍 Deliberate Bug Detection:");
    let caught = 0;
    let missed = 0;

    for (const bug of expectedBugs) {
      const found = bug.pattern.test(output);
      if (found) {
        console.log(`   ✅ CAUGHT: ${bug.name}`);
        caught++;
      } else {
        console.log(`   ❌ MISSED: ${bug.name}`);
        missed++;
      }
    }

    console.log(`\n📈 Score: ${caught}/${expectedBugs.length} deliberate bugs caught`);
    if (missed > 0) {
      console.log(`⚠️  ${missed} deliberate bug(s) were not detected`);
    } else {
      console.log("🎉 All deliberate bugs were caught!");
    }

    // Print raw output for debugging
    console.log("\n--- Raw Output (truncated) ---");
    console.log(output.substring(0, 2000));
    if (output.length > 2000) console.log(`\n... (${output.length - 2000} more chars)`);

  } catch (error) {
    console.error("❌ Validation failed:", error);
    process.exit(1);
  }

  process.exit(0);
}

testFrontendValidation();
