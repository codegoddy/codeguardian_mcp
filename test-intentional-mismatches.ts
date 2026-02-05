/**
 * Test API Contract detection with intentional mismatches
 */

import { validateApiContracts } from "./dist/api-contract/index.js";

const REPORT_PATH = "./report";

async function testIntentionalMismatches() {
  console.log("🧪 Testing API Contract Detection with Intentional Mismatches\n");
  console.log("=" .repeat(80));
  console.log("\n🔧 Intentional Mismatches Created:");
  console.log("   1. getClients() - Using POST instead of GET");
  console.log("   2. createClient() - Calling /api/customers instead of /api/clients");
  console.log("   3. ClientCreate interface - Missing required 'email' field");
  console.log("\n" + "=".repeat(80) + "\n");

  try {
    const result = await validateApiContracts(REPORT_PATH);

    console.log("📊 Results:");
    console.log(`   Total Issues Found: ${result.summary.totalIssues}`);
    console.log(`   Critical: ${result.summary.critical} 🔴`);
    console.log(`   High: ${result.summary.high} 🟠`);
    console.log(`   Medium: ${result.summary.medium} 🟡`);
    console.log(`   Low: ${result.summary.low} 🟢`);
    console.log("");

    if (result.issues.length > 0) {
      console.log("🔍 Detected Issues:\n");
      
      // Group by severity
      const critical = result.issues.filter(i => i.severity === "critical");
      const high = result.issues.filter(i => i.severity === "high");
      const medium = result.issues.filter(i => i.severity === "medium");

      if (critical.length > 0) {
        console.log("🔴 CRITICAL ISSUES:");
        critical.forEach((issue, i) => {
          console.log(`\n   ${i + 1}. ${issue.type}`);
          console.log(`      Message: ${issue.message}`);
          console.log(`      File: ${issue.file}:${issue.line}`);
          console.log(`      Suggestion: ${issue.suggestion}`);
        });
        console.log("");
      }

      if (high.length > 0) {
        console.log("🟠 HIGH SEVERITY ISSUES:");
        high.forEach((issue, i) => {
          console.log(`\n   ${i + 1}. ${issue.type}`);
          console.log(`      Message: ${issue.message}`);
          console.log(`      File: ${issue.file}:${issue.line}`);
          console.log(`      Suggestion: ${issue.suggestion}`);
        });
        console.log("");
      }

      if (medium.length > 0) {
        console.log("🟡 MEDIUM SEVERITY ISSUES:");
        medium.slice(0, 3).forEach((issue, i) => {
          console.log(`\n   ${i + 1}. ${issue.type}`);
          console.log(`      Message: ${issue.message}`);
          console.log(`      File: ${issue.file}:${issue.line}`);
        });
        if (medium.length > 3) {
          console.log(`\n   ... and ${medium.length - 3} more medium issues`);
        }
        console.log("");
      }

      // Check if our intentional mismatches were detected
      console.log("=".repeat(80));
      console.log("\n✅ Verification:");
      
      const methodMismatch = result.issues.find(i => 
        i.message.includes("POST") && i.message.includes("GET")
      );
      const pathMismatch = result.issues.find(i => 
        i.message.includes("customers")
      );
      const missingField = result.issues.find(i => 
        i.message.includes("email")
      );

      console.log(`   Method Mismatch Detected: ${methodMismatch ? '✅ YES' : '❌ NO'}`);
      console.log(`   Path Mismatch Detected: ${pathMismatch ? '✅ YES' : '❌ NO'}`);
      console.log(`   Missing Field Detected: ${missingField ? '✅ YES' : '❌ NO'}`);

      if (methodMismatch && pathMismatch && missingField) {
        console.log("\n🎉 SUCCESS! All intentional mismatches were detected!");
      } else {
        console.log("\n⚠️  Some mismatches were not detected");
      }
    } else {
      console.log("❌ No issues detected - this is unexpected!");
    }

    console.log("\n" + "=".repeat(80));

  } catch (error) {
    console.error("\n❌ Test failed:", error);
    process.exit(1);
  }
}

testIntentionalMismatches();
