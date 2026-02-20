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
  projectPath?: string;
  agentName?: string;
}

interface AlertsScanStatus {
  phase: "none" | "watch_only" | "initial_partial" | "initial_full";
  initialCoverage: "none" | "partial" | "full";
  initialSignals: {
    apiContract: boolean;
    projectDeadCode: boolean;
    perFile: boolean;
  };
  hasNonInitialAlerts: boolean;
  note: string;
}

// ============================================================================
// Persistence
// ============================================================================

const GUARDIANS_DIR = ".codeguardian/guardians";
const ALERTS_FILE = "alerts.json";

function normalizeProjectPath(projectPath?: string): string | null {
  if (!projectPath || !projectPath.trim()) return null;
  return path.resolve(projectPath);
}

function getProjectPathFromStorageKey(storageKey: string): string | null {
  const separatorIndex = storageKey.indexOf("::");
  if (separatorIndex <= 0) return null;
  const projectPath = storageKey.slice(0, separatorIndex);
  return normalizeProjectPath(projectPath);
}

function buildAlertsScanStatus(
  alerts: Map<string, PersistedAlert>,
): AlertsScanStatus {
  let hasApiContractInitial = false;
  let hasInitialDeadCode = false;
  let hasInitialPerFile = false;
  let hasNonInitialAlerts = false;

  for (const alert of alerts.values()) {
    const fileKey = alert.file || "";

    if (fileKey === "INITIAL_SCAN") {
      hasInitialDeadCode = true;
    } else if (fileKey === "INITIAL_FILE_SCAN") {
      hasInitialPerFile = true;
    } else if (
      fileKey === "API_CONTRACT_SCAN" ||
      fileKey.startsWith("API_CONTRACT_SCAN:")
    ) {
      hasApiContractInitial = true;
    }

    if (!alert.isInitialScan) {
      hasNonInitialAlerts = true;
    }
  }

  const initialSignals = {
    apiContract: hasApiContractInitial,
    projectDeadCode: hasInitialDeadCode,
    perFile: hasInitialPerFile,
  };

  const signalCount = Object.values(initialSignals).filter(Boolean).length;
  const initialCoverage: AlertsScanStatus["initialCoverage"] =
    signalCount === 0 ? "none" : signalCount === 3 ? "full" : "partial";

  let phase: AlertsScanStatus["phase"] = "none";
  if (initialCoverage === "full") {
    phase = "initial_full";
  } else if (initialCoverage === "partial") {
    phase = "initial_partial";
  } else if (hasNonInitialAlerts) {
    phase = "watch_only";
  }

  const note =
    phase === "initial_full"
      ? "Initial scan alerts are present for API contract, project dead code, and per-file checks."
      : "Alert set may be partial. Missing initial-scan alert categories can mean either scans are still in progress or that category produced no issues.";

  return {
    phase,
    initialCoverage,
    initialSignals,
    hasNonInitialAlerts,
    note,
  };
}

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
    alerts: Map<string, PersistedAlert>,
    projectPaths: string[] = []
  ): Promise<void> {
    try {
      await this.initialize();
      const filePath = path.join(this.guardiansDir, ALERTS_FILE);
      const data = Object.fromEntries(alerts.entries());
      await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
      logger.debug(`Saved ${alerts.size} alerts to disk`);

      // Also save LLM-readable alerts to project root(s)
      await this.saveLLMReadableAlerts(alerts, projectPaths);
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
    alerts: Map<string, PersistedAlert>,
    explicitProjectPaths: string[] = []
  ): Promise<void> {
    try {
      const projectPaths = new Set<string>();
      const guardianProjectByName = new Map<string, string>();

      // Include explicit project paths first (passed by live guardians)
      for (const explicitPath of explicitProjectPaths) {
        if (explicitPath && explicitPath.trim()) {
          projectPaths.add(path.resolve(explicitPath));
        }
      }

      // Also discover project paths from persisted guardian configs
      // (used for cross-session persistence/restore)
      const configs = await this.loadAllGuardians();
      for (const config of configs) {
        if (config.projectPath && config.projectPath.trim()) {
          const resolvedPath = path.resolve(config.projectPath);
          projectPaths.add(resolvedPath);
          guardianProjectByName.set(config.agentName, resolvedPath);
        }
      }

      if (projectPaths.size === 0) return;

      // Write to each project root
      for (const projectPath of projectPaths) {
        try {
          const resolvedProjectPath = path.resolve(projectPath);

          // Scope alerts to the owning guardian project.
          // Priority:
          // 1) alert.projectPath metadata
          // 2) composite storage key prefix (<projectPath>::<file>)
          // 3) agentName -> persisted guardian config mapping
          // 4) API_CONTRACT_SCAN:<agent> guardian mapping
          // 5) fallback: include only when a single project is being written
          const scopedAlerts = new Map<string, PersistedAlert>();

          for (const [storageKey, alert] of alerts.entries()) {
            const alertProjectPath = normalizeProjectPath(alert.projectPath);
            if (alertProjectPath) {
              if (alertProjectPath !== resolvedProjectPath) continue;
              scopedAlerts.set(storageKey, alert);
              continue;
            }

            const keyProjectPath = getProjectPathFromStorageKey(storageKey);
            if (keyProjectPath) {
              if (keyProjectPath !== resolvedProjectPath) continue;
              scopedAlerts.set(storageKey, alert);
              continue;
            }

            if (alert.agentName) {
              const ownerProjectPath = guardianProjectByName.get(alert.agentName);
              if (ownerProjectPath) {
                if (ownerProjectPath !== resolvedProjectPath) continue;
                scopedAlerts.set(storageKey, alert);
                continue;
              }
            }

            if (storageKey.startsWith("API_CONTRACT_SCAN:")) {
              const guardianName = storageKey.slice("API_CONTRACT_SCAN:".length);
              const ownerProjectPath = guardianProjectByName.get(guardianName);
              if (ownerProjectPath && ownerProjectPath !== resolvedProjectPath) {
                continue;
              }
              scopedAlerts.set(storageKey, alert);
              continue;
            }

            // Legacy fallback: include ambiguous alerts only when there is a
            // single destination project. This avoids cross-project bleed.
            if (projectPaths.size === 1) {
              scopedAlerts.set(storageKey, alert);
            }
          }

          const groupedByFile: Record<string, PersistedAlert> = {};
          for (const alert of scopedAlerts.values()) {
            groupedByFile[alert.file] = alert;
          }

          const severityCounts: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0, warning: 0 };
          for (const alert of scopedAlerts.values()) {
            for (const issue of alert.issues) {
              const sev = issue.severity || "low";
              severityCounts[sev] = (severityCounts[sev] || 0) + 1;
            }
          }

          const totalIssues = Array.from(scopedAlerts.values()).reduce(
            (sum, alert) => sum + alert.issues.length,
            0,
          );

          const llmAlerts = {
            _meta: {
              generatedBy: "CodeGuardian MCP - Guardian Agent",
              generatedAt: new Date().toISOString(),
              purpose: "LLM-readable guardian alerts. This file is placed outside .codeguardian/ so AI assistants can read it.",
            },
            summary: {
              totalFiles: scopedAlerts.size,
              totalIssues,
              bySeverity: severityCounts,
            },
            scanStatus: buildAlertsScanStatus(scopedAlerts),
            alerts: groupedByFile,
          };

          const content = JSON.stringify(llmAlerts, null, 2);
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
  async clearAlerts(projectPaths: string[] = []): Promise<void> {
    try {
      const filePath = path.join(this.guardiansDir, ALERTS_FILE);
      await fs.unlink(filePath).catch(() => {});

      // Also clean up LLM-readable alerts from project roots
      const roots = new Set<string>();
      for (const projectPath of projectPaths) {
        if (projectPath && projectPath.trim()) {
          roots.add(path.resolve(projectPath));
        }
      }

      const configs = await this.loadAllGuardians();
      for (const config of configs) {
        if (config.projectPath && config.projectPath.trim()) {
          roots.add(path.resolve(config.projectPath));
        }
      }

      for (const root of roots) {
        const llmAlertsPath = path.join(root, LLM_ALERTS_FILENAME);
        await fs.unlink(llmAlertsPath).catch(() => {});
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
