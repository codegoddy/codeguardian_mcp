/**
 * Test script to verify API Contract extraction on real project
 *
 * @format
 */

import { detectProjectStructure } from "./src/api-contract/detector.js";
import { buildFrontendContext } from "./src/api-contract/context/frontend.js";
import { buildBackendContext } from "./src/api-contract/context/backend.js";
import { buildContractContext } from "./src/api-contract/context/contract.js";

async function testExtraction() {
  const reportPath = "/home/codegoddy/Desktop/codeguardian_mcp/report";
  const frontendPath = `${reportPath}/frontend`;
  const backendPath = `${reportPath}/backend`;

  console.log("=".repeat(80));
  console.log("Testing API Contract Guardian on Real Project");
  console.log("=".repeat(80));

  // Test 1: Project Detection
  console.log("\n📁 Testing Project Detection...");
  const structure = await detectProjectStructure(reportPath);
  console.log("Detected structure:", JSON.stringify(structure, null, 2));

  // Test 2: Frontend Context
  if (structure.frontend) {
    console.log("\n🎨 Building Frontend Context...");
    const frontendContext = await buildFrontendContext(structure.frontend);
    console.log(`✓ Extracted ${frontendContext.services.length} services`);
    console.log(`✓ Extracted ${frontendContext.types.length} types`);

    // Show sample services
    console.log("\n📡 Sample Frontend Services:");
    frontendContext.services.slice(0, 5).forEach((service) => {
      console.log(`  - ${service.method} ${service.endpoint} (${service.name})`);
    });

    // Show sample types
    console.log("\n📋 Sample Frontend Types:");
    frontendContext.types.slice(0, 5).forEach((type) => {
      console.log(`  - ${type.name} (${type.fields.length} fields)`);
    });
  }

  // Test 3: Backend Context
  if (structure.backend) {
    console.log("\n⚙️  Building Backend Context...");
    const backendContext = await buildBackendContext(structure.backend);
    console.log(`✓ Extracted ${backendContext.routes.length} routes`);
    console.log(`✓ Extracted ${backendContext.models.length} models`);

    // Show sample routes
    console.log("\n🛣️  Sample Backend Routes:");
    backendContext.routes.slice(0, 5).forEach((route) => {
      console.log(
        `  - ${route.method} ${route.path} (${route.handler})` +
          (route.requestModel ? ` [Request: ${route.requestModel}]` : "") +
          (route.responseModel ? ` [Response: ${route.responseModel}]` : ""),
      );
    });

    // Show sample models
    console.log("\n🗃️  Sample Backend Models:");
    backendContext.models.slice(0, 5).forEach((model) => {
      console.log(`  - ${model.name} (${model.fields.length} fields)`);
    });
  }

  // Test 4: Contract Context
  if (structure.frontend && structure.backend) {
    console.log("\n🔗 Building Contract Context...");
    const frontendContext = await buildFrontendContext(structure.frontend);
    const backendContext = await buildBackendContext(structure.backend);
    const contractContext = await buildContractContext(
      frontendContext,
      backendContext,
    );

    console.log(`✓ Matched ${contractContext.endpoints.size} endpoints`);
    console.log(`✓ Matched ${contractContext.types.size} types`);
    console.log(`⚠️  ${contractContext.unmatchedFrontend.length} unmatched frontend services`);
    console.log(`⚠️  ${contractContext.unmatchedBackend.length} unmatched backend routes`);

    // Show matched endpoints
    console.log("\n✅ Matched Endpoints:");
    contractContext.endpoints.forEach((mapping, endpoint) => {
      console.log(
        `  - ${mapping.frontend.method} ${endpoint}` +
          ` (Score: ${mapping.score})` +
          `\n    Frontend: ${mapping.frontend.name}` +
          `\n    Backend: ${mapping.backend.handler}`,
      );
    });

    // Show type compatibility issues
    console.log("\n🔍 Type Compatibility:");
    contractContext.types.forEach((mapping, typeName) => {
      const issues = mapping.compatibility.issues;
      if (issues.length > 0) {
        console.log(`  - ${typeName}: ${issues.length} issues`);
        issues.forEach((issue) => console.log(`    ⚠️  ${issue}`));
      } else {
        console.log(`  - ${typeName}: ✅ Compatible`);
      }
    });

    // Show unmatched
    if (contractContext.unmatchedFrontend.length > 0) {
      console.log("\n❌ Unmatched Frontend Services:");
      contractContext.unmatchedFrontend.forEach((service) => {
        console.log(`  - ${service.method} ${service.endpoint} (${service.name})`);
      });
    }

    if (contractContext.unmatchedBackend.length > 0) {
      console.log("\n❌ Unmatched Backend Routes:");
      contractContext.unmatchedBackend.forEach((route) => {
        console.log(`  - ${route.method} ${route.path} (${route.handler})`);
      });
    }
  }

  console.log("\n" + "=".repeat(80));
  console.log("Test Complete!");
  console.log("=".repeat(80));
}

testExtraction().catch(console.error);
