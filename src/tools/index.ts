/**
 * CodeGuardian MCP - Focused Tool Set
 *
 * 6 TOOLS - Each with clear, unique value:
 *
 * 1. validate_code - THE flagship: catches hallucinations + dead code (for snippets/small files)
 * 2. start_validation - Submit async validation job for large codebases (no timeout limits)
 * 3. get_validation_status - Check async job progress
 * 4. get_validation_results - Retrieve async job results
 * 5. build_context - Makes validation fast (auto-called, but can force rebuild)
 * 6. get_dependency_graph - "What breaks if I change this?"
 * 7. start_guardian - Activate the Guardian Agent (proactive validation)
 * 8. stop_guardian - Stop the Guardian Agent
 * 9. get_guardian_alerts - Get pending validation alerts
 * 10. get_guardian_status - Check Guardian status
 *
 * @format
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { logger } from "../utils/logger.js";

// Core tools only
import { buildContextTool } from "./buildContext.js";
import { validateCodeTool } from "./validateCode.js";
import { getDependencyGraphTool } from "./getDependencyGraph.js";

// Async validation tools
import {
  startValidationTool,
  getValidationStatusTool,
  getValidationResultsTool,
} from "./asyncValidation.js";

// Guardian tools - proactive real-time validation
import {
  startGuardianTool,
  stopGuardianTool,
  getGuardianAlertsTool,
  getGuardianStatusTool,
} from "../agent/agentTools.js";

/**
 * Register all tools with the MCP server
 */
export function registerTools(server: Server) {
  // List all available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        // Primary tool - hallucination + dead code detection
        validateCodeTool.definition,

        // Async validation - for large codebases (no timeout limits)
        startValidationTool.definition,
        getValidationStatusTool.definition,
        getValidationResultsTool.definition,

        // Context management (forceRebuild replaces invalidate_context)
        buildContextTool.definition,

        // Impact analysis - what breaks if I change this?
        getDependencyGraphTool.definition,

        // Guardian Mode - real-time proactive validation
        startGuardianTool.definition,
        stopGuardianTool.definition,
        getGuardianAlertsTool.definition,
        getGuardianStatusTool.definition,
      ],
    };
  });

  // Handle tool execution
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    logger.info(`Executing tool: ${name}`);

    try {
      switch (name) {
        case "validate_code":
          return await validateCodeTool.handler(args);

        case "start_validation":
          return await startValidationTool.handler(args);

        case "get_validation_status":
          return await getValidationStatusTool.handler(args);

        case "get_validation_results":
          return await getValidationResultsTool.handler(args);

        case "build_context":
          return await buildContextTool.handler(args);

        case "get_dependency_graph":
          return await getDependencyGraphTool.handler(args);

        case "start_guardian":
          return await startGuardianTool.handler(args);

        case "stop_guardian":
          return await stopGuardianTool.handler(args);

        case "get_guardian_alerts":
          return await getGuardianAlertsTool.handler(args);

        case "get_guardian_status":
          return await getGuardianStatusTool.handler(args);

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      logger.error(`Error executing tool ${name}:`, error);
      return {
        content: [
          {
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  });
}
