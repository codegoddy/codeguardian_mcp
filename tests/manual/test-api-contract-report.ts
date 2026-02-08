/**
 * Test API Contract Guardian on the report directory
 * 
 * Run with: npx ts-node tests/manual/test-api-contract-report.ts
 */

import { validateApiContracts } from "../../src/api-contract/index.js";
import * as path from "path";

const REPORT_DIR = path.join(process.cwd(), "report");

async function testApiContractValidation() {
  console.log("🧪 Testing API Contract Guardian");
  console.log(`📁 Project: ${REPORT_DIR}`);
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
    
    if (result.issues.length > 0) {
      console.log("\n🔍 All Issues:");
      result.issues.forEach((issue: any, i: number) => {
        console.log(`\n${i + 1}. [${issue.severity.toUpperCase()}] ${issue.type}`);
        console.log(`   📄 ${issue.file || 'N/A'}${issue.line ? `:${issue.line}` : ''}`);
        console.log(`   📝 ${issue.message}`);
        if (issue.suggestion) {
          console.log(`   💡 ${issue.suggestion}`);
        }
      });
    } else {
      console.log("\n✨ No issues found! All API contracts are valid.");
    }
    
    // Write full JSON output for analysis
    const fs = await import("fs");
    fs.writeFileSync("api-contract-report.json", JSON.stringify(result, null, 2, ), "utf-8");
    console.log("\n📁 Full report written to api-contract-report.json");

    process.exit(0);
  } catch (error) {
    console.error("❌ Validation failed:", error);
    process.exit(1);
  }
}

testApiContractValidation();
