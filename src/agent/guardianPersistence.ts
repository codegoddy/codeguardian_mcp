/**
 * Guardian Persistence Layer
 *
 * Saves guardian configurations and alerts to disk so they survive
 * server restarts (e.g., when the user starts a new LLM session).
 *
 * On startup, the server reads persisted configs and auto-restores
 * guardians without requiring the LLM to call start_guardian again.
 *
 * Alerts are saved in TWO locations:
 * 1. `.codeguardian/guardians/alerts.json` - internal cache (gitignored)
 * 2. `codeguardian-alerts.json` - LLM-readable file at project root (NOT gitignored)
 *
 * @format
 */

import * as fs from "fs/promises";
import * as path from "path";
import { logger } from "../utils/logger.js";

// ============================================================================
// Constants
// ============================================================================

/**
 * LLM-readable alerts filename.
 * Placed at the project root, outside `.codeguardian/`, so that
 * LLM file-reading tools (which often respect .gitignore) can access it.
 */
const LLM_ALERTS_FILENAME = "codeguardian-alerts.json";

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
    file?: string; // Source file path (for initial scan issues, used to scrub stale alerts)
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
   * Save all current file alerts to disk.
   *
   * Saves to TWO locations:
   * 1. `.codeguardian/guardians/alerts.json` - internal cache (gitignored)
   * 2. `codeguardian-alerts.json` - LLM-readable file at project root(s)
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

      // Also save LLM-readable alerts to project root(s)
      await this.saveLLMReadableAlerts(alerts);
    } catch (error) {
      logger.error("Failed to save alerts:", error);
    }
  }

  /**
   * Save LLM-readable alerts file to each guardian's project root.
   *
   * This is placed OUTSIDE `.codeguardian/` so that LLM file-reading tools
   * (which often respect .gitignore) can access the alert data.
   */
  private async saveLLMReadableAlerts(
    alerts: Map<string, PersistedAlert>
  ): Promise<void> {
    try {
      // Discover project paths from persisted guardian configs
      const configs = await this.loadAllGuardians();
      const projectPaths = new Set<string>();
      for (const config of configs) {
        projectPaths.add(config.projectPath);
      }

      if (projectPaths.size === 0) return;

      // Build a structured alert report
      const alertEntries = Array.from(alerts.values());
      const groupedByFile: Record<string, PersistedAlert> = {};
      for (const [file, alert] of alerts.entries()) {
        groupedByFile[file] = alert;
      }

      // Count by severity
      const severityCounts: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0, warning: 0 };
      for (const alert of alertEntries) {
        for (const issue of alert.issues) {
          const sev = issue.severity || "low";
          severityCounts[sev] = (severityCounts[sev] || 0) + 1;
        }
      }

      const totalIssues = alertEntries.reduce((sum, a) => sum + a.issues.length, 0);

      const llmAlerts = {
        _meta: {
          generatedBy: "CodeGuardian MCP - Guardian Agent",
          generatedAt: new Date().toISOString(),
          purpose: "LLM-readable guardian alerts. This file is placed outside .codeguardian/ so AI assistants can read it.",
        },
        summary: {
          totalFiles: alerts.size,
          totalIssues,
          bySeverity: severityCounts,
        },
        alerts: groupedByFile,
      };

      const content = JSON.stringify(llmAlerts, null, 2);

      // Write to each project root
      for (const projectPath of projectPaths) {
        try {
          const llmAlertsPath = path.join(projectPath, LLM_ALERTS_FILENAME);
          await fs.writeFile(llmAlertsPath, content, "utf-8");
          logger.debug(`LLM-readable alerts saved: ${llmAlertsPath}`);
        } catch (err) {
          logger.warn(`Failed to save LLM-readable alerts to ${projectPath}:`, err);
        }
      }
    } catch (error) {
      logger.warn("Failed to save LLM-readable alerts:", error);
    }
  }

  /**
   * Get the LLM-readable alerts file path for a project
   */
  getLLMAlertsPath(projectPath: string): string {
    return path.join(projectPath, LLM_ALERTS_FILENAME);
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
   * Clear persisted alerts (both internal cache and LLM-readable files)
   */
  async clearAlerts(): Promise<void> {
    try {
      const filePath = path.join(this.guardiansDir, ALERTS_FILE);
      await fs.unlink(filePath).catch(() => {});

      // Also clean up LLM-readable alerts from project roots
      const configs = await this.loadAllGuardians();
      for (const config of configs) {
        try {
          const llmAlertsPath = path.join(config.projectPath, LLM_ALERTS_FILENAME);
          await fs.unlink(llmAlertsPath).catch(() => {});
        } catch {
          // Ignore
        }
      }
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
