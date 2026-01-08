/**
 * CodeGuardian MCP - Focused Tool Set
 *
 * 3 TOOLS ONLY - Each with clear, unique value:
 *
 * 1. validate_code - THE flagship: catches hallucinations + dead code
 * 2. build_context - Makes validation fast (auto-called, but can force rebuild)
 * 3. get_dependency_graph - "What breaks if I change this?"
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

        // Context management (forceRebuild replaces invalidate_context)
        buildContextTool.definition,

        // Impact analysis - what breaks if I change this?
        getDependencyGraphTool.definition,
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

        case "build_context":
          return await buildContextTool.handler(args);

        case "get_dependency_graph":
          return await getDependencyGraphTool.handler(args);

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
