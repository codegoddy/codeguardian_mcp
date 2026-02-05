/**
 * Debug the multiple methods detection
 */

import { getProjectContext } from "./dist/context/projectContext.js";

const REPORT_PATH = "./report";

async function debugMultipleMethods() {
  console.log("🔍 Debugging Multiple Methods Detection\n");

  const context = await getProjectContext(REPORT_PATH, {
    language: "all",
    forceRebuild: true,
  });

  if (context.apiContract) {
    const ac = context.apiContract;
    
    console.log("Endpoint Mappings for /api/clients:");
    const clientsMapping = ac.endpointMappings.get('/api/clients');
    if (clientsMapping) {
      console.log("  Frontend:", clientsMapping.frontend.method, clientsMapping.frontend.name);
      console.log("  Backend:", clientsMapping.backend.method, clientsMapping.backend.handler);
      console.log("  Score:", clientsMapping.score);
      console.log("  Has Multiple Methods:", clientsMapping.hasMultipleMethods);
      console.log("  Available Methods:", clientsMapping.availableMethods);
    } else {
      console.log("  Not found in mappings");
    }

    console.log("\nAll endpoint mappings with multiple methods:");
    for (const [endpoint, mapping] of ac.endpointMappings) {
      if (mapping.hasMultipleMethods) {
        console.log(`  ${endpoint}:`);
        console.log(`    Frontend: ${mapping.frontend.method} ${mapping.frontend.name}`);
        console.log(`    Backend: ${mapping.backend.method} ${mapping.backend.handler}`);
        console.log(`    Available: ${mapping.availableMethods?.join(', ')}`);
      }
    }
  }
}

debugMultipleMethods();
