/**
 * Resource registration for CodeGuardian MCP
 * 
 * Resources provide access to dynamic data and dashboards.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ListResourcesRequestSchema, ReadResourceRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { logger } from '../utils/logger.js';

/**
 * Register all resources with the MCP server
 */
export function registerResources(server: Server) {
  // List all available resources
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return {
      resources: [
        {
          uri: 'codeguardian://quality-dashboard',
          name: 'Quality Dashboard',
          description: 'Real-time code quality metrics and trends',
          mimeType: 'application/json',
        },
        {
          uri: 'codeguardian://vulnerability-db',
          name: 'Vulnerability Database',
          description: 'Common AI-generated security vulnerabilities',
          mimeType: 'application/json',
        },
        {
          uri: 'codeguardian://best-practices',
          name: 'Best Practices Library',
          description: 'Context-aware coding best practices',
          mimeType: 'application/json',
        },
      ],
    };
  });

  // Handle resource reading
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;

    logger.info(`Reading resource: ${uri}`);

    try {
      switch (uri) {
        case 'codeguardian://quality-dashboard':
          return {
            contents: [
              {
                uri,
                mimeType: 'application/json',
                text: JSON.stringify({
                  message: 'Quality dashboard - coming soon',
                  metrics: {},
                }, null, 2),
              },
            ],
          };

        case 'codeguardian://vulnerability-db':
          return {
            contents: [
              {
                uri,
                mimeType: 'application/json',
                text: JSON.stringify({
                  message: 'Vulnerability database - coming soon',
                  vulnerabilities: [],
                }, null, 2),
              },
            ],
          };

        case 'codeguardian://best-practices':
          return {
            contents: [
              {
                uri,
                mimeType: 'application/json',
                text: JSON.stringify({
                  message: 'Best practices library - coming soon',
                  practices: [],
                }, null, 2),
              },
            ],
          };

        default:
          throw new Error(`Unknown resource: ${uri}`);
      }
    } catch (error) {
      logger.error(`Error reading resource ${uri}:`, error);
      throw error;
    }
  });
}
