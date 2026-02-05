/**
 * Quick test to show matched endpoints
 */

import { getProjectContext } from "./dist/context/projectContext.js";

const REPORT_PATH = "./report";

async function showMatchedEndpoints() {
  console.log("🔗 API Contract - Matched Endpoints\n");
  console.log("=" .repeat(80));

  const context = await getProjectContext(REPORT_PATH, {
    language: "all",
    forceRebuild: true,
  });

  if (context.apiContract) {
    const ac = context.apiContract;
    
    console.log(`\n📊 Summary:`);
    console.log(`   Frontend Services: ${ac.frontendServices.length}`);
    console.log(`   Backend Routes: ${ac.backendRoutes.length}`);
    console.log(`   Matched Endpoints: ${ac.endpointMappings.size}`);
    console.log(`   Unmatched Frontend: ${ac.unmatchedFrontend.length}`);
    console.log(`   Unmatched Backend: ${ac.unmatchedBackend.length}`);

    console.log(`\n✅ Matched Endpoints (${ac.endpointMappings.size}):`);
    console.log("-".repeat(80));
    let count = 0;
    for (const [endpoint, mapping] of ac.endpointMappings) {
      count++;
      console.log(`\n${count}. ${mapping.frontend.method} ${endpoint}`);
      console.log(`   Frontend: ${mapping.frontend.name} (${mapping.frontend.file.split('/').pop()})`);
      console.log(`   Backend: ${mapping.backend.handler} (${mapping.backend.file.split('/').pop()})`);
      console.log(`   Match Score: ${mapping.score}%`);
    }

    if (ac.unmatchedFrontend.length > 0) {
      console.log(`\n\n⚠️  Unmatched Frontend Services (${ac.unmatchedFrontend.length}):`);
      console.log("-".repeat(80));
      ac.unmatchedFrontend.slice(0, 10).forEach((service, i) => {
        console.log(`   ${i + 1}. ${service.method} ${service.endpoint} - ${service.name}`);
      });
      if (ac.unmatchedFrontend.length > 10) {
        console.log(`   ... and ${ac.unmatchedFrontend.length - 10} more`);
      }
    }

    if (ac.unmatchedBackend.length > 0) {
      console.log(`\n\n⚠️  Unmatched Backend Routes (${ac.unmatchedBackend.length}):`);
      console.log("-".repeat(80));
      ac.unmatchedBackend.slice(0, 10).forEach((route, i) => {
        console.log(`   ${i + 1}. ${route.method} ${route.path} - ${route.handler}`);
      });
      if (ac.unmatchedBackend.length > 10) {
        console.log(`   ... and ${ac.unmatchedBackend.length - 10} more`);
      }
    }
  }

  console.log("\n" + "=".repeat(80));
}

showMatchedEndpoints();
