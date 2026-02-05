/**
 * Debug the method mismatch
 */

import { getProjectContext } from "./dist/context/projectContext.js";

const REPORT_PATH = "./report";

async function debugMethodMismatch() {
  console.log("🔍 Debugging Method Mismatch Detection\n");

  const context = await getProjectContext(REPORT_PATH, {
    language: "all",
    forceRebuild: true,
  });

  if (context.apiContract) {
    const ac = context.apiContract;
    
    console.log("Looking for GET /api/clients in frontend...");
    const getClientsEndpoint = ac.frontendServices.find(s => 
      s.endpoint === '/api/clients' && s.method === 'GET'
    );
    
    if (getClientsEndpoint) {
      console.log("✅ Found:", getClientsEndpoint.name, "at line", getClientsEndpoint.line);
    } else {
      console.log("❌ Not found in frontend services");
    }

    console.log("\nLooking for POST /api/clients in backend...");
    const postClientsRoute = ac.backendRoutes.find(r => 
      r.path === '/api/clients' && r.method === 'POST'
    );
    
    if (postClientsRoute) {
      console.log("✅ Found:", postClientsRoute.handler);
    } else {
      console.log("❌ Not found in backend routes");
    }

    console.log("\nEndpoint Mappings:");
    for (const [endpoint, mapping] of ac.endpointMappings) {
      if (endpoint.includes('clients')) {
        console.log(`  ${endpoint}:`);
        console.log(`    Frontend: ${mapping.frontend.method} ${mapping.frontend.name}`);
        console.log(`    Backend: ${mapping.backend.method} ${mapping.backend.handler}`);
        console.log(`    Score: ${mapping.score}`);
      }
    }

    console.log("\nUnmatched Frontend (clients only):");
    ac.unmatchedFrontend
      .filter(s => s.endpoint.includes('clients') || s.endpoint.includes('users'))
      .forEach(s => {
        console.log(`  ${s.method} ${s.endpoint} - ${s.name}`);
      });
  }
}

debugMethodMismatch();
