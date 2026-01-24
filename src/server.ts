#!/usr/bin/env node
/**
 * CodeGuardian MCP Server
 *
 * Main entry point for the CodeGuardian Model Context Protocol server.
 * Provides automated quality assurance tools for AI-generated code with
 * hallucination prevention, security scanning, and production readiness checks.
 *
 * @format
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { logger } from "./utils/logger.js";
import { registerTools } from "./tools/index.js";
import { registerResources } from "./resources/index.js";
import { registerPrompts } from "./prompts/index.js";
import { registerValidationJob } from "./queue/validationJob.js";
import { setMCPServer } from "./agent/mcpNotifications.js";

// Server configuration
const SERVER_NAME = "codeguardian-mcp";
const SERVER_VERSION = "1.0.0";

/**
 * Initialize and start the MCP server
 */
async function main() {
  logger.info("Starting CodeGuardian MCP Server...");

  // Initialize job queue and register handlers
  registerValidationJob();
  logger.info("Job queue initialized");

  // Create MCP server instance
  const server = new Server(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
    {
      capabilities: {
        tools: {},
        resources: {},
        prompts: {},
      },
    },
  );

  // Register all tools
  registerTools(server);
  logger.info("Tools registered successfully");

  // Register MCP server for notification system
  setMCPServer(server);

  // Register all resources
  registerResources(server);
  logger.info("Resources registered successfully");

  // Register all prompts
  registerPrompts(server);
  logger.info("Prompts registered successfully");

  // Set up error handling
  server.onerror = (error) => {
    logger.error("Server error:", error);
  };

  const cleanup = async () => {
    logger.info("Shutting down CodeGuardian MCP Server...");
    
    // Stop all active guardians
    try {
      await import("./agent/agentTools.js").then((m) => 
        m.stopGuardianTool.handler({ agent_name: "" })
      );
      logger.info("All guardians stopped.");
    } catch (err) {
      logger.error("Error stopping guardians during shutdown:", err);
    }

    await server.close();
    process.exit(0);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  // Connect using stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  logger.info(`${SERVER_NAME} v${SERVER_VERSION} is running`);
}

// Start the server
main().catch((error) => {
  logger.error("Fatal error:", error);
  process.exit(1);
});
