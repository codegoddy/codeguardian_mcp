/**
 * Tool registration for CodeGuardian MCP
 * 
 * This file centralizes the registration of all tools provided by the server.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { logger } from '../utils/logger.js';

// Tool implementations
import { preventHallucinationsTool } from './preventHallucinations.js';
import { analyzeCodeQualityTool } from './analyzeCodeQuality.js';
import { generateTestsTool } from './generateTests.js';
import { runSecurityScanTool } from './runSecurityScan.js';
import { checkProductionReadinessTool } from './checkProductionReadiness.js';

/**
 * Register all tools with the MCP server
 */
export function registerTools(server: Server) {
  // List all available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        preventHallucinationsTool.definition,
        analyzeCodeQualityTool.definition,
        generateTestsTool.definition,
        runSecurityScanTool.definition,
        checkProductionReadinessTool.definition,
      ],
    };
  });

  // Handle tool execution
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    logger.info(`Executing tool: ${name}`);

    try {
      switch (name) {
        case 'prevent_hallucinations':
          return await preventHallucinationsTool.handler(args);

        case 'analyze_code_quality':
          return await analyzeCodeQualityTool.handler(args);

        case 'generate_tests':
          return await generateTestsTool.handler(args);

        case 'run_security_scan':
          return await runSecurityScanTool.handler(args);

        case 'check_production_readiness':
          return await checkProductionReadinessTool.handler(args);

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      logger.error(`Error executing tool ${name}:`, error);
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  });
}
