/**
 * API Contract Guardian - Backend Context Builder
 *
 * Builds the backend context by extracting routes, models, and configuration.
 *
 * @format
 */

import { logger } from "../../utils/logger.js";
import type { BackendContext, BackendProject } from "../types.js";
import {
  extractRoutes,
  extractModels,
  extractApiConfig,
} from "../extractors/python.js";

/**
 * Build backend context from a project path
 * Extracts routes, models, and API configuration
 */
export async function buildBackendContext(
  project: BackendProject,
): Promise<BackendContext> {
  logger.info(`Building backend context for ${project.framework} project...`);

  const startTime = Date.now();

  // Extract routes and models in parallel
  const [routes, models, config] = await Promise.all([
    extractRoutes(project.path, project.framework),
    extractModels(project.path),
    extractApiConfig(project.path),
  ]);

  const context: BackendContext = {
    framework: project.framework,
    routes,
    models,
    apiPrefix: config.apiPrefix,
  };

  logger.info(
    `Backend context built in ${Date.now() - startTime}ms ` +
      `(${routes.length} routes, ${models.length} models)`,
  );

  return context;
}

/**
 * Incrementally update backend context when a file changes
 * Only re-extracts from the changed file
 */
export async function updateBackendContext(
  context: BackendContext,
  projectPath: string,
  changedFile: string,
): Promise<BackendContext> {
  logger.debug(`Updating backend context for changed file: ${changedFile}`);

  // Remove old entries from this file
  context.routes = context.routes.filter((r) => !r.file.includes(changedFile));
  context.models = context.models.filter((m) => !m.file.includes(changedFile));

  // Re-extract from changed file if it's a relevant file
  if (
    changedFile.includes("/routes/") ||
    changedFile.includes("/routers/") ||
    changedFile.includes("/api/") ||
    changedFile.includes("/models/") ||
    changedFile.includes("/schemas/")
  ) {
    try {
      const fs = await import("fs/promises");
      const content = await fs.readFile(changedFile, "utf-8");

      // Import extractors dynamically to avoid circular dependencies
      const {
        extractRoutesFromFile,
        extractModelsFromFile,
      } = await import("../extractors/python.js");

      const newRoutes = extractRoutesFromFile(
        content,
        changedFile,
        context.framework,
      );
      const newModels = extractModelsFromFile(content, changedFile);

      context.routes.push(...newRoutes);
      context.models.push(...newModels);
    } catch (err) {
      logger.debug(`Failed to update context for ${changedFile}`);
    }
  }

  return context;
}
