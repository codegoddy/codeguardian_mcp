/**
 * Guardian Persistence Layer
 *
 * Saves guardian configurations and alerts to disk so they survive
 * server restarts (e.g., when the user starts a new LLM session).
 *
 * On startup, the server reads persisted configs and auto-restores
 * guardians without requiring the LLM to call start_guardian again.
 *
 * @format
 */

import * as fs from "fs/promises";
import * as path from "path";
import { logger } from "../utils/logger.js";

// ============================================================================
// Types
// ============================================================================

export interface PersistedGuardianConfig {
  agentName: string;
  projectPath: string;
  language: string;
  mode: string;
  startedAt: number;
}

export interface PersistedAlert {
  file: string;
  issues: Array<{
    type: string;
    severity: string;
    message: string;
    suggestion?: string;
    line?: number;
  }>;
  timestamp: number;
  llmMessage: string;
  isInitialScan?: boolean;
}

// ============================================================================
// Persistence
// ============================================================================

const GUARDIANS_DIR = ".codeguardian/guardians";
const ALERTS_FILE = "alerts.json";

class GuardianPersistence {
  private guardiansDir: string;

  constructor(baseDir: string = GUARDIANS_DIR) {
    this.guardiansDir = baseDir;
  }

  /**
   * Initialize persistence directory
   */
  async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.guardiansDir, { recursive: true });
      logger.debug(`Guardian persistence initialized: ${this.guardiansDir}`);
    } catch (error) {
      logger.error("Failed to initialize guardian persistence:", error);
    }
  }

  // --------------------------------------------------------------------------
  // Guardian config persistence
  // --------------------------------------------------------------------------

  /**
   * Save a guardian config to disk.
   * Also saves to the project-specific .codeguardian/guardians/ directory
   * so the config is discoverable from the project root.
   */
  async saveGuardian(config: PersistedGuardianConfig): Promise<void> {
    try {
      await this.initialize();

      // Save to global guardians dir (server-level)
      const filePath = this.getConfigPath(config.agentName);
      await fs.writeFile(filePath, JSON.stringify(config, null, 2), "utf-8");

      // Also save to project-specific dir for discoverability
      const projectGuardiansDir = path.join(
        config.projectPath,
        ".codeguardian",
        "guardians"
      );
      await fs.mkdir(projectGuardiansDir, { recursive: true });
      const projectFilePath = path.join(
        projectGuardiansDir,
        `${this.sanitizeName(config.agentName)}.json`
      );
      await fs.writeFile(
        projectFilePath,
        JSON.stringify(config, null, 2),
        "utf-8"
      );

      logger.info(`Guardian config persisted: ${config.agentName}`);
    } catch (error) {
      logger.error(
        `Failed to persist guardian config ${config.agentName}:`,
        error
      );
    }
  }

  /**
   * Remove a guardian config from disk
   */
  async removeGuardian(agentName: string): Promise<void> {
    try {
      // Remove from global dir
      const filePath = this.getConfigPath(agentName);
      await fs.unlink(filePath).catch(() => {});

      // Try to load the config first to find the project path
      // (already deleted above, so we read before delete in the caller)
      logger.info(`Guardian config removed: ${agentName}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        logger.error(
          `Failed to remove guardian config ${agentName}:`,
          error
        );
      }
    }
  }

  /**
   * Remove a guardian config from both global and project-specific dirs
   */
  async removeGuardianFull(
    agentName: string,
    projectPath: string
  ): Promise<void> {
    // Remove from global dir
    const filePath = this.getConfigPath(agentName);
    await fs.unlink(filePath).catch(() => {});

    // Remove from project dir
    const projectFilePath = path.join(
      projectPath,
      ".codeguardian",
      "guardians",
      `${this.sanitizeName(agentName)}.json`
    );
    await fs.unlink(projectFilePath).catch(() => {});

    logger.info(`Guardian config fully removed: ${agentName}`);
  }

  /**
   * Load all persisted guardian configs
   */
  async loadAllGuardians(): Promise<PersistedGuardianConfig[]> {
    try {
      const files = await fs.readdir(this.guardiansDir);
      const configs: PersistedGuardianConfig[] = [];

      for (const file of files) {
        if (file.endsWith(".json") && file !== ALERTS_FILE) {
          try {
            const content = await fs.readFile(
              path.join(this.guardiansDir, file),
              "utf-8"
            );
            const config = JSON.parse(content) as PersistedGuardianConfig;
            configs.push(config);
          } catch (err) {
            logger.warn(`Failed to load guardian config ${file}:`, err);
          }
        }
      }

      return configs;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      logger.error("Failed to load guardian configs:", error);
      return [];
    }
  }

  // --------------------------------------------------------------------------
  // Alert persistence
  // --------------------------------------------------------------------------

  /**
   * Save all current file alerts to disk
   */
  async saveAlerts(
    alerts: Map<string, PersistedAlert>
  ): Promise<void> {
    try {
      await this.initialize();
      const filePath = path.join(this.guardiansDir, ALERTS_FILE);
      const data = Object.fromEntries(alerts.entries());
      await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
      logger.debug(`Saved ${alerts.size} alerts to disk`);
    } catch (error) {
      logger.error("Failed to save alerts:", error);
    }
  }

  /**
   * Load persisted alerts from disk
   */
  async loadAlerts(): Promise<Map<string, PersistedAlert>> {
    try {
      const filePath = path.join(this.guardiansDir, ALERTS_FILE);
      const content = await fs.readFile(filePath, "utf-8");
      const data = JSON.parse(content) as Record<string, PersistedAlert>;
      const map = new Map<string, PersistedAlert>();
      for (const [key, value] of Object.entries(data)) {
        map.set(key, value);
      }
      logger.info(`Loaded ${map.size} persisted alerts`);
      return map;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        logger.error("Failed to load alerts:", error);
      }
      return new Map();
    }
  }

  /**
   * Clear persisted alerts
   */
  async clearAlerts(): Promise<void> {
    try {
      const filePath = path.join(this.guardiansDir, ALERTS_FILE);
      await fs.unlink(filePath).catch(() => {});
    } catch (error) {
      // Ignore
    }
  }

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  private getConfigPath(agentName: string): string {
    return path.join(
      this.guardiansDir,
      `${this.sanitizeName(agentName)}.json`
    );
  }

  private sanitizeName(name: string): string {
    return name.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase();
  }

  /**
   * Validate that a persisted config's project path still exists
   */
  async isProjectValid(config: PersistedGuardianConfig): Promise<boolean> {
    try {
      await fs.access(config.projectPath);
      return true;
    } catch {
      return false;
    }
  }
}

// ============================================================================
// Singleton
// ============================================================================

export const guardianPersistence = new GuardianPersistence();
