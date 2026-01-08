/**
 * Tool registration for CodeGuardian MCP
 *
 * FOCUSED TOOLS - Only tools that genuinely help LLMs:
 * 1. build_context - Build shared project context (call first!)
 * 2. validate_code - Catch hallucinations (references to non-existent code)
 * 3. discover_context - Find relevant files for a task
 * 4. get_dependency_graph - Understand what depends on what
 * 5. find_dead_code - Identify unused exports and orphaned files
 * 6. get_test_coverage_gaps - Find what's NOT tested
 * 7. resolve_types - Get actual resolved types
 * 8. scan_directory - Batch validation across files
 *
 * @format
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { logger } from "../utils/logger.js";

// Shared context system
import { buildContextTool, invalidateContextTool } from "./buildContext.js";

// Core tools - things LLMs can't do well on their own
import { validateCodeTool } from "./validateCode.js";
import { discoverContextTool } from "./discoverContext.js";
import { getDependencyGraphTool } from "./getDependencyGraph.js";
import { findDeadCodeTool } from "./findDeadCode.js";
import { getTestCoverageGapsTool } from "./getTestCoverageGaps.js";
import { resolveTypesTool } from "./resolveTypes.js";
import { scanDirectoryTool } from "./scanDirectory.js";
import { scanDependenciesTool } from "./scanDependencies.js";

/**
 * Register all tools with the MCP server
 */
export function registerTools(server: Server) {
  // List all available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        // Shared context (call first for best results)
        buildContextTool.definition,
        invalidateContextTool.definition,

        // Primary tool - hallucination detection
        validateCodeTool.definition,

        // Context discovery
        discoverContextTool.definition,

        // Dependency analysis
        getDependencyGraphTool.definition,

        // Dead code detection
        findDeadCodeTool.definition,

        // Test coverage gaps
        getTestCoverageGapsTool.definition,

        // Type resolution
        resolveTypesTool.definition,

        // Batch scanning
        scanDirectoryTool.definition,

        // Dependency vulnerability scanning
        scanDependenciesTool.definition,
      ],
    };
  });

  // Handle tool execution
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    logger.info(`Executing tool: ${name}`);

    try {
      switch (name) {
        case "build_context":
          return await buildContextTool.handler(args);

        case "invalidate_context":
          return await invalidateContextTool.handler(args);

        case "validate_code":
          return await validateCodeTool.handler(args);

        case "discover_context":
          return await discoverContextTool.handler(args);

        case "get_dependency_graph":
          return await getDependencyGraphTool.handler(args);

        case "find_dead_code":
          return await findDeadCodeTool.handler(args);

        case "get_test_coverage_gaps":
          return await getTestCoverageGapsTool.handler(args);

        case "resolve_types":
          return await resolveTypesTool.handler(args);

        case "scan_directory":
          return await scanDirectoryTool.handler(args);

        case "scan_dependencies":
          return await scanDependenciesTool.handler(args);

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
