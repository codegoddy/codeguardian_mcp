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

// Global map of active agents (key: name)
const activeGuardians = new Map<string, AutoValidator>();
// Map of file paths to their latest validation alert (issues or clear)
const fileAlerts = new Map<string, ValidationAlert>();

/**
 * Callback to handle validation alerts
 * Stores them for retrieval via get_guardian_alerts tool
 * 
 * Note: MCP servers cannot directly push data to LLMs. The LLM must
 * call get_guardian_alerts to retrieve pending alerts. We also send
 * a UI notification to hint the user/LLM that alerts are available.
 */
function handleAlert(alert: ValidationAlert): void {
  // Update state for this file
  if (alert.issues.length === 0) {
    // Clear issues for this file
    const hadIssues = fileAlerts.has(alert.file);
    fileAlerts.delete(alert.file);
    
    // Only log if we actually cleared something
    if (hadIssues) {
      logger.info(`Issues cleared for: ${alert.file}`);
    }
  } else {
    // Store new issues for LLM to retrieve via get_guardian_alerts
    fileAlerts.set(alert.file, alert);
    logger.info(`Alert stored for: ${alert.file} (${alert.issues.length} issues) - use get_guardian_alerts to retrieve`);
    
    // Send UI notification as a hint (shows in client UI, not to LLM directly)
    // The LLM still needs to call get_guardian_alerts to get the actual data
    pushValidationAlert(alert).catch((err) => {
      logger.warn("Failed to send UI notification:", err);
    });
  }
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
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: false,
              message: `Guardian '${agent_name}' is already watching. Use a different name or stop it first.`,
              status: activeGuardians.get(agent_name)?.getStatus(),
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

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              message: `Started ${agent_name} at ${absolutePath} (${language}). Initialization running in background.`,
              status: {
                  ...guardian.getStatus(),
                  state: "initializing"
              },
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
      for (const [name, guardian] of activeGuardians) {
        guardian.stop();
      }
      activeGuardians.clear();
      fileAlerts.clear(); // Clear all tracked alerts
      
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
    description: `Get pending alerts from all active Guardians.`,
    inputSchema: {
      type: "object",
      properties: {
        clearAfterRead: {
          type: "boolean",
          description: "Deprecated: Alerts are now persistent until issues are resolved. This flag is ignored.",
          default: false,
        },
      },
    },
  },

  async handler(args: any) {
    // Get all active alerts
    const alerts = Array.from(fileAlerts.values());

    if (alerts.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              hasAlerts: false,
              message: "No active issues. All clear! (Alerts automatically clear when issues are fixed)",
            }),
          },
        ],
      };
    }

    // Format alerts for LLM consumption
    const llmMessages = alerts.map((a) => a.llmMessage).join("\n\n---\n\n");

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            hasAlerts: true,
            alertCount: alerts.length,
            alerts: alerts,
            llmSummary: llmMessages,
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
    if (activeGuardians.size === 0) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              active: false,
              message: "No Guardians are active.",
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
            pendingAlerts: fileAlerts.size,
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

      const result = await validateApiContracts(absolutePath, {
        validation: {
          endpoint: includeEndpoints,
          parameters: includeParameters,
          types: includeTypes,
          strict: false,
        },
      });

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
      lines.push(`  - Medium: ${report.summary.medium} 🟡`);
      lines.push(`  - Low: ${report.summary.low} 🟢`);
      lines.push(`- **Matched Endpoints:** ${report.summary.matchedEndpoints}`);
      lines.push(`- **Matched Types:** ${report.summary.matchedTypes}`);
      lines.push(`- **Unmatched Frontend:** ${report.summary.unmatchedFrontend}`);
      lines.push(`- **Unmatched Backend:** ${report.summary.unmatchedBackend}`);
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
