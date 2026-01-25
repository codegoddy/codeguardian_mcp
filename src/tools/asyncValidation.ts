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
import { validationReportStore } from "../resources/validationReportStore.js";

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
        fileFilter: {
          type: "string",
          description: "Optional: Filter results by file path (partial match)",
        },
        severityFilter: {
          type: "string",
          enum: ["critical", "high", "medium", "low", "warning"],
          description: "Optional: Filter results by severity",
        },
        limit: {
          type: "number",
          description: "Optional: Limit number of issues returned (default: all)",
        },
        offset: {
          type: "number",
          description: "Optional: Offset for pagination (default: 0)",
        },
        summaryOnly: {
          type: "boolean",
          description: "Optional: If true, returns only summary and stats without issue lists",
          default: false,
        },
      },
      required: ["jobId"],
    },
  },

  async handler(args: { 
    jobId: string;
    fileFilter?: string;
    severityFilter?: string;
    limit?: number;
    offset?: number;
    summaryOnly?: boolean;
  }) {
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

      const fullResult = results.result as any;
      if (!fullResult) {
        return formatResponse({
          success: true,
          exists: true,
          jobId: args.jobId,
          status: results.status,
          message: "No result data found",
        });
      }

      // Store the report in the resource store (if not already stored)
      if (!validationReportStore.has(args.jobId)) {
        const job = jobQueue.getJob(args.jobId);
        const projectPath = (job?.input as any)?.projectPath || "";
        
        validationReportStore.store(args.jobId, projectPath, {
          summary: fullResult.summary,
          stats: fullResult.stats,
          hallucinations: fullResult.hallucinations || [],
          deadCode: fullResult.deadCode || [],
          score: fullResult.score,
          recommendation: fullResult.recommendation,
        });
      }

      const totalIssues = (fullResult.hallucinations?.length || 0) + (fullResult.deadCode?.length || 0);
      const isLargeResult = totalIssues > 50;
      const hasAppliedFilters = args.fileFilter || args.severityFilter || args.limit !== undefined || args.offset !== undefined;

      // For large results without filters, return ONLY the URI and summary
      // This prevents LLM context overflow
      if (isLargeResult && !hasAppliedFilters && !args.summaryOnly) {
        const reportUri = validationReportStore.getReportUri(args.jobId);
        const summary = validationReportStore.getSummary(args.jobId);
        
        return formatResponse({
          success: true,
          exists: true,
          jobId: args.jobId,
          status: results.status,
          // COMPACT RESPONSE: URI + Summary only
          reportUri,
          message: `Large result set (${totalIssues} issues). Report stored as MCP Resource.`,
          summary: (summary as any)?.summary,
          stats: (summary as any)?.stats,
          score: (summary as any)?.score,
          recommendation: (summary as any)?.recommendation,
          totalHallucinations: (summary as any)?.totalHallucinations,
          totalDeadCode: (summary as any)?.totalDeadCode,
          // Instructions for the LLM/IDE to fetch chunks
          resourceAccess: {
            summaryUri: reportUri,
            hallucinationsUri: `${reportUri}/hallucinations/0`,
            deadCodeUri: `${reportUri}/dead-code/0`,
            bySeverityUri: `${reportUri}/by-severity/critical`,
            byTypeUri: `${reportUri}/by-type/dependencyHallucination`,
            tip: "Use 'list_resources' to see available reports, then 'read_resource' to fetch chunks. Or use filters (fileFilter, severityFilter) with this tool for specific queries.",
          },
        });
      }

      // For summaryOnly, return just the summary
      if (args.summaryOnly) {
        return formatResponse({
          success: true,
          exists: true,
          jobId: args.jobId,
          status: results.status,
          summary: fullResult.summary,
          stats: fullResult.stats,
          recommendation: fullResult.recommendation,
          score: fullResult.score,
          totalIssues,
          reportUri: validationReportStore.getReportUri(args.jobId),
        });
      }

      // For filtered/paginated requests, return the filtered data inline
      // (This is for when the LLM specifically needs certain issues)
      const filtered = validationReportStore.getFilteredIssues(args.jobId, {
        type: args.severityFilter ? undefined : undefined, // Can extend later
        severity: args.severityFilter,
        file: args.fileFilter,
        limit: args.limit ?? 25,
        offset: args.offset ?? 0,
      });

      if (!filtered) {
        return formatResponse({
          success: false,
          error: "Failed to retrieve filtered issues",
        });
      }

      return formatResponse({
        success: true,
        exists: true,
        jobId: args.jobId,
        status: results.status,
        reportUri: validationReportStore.getReportUri(args.jobId),
        issues: filtered.issues,
        pagination: {
          total: filtered.total,
          limit: args.limit ?? 25,
          offset: args.offset ?? 0,
          hasMore: filtered.hasMore,
        },
        summary: fullResult.summary,
        score: fullResult.score,
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
