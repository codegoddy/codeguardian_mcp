/**
 * Prompt registration for CodeGuardian MCP
 *
 * Enhanced prompts using prompt engineering best practices:
 * - Few-shot learning with examples
 * - Chain-of-thought reasoning
 * - Structured output formats
 * - Role-based prompting
 *
 * @format
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { logger } from "../utils/logger.js";
import { VALIDATION_TEMPLATES } from "./templates.js";

/**
 * Register all prompts with the MCP server
 */
export function registerPrompts(server: Server) {
  server.setRequestHandler(ListPromptsRequestSchema, async () => {
    return {
      prompts: [
        {
          name: "validate",
          description: "Basic validation - Quick check for hallucinations",
          arguments: [
            {
              name: "code",
              description: "The code to validate",
              required: true,
            },
          ],
        },
        {
          name: "validate-detailed",
          description: "Detailed validation with step-by-step reasoning",
          arguments: [
            {
              name: "code",
              description: "The code to validate",
              required: true,
            },
          ],
        },
        {
          name: "validate-with-examples",
          description:
            "Validation with few-shot examples of common AI mistakes",
          arguments: [
            {
              name: "code",
              description: "The code to validate",
              required: true,
            },
          ],
        },
        {
          name: "validate-comprehensive",
          description: "Comprehensive validation from multiple perspectives",
          arguments: [
            {
              name: "code",
              description: "The code to validate",
              required: true,
            },
          ],
        },
        {
          name: "validate-structured",
          description: "Validation with structured output format",
          arguments: [
            {
              name: "code",
              description: "The code to validate",
              required: true,
            },
          ],
        },
        // Natural language Guardian commands
        {
          name: "start-vibeguard",
          description: "Start the VibeGuard agent with natural language (e.g., 'start vibeguard for my TypeScript project')",
          arguments: [
            {
              name: "projectPath",
              description: "Project path (default: current directory)",
              required: false,
            },
            {
              name: "language",
              description: "Language to watch (default: typescript)",
              required: false,
            },
          ],
        },
        {
          name: "vibeguard-status",
          description: "Check VibeGuard agent status (use when saying 'check vibeguard' or 'what's running')",
        },
        {
          name: "vibeguard-validate",
          description: "Use VibeGuard to validate code (e.g., 'vibeguard validate this file')",
          arguments: [
            {
              name: "target",
              description: "File or code to validate",
              required: true,
            },
          ],
        },
        {
          name: "vibeguard-impact",
          description: "Use VibeGuard to analyze impact (e.g., 'vibeguard what breaks if I change X')",
          arguments: [
            {
              name: "target",
              description: "File or symbol to analyze",
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
      const code = args?.code || "";

      switch (name) {
        case "validate":
          // Zero-shot: Simple, direct validation
          return {
            messages: [
              {
                role: "user",
                content: {
                  type: "text",
                  text: VALIDATION_TEMPLATES.zeroShot(code),
                },
              },
            ],
          };

        case "validate-detailed":
          // Chain-of-thought: Step-by-step reasoning
          return {
            messages: [
              {
                role: "user",
                content: {
                  type: "text",
                  text: VALIDATION_TEMPLATES.chainOfThought(code),
                },
              },
            ],
          };

        case "validate-with-examples":
          // Few-shot: Learning from examples
          return {
            messages: [
              {
                role: "user",
                content: {
                  type: "text",
                  text: VALIDATION_TEMPLATES.fewShot(code),
                },
              },
            ],
          };

        case "validate-comprehensive":
          // Self-consistency: Multiple perspectives
          return {
            messages: [
              {
                role: "user",
                content: {
                  type: "text",
                  text: VALIDATION_TEMPLATES.selfConsistency(code),
                },
              },
            ],
          };

        case "validate-structured":
          // Structured output: Explicit format
          return {
            messages: [
              {
                role: "user",
                content: {
                  type: "text",
                  text: VALIDATION_TEMPLATES.structuredOutput(code),
                },
              },
            ],
          };

        // Natural language Guardian commands
        case "start-vibeguard": {
          const projectPath = args?.projectPath || ".";
          const language = args?.language || "typescript";
          return {
            messages: [
              {
                role: "user",
                content: {
                  type: "text",
                  text: `I want to start the VibeGuard agent to watch my project for code quality issues.\n\nPlease call the \`start_guardian\` tool with these parameters:\n- projectPath: "${projectPath}"\n- language: "${language}"\n- mode: "auto"\n\nAfter starting, let me know it's active and watching for issues.`,
                },
              },
            ],
          };
        }

        case "vibeguard-status":
          return {
            messages: [
              {
                role: "user",
                content: {
                  type: "text",
                  text: `Please check the status of VibeGuard by calling the \`get_guardian_status\` tool and summarize what's currently running.`,
                },
              },
            ],
          };

        case "vibeguard-validate": {
          const target = args?.target || "";
          return {
            messages: [
              {
                role: "user",
                content: {
                  type: "text",
                  text: `I want to validate this code for hallucinations and issues: ${target}\n\nTool selection rules:\n- If this is a snippet or single-file change, use \`validate_code\`.\n- If this is a project-wide/monorepo validation request, use \`start_validation\` on a scoped subdirectory (for example: frontend/ or backend/), not the repo root.`,
                },
              },
            ],
          };
        }

        case "vibeguard-impact": {
          const target = args?.target || "";
          return {
            messages: [
              {
                role: "user",
                content: {
                  type: "text",
                  text: `I want to understand the impact of changing: ${target}\n\nPlease use the \`get_dependency_graph\` tool to show me what depends on this and what might break.`,
                },
              },
            ],
          };
        }

        default:
          throw new Error(`Unknown prompt: ${name}`);
      }
    } catch (error) {
      logger.error(`Error getting prompt ${name}:`, error);
      throw error;
    }
  });
}
