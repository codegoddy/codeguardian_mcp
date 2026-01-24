/**
 * MCP Notification System
 *
 * Provides a way to push notifications to the MCP client (system UI)
 * such as Claude Desktop, Cline, Continue, etc.
 * Notifications appear in the client's UI, not directly to the LLM.
 *
 * @format
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { logger } from "../utils/logger.js";

let mcpServer: Server | null = null;

/**
 * Register the MCP server instance for notifications
 */
export function setMCPServer(server: Server): void {
  mcpServer = server;
  logger.info("MCP notification system initialized");
}

/**
 * Send a notification to the MCP client (system UI)
 * This uses MCP's standard logging notification API
 */
export async function sendNotification(
  type: "validation_complete" | "agent_alert" | "initial_scan" | "guardian_ready" | "guardian_starting",
  data: any
): Promise<boolean> {
  if (!mcpServer) {
    logger.warn("MCP server not registered, cannot send notification");
    return false;
  }

  try {
    // Use MCP's standard logging/message notification
    // This routes to the client UI (Claude Desktop, Cline, VS Code, etc.)
    const level = type === "agent_alert" ? "warning" : "info";
    
    await mcpServer.notification({
      method: "notifications/message",
      params: {
        level,
        logger: "CodeGuardian",
        data: {
          type,
          message: data.message || `CodeGuardian ${type}`,
          ...data,
        },
      },
    });

    logger.info(`Sent notification to system: ${type}`);
    return true;
  } catch (error) {
    logger.error("Failed to send notification:", error);
    return false;
  }
}

/**
 * Send a validation alert to the LLM
 */
export async function pushValidationAlert(alert: {
  file: string;
  issues: any[];
  llmMessage: string;
  isInitialScan?: boolean;
}): Promise<boolean> {
  const type = alert.isInitialScan ? "initial_scan" : "agent_alert";
  return sendNotification(type, {
    file: alert.file,
    issueCount: alert.issues.length,
    message: alert.llmMessage,
    timestamp: Date.now(),
  });
}

/**
 * Send async validation results when complete
 */
export async function pushAsyncValidationComplete(
  jobId: string,
  results: any
): Promise<boolean> {
  return sendNotification("validation_complete", {
    jobId,
    success: results.success,
    issueCount: results.issues?.length || 0,
    message: results.recommendation?.message || "Validation complete",
    timestamp: Date.now(),
  });
}
