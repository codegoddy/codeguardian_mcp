/**
 * Test API Contract Guardian on Report Directory
 *
 * This script tests the integrated API Contract validation
 * on the report/frontend and report/backend directories.
 */

import { orchestrateContext } from "./dist/context/contextOrchestrator.js";
import { validateApiContracts, formatValidationResults } from "./dist/api-contract/index.js";
import { getProjectContext } from "./dist/context/projectContext.js";
import { logger } from "./dist/utils/logger.js";

const REPORT_PATH = "./report";

async function testApiContractGuardian() {
  console.log("🧪 Testing API Contract Guardian on Report Directory\n");
  console.log("=" .repeat(80));

  try {
    // Test 1: Build context with API Contract extraction
    console.log("\n📦 Test 1: Building orchestrated context (includes API Contract extraction)...");
    const orchestration = await orchestrateContext({
      projectPath: REPORT_PATH,
      language: "all",
    });

    console.log("✅ Context built successfully!");
    console.log(`   Context Quality: ${orchestration.contextQuality}`);
    console.log(`   Total Files: ${orchestration.projectContext.totalFiles}`);
    console.log(`   Total Symbols: ${orchestration.projectContext.symbolIndex.size}`);

    // Test 2: Check if API Contract was extracted
    console.log("\n🔗 Test 2: Checking API Contract extraction...");
    if (orchestration.projectContext.apiContract) {
      const apiContract = orchestration.projectContext.apiContract;
      console.log("✅ API Contract context found!");
      console.log(`   Project Structure: ${apiContract.projectStructure.relationship}`);
      
      if (apiContract.projectStructure.frontend) {
        console.log(`   Frontend: ${apiContract.projectStructure.frontend.framework} (${apiContract.projectStructure.frontend.path})`);
      }
      
      if (apiContract.projectStructure.backend) {
        console.log(`   Backend: ${apiContract.projectStructure.backend.framework} (${apiContract.projectStructure.backend.path})`);
      }

      console.log(`   Frontend Services: ${apiContract.frontendServices.length}`);
      console.log(`   Frontend Types: ${apiContract.frontendTypes.length}`);
      console.log(`   Backend Routes: ${apiContract.backendRoutes.length}`);
      console.log(`   Backend Models: ${apiContract.backendModels.length}`);
      console.log(`   Matched Endpoints: ${apiContract.endpointMappings.size}`);
      console.log(`   Matched Types: ${apiContract.typeMappings.size}`);
      console.log(`   Unmatched Frontend: ${apiContract.unmatchedFrontend.length}`);
      console.log(`   Unmatched Backend: ${apiContract.unmatchedBackend.length}`);
    } else {
      console.log("⚠️  No API Contract context found (no frontend/backend detected)");
    }

    // Test 3: Check orchestration results
    console.log("\n🔍 Test 3: Checking orchestration validation results...");
    if (orchestration.apiContractIssues) {
      console.log(`✅ API Contract validation performed!`);
      console.log(`   Total Issues: ${orchestration.apiContractSummary?.totalIssues || 0}`);
      console.log(`   Critical: ${orchestration.apiContractSummary?.critical || 0}`);
      console.log(`   High: ${orchestration.apiContractSummary?.high || 0}`);
      console.log(`   Matched Endpoints: ${orchestration.apiContractSummary?.matchedEndpoints || 0}`);
      console.log(`   Matched Types: ${orchestration.apiContractSummary?.matchedTypes || 0}`);

      if (orchestration.apiContractIssues.length > 0) {
        console.log("\n   📋 First 5 Issues:");
        orchestration.apiContractIssues.slice(0, 5).forEach((issue, i) => {
          console.log(`   ${i + 1}. [${issue.severity.toUpperCase()}] ${issue.message}`);
          console.log(`      File: ${issue.file}:${issue.line}`);
        });
      }
    } else {
      console.log("ℹ️  No API Contract issues (validation not performed or no contracts found)");
    }

    // Test 4: Direct validation using the public API
    console.log("\n🎯 Test 4: Testing direct validation API...");
    const validationResult = await validateApiContracts(REPORT_PATH);
    
    console.log("✅ Direct validation completed!");
    console.log(`   Total Issues: ${validationResult.summary.totalIssues}`);
    console.log(`   Critical: ${validationResult.summary.critical}`);
    console.log(`   High: ${validationResult.summary.high}`);
    console.log(`   Matched Endpoints: ${validationResult.summary.matchedEndpoints}`);
    console.log(`   Matched Types: ${validationResult.summary.matchedTypes}`);

    // Test 5: Format results
    console.log("\n📝 Test 5: Formatting results...");
    const formatted = formatValidationResults(validationResult);
    console.log("\n" + formatted);

    // Test 6: Show sample extracted data
    if (orchestration.projectContext.apiContract) {
      const apiContract = orchestration.projectContext.apiContract;
      
      console.log("\n📊 Test 6: Sample Extracted Data");
      console.log("-".repeat(80));
      
      if (apiContract.frontendServices.length > 0) {
        console.log("\n🌐 Sample Frontend Services:");
        apiContract.frontendServices.slice(0, 3).forEach((service, i) => {
          console.log(`   ${i + 1}. ${service.name} - ${service.method} ${service.endpoint}`);
          console.log(`      File: ${service.file}:${service.line}`);
        });
      }

      if (apiContract.backendRoutes.length > 0) {
        console.log("\n⚙️  Sample Backend Routes:");
        apiContract.backendRoutes.slice(0, 3).forEach((route, i) => {
          console.log(`   ${i + 1}. ${route.handler} - ${route.method} ${route.path}`);
          console.log(`      File: ${route.file}:${route.line}`);
        });
      }

      if (apiContract.endpointMappings.size > 0) {
        console.log("\n🔗 Sample Matched Endpoints:");
        let count = 0;
        for (const [endpoint, mapping] of apiContract.endpointMappings) {
          if (count >= 3) break;
          console.log(`   ${count + 1}. ${mapping.frontend.method} ${endpoint}`);
          console.log(`      Frontend: ${mapping.frontend.name} (score: ${mapping.score})`);
          console.log(`      Backend: ${mapping.backend.handler}`);
          count++;
        }
      }
    }

    console.log("\n" + "=".repeat(80));
    console.log("✅ All tests completed successfully!");
    console.log("\n💡 Next Steps:");
    console.log("   - Review any API contract issues found");
    console.log("   - Check if frontend services match backend routes");
    console.log("   - Verify type compatibility between frontend and backend");

  } catch (error) {
    console.error("\n❌ Test failed:", error);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the test
testApiContractGuardian();
