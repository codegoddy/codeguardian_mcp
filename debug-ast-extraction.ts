/**
 * Debug AST extraction
 */

import { extractServicesFromFileAST } from "./dist/context/apiContractExtraction.js";

const TEST_FILE = "./report/frontend/src/services/clients.ts";

async function testASTExtraction() {
  console.log("🔍 Testing AST-based service extraction\n");

  const services = await extractServicesFromFileAST(TEST_FILE);

  console.log(`Found ${services.length} services:\n`);

  services.forEach((service, i) => {
    console.log(`${i + 1}. ${service.name}`);
    console.log(`   Method: ${service.method}`);
    console.log(`   Endpoint: ${service.endpoint}`);
    console.log(`   Location: ${service.file}:${service.line}`);
    console.log("");
  });
}

testASTExtraction();
