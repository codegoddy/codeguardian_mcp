/**
 * Scan Directory Tool
 *
 * Scans entire directories with proper result aggregation to avoid
 * overwhelming LLMs with massive result sets.
 *
 * Key features:
 * - Returns summaries by default, not raw issues
 * - Supports pagination for detailed results
 * - Filters by severity to reduce noise
 * - Groups and deduplicates similar issues
 * - Integrates with shared project context for smarter analysis
 * - Includes dependency vulnerability scanning
 *
 * @format
 */

import { ToolDefinition } from "../types/tools.js";
import { scanForVulnerabilities } from "../analyzers/security/securityScanner.js";
import { detectAntiPatterns } from "../analyzers/antiPatternDetector.js";
import { validateImports } from "../analyzers/importValidator.js";
import {
  aggregateResults,
  paginateIssues,
  filterBySeverity,
  formatSummaryForLLM,
  DirectoryScanResult,
} from "../utils/resultAggregator.js";
import { logger } from "../utils/logger.js";
import {
  filterExcludedFiles,
  getExcludePatternsForPath,
} from "../utils/fileFilter.js";
import { glob } from "glob";
import * as fs from "fs/promises";
import * as path from "path";
import { scanDependencies } from "./scanDependencies.js";
import {
  getProjectContext,
  ProjectContext,
} from "../context/projectContext.js";

// File extensions by language
const EXTENSIONS: Record<string, string[]> = {
  javascript: [".js", ".jsx", ".mjs", ".cjs"],
  typescript: [".ts", ".tsx", ".mts", ".cts"],
  python: [".py"],
  go: [".go"],
  java: [".java"],
};

// Default exclusion patterns
const DEFAULT_EXCLUDES = [
  "**/node_modules/**",
  "**/venv/**",
  "**/.venv/**",
  "**/env/**",
  "**/__pycache__/**",
  "**/dist/**",
  "**/build/**",
  "**/.next/**",
  "**/coverage/**",
  "**/.git/**",
  "**/vendor/**",
];

export const scanDirectoryTool: ToolDefinition = {
  definition: {
    name: "scan_directory",
    description: `Scan a directory for code quality, security issues, and dependency vulnerabilities.

Features:
- Auto-builds project context for smarter analysis (no need to call build_context first)
- Context-aware scanning: reduces false positives in test files, config files
- Integrated dependency vulnerability scanning (checks package.json)
- Smart caching: context auto-refreshes when files change

Returns aggregated summaries by default. Use 'outputMode' to control detail level.
Includes: security issues, code quality, import validation, and dependency vulnerabilities.`,
    inputSchema: {
      type: "object",
      properties: {
        directory: {
          type: "string",
          description: "Directory path to scan (relative to workspace root)",
        },
        language: {
          type: "string",
          enum: ["javascript", "typescript", "python", "go", "java"],
          description: "Programming language to scan for",
        },
        scanTypes: {
          type: "array",
          items: {
            type: "string",
            enum: ["security", "quality", "imports", "dependencies", "all"],
          },
          description:
            "Types of scans to run (dependencies scans package.json for vulnerabilities)",
          default: ["all"],
        },
        minSeverity: {
          type: "string",
          enum: ["critical", "high", "medium", "low"],
          description: "Minimum severity to include in results",
          default: "medium",
        },
        outputMode: {
          type: "string",
          enum: ["summary", "aggregated", "detailed", "file"],
          description: `Output mode:
- summary: Compact overview (default, best for LLMs)
- aggregated: Grouped issues with examples
- detailed: Paginated raw issues (use with caution)
- file: Issues for a specific file only`,
          default: "summary",
        },
        targetFile: {
          type: "string",
          description:
            "Specific file to get details for (when outputMode=file)",
        },
        page: {
          type: "number",
          description: "Page number for detailed output (default: 1)",
          default: 1,
        },
        pageSize: {
          type: "number",
          description:
            "Items per page for detailed output (default: 50, max: 100)",
          default: 50,
        },
        excludePatterns: {
          type: "array",
          items: { type: "string" },
          description: "Additional glob patterns to exclude",
        },
        maxFiles: {
          type: "number",
          description: "Maximum files to scan (default: 500)",
          default: 500,
        },
      },
      required: ["directory", "language"],
    },
  },

  async handler(args: any) {
    const startTime = Date.now();

    const {
      directory,
      language,
      scanTypes = ["all"],
      minSeverity = "medium",
      outputMode = "summary",
      targetFile,
      page = 1,
      excludePatterns = [],
      maxFiles = 500,
    } = args;

    // Cap pageSize at 100
    const pageSize = Math.min(args.pageSize || 50, 100);

    logger.info(`Starting directory scan: ${directory} (${language})`);

    try {
      // Try to get or build shared project context for smarter analysis
      let projectContext: ProjectContext | null = null;
      try {
        const projectRoot = await findProjectRoot(directory);
        if (projectRoot) {
          projectContext = await getProjectContext(projectRoot, {
            language: language === "all" ? "all" : language,
            includeTests: true,
            maxFiles: maxFiles,
          });
          logger.info(
            `Using shared project context (${projectContext.totalFiles} files indexed)`
          );
        }
      } catch (err) {
        logger.debug(`Could not build project context: ${err}`);
      }

      // Find files to scan
      const extensions = EXTENSIONS[language] || [];
      const patterns = extensions.map((ext) => `${directory}/**/*${ext}`);

      // Get exclude patterns adjusted for absolute paths
      const excludes = [
        ...DEFAULT_EXCLUDES,
        ...excludePatterns,
        ...getExcludePatternsForPath(directory),
      ];

      let files = await glob(patterns, {
        ignore: excludes,
        nodir: true,
        absolute: true, // Use absolute paths for better ignore matching
      });

      // Additional filtering to catch any excluded directories that glob missed
      files = filterExcludedFiles(files);

      if (files.length === 0) {
        return formatResponse({
          success: true,
          message: `No ${language} files found in ${directory}`,
          stats: {
            filesScanned: 0,
          },
        });
      }

      // Limit files if needed
      const filesToScan = files.slice(0, maxFiles);
      const wasLimited = files.length > maxFiles;

      logger.info(`Scanning ${filesToScan.length} files...`);

      // Scan each file
      const fileResults: Array<{
        file: string;
        issues: any[];
        scanTime: number;
      }> = [];
      const runAll = scanTypes.includes("all");

      for (const file of filesToScan) {
        const fileStartTime = Date.now();
        const issues: any[] = [];

        // Get file info from context if available
        const fileInfo = projectContext?.files.get(file);
        const isTestFile =
          fileInfo?.isTest ?? file.toLowerCase().includes("test");
        const isConfigFile = fileInfo?.isConfig ?? false;

        try {
          const code = await fs.readFile(file, "utf-8");

          // Security scan (with context awareness)
          if (runAll || scanTypes.includes("security")) {
            const securityIssues = await scanForVulnerabilities(
              code,
              language,
              {
                severityLevel: minSeverity,
                filePath: file, // Pass file path for context-aware scanning
              }
            );

            // Filter issues based on context
            const filteredSecurityIssues = securityIssues.filter((issue) => {
              // Skip certain issues in config files
              if (isConfigFile && issue.category === "secrets") {
                // Config files often have placeholder secrets
                return issue.confidence > 80;
              }
              return true;
            });

            issues.push(
              ...filteredSecurityIssues.map((i) => ({
                ...i,
                type: i.id,
                source: "security",
                isTestFile,
                isConfigFile,
              }))
            );
          }

          // Quality scan
          if (runAll || scanTypes.includes("quality")) {
            const qualityIssues = await detectAntiPatterns(code, language, {
              severityLevel:
                minSeverity === "critical" ? "high" : (minSeverity as any),
            });
            issues.push(
              ...qualityIssues.map((i) => ({
                ...i,
                type: i.id,
                source: "quality",
                isTestFile,
              }))
            );
          }

          // Import validation (enhanced with context)
          if (runAll || scanTypes.includes("imports")) {
            const importIssues = await validateImports(code, language);

            // If we have context, validate imports against known symbols
            const enhancedImportIssues = importIssues.map((issue) => {
              if (projectContext && issue.type === "unusedImport") {
                // Check if the import is used elsewhere in the project
                const symbolName =
                  (issue as any).name || (issue as any).symbol || "";
                if (symbolName) {
                  const definitions =
                    projectContext.symbolIndex.get(symbolName);
                  if (definitions && definitions.length > 0) {
                    // Symbol exists in project, might be re-exported
                    return {
                      ...issue,
                      confidence: 60,
                      note: "Symbol exists in project",
                    };
                  }
                }
              }
              return issue;
            });

            issues.push(
              ...enhancedImportIssues.map((i) => ({
                ...i,
                source: "imports",
              }))
            );
          }
        } catch (err) {
          logger.warn(`Failed to scan ${file}: ${err}`);
        }

        fileResults.push({
          file,
          issues,
          scanTime: Date.now() - fileStartTime,
        });
      }

      // Aggregate results
      const aggregated = aggregateResults(fileResults, {
        minSeverity: minSeverity as any,
        includeRawIssues: outputMode === "detailed",
      });

      // Dependency vulnerability scan (if requested)
      let dependencyResults: any = null;
      if (runAll || scanTypes.includes("dependencies")) {
        try {
          // Find the project root (where package.json is)
          const projectRoot = await findProjectRoot(directory);
          if (projectRoot) {
            dependencyResults = await scanDependencies(projectRoot, {
              includeDevDependencies: true,
              severityLevel: minSeverity as any,
            });

            // Add dependency vulnerabilities to the aggregated summary
            if (dependencyResults.vulnerabilities.length > 0) {
              aggregated.summary.totalIssues +=
                dependencyResults.vulnerabilities.length;
              for (const vuln of dependencyResults.vulnerabilities) {
                const severity = vuln.severity as
                  | "critical"
                  | "high"
                  | "medium"
                  | "low";
                aggregated.summary.bySeverity[severity] =
                  (aggregated.summary.bySeverity[severity] || 0) + 1;
              }
              // Reduce score based on dependency vulnerabilities
              const vulnDeductions = dependencyResults.vulnerabilities.reduce(
                (acc: number, v: any) => {
                  const weights: Record<string, number> = {
                    critical: 15,
                    high: 10,
                    medium: 5,
                    low: 2,
                  };
                  return acc + (weights[v.severity] || 0);
                },
                0
              );
              aggregated.summary.score = Math.max(
                0,
                aggregated.summary.score - vulnDeductions
              );
            }
          }
        } catch (err) {
          logger.warn(`Dependency scan failed: ${err}`);
        }
      }

      const elapsedTime = Date.now() - startTime;
      aggregated.summary.scanTime = `${elapsedTime}ms`;

      // Format output based on mode
      let output: any;

      switch (outputMode) {
        case "summary":
          // Compact summary for LLM consumption
          output = {
            success: true,
            mode: "summary",
            summary: formatSummaryForLLM(aggregated),
            dependencies:
              dependencyResults ?
                {
                  securityScore: dependencyResults.securityScore,
                  vulnerabilities: dependencyResults.vulnerabilities.length,
                  critical: dependencyResults.vulnerabilities.filter(
                    (v: any) => v.severity === "critical"
                  ).length,
                  high: dependencyResults.vulnerabilities.filter(
                    (v: any) => v.severity === "high"
                  ).length,
                  deprecatedPackages: dependencyResults.outdatedPackages.length,
                  recommendations: dependencyResults.recommendations,
                }
              : undefined,
            stats: {
              filesScanned: filesToScan.length,
              filesLimited:
                wasLimited ?
                  `Limited to ${maxFiles} of ${files.length} files`
                : undefined,
              scanTime: aggregated.summary.scanTime,
              score: aggregated.summary.score,
              contextUsed: projectContext ? true : false,
              framework: projectContext?.framework?.name,
            },
          };
          break;

        case "aggregated":
          // Grouped issues with examples
          output = {
            success: true,
            mode: "aggregated",
            summary: aggregated.summary,
            issues: aggregated.aggregatedIssues,
            dependencies:
              dependencyResults ?
                {
                  vulnerabilities: dependencyResults.vulnerabilities,
                  deprecatedPackages: dependencyResults.outdatedPackages,
                  securityScore: dependencyResults.securityScore,
                }
              : undefined,
            hint: 'Use outputMode="file" with targetFile to see details for a specific file',
          };
          break;

        case "detailed":
          // Paginated raw issues
          const paginated = paginateIssues(
            filterBySeverity(aggregated.rawIssues || [], minSeverity as any),
            page,
            pageSize
          );
          output = {
            success: true,
            mode: "detailed",
            summary: {
              totalIssues: aggregated.summary.totalIssues,
              bySeverity: aggregated.summary.bySeverity,
              score: aggregated.summary.score,
            },
            issues: paginated.data,
            pagination: paginated.pagination,
          };
          break;

        case "file":
          // Issues for specific file
          if (!targetFile) {
            return formatResponse({
              success: false,
              error: "targetFile is required when outputMode=file",
            });
          }
          const fileIssues = fileResults.find(
            (r) => r.file === targetFile || r.file.endsWith(targetFile)
          );
          output = {
            success: true,
            mode: "file",
            file: targetFile,
            issues: fileIssues?.issues || [],
            issueCount: fileIssues?.issues.length || 0,
          };
          break;
      }

      return formatResponse(output);
    } catch (error) {
      logger.error("Error in directory scan:", error);
      return formatResponse({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
};

function formatResponse(data: any) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

/**
 * Find the project root by looking for package.json
 */
async function findProjectRoot(startDir: string): Promise<string | null> {
  let currentDir = path.resolve(startDir);
  const root = path.parse(currentDir).root;

  while (currentDir !== root) {
    try {
      const packageJsonPath = path.join(currentDir, "package.json");
      await fs.access(packageJsonPath);
      return currentDir;
    } catch {
      currentDir = path.dirname(currentDir);
    }
  }

  return null;
}
