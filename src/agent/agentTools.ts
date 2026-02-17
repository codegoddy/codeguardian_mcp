/**
 * Agent Tools - Start/Stop Agent Mode
 *
 * MCP tools to control the proactive agent mode.
 *
 * @format
 */

import * as path from "path";
import { ToolDefinition } from "../types/tools.js";
import { AutoValidator, ValidationAlert } from "./autoValidator.js";
import { pushValidationAlert } from "./mcpNotifications.js";
import { logger } from "../utils/logger.js";
import {
  validateApiContracts,
  formatValidationResults,
  generateValidationReport,
} from "../api-contract/index.js";
import { guardianPersistence } from "./guardianPersistence.js";

// Global map of active agents (key: name)
const activeGuardians = new Map<string, AutoValidator>();
// Map of file paths to their latest validation alert (issues or clear)
const fileAlerts = new Map<string, ValidationAlert>();

// Debounced alert persistence — avoid writing to disk on every single alert change
let alertPersistTimer: ReturnType<typeof setTimeout> | null = null;

function getActiveGuardianProjectPaths(): string[] {
  return Array.from(activeGuardians.values())
    .map((guardian) => guardian.getStatus().projectPath)
    .filter((projectPath): projectPath is string => !!projectPath);
}

function scheduleAlertPersist(): void {
  if (alertPersistTimer) clearTimeout(alertPersistTimer);
  alertPersistTimer = setTimeout(() => {
    const projectPaths = getActiveGuardianProjectPaths();

    guardianPersistence.saveAlerts(fileAlerts, projectPaths).catch((err) => {
      logger.warn("Failed to persist alerts:", err);
    });
    alertPersistTimer = null;
  }, 2000);
}

function cancelScheduledAlertPersist(): void {
  if (!alertPersistTimer) return;
  clearTimeout(alertPersistTimer);
  alertPersistTimer = null;
}

async function flushAlertPersistenceNow(): Promise<void> {
  // If nothing is active and memory is empty, do not overwrite persisted alerts.
  // This allows get_guardian_alerts to hydrate from disk after server/session restarts.
  if (activeGuardians.size === 0 && fileAlerts.size === 0) {
    return;
  }

  cancelScheduledAlertPersist();
  await guardianPersistence.saveAlerts(fileAlerts, getActiveGuardianProjectPaths());
}

function collectAlertsWithIssues(alertMap: Map<string, ValidationAlert>): ValidationAlert[] {
  const alerts: ValidationAlert[] = [];
  for (const alert of alertMap.values()) {
    if (Array.isArray(alert.issues) && alert.issues.length > 0) {
      alerts.push(alert);
    }
  }
  return alerts;
}

function isApiContractScanAlertKey(alertKey: string): boolean {
  return alertKey === "API_CONTRACT_SCAN" || alertKey.startsWith("API_CONTRACT_SCAN:");
}

/**
 * Callback to handle validation alerts
 * Stores them for retrieval via get_guardian_alerts tool
 * 
 * Note: MCP servers cannot directly push data to LLMs. The LLM must
 * call get_guardian_alerts to retrieve pending alerts. We also send
 * a UI notification to hint the user/LLM that alerts are available.
 */
function handleAlert(alert: ValidationAlert): void {
  // Initial scan notifications can be useful UX hints but should not be tracked
  // as pending issues when they carry zero findings.
  if (alert.issues.length === 0 && alert.isInitialScan) {
    fileAlerts.delete(alert.file);

    pushValidationAlert(alert).catch((err) => {
      logger.warn("Failed to send UI notification:", err);
    });
    return;
  }

  // Update state for this file
  if (alert.issues.length === 0 && !alert.isInitialScan) {
    // Clear issues for this file
    const hadIssues = fileAlerts.has(alert.file);
    fileAlerts.delete(alert.file);
    
    // Also scrub initial scan alerts that referenced this file.
    // Initial scans (INITIAL_FILE_SCAN, INITIAL_SCAN, API_CONTRACT_SCAN) store
    // issues from startup. When a file is re-validated and passes clean,
    // those stale initial issues should be removed.
    const scrubbed = scrubInitialScanIssuesForFile(alert.file);
    
    // Only log if we actually cleared something
    if (hadIssues || scrubbed) {
      logger.info(`Issues cleared for: ${alert.file}${scrubbed ? " (including initial scan issues)" : ""}`);
    }

    // Always persist after a clear notification to keep file + tool view aligned.
    scheduleAlertPersist();
  } else {
    // If this is an API_CONTRACT_SCAN update (legacy or guardian-scoped),
    // replace only that specific scan key.
    // This handles re-validation of service/route files updating the contract scan.
    if (isApiContractScanAlertKey(alert.file)) {
      fileAlerts.set(alert.file, alert);
      // Migration: once guardian-scoped keys are flowing, drop the old shared key
      // so stale cross-guardian messages don't keep showing up.
      if (alert.file !== "API_CONTRACT_SCAN") {
        fileAlerts.delete("API_CONTRACT_SCAN");
      }
      logger.info(`API Contract scan updated: ${alert.issues.length} issues`);
      scheduleAlertPersist();
      return;
    }

    // Store new issues for LLM to retrieve via get_guardian_alerts
    fileAlerts.set(alert.file, alert);
    logger.info(`Alert stored for: ${alert.file} (${alert.issues.length} issues) - use get_guardian_alerts to retrieve`);
    scheduleAlertPersist();
    
    // Send UI notification as a hint (shows in client UI, not to LLM directly)
    // The LLM still needs to call get_guardian_alerts to get the actual data
    pushValidationAlert(alert).catch((err) => {
      logger.warn("Failed to send UI notification:", err);
    });
  }
}

/**
 * When a file passes clean re-validation, scrub any matching issues from
 * the initial scan alerts (INITIAL_FILE_SCAN, INITIAL_SCAN, API_CONTRACT_SCAN).
 * These are snapshot alerts from startup that may reference files which have
 * since been fixed.
 *
 * @returns true if any initial scan issues were removed
 */
function scrubInitialScanIssuesForFile(cleanFile: string): boolean {
  let scrubbed = false;
  const INITIAL_SCAN_KEYS = [
    "INITIAL_FILE_SCAN",
    "INITIAL_SCAN",
    // Legacy key support
    "API_CONTRACT_SCAN",
    // Guardian-scoped API contract scans
    ...Array.from(fileAlerts.keys()).filter((key) => isApiContractScanAlertKey(key)),
  ];

  for (const key of new Set(INITIAL_SCAN_KEYS)) {
    const scanAlert = fileAlerts.get(key);
    if (!scanAlert) continue;

    const originalCount = scanAlert.issues.length;

    // Remove issues that reference the now-clean file.
    // Issues may have a `file` field (from the per-file scan) or the message
    // may contain the file path. Check both.
    // Normalize paths for comparison (strip leading ../ segments and path separators)
    const normalizedClean = cleanFile.replace(/^(\.\.\/)+/, "").replace(/\\/g, "/");
    scanAlert.issues = scanAlert.issues.filter((issue: any) => {
      if (issue.file) {
        const normalizedIssueFile = issue.file.replace(/^(\.\.\/)+/, "").replace(/\\/g, "/");
        // Match by normalized paths (handles ../../ frontend/src/... vs frontend/src/...)
        if (normalizedIssueFile === normalizedClean ||
            normalizedIssueFile.endsWith(normalizedClean) ||
            normalizedClean.endsWith(normalizedIssueFile)) {
          return false;
        }
      }
      // Check if the message references this file
      if (issue.message && issue.message.includes(normalizedClean)) {
        return false;
      }
      return true;
    });

    if (scanAlert.issues.length < originalCount) {
      scrubbed = true;
      logger.debug(`Scrubbed ${originalCount - scanAlert.issues.length} stale issues from ${key} for file: ${cleanFile}`);

      // If no issues remain, remove the entire alert
      if (scanAlert.issues.length === 0) {
        fileAlerts.delete(key);
        logger.debug(`Removed empty ${key} alert`);
      }
    }
  }

  return scrubbed;
}

export const startGuardianTool: ToolDefinition = {
  definition: {
    name: "start_guardian",
    description: `Activate a VibeGuard Agent.
You can start multiple Guardians to watch different parts of your codebase (e.g., one for 'Frontend', one for 'Backend').
Each Guardian watches its own path and language.`,
    inputSchema: {
      type: "object",
      properties: {
        projectPath: {
          type: "string",
          description: "Absolute path to the project root",
        },
        language: {
          type: "string",
          enum: ["javascript", "typescript", "python", "go"],
          description: "Programming language (default: typescript)",
          default: "typescript",
        },
        mode: {
          type: "string",
          enum: ["auto", "learning", "strict"],
          description: "Operation mode (default: auto)",
          default: "auto",
        },
        agent_name: {
          type: "string",
          description: "Name for your Guardian (default: 'VibeGuard')",
          default: "VibeGuard",
        },
      },
      required: ["projectPath"],
    },
  },

  async handler(args: any) {
    const { projectPath, language = "typescript", mode = "auto", agent_name = "VibeGuard" } = args;

    // Resolve relative paths (user-friendly)
    const absolutePath = path.resolve(projectPath);

    if (activeGuardians.has(agent_name)) {
      const existingStatus = activeGuardians.get(agent_name)?.getStatus();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              alreadyRunning: true,
              message: `Guardian '${agent_name}' is already active (auto-restored from previous session). No action needed — it's watching your code.`,
              status: existingStatus,
              pendingAlerts: fileAlerts.size,
              hint: fileAlerts.size > 0
                ? "There are pending alerts from the previous session. Use get_guardian_alerts to review them."
                : "No pending alerts. The guardian is watching for changes.",
            }),
          },
        ],
      };
    }

    try {
      const guardian = new AutoValidator(absolutePath, language, mode, agent_name);
      guardian.setAlertHandler(handleAlert);
      
      // Start in background to avoid MCP timeout
      // processing context/initial scan can take time
      guardian.start().catch(err => {
         logger.error(`Failed to start guardian ${agent_name}:`, err);
      });

      activeGuardians.set(agent_name, guardian);

      // Persist config so guardian survives server restarts (new LLM sessions).
      // Await to avoid races where tests/cleanup stop a guardian before persistence settles.
      await guardianPersistence.saveGuardian({
        agentName: agent_name,
        projectPath: absolutePath,
        language,
        mode,
        startedAt: Date.now(),
      });

      const alertsFilePath = guardianPersistence.getLLMAlertsPath(absolutePath);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              message: `Started ${agent_name} at ${absolutePath} (${language}). Initialization running in background.`,
              alertsFile: alertsFilePath,
              status: {
                  ...guardian.getStatus(),
                  state: "initializing"
              },
              hint: `Alerts will be saved to ${alertsFilePath} (readable by file tools, NOT inside .codeguardian/). Use get_guardian_alerts or read the file directly to check for issues.`,
            }),
          },
        ],
      };
    } catch (error) {
      logger.error("Failed to start guardian:", error);
      return {
        content: [
          {
            type: "text",
            text: `Error activating Guardian: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  },
};

export const stopGuardianTool: ToolDefinition = {
  definition: {
    name: "stop_guardian",
    description: "Stop a specific Guardian Agent or all active Guardians.",
    inputSchema: {
      type: "object",
      properties: {
        agent_name: {
          type: "string",
          description: "Name of the Guardian to stop. Leave empty to stop ALL.",
        },
      },
    },
  },

  async handler(args: any) {
    const { agent_name } = args;

    // Prevent delayed disk writes from firing while/after guardians are being stopped.
    cancelScheduledAlertPersist();

    if (activeGuardians.size === 0) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: false,
              message: "No active Guardians.",
            }),
          },
        ],
      };
    }

    if (agent_name) {
      const guardian = activeGuardians.get(agent_name);
      if (!guardian) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: false,
                message: `Guardian '${agent_name}' not found.`,
                activeGuardians: Array.from(activeGuardians.keys()),
              }),
            },
          ],
        };
      }
      guardian.stop();
      activeGuardians.delete(agent_name);

      // Remove persisted config so it won't auto-restore
      try {
        await guardianPersistence.removeGuardianFull(agent_name, guardian.getStatus().projectPath);
      } catch (err) {
        logger.warn("Failed to remove persisted guardian config:", err);
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              message: `${agent_name} stopped.`,
            }),
          },
        ],
      };
    } else {
      // Stop all
      const count = activeGuardians.size;
      const projectPaths = getActiveGuardianProjectPaths();
      const removals: Promise<void>[] = [];
      for (const [name, guardian] of activeGuardians) {
        guardian.stop();
        // Remove persisted config
        removals.push(
          guardianPersistence.removeGuardianFull(name, guardian.getStatus().projectPath).catch(() => {}),
        );
      }
      activeGuardians.clear();
      fileAlerts.clear(); // Clear all tracked alerts
      await Promise.allSettled(removals);
      await guardianPersistence.clearAlerts(projectPaths).catch(() => {});
      
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              message: `Stopped all ${count} Guardians.`,
            }),
          },
        ],
      };
    }
  },
};

export const getGuardianAlertsTool: ToolDefinition = {
  definition: {
    name: "get_guardian_alerts",
    description: `Get pending alerts from all active Guardians. Returns a compact summary with a pointer to the full LLM-readable alerts file (codeguardian-alerts.json) in the project root.`,
    inputSchema: {
      type: "object",
      properties: {
        clearAfterRead: {
          type: "boolean",
          description: "Deprecated: Alerts are now persistent until issues are resolved. This flag is ignored.",
          default: false,
        },
        summaryOnly: {
          type: "boolean",
          description: "If true, returns only a compact summary with file path to full alerts. Useful to avoid LLM context overflow. Default: false.",
          default: false,
        },
      },
    },
  },

  async handler(args: any) {
    const { summaryOnly = false } = args;

    // Keep LLM tool output and codeguardian-alerts.json in sync at read time.
    await flushAlertPersistenceNow().catch((err) => {
      logger.warn("Failed to flush alerts before get_guardian_alerts:", err);
    });

    // Get all active alerts that contain actual issues.
    let alerts = collectAlertsWithIssues(fileAlerts);

    // If memory is empty (e.g., very early after restart), hydrate from persisted alerts.
    if (alerts.length === 0) {
      const persistedAlerts = await guardianPersistence.loadAlerts();
      for (const [file, alert] of persistedAlerts.entries()) {
        fileAlerts.set(file, alert as ValidationAlert);
      }
      alerts = collectAlertsWithIssues(fileAlerts);
    }

    // Collect LLM-readable file paths from all active guardians
    const alertsFilePaths = new Set<string>();
    for (const guardian of activeGuardians.values()) {
      const status = guardian.getStatus();
      if (status.projectPath) {
        alertsFilePaths.add(guardianPersistence.getLLMAlertsPath(status.projectPath));
      }
    }

    // If no guardians are currently active, still provide paths for persisted guardians.
    if (alertsFilePaths.size === 0) {
      const persistedConfigs = await guardianPersistence.loadAllGuardians();
      for (const config of persistedConfigs) {
        if (config.projectPath) {
          alertsFilePaths.add(guardianPersistence.getLLMAlertsPath(config.projectPath));
        }
      }
    }

    const alertsFilePathList = Array.from(alertsFilePaths);

    if (alerts.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              hasAlerts: false,
              message: "No active issues. All clear! (Alerts automatically clear when issues are fixed)",
              alertsFiles: alertsFilePathList.length > 0 ? alertsFilePathList : undefined,
            }),
          },
        ],
      };
    }

    // Count issues by severity
    const severityCounts: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0, warning: 0 };
    let totalIssues = 0;
    for (const alert of alerts) {
      for (const issue of alert.issues) {
        const sev = issue.severity || "low";
        severityCounts[sev] = (severityCounts[sev] || 0) + 1;
        totalIssues++;
      }
    }

    // For summaryOnly mode or large alert sets, return compact summary + file path
    if (summaryOnly || totalIssues > 50) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              hasAlerts: true,
              alertCount: alerts.length,
              totalIssues,
              bySeverity: severityCounts,
              affectedFiles: alerts.map(a => a.file),
              alertsFiles: alertsFilePathList,
              message: totalIssues > 50
                ? `Large alert set (${totalIssues} issues across ${alerts.length} files). Full details available in the alertsFiles listed above. Use read_file to access them.`
                : `${totalIssues} issues across ${alerts.length} files. Full details available in the alertsFiles listed above.`,
              hint: "The codeguardian-alerts.json file in the project root contains the full alert details. Use your file-reading tool to access it.",
            }),
          },
        ],
      };
    }

    // Format alerts for LLM consumption (full inline for small result sets)
    const llmMessages = alerts.map((a) => a.llmMessage).join("\n\n---\n\n");

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            hasAlerts: true,
            alertCount: alerts.length,
            totalIssues,
            bySeverity: severityCounts,
            alerts: alerts,
            llmSummary: llmMessages,
            alertsFiles: alertsFilePathList,
            hint: "Full alerts are also persisted at the codeguardian-alerts.json file(s) in the project root. Use your file-reading tool to access them across sessions.",
          }),
        },
      ],
    };
  },
};

export const getGuardianStatusTool: ToolDefinition = {
  definition: {
    name: "get_guardian_status",
    description: "Get the current status of VibeGuard. Use this when the user asks for 'vibeguard status', 'what is running', or 'agent health'. Lists all active agents.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },

  async handler() {
    const pendingIssueAlerts = collectAlertsWithIssues(fileAlerts).length;

    if (activeGuardians.size === 0) {
      // Check if there are persisted configs that might be restoring
      const persistedConfigs = await guardianPersistence.loadAllGuardians();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              active: false,
              message: persistedConfigs.length > 0
                ? `No Guardians are active yet, but ${persistedConfigs.length} guardian(s) are being restored from a previous session. They should be ready shortly.`
                : "No Guardians are active.",
              pendingRestore: persistedConfigs.length,
              pendingAlerts: pendingIssueAlerts,
            }),
          },
        ],
      };
    }

    const statuses = Array.from(activeGuardians.values()).map(g => g.getStatus());

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            active: true,
            count: activeGuardians.size,
            guardians: statuses,
            pendingAlerts: pendingIssueAlerts,
            hint: pendingIssueAlerts > 0
              ? "There are pending alerts. Use get_guardian_alerts to review them."
              : "No pending alerts. All clear.",
          }),
        },
      ],
    };
  },
};

// ============================================================================
// API Contract Validation Tools
// ============================================================================

export const validateApiContractsTool: ToolDefinition = {
  definition: {
    name: "validate_api_contracts",
    description: `Validate API contracts between frontend and backend. Detects mismatches in endpoints, types, and parameters before runtime errors occur.`,
    inputSchema: {
      type: "object",
      properties: {
        projectPath: {
          type: "string",
          description: "Absolute path to the project root (should contain both frontend and backend)",
        },
        includeEndpoints: {
          type: "boolean",
          description: "Validate endpoint existence and HTTP methods",
          default: true,
        },
        includeParameters: {
          type: "boolean",
          description: "Validate request/response parameters",
          default: true,
        },
        includeTypes: {
          type: "boolean",
          description: "Validate type compatibility",
          default: true,
        },
      },
      required: ["projectPath"],
    },
  },

  async handler(args: any) {
    const {
      projectPath,
      includeEndpoints = true,
      includeParameters = true,
      includeTypes = true,
    } = args;

    const absolutePath = path.resolve(projectPath);

    try {
      logger.info(`Running API Contract validation for ${absolutePath}`);

      const result = await validateApiContracts(absolutePath);

      const formatted = formatValidationResults(result);

      return {
        content: [
          {
            type: "text",
            text: formatted,
          },
        ],
      };
    } catch (error) {
      logger.error("API Contract validation failed:", error);
      return {
        content: [
          {
            type: "text",
            text: `Error validating API contracts: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  },
};

export const getApiContractReportTool: ToolDefinition = {
  definition: {
    name: "get_api_contract_report",
    description: `Generate a detailed API Contract validation report with recommendations.`,
    inputSchema: {
      type: "object",
      properties: {
        projectPath: {
          type: "string",
          description: "Absolute path to the project root",
        },
      },
      required: ["projectPath"],
    },
  },

  async handler(args: any) {
    const { projectPath } = args;
    const absolutePath = path.resolve(projectPath);

    try {
      const report = await generateValidationReport(absolutePath);

      const lines: string[] = [];
      lines.push("# API Contract Validation Report");
      lines.push("");
      lines.push(`**Generated:** ${report.timestamp}`);
      lines.push(`**Project:** ${report.projectPath}`);
      lines.push("");

      lines.push("## Summary");
      lines.push(`- **Total Issues:** ${report.summary.totalIssues}`);
      lines.push(`  - Critical: ${report.summary.critical} 🔴`);
      lines.push(`  - High: ${report.summary.high} 🟠`);
      lines.push(`- **Matched Endpoints:** ${report.summary.matchedEndpoints}`);
      lines.push(`- **Matched Types:** ${report.summary.matchedTypes}`);
      lines.push("");

      if (report.recommendations.length > 0) {
        lines.push("## Recommendations");
        report.recommendations.forEach((rec, i) => {
          lines.push(`${i + 1}. ${rec}`);
        });
        lines.push("");
      }

      if (report.issues.length > 0) {
        lines.push("## Issues");
        lines.push("");

        const byType = report.issues.reduce((acc, issue) => {
          if (!acc[issue.type]) acc[issue.type] = [];
          acc[issue.type].push(issue);
          return acc;
        }, {} as Record<string, typeof report.issues>);

        for (const [type, issues] of Object.entries(byType)) {
          lines.push(`### ${type}`);
          issues.slice(0, 5).forEach((issue) => {
            lines.push(`- **[${issue.severity.toUpperCase()}]** ${issue.message}`);
            lines.push(`  - File: ${issue.file}:${issue.line}`);
            lines.push(`  - Suggestion: ${issue.suggestion}`);
          });
          if (issues.length > 5) {
            lines.push(`- *... and ${issues.length - 5} more issues of this type*`);
          }
          lines.push("");
        }
      }

      return {
        content: [
          {
            type: "text",
            text: lines.join("\n"),
          },
        ],
      };
    } catch (error) {
      logger.error("Failed to generate API Contract report:", error);
      return {
        content: [
          {
            type: "text",
            text: `Error generating report: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  },
};

// ============================================================================
// Guardian Graceful Shutdown (preserves persisted configs for auto-restore)
// ============================================================================

/**
 * Stop all in-memory guardian watchers WITHOUT removing persisted configs.
 * Called during server shutdown so guardians auto-restore on next startup.
 */
export async function shutdownGuardiansGracefully(): Promise<void> {
  for (const [name, guardian] of activeGuardians) {
    logger.info(`Gracefully stopping guardian '${name}'...`);
    guardian.stop();
  }
  activeGuardians.clear();
  // Do NOT clear fileAlerts — they're already persisted to disk
  // Do NOT call guardianPersistence.removeGuardian — we want auto-restore
}

// ============================================================================
// Guardian Auto-Restore (survives server restarts / new LLM sessions)
// ============================================================================

/**
 * Restore guardians from persisted configs.
 * Called once during server startup to resume any guardians that were
 * running before the server was restarted (e.g., new LLM session).
 */
export async function restoreGuardians(): Promise<number> {
  try {
    const configs = await guardianPersistence.loadAllGuardians();
    if (configs.length === 0) {
      logger.info("No persisted guardians to restore");
      return 0;
    }

    // Load persisted alerts first so they're available immediately
    const persistedAlerts = await guardianPersistence.loadAlerts();
    for (const [file, alert] of persistedAlerts) {
      fileAlerts.set(file, alert);
    }
    if (persistedAlerts.size > 0) {
      logger.info(`Restored ${persistedAlerts.size} persisted alerts`);
    }

    let restored = 0;
    for (const config of configs) {
      // Skip if already running (shouldn't happen, but be safe)
      if (activeGuardians.has(config.agentName)) {
        logger.info(`Guardian '${config.agentName}' already active, skipping restore`);
        continue;
      }

      // Validate the project path still exists
      const valid = await guardianPersistence.isProjectValid(config);
      if (!valid) {
        logger.warn(`Project path no longer exists for guardian '${config.agentName}': ${config.projectPath} — removing persisted config`);
        await guardianPersistence.removeGuardian(config.agentName);
        continue;
      }

      try {
        logger.info(`Restoring guardian '${config.agentName}' for ${config.projectPath} (${config.language})...`);
        const guardian = new AutoValidator(
          config.projectPath,
          config.language,
          config.mode as any,
          config.agentName
        );
        guardian.setAlertHandler(handleAlert);

        // Start in background (same as normal start)
        guardian.start().catch((err) => {
          logger.error(`Failed to restore guardian ${config.agentName}:`, err);
        });

        activeGuardians.set(config.agentName, guardian);
        restored++;
      } catch (err) {
        logger.error(`Error restoring guardian '${config.agentName}':`, err);
        // Remove broken config so we don't keep retrying
        await guardianPersistence.removeGuardian(config.agentName);
      }
    }

    if (restored > 0) {
      logger.info(`Auto-restored ${restored} guardian(s) from previous session`);
    }
    return restored;
  } catch (error) {
    logger.error("Failed to restore guardians:", error);
    return 0;
  }
}
