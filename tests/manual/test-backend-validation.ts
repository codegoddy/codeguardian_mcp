/**
 * Test 2: Backend Validation - Hallucinations + Dead Code
 *
 * Tests that CodeGuardian catches deliberate hallucinations and dead code
 * in the report/backend project.
 *
 * Run with: node --loader ts-node/esm tests/manual/test-backend-validation.ts
 *
 * @format
 */

import { validateCodeTool } from "../../src/tools/validateCode.js";
import * as path from "path";

const BACKEND_DIR = path.join(process.cwd(), "report/backend");

// Deliberate hallucination bugs embedded as newCode
const BUGGY_CODE = `
// Bug 1: Dependency hallucination - package does NOT exist on npm
import { PhantomORM } from '@phantom-nonexistent/orm-driver';

// Bug 2: Dependency hallucination - package does NOT exist on npm
import { GhostAuth } from '@phantom-nonexistent/auth-service';

// Bug 3: Unused import - Router imported but never used
import { Router } from 'express';

// Bug 4: Unused import - eq imported but never used
import { eq } from 'drizzle-orm';

// Some actual code
export async function buggyController(req: any, res: any) {
  // Use the hallucinated packages so they aren't flagged as unused
  const orm = new PhantomORM();
  const auth = GhostAuth.verify(req.headers.token);

  res.json({ orm, auth });
}
`;

async function testBackendValidation() {
  console.log("🧪 Test 2: Backend Validation (Hallucinations + Dead Code)");
  console.log(`📁 Project: ${BACKEND_DIR}`);
  console.log("⏳ Running validation...\n");

  const startTime = Date.now();

  try {
    const result = await validateCodeTool.handler({
      projectPath: BACKEND_DIR,
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
      { name: "Dependency: @phantom-nonexistent/orm-driver", pattern: /phantom-nonexistent\/orm-driver|orm.driver/i },
      { name: "Dependency: @phantom-nonexistent/auth-service", pattern: /phantom-nonexistent\/auth-service|auth.service/i },
      { name: "Unused import: Router", pattern: /Router.*unused|unused.*Router/i },
      { name: "Unused import: eq", pattern: /\beq\b.*unused|unused.*\beq\b/i },
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

testBackendValidation();
