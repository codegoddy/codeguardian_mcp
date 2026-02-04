/**
 * Test validators against real project
 *
 * @format
 */

import { detectProjectStructure } from "./src/api-contract/detector.js";
import { buildFrontendContext } from "./src/api-contract/context/frontend.js";
import { buildBackendContext } from "./src/api-contract/context/backend.js";
import { buildContractContext } from "./src/api-contract/context/contract.js";
import { validateAllEndpoints } from "./src/api-contract/validators/endpoint.js";
import { validateAllParameters } from "./src/api-contract/validators/parameter.js";
import { validateAllTypes } from "./src/api-contract/validators/type.js";

async function testValidatorsOnRealProject() {
  const reportPath = "/home/codegoddy/Desktop/codeguardian_mcp/report";

  console.log("=".repeat(80));
  console.log("Testing Validators on Real Project (report directory)");
  console.log("=".repeat(80));

  // Detect and build contexts
  const structure = await detectProjectStructure(reportPath);

  if (!structure.frontend || !structure.backend) {
    console.log("❌ Could not detect both frontend and backend");
    return;
  }

  console.log("\n📁 Building contexts...");
  const frontendContext = await buildFrontendContext(structure.frontend);
  const backendContext = await buildBackendContext(structure.backend);
  const contractContext = await buildContractContext(frontendContext, backendContext);

  console.log(`✓ Frontend: ${frontendContext.services.length} services, ${frontendContext.types.length} types`);
  console.log(`✓ Backend: ${backendContext.routes.length} routes, ${backendContext.models.length} models`);
  console.log(`✓ Contract: ${contractContext.endpoints.size} matched endpoints, ${contractContext.types.size} matched types`);

  // Test Endpoint Validator
  console.log("\n🔍 Running Endpoint Validator...");
  const endpointIssues = validateAllEndpoints(contractContext);
  console.log(`Found ${endpointIssues.length} endpoint issues:`);

  const criticalEndpointIssues = endpointIssues.filter(i => i.severity === "critical");
  const highEndpointIssues = endpointIssues.filter(i => i.severity === "high");
  const mediumEndpointIssues = endpointIssues.filter(i => i.severity === "medium");

  if (criticalEndpointIssues.length > 0) {
    console.log(`\n  ❌ Critical (${criticalEndpointIssues.length}):`);
    criticalEndpointIssues.slice(0, 3).forEach(issue => {
      console.log(`    - ${issue.message}`);
      console.log(`      File: ${issue.file}:${issue.line}`);
      console.log(`      Suggestion: ${issue.suggestion}`);
    });
  }

  if (highEndpointIssues.length > 0) {
    console.log(`\n  ⚠️  High (${highEndpointIssues.length}):`);
    highEndpointIssues.slice(0, 3).forEach(issue => {
      console.log(`    - ${issue.message}`);
    });
  }

  if (mediumEndpointIssues.length > 0) {
    console.log(`\n  ℹ️  Medium (${mediumEndpointIssues.length}):`);
    mediumEndpointIssues.slice(0, 3).forEach(issue => {
      console.log(`    - ${issue.message}`);
    });
  }

  if (endpointIssues.length === 0) {
    console.log("  ✅ No endpoint issues found!");
  }

  // Test Parameter Validator
  console.log("\n🔍 Running Parameter Validator...");
  const paramIssues = validateAllParameters(contractContext);
  console.log(`Found ${paramIssues.length} parameter issues:`);

  const missingFields = paramIssues.filter(i => i.type === "apiMissingRequiredField");
  const namingMismatches = paramIssues.filter(i => i.type === "apiNamingConventionMismatch");
  const typeMismatches = paramIssues.filter(i => i.type === "apiTypeMismatch");

  if (missingFields.length > 0) {
    console.log(`\n  ❌ Missing Required Fields (${missingFields.length}):`);
    missingFields.slice(0, 5).forEach(issue => {
      console.log(`    - ${issue.message}`);
      console.log(`      Suggestion: ${issue.suggestion}`);
    });
  }

  if (namingMismatches.length > 0) {
    console.log(`\n  ⚠️  Naming Convention Mismatches (${namingMismatches.length}):`);
    namingMismatches.slice(0, 5).forEach(issue => {
      console.log(`    - ${issue.message}`);
    });
  }

  if (typeMismatches.length > 0) {
    console.log(`\n  ℹ️  Type Mismatches (${typeMismatches.length}):`);
    typeMismatches.slice(0, 5).forEach(issue => {
      console.log(`    - ${issue.message}`);
    });
  }

  if (paramIssues.length === 0) {
    console.log("  ✅ No parameter issues found!");
  }

  // Test Type Validator
  console.log("\n🔍 Running Type Validator...");
  const typeIssues = validateAllTypes(contractContext);
  console.log(`Found ${typeIssues.length} type compatibility issues:`);

  if (typeIssues.length > 0) {
    typeIssues.slice(0, 10).forEach(issue => {
      console.log(`  - [${issue.severity.toUpperCase()}] ${issue.message}`);
    });
  } else {
    console.log("  ✅ No type compatibility issues found!");
  }

  // Summary
  console.log("\n" + "=".repeat(80));
  console.log("VALIDATION SUMMARY");
  console.log("=".repeat(80));
  console.log(`Total Issues Found: ${endpointIssues.length + paramIssues.length + typeIssues.length}`);
  console.log(`  - Endpoint Issues: ${endpointIssues.length}`);
  console.log(`  - Parameter Issues: ${paramIssues.length}`);
  console.log(`  - Type Issues: ${typeIssues.length}`);

  const totalCritical = [...endpointIssues, ...paramIssues, ...typeIssues]
    .filter(i => i.severity === "critical").length;
  const totalHigh = [...endpointIssues, ...paramIssues, ...typeIssues]
    .filter(i => i.severity === "high").length;

  console.log(`\nBy Severity:`);
  console.log(`  - Critical: ${totalCritical}`);
  console.log(`  - High: ${totalHigh}`);
  console.log(`  - Medium: ${[...endpointIssues, ...paramIssues, ...typeIssues].filter(i => i.severity === "medium").length}`);
  console.log(`  - Low: ${[...endpointIssues, ...paramIssues, ...typeIssues].filter(i => i.severity === "low").length}`);

  console.log("\n" + "=".repeat(80));
}

testValidatorsOnRealProject().catch(console.error);
