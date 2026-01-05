/**
 * Prompt registration for CodeGuardian MCP
 * 
 * Prompts provide pre-configured templates for common code review tasks.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ListPromptsRequestSchema, GetPromptRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { logger } from '../utils/logger.js';

/**
 * Register all prompts with the MCP server
 */
export function registerPrompts(server: Server) {
  // List all available prompts
  server.setRequestHandler(ListPromptsRequestSchema, async () => {
    return {
      prompts: [
        {
          name: 'review-code',
          description: 'Review AI-generated code for production readiness',
          arguments: [
            {
              name: 'code',
              description: 'The code to review',
              required: true,
            },
            {
              name: 'language',
              description: 'Programming language',
              required: false,
            },
          ],
        },
        {
          name: 'check-hallucinations',
          description: 'Check for AI hallucinations in code',
          arguments: [
            {
              name: 'newCode',
              description: 'The new code to check',
              required: true,
            },
          ],
        },
      ],
    };
  });

  // Handle prompt retrieval
  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    logger.info(`Getting prompt: ${name}`);

    try {
      switch (name) {
        case 'review-code':
          return {
            messages: [
              {
                role: 'user',
                content: {
                  type: 'text',
                  text: `Review this code for production readiness:\n\n${args?.code || ''}`,
                },
              },
            ],
          };

        case 'check-hallucinations':
          return {
            messages: [
              {
                role: 'user',
                content: {
                  type: 'text',
                  text: `Check this code for AI hallucinations:\n\n${args?.newCode || ''}`,
                },
              },
            ],
          };

        default:
          throw new Error(`Unknown prompt: ${name}`);
      }
    } catch (error) {
      logger.error(`Error getting prompt ${name}:`, error);
      throw error;
    }
  });
}
