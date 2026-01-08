/**
 * Prompt registration for CodeGuardian MCP
 *
 * Simple prompts focused on hallucination detection.
 *
 * @format
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { logger } from "../utils/logger.js";

/**
 * Register all prompts with the MCP server
 */
export function registerPrompts(server: Server) {
  server.setRequestHandler(ListPromptsRequestSchema, async () => {
    return {
      prompts: [
        {
          name: "validate",
          description: "Validate AI-generated code for hallucinations",
          arguments: [
            {
              name: "code",
              description: "The code to validate",
              required: true,
            },
          ],
        },
      ],
    };
  });

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    logger.info(`Getting prompt: ${name}`);

    try {
      switch (name) {
        case "validate":
          return {
            messages: [
              {
                role: "user",
                content: {
                  type: "text",
                  text: `Use validate_code to check this code for hallucinations (non-existent functions, wrong methods, etc.):\n\n${args?.code || ""}`,
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
