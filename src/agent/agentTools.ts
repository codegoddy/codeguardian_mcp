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

// Global map of active agents (key: name)
const activeGuardians = new Map<string, AutoValidator>();
// Map of file paths to their latest validation alert (issues or clear)
const fileAlerts = new Map<string, ValidationAlert>();

/**
 * Callback to handle validation alerts
 * Stores them for MCP sampling to retrieve AND auto-pushes to LLM
 */
function handleAlert(alert: ValidationAlert): void {
  // Update state for this file
  if (alert.issues.length === 0) {
    // Clear issues for this file
    const hadIssues = fileAlerts.has(alert.file);
    fileAlerts.delete(alert.file);
    
    // Only verify notification if we actually cleared something
    if (hadIssues) {
      logger.info(`Issues cleared for: ${alert.file}`);
      // Optional: Push "all clear" notification if desired
    }
  } else {
    // Store new issues
    fileAlerts.set(alert.file, alert);
    logger.info(`Alert tracked for: ${alert.file} (${alert.issues.length} issues)`);
    
    // Auto-push to LLM via MCP notification
    pushValidationAlert(alert).catch((err) => {
      logger.warn("Failed to auto-push alert:", err);
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
