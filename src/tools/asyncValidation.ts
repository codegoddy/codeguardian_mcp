/**
 * Async Validation Tools
 *
 * Three tools for handling long-running validation jobs:
 * 1. start_validation - Submit a validation job
 * 2. get_validation_status - Check job progress
 * 3. get_validation_results - Retrieve completed results
 *
 * @format
 */

import { ToolDefinition } from "../types/tools.js";
import { logger } from "../utils/logger.js";
import { jobQueue } from "../queue/jobQueue.js";

// ============================================================================
// Tool 1: Start Validation
// ============================================================================

export const startValidationTool: ToolDefinition = {
  definition: {
    name: "start_validation",
    description:
      "Start a background validation job for large codebases (>50 files) to avoid timeouts. Use 'get_validation_status' to poll for progress.",
    inputSchema: {
      type: "object",
      properties: {
        projectPath: {
          type: "string",
          description: 'Path to your project (e.g., ".", "frontend")',
        },
        language: {
          type: "string",
          enum: ["javascript", "typescript", "python", "go"],
          description:
            "Programming language (typescript includes .js/.jsx files for mixed projects)",
        },
        batchSize: {
          type: "number",
          description: "Files per batch (default: 50, max: 100)",
          default: 50,
        },
        strictMode: {
          type: "boolean",
          description: "Flag all unresolved symbols (default: false)",
          default: false,
        },
        includeTests: {
          type: "boolean",
          description: "Include test files (default: true)",
          default: true,
        },
        recentlyEditedFiles: {
          type: "array",
          items: { type: "string" },
          description:
            "Optional list of files edited in this session to boost relevance",
        },
      },
      required: ["projectPath", "language"],
    },
  },

  async handler(args: {
    projectPath: string;
    language: string;
    batchSize?: number;
    strictMode?: boolean;
    includeTests?: boolean;
    recentlyEditedFiles?: string[];
  }) {
    logger.info(`Starting async validation for: ${args.projectPath}`);

    try {
      const jobId = await jobQueue.submitJob("validation", args);

      return formatResponse({
        success: true,
        jobId,
        status: "queued",
        message: "Validation job submitted successfully",
        nextSteps: [
          `Use get_validation_status({ jobId: "${jobId}" }) to check progress`,
          `Use get_validation_results({ jobId: "${jobId}" }) to get results when complete`,
        ],
      });
    } catch (error) {
      logger.error("Error starting validation job:", error);
      return formatResponse({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
};

// ============================================================================
// Tool 2: Get Validation Status
// ============================================================================

export const getValidationStatusTool: ToolDefinition = {
  definition: {
    name: "get_validation_status",
    description:
      "Check progress of a validation job. Poll every 3-5s until status is 'complete' or 'failed'.",
    inputSchema: {
      type: "object",
      properties: {
        jobId: {
          type: "string",
          description: "Job ID returned from start_validation",
        },
      },
      required: ["jobId"],
    },
  },

  async handler(args: { jobId: string }) {
    logger.info(`Checking status for job: ${args.jobId}`);

    try {
      const status = jobQueue.getJobStatus(args.jobId);

      if (!status.exists) {
        return formatResponse({
          success: false,
          exists: false,
          error: `Job not found: ${args.jobId}`,
          message: "Job may have expired (jobs expire after 24 hours)",
        });
      }

      return formatResponse({
        success: true,
        exists: true,
        jobId: args.jobId,
        status: status.status,
        progress: status.progress,
        error: status.error,
      });
    } catch (error) {
      logger.error("Error getting job status:", error);
      return formatResponse({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
};

// ============================================================================
// Tool 3: Get Validation Results
// ============================================================================

export const getValidationResultsTool: ToolDefinition = {
  definition: {
    name: "get_validation_results",
    description: "Retrieve final results for a completed validation job.",
    inputSchema: {
      type: "object",
      properties: {
        jobId: {
          type: "string",
          description: "Job ID returned from start_validation",
        },
      },
      required: ["jobId"],
    },
  },

  async handler(args: { jobId: string }) {
    logger.info(`Getting results for job: ${args.jobId}`);

    try {
      const results = jobQueue.getJobResults(args.jobId);

      if (!results.exists) {
        return formatResponse({
          success: false,
          exists: false,
          error: `Job not found: ${args.jobId}`,
          message: "Job may have expired (jobs expire after 24 hours)",
        });
      }

      if (results.status !== "complete") {
        return formatResponse({
          success: false,
          exists: true,
          jobId: args.jobId,
          status: results.status,
          error: results.error,
          message:
            results.status === "processing" ?
              "Job is still processing. Use get_validation_status to check progress."
            : results.status === "failed" ?
              "Job failed. Check error field for details."
            : results.status === "queued" ?
              "Job is queued. Use get_validation_status to check progress."
            : "Job was cancelled.",
        });
      }

      return formatResponse({
        success: true,
        exists: true,
        jobId: args.jobId,
        status: results.status,
        result: results.result,
      });
    } catch (error) {
      logger.error("Error getting job results:", error);
      return formatResponse({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
};

// ============================================================================
// Response Formatting
// ============================================================================

function formatResponse(data: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}
