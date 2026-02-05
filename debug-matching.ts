/**
 * Debug the matching logic
 */

import { getProjectContext } from "./dist/context/projectContext.js";

const REPORT_PATH = "./report";

async function debugMatching() {
  console.log("🔍 Debugging API Contract Matching\n");

  const context = await getProjectContext(REPORT_PATH, {
    language: "all",
    forceRebuild: true,
  });

  if (context.apiContract) {
    const ac = context.apiContract;
    
    console.log("Unmatched Frontend Services:");
    ac.unmatchedFrontend.forEach((service, i) => {
      console.log(`  ${i + 1}. ${service.method} ${service.endpoint} - ${service.name}`);
    });

    console.log("\nBackend Routes (sample):");
    ac.backendRoutes.slice(0, 10).forEach((route, i) => {
      console.log(`  ${i + 1}. ${route.method} ${route.path} - ${route.handler}`);
    });

    // Check if /api/clients exists in backend
    const clientsRoute = ac.backendRoutes.find(r => r.path === "/api/clients");
    console.log("\n/api/clients in backend:", clientsRoute ? "YES" : "NO");
    if (clientsRoute) {
      console.log("  Method:", clientsRoute.method);
    }
  }
}

debugMatching();
