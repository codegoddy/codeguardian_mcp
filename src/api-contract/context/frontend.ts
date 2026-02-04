/**
 * API Contract Guardian - Frontend Context Builder
 *
 * Builds the frontend context by extracting services, types, and configuration.
 *
 * @format
 */

import { logger } from "../../utils/logger.js";
import type { FrontendContext, FrontendProject } from "../types.js";
import {
  extractServices,
  extractTypes,
  extractApiConfig,
} from "../extractors/typescript.js";

/**
 * Build frontend context from a project path
 * Extracts services, types, and API configuration
 */
export async function buildFrontendContext(
  project: FrontendProject,
): Promise<FrontendContext> {
  logger.info(`Building frontend context for ${project.framework} project...`);

  const startTime = Date.now();

  // Extract services and types in parallel
  const [services, types, config] = await Promise.all([
    extractServices(project.path),
    extractTypes(project.path),
    extractApiConfig(project.path),
  ]);

  const context: FrontendContext = {
    framework: project.framework,
    services,
    types,
    apiBaseUrl: config.apiBaseUrl,
    httpClient: config.httpClient,
  };

  logger.info(
    `Frontend context built in ${Date.now() - startTime}ms ` +
      `(${services.length} services, ${types.length} types)`,
  );

  return context;
}

/**
 * Incrementally update frontend context when a file changes
 * Only re-extracts from the changed file
 */
export async function updateFrontendContext(
  context: FrontendContext,
  projectPath: string,
  changedFile: string,
): Promise<FrontendContext> {
  logger.debug(`Updating frontend context for changed file: ${changedFile}`);

  // Remove old entries from this file
  context.services = context.services.filter(
    (s) => !s.file.includes(changedFile),
  );
  context.types = context.types.filter((t) => !t.file.includes(changedFile));

  // Re-extract from changed file if it's a relevant file
  if (
    changedFile.includes("/services/") ||
    changedFile.includes("/api/") ||
    changedFile.includes("/types/") ||
    changedFile.includes("/interfaces/")
  ) {
    try {
      const fs = await import("fs/promises");
      const content = await fs.readFile(changedFile, "utf-8");

      // Import extractors dynamically to avoid circular dependencies
      const { extractServicesFromFile, extractTypesFromFile } = await import(
        "../extractors/typescript.js"
      );

      const newServices = extractServicesFromFile(content, changedFile);
      const newTypes = extractTypesFromFile(content, changedFile);

      context.services.push(...newServices);
      context.types.push(...newTypes);
    } catch (err) {
      logger.debug(`Failed to update context for ${changedFile}`);
    }
  }

  return context;
}
