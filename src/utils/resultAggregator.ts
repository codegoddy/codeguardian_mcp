/**
 * Result Aggregator
 *
 * Handles large result sets from directory-wide scans by:
 * 1. Aggregating issues into summaries
 * 2. Deduplicating similar issues
 * 3. Providing pagination
 * 4. Filtering by severity
 *
 * @format
 */

export interface AggregatedIssue {
  type: string;
  severity: "critical" | "high" | "medium" | "low";
  count: number;
  message: string;
  examples: Array<{
    file: string;
    line: number;
    code?: string;
  }>;
  affectedFiles: string[];
}

export interface ScanSummary {
  totalFiles: number;
  filesWithIssues: number;
  totalIssues: number;
  bySeverity: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  byType: Record<string, number>;
  topIssueTypes: Array<{ type: string; count: number; severity: string }>;
  worstFiles: Array<{
    file: string;
    issueCount: number;
    criticalCount: number;
  }>;
  score: number;
  scanTime: string;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
    hasMore: boolean;
  };
}

export interface DirectoryScanResult {
  summary: ScanSummary;
  aggregatedIssues: AggregatedIssue[];
  // Raw issues only included if requested and within limits
  rawIssues?: any[];
}

const MAX_EXAMPLES_PER_ISSUE = 3;
const MAX_AFFECTED_FILES_SHOWN = 10;
const MAX_RAW_ISSUES = 100;
const DEFAULT_PAGE_SIZE = 50;

/**
 * Aggregate issues from multiple files into a summary
 */
export function aggregateResults(
  fileResults: Array<{ file: string; issues: any[]; scanTime?: number }>,
  options: {
    includeRawIssues?: boolean;
    maxRawIssues?: number;
    minSeverity?: "critical" | "high" | "medium" | "low";
  } = {}
): DirectoryScanResult {
  const {
    includeRawIssues = false,
    maxRawIssues = MAX_RAW_ISSUES,
    minSeverity = "low",
  } = options;

  const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
  const minSeverityLevel = severityOrder[minSeverity];

  // Collect all issues
  const allIssues: Array<any & { file: string }> = [];
  const issuesByType = new Map<string, AggregatedIssue>();
  const issuesByFile = new Map<string, any[]>();

  let totalScanTime = 0;

  for (const result of fileResults) {
    totalScanTime += result.scanTime || 0;

    for (const issue of result.issues) {
      const issueSeverity =
        severityOrder[issue.severity as keyof typeof severityOrder] || 1;
      if (issueSeverity < minSeverityLevel) continue;

      const issueWithFile = { ...issue, file: result.file };
      allIssues.push(issueWithFile);

      // Track by file
      if (!issuesByFile.has(result.file)) {
        issuesByFile.set(result.file, []);
      }
      issuesByFile.get(result.file)!.push(issue);

      // Aggregate by type
      const typeKey = issue.type || issue.id || issue.name || "unknown";
      if (!issuesByType.has(typeKey)) {
        issuesByType.set(typeKey, {
          type: typeKey,
          severity: issue.severity || "medium",
          count: 0,
          message: issue.message || issue.description || typeKey,
          examples: [],
          affectedFiles: [],
        });
      }

      const aggregated = issuesByType.get(typeKey)!;
      aggregated.count++;

      // Add example (limit to MAX_EXAMPLES_PER_ISSUE)
      if (aggregated.examples.length < MAX_EXAMPLES_PER_ISSUE) {
        aggregated.examples.push({
          file: result.file,
          line: issue.line || 0,
          code: issue.code?.substring(0, 100),
        });
      }

      // Track affected files
      if (!aggregated.affectedFiles.includes(result.file)) {
        aggregated.affectedFiles.push(result.file);
      }
    }
  }

  // Calculate summary
  const bySeverity = {
    critical: allIssues.filter((i) => i.severity === "critical").length,
    high: allIssues.filter((i) => i.severity === "high").length,
    medium: allIssues.filter((i) => i.severity === "medium").length,
    low: allIssues.filter((i) => i.severity === "low").length,
  };

  const byType: Record<string, number> = {};
  for (const [type, agg] of issuesByType) {
    byType[type] = agg.count;
  }

  // Top issue types (sorted by count)
  const topIssueTypes = Array.from(issuesByType.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
    .map((a) => ({ type: a.type, count: a.count, severity: a.severity }));

  // Worst files (sorted by issue count, prioritizing critical)
  const worstFiles = Array.from(issuesByFile.entries())
    .map(([file, issues]) => ({
      file,
      issueCount: issues.length,
      criticalCount: issues.filter((i) => i.severity === "critical").length,
    }))
    .sort((a, b) => {
      // Sort by critical count first, then total count
      if (b.criticalCount !== a.criticalCount) {
        return b.criticalCount - a.criticalCount;
      }
      return b.issueCount - a.issueCount;
    })
    .slice(0, 10);

  // Calculate overall score (0-100, higher is better)
  const score = calculateOverallScore(bySeverity, fileResults.length);

  // Build aggregated issues list (limit affected files shown)
  const aggregatedIssues = Array.from(issuesByType.values())
    .sort((a, b) => {
      const severityDiff =
        severityOrder[b.severity as keyof typeof severityOrder] -
        severityOrder[a.severity as keyof typeof severityOrder];
      if (severityDiff !== 0) return severityDiff;
      return b.count - a.count;
    })
    .map((agg) => ({
      ...agg,
      affectedFiles: agg.affectedFiles.slice(0, MAX_AFFECTED_FILES_SHOWN),
    }));

  const result: DirectoryScanResult = {
    summary: {
      totalFiles: fileResults.length,
      filesWithIssues: issuesByFile.size,
      totalIssues: allIssues.length,
      bySeverity,
      byType,
      topIssueTypes,
      worstFiles,
      score,
      scanTime: `${totalScanTime}ms`,
    },
    aggregatedIssues,
  };

  // Include raw issues only if requested and within limits
  if (includeRawIssues) {
    result.rawIssues = allIssues.slice(0, maxRawIssues);
    if (allIssues.length > maxRawIssues) {
      // Add truncation notice
      result.rawIssues.push({
        type: "_truncated",
        message: `Showing ${maxRawIssues} of ${allIssues.length} issues. Use pagination or filter by severity to see more.`,
      });
    }
  }

  return result;
}

/**
 * Paginate raw issues
 */
export function paginateIssues(
  issues: any[],
  page: number = 1,
  pageSize: number = DEFAULT_PAGE_SIZE
): PaginatedResult<any> {
  const totalItems = issues.length;
  const totalPages = Math.ceil(totalItems / pageSize);
  const startIndex = (page - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);

  return {
    data: issues.slice(startIndex, endIndex),
    pagination: {
      page,
      pageSize,
      totalItems,
      totalPages,
      hasMore: page < totalPages,
    },
  };
}

/**
 * Filter issues by severity
 */
export function filterBySeverity(
  issues: any[],
  minSeverity: "critical" | "high" | "medium" | "low"
): any[] {
  const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
  const minLevel = severityOrder[minSeverity];

  return issues.filter((issue) => {
    const level =
      severityOrder[issue.severity as keyof typeof severityOrder] || 1;
    return level >= minLevel;
  });
}

/**
 * Filter issues by type
 */
export function filterByType(issues: any[], types: string[]): any[] {
  const typeSet = new Set(types.map((t) => t.toLowerCase()));
  return issues.filter((issue) => {
    const issueType = (
      issue.type ||
      issue.id ||
      issue.name ||
      ""
    ).toLowerCase();
    return typeSet.has(issueType);
  });
}

/**
 * Get issues for a specific file
 */
export function getIssuesForFile(
  fileResults: Array<{ file: string; issues: any[] }>,
  targetFile: string
): any[] {
  const result = fileResults.find(
    (r) => r.file === targetFile || r.file.endsWith(targetFile)
  );
  return result?.issues || [];
}

/**
 * Calculate overall score based on severity distribution
 */
function calculateOverallScore(
  bySeverity: { critical: number; high: number; medium: number; low: number },
  totalFiles: number
): number {
  if (totalFiles === 0) return 100;

  // Weighted deductions
  const deductions =
    bySeverity.critical * 10 +
    bySeverity.high * 5 +
    bySeverity.medium * 2 +
    bySeverity.low * 0.5;

  // Normalize by file count (more files = more expected issues)
  const normalizedDeductions = deductions / Math.sqrt(totalFiles);

  return Math.max(0, Math.round(100 - normalizedDeductions));
}

/**
 * Format summary for LLM consumption (compact, actionable)
 */
export function formatSummaryForLLM(result: DirectoryScanResult): string {
  const { summary, aggregatedIssues } = result;
  const lines: string[] = [];

  // Header
  lines.push(`## Scan Summary (Score: ${summary.score}/100)`);
  lines.push(
    `Scanned ${summary.totalFiles} files, ${summary.filesWithIssues} with issues, ${summary.totalIssues} total issues`
  );
  lines.push("");

  // Severity breakdown (only if issues exist)
  if (summary.totalIssues > 0) {
    lines.push("### By Severity");
    if (summary.bySeverity.critical > 0)
      lines.push(`- 🚨 Critical: ${summary.bySeverity.critical}`);
    if (summary.bySeverity.high > 0)
      lines.push(`- ⚠️ High: ${summary.bySeverity.high}`);
    if (summary.bySeverity.medium > 0)
      lines.push(`- ⚡ Medium: ${summary.bySeverity.medium}`);
    if (summary.bySeverity.low > 0)
      lines.push(`- ℹ️ Low: ${summary.bySeverity.low}`);
    lines.push("");

    // Top issues (actionable)
    lines.push("### Top Issues to Fix");
    for (const issue of aggregatedIssues.slice(0, 5)) {
      const fileCount = issue.affectedFiles.length;
      const fileText = fileCount === 1 ? "1 file" : `${fileCount} files`;
      lines.push(
        `- **${issue.type}** (${issue.count}x in ${fileText}): ${issue.message.substring(0, 80)}`
      );
    }
    lines.push("");

    // Worst files (actionable)
    if (summary.worstFiles.length > 0) {
      lines.push("### Files Needing Most Attention");
      for (const file of summary.worstFiles.slice(0, 5)) {
        const criticalNote =
          file.criticalCount > 0 ? ` (${file.criticalCount} critical)` : "";
        lines.push(
          `- \`${file.file}\`: ${file.issueCount} issues${criticalNote}`
        );
      }
    }
  } else {
    lines.push("✅ No issues found!");
  }

  return lines.join("\n");
}
