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
import { restoreGuardians } from "./agent/agentTools.js";
import { initParsers } from "./tools/validation/parser.js";

// Server configuration
const SERVER_NAME = "codeguardian-mcp";
const SERVER_VERSION = "1.0.0";

/**
 * Initialize and start the MCP server
 */
async function main() {
  logger.info("Starting CodeGuardian MCP Server...");

  // Initialize web-tree-sitter WASM parsers (must complete before any parsing)
  await initParsers();
  logger.info("Tree-sitter WASM parsers initialized");

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
    
    // Gracefully stop guardian watchers but KEEP persisted configs on disk.
    // This allows guardians to auto-restore when the server restarts
    // (e.g., when the user starts a new LLM session).
    try {
      const { shutdownGuardiansGracefully } = await import("./agent/agentTools.js");
      await shutdownGuardiansGracefully();
      logger.info("All guardians stopped gracefully (configs preserved for next session).");
    } catch (err) {
      logger.error("Error stopping guardians during shutdown:", err);
    }
    
    // Shutdown report store
    try {
      const { validationReportStore } = await import("./resources/validationReportStore.js");
      validationReportStore.shutdown();
      logger.info("Validation report store cleaned up.");
    } catch (err) {
      logger.error("Error cleaning up report store:", err);
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

  // Auto-restore guardians from previous session (non-blocking)
  restoreGuardians().then((count) => {
    if (count > 0) {
      logger.info(`Restored ${count} guardian(s) from previous session`);
    }
  }).catch((err) => {
    logger.error("Failed to restore guardians:", err);
  });
}

// Start the server
main().catch((error) => {
  logger.error("Fatal error:", error);
  process.exit(1);
});
