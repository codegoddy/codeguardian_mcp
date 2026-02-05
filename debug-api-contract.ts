/**
 * Debug API Contract Guardian on Report Directory
 */

import { getProjectContext } from "./dist/context/projectContext.js";
import { logger } from "./dist/utils/logger.js";

const REPORT_PATH = "./report";

async function debugApiContract() {
  console.log("🔍 Debugging API Contract Guardian\n");

  const context = await getProjectContext(REPORT_PATH, {
    language: "all",
    forceRebuild: true,
  });

  console.log("\n📊 Context Built:");
  console.log(`   Total Files: ${context.totalFiles}`);
  console.log(`   Has API Contract: ${!!context.apiContract}`);

  if (context.apiContract) {
    const ac = context.apiContract;
    console.log("\n🔗 API Contract Details:");
    console.log(`   Frontend Path: ${ac.projectStructure.frontend?.path}`);
    console.log(`   Backend Path: ${ac.projectStructure.backend?.path}`);
    console.log(`   Frontend Services: ${ac.frontendServices.length}`);
    console.log(`   Backend Routes: ${ac.backendRoutes.length}`);

    // Check what files were found
    const serviceFiles = Array.from(context.files.values()).filter(
      (f) =>
        f.path.includes("/services/") &&
        f.path.includes("frontend") &&
        f.language === "typescript",
    );
    console.log(`\n📁 Service Files Found: ${serviceFiles.length}`);
    serviceFiles.slice(0, 5).forEach((f) => {
      console.log(`   - ${f.relativePath}`);
    });

    const routeFiles = Array.from(context.files.values()).filter(
      (f) =>
        f.path.includes("/api/") &&
        f.path.includes("backend") &&
        f.language === "python",
    );
    console.log(`\n📁 Route Files Found: ${routeFiles.length}`);
    routeFiles.slice(0, 5).forEach((f) => {
      console.log(`   - ${f.relativePath}`);
    });
  }
}

debugApiContract();
