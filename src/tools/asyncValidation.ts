/**
 * Async Validation Tools
 *
 * Three tools for handling long-running validation jobs:
 * 1. start_validation - Submit a validation job
 * 2. get_validation_status - Check job progress
 * 3. get_validation_results - Retrieve completed results
 *
 * Results are saved to BOTH:
 * - `.codeguardian/reports/` (internal cache, gitignored)
 * - `codeguardian-report.json` (LLM-readable, at project root)
 *
 * @format
 */

import * as path from "path";
import * as fs from "fs/promises";
import { ToolDefinition } from "../types/tools.js";
import { logger } from "../utils/logger.js";
import { jobQueue } from "../queue/jobQueue.js";
import { validationReportStore } from "../resources/validationReportStore.js";

const TS_MANIFESTS = ["package.json", "tsconfig.json"];
const PY_MANIFESTS = ["requirements.txt", "pyproject.toml", "Pipfile"];
const GO_MANIFESTS = ["go.mod"];

type PathResolution = {
  resolvedPath: string;
  note?: string;
  blocked?: boolean;
  suggestions?: string[];
};

async function hasAnyManifest(projectPath: string, manifests: string[]): Promise<boolean> {
  for (const manifest of manifests) {
    try {
      await fs.access(path.join(projectPath, manifest));
      return true;
    } catch {
      // Not found
    }
  }
  return false;
}

async function detectLanguageScopes(projectPath: string, language: string): Promise<string[]> {
  const manifests = getLanguageManifests(language);
  const candidates = new Set<string>();

  const directDirs =
    language === "python"
      ? ["backend", "server", "api", "app", "src"]
      : language === "go"
      ? ["backend", "server", "api", "cmd", "internal", "pkg", "src"]
      : ["frontend", "client", "web", "app", "src", "backend", "server"];

  for (const dir of directDirs) {
    const absDir = path.join(projectPath, dir);
    try {
      const stat = await fs.stat(absDir);
      if (!stat.isDirectory()) continue;
      if (await hasAnyManifest(absDir, manifests)) {
        candidates.add(absDir);
      }
    } catch {
      // Directory doesn't exist
    }
  }

  // Monorepo containers: packages/* and apps/*
  const containerDirs = ["packages", "apps"];
  for (const container of containerDirs) {
    const absContainer = path.join(projectPath, container);
    try {
      const entries = await fs.readdir(absContainer, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const absSubdir = path.join(absContainer, entry.name);
        if (await hasAnyManifest(absSubdir, manifests)) {
          candidates.add(absSubdir);
        }
      }
    } catch {
      // Container doesn't exist
    }
  }

  return Array.from(candidates).sort();
}

function getLanguageManifests(language: string): string[] {
  if (language === "python") return PY_MANIFESTS;
  if (language === "go") return GO_MANIFESTS;
  return TS_MANIFESTS;
}

async function resolveValidationProjectPath(projectPath: string, language: string): Promise<PathResolution> {
  const manifests = getLanguageManifests(language);
  const scopes = await detectLanguageScopes(projectPath, language);

  // Guardrail: root-scoped runs are risky when multiple language-specific
  // subprojects are present in a monorepo.
  if (scopes.length > 1) {
    return {
      resolvedPath: projectPath,
      blocked: true,
      suggestions: scopes,
      note:
        `Multiple ${language} subprojects were detected under ${projectPath}. ` +
        "Run start_validation on a specific subdirectory (e.g., frontend or backend) instead of the monorepo root.",
    };
  }

  const rootHasManifest = await hasAnyManifest(projectPath, manifests);
  if (rootHasManifest) {
    return { resolvedPath: projectPath };
  }

  if (scopes.length === 1) {
    return {
      resolvedPath: scopes[0]!,
      note: `No ${language} manifest found at ${projectPath}; auto-scoped validation to ${scopes[0]}.`,
    };
  }

  return { resolvedPath: projectPath };
}

// ============================================================================
// Tool 1: Start Validation
// ============================================================================

export const startValidationTool: ToolDefinition = {
  definition: {
    name: "start_validation",
    description:
      "Start a background validation job for large codebases (>50 files) to avoid timeouts. In monorepos, run this on a scoped subdirectory (e.g., frontend/ or backend/) rather than the repo root. Use 'get_validation_status' to poll for progress. Results are saved to codeguardian-report.json at the project root (readable by file tools, NOT inside .codeguardian/).",
    inputSchema: {
      type: "object",
      properties: {
        projectPath: {
          type: "string",
          description:
            'Path to your validation scope (e.g., "frontend", "backend", or a single app/package path). Avoid monorepo root unless it is a single-project repo.',
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
          description: "ONLY use true if explicitly requested. When true, flags ALL unresolved symbols including edge cases. Default is false which catches likely hallucinations without excessive noise.",
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
      const requestedPath = path.resolve(args.projectPath);
      const pathResolution = await resolveValidationProjectPath(requestedPath, args.language);

      if (pathResolution.blocked) {
        return formatResponse({
          success: false,
          error: "ambiguousValidationScope",
          message: pathResolution.note,
          requestedProjectPath: requestedPath,
          suggestedProjectPaths: pathResolution.suggestions || [],
          nextSteps:
            (pathResolution.suggestions || []).map((p) =>
              `Run start_validation({ projectPath: "${p}", language: "${args.language}" })`,
            ),
        });
      }

      const effectivePath = pathResolution.resolvedPath;
      const jobInput = {
        ...args,
        projectPath: effectivePath,
      };

      const jobId = await jobQueue.submitJob("validation", jobInput);
      const reportFilePath = validationReportStore.getLLMReportPath(effectivePath);

      return formatResponse({
        success: true,
        jobId,
        status: "queued",
        message: pathResolution.note
          ? `Validation job submitted successfully. ${pathResolution.note}`
          : "Validation job submitted successfully",
        requestedProjectPath: requestedPath,
        effectiveProjectPath: effectivePath,
        reportFile: reportFilePath,
        nextSteps: [
          `Use get_validation_status({ jobId: "${jobId}" }) to check progress`,
          `Use get_validation_results({ jobId: "${jobId}" }) to get results when complete`,
          `When complete, results will be saved to: ${reportFilePath}`,
          `You can read the report file directly with your file-reading tool (it's NOT inside .codeguardian/)`,
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
    description: "Retrieve final results for a completed validation job. Results are also saved to codeguardian-report.json at the project root, readable by file tools.",
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
      const job = jobQueue.getJob(args.jobId);
      const projectPath = (job?.input as any)?.projectPath || "";
      
      if (!validationReportStore.has(args.jobId)) {
        // Wait for the report to be written to disk
        // This saves to BOTH .codeguardian/reports/ AND codeguardian-report.json (LLM-readable)
        await validationReportStore.store(args.jobId, projectPath, {
          summary: fullResult.summary,
          stats: fullResult.stats,
          hallucinations: fullResult.hallucinations || [],
          deadCode: fullResult.deadCode || [],
          score: fullResult.score,
          recommendation: fullResult.recommendation,
        });
      }

      // Get LLM-readable report file path
      const reportFilePath = projectPath
        ? validationReportStore.getLLMReportPath(projectPath)
        : undefined;

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
          reportFile: reportFilePath,
          message: `Large result set (${totalIssues} issues). Full report saved to ${reportFilePath || 'MCP Resource'}. Use your file-reading tool to access it.`,
          summary: (summary as any)?.summary,
          stats: (summary as any)?.stats,
          score: (summary as any)?.score,
          recommendation: (summary as any)?.recommendation,
          totalHallucinations: (summary as any)?.totalHallucinations,
          totalDeadCode: (summary as any)?.totalDeadCode,
          // Instructions for the LLM/IDE to fetch chunks or read file
          fileAccess: {
            reportFile: reportFilePath,
            tip: "Use your file-reading tool (e.g. read_file) to read the codeguardian-report.json file for full details. This file is at the project root and NOT inside .codeguardian/.",
          },
          resourceAccess: {
            summaryUri: reportUri,
            hallucinationsUri: `${reportUri}/hallucinations/0`,
            deadCodeUri: `${reportUri}/dead-code/0`,
            bySeverityUri: `${reportUri}/by-severity/critical`,
            byTypeUri: `${reportUri}/by-type/dependencyHallucination`,
            tip: "Alternatively, use MCP Resources or filters (fileFilter, severityFilter) with this tool for specific queries.",
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
          reportFile: reportFilePath,
          hint: reportFilePath
            ? `Full report saved to ${reportFilePath}. Use your file-reading tool to access it.`
            : undefined,
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
        reportFile: reportFilePath,
        issues: filtered.issues,
        pagination: {
          total: filtered.total,
          limit: args.limit ?? 25,
          offset: args.offset ?? 0,
          hasMore: filtered.hasMore,
        },
        summary: fullResult.summary,
        score: fullResult.score,
        hint: reportFilePath
          ? `Full report also available at ${reportFilePath}. Use your file-reading tool to access it.`
          : undefined,
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
