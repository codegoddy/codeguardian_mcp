/**
 * API Contract Guardian - Integrated Module
 *
 * This module is now integrated into the main context system.
 * API Contract validation happens automatically during context building.
 *
 * Usage:
 *   const orchestration = await orchestrateContext({ projectPath, language });
 *   const apiContractIssues = orchestration.apiContractIssues;
 *   const apiContractSummary = orchestration.apiContractSummary;
 *
 * @format
 */

import { getProjectContext } from "../context/projectContext.js";
import { orchestrateContext } from "../context/contextOrchestrator.js";
import { validateApiContractsFromContext, type ApiContractIssue } from "./validators/index.js";

// Re-export types for convenience
export type { ApiContractIssue } from "./validators/index.js";

/**
 * Default ignore patterns for common false positives
 * These patterns are used to filter out known unmatched endpoints
 */
export const DEFAULT_IGNORE_PATTERNS = {
  // Webhook endpoints (usually called by external services, not frontend)
  webhooks: [
    /\/webhook/i,
    /\/webhooks/i,
    /\/stripe\/webhook/i,
    /\/paypal\/webhook/i,
    /\/github\/webhook/i,
    /\/slack\/webhook/i,
  ],
  
  // Admin-only routes (not typically called from frontend)
  admin: [
    /\/admin/i,
    /\/api\/admin/i,
    /\/management/i,
    /\/api\/management/i,
  ],
  
  // Internal/debug routes
  internal: [
    /\/debug/i,
    /\/internal/i,
    /\/api\/internal/i,
    /\/health/i,
    /\/ping/i,
    /\/metrics/i,
    /\/ready/i,
    /\/alive/i,
  ],
  
  // OAuth/Auth callbacks
  auth: [
    /\/auth\/callback/i,
    /\/oauth/i,
    /\/oauth2/i,
    /\/callback/i,
  ],
  
  // API documentation
  docs: [
    /\/docs/i,
    /\/swagger/i,
    /\/openapi/i,
    /\/redoc/i,
  ],
};

/**
 * Check if an endpoint should be ignored based on patterns
 */
export function shouldIgnoreEndpoint(
  endpoint: string,
  patterns: RegExp[] = Object.values(DEFAULT_IGNORE_PATTERNS).flat(),
): boolean {
  return patterns.some((pattern) => pattern.test(endpoint));
}

/**
 * Validate API contracts for a project using the integrated context system
 * This is the recommended way to validate API contracts
 */
export async function validateApiContracts(projectPath: string): Promise<{
  issues: ApiContractIssue[];
  summary: {
    totalIssues: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    matchedEndpoints: number;
    matchedTypes: number;
    unmatchedFrontend: number;
    unmatchedBackend: number;
  };
}> {
  // Get orchestrated context (includes API Contract validation)
  const orchestration = await orchestrateContext({
    projectPath,
    language: "all",
  });

  // If API Contract validation was performed, return those results
  if (orchestration.apiContractIssues && orchestration.apiContractSummary) {
    return {
      issues: orchestration.apiContractIssues,
      summary: {
        totalIssues: orchestration.apiContractSummary.totalIssues,
        critical: orchestration.apiContractSummary.critical,
        high: orchestration.apiContractSummary.high,
        medium: 0, // Not tracked in summary
        low: 0, // Not tracked in summary
        matchedEndpoints: orchestration.apiContractSummary.matchedEndpoints,
        matchedTypes: orchestration.apiContractSummary.matchedTypes,
        unmatchedFrontend: 0, // Not tracked in summary
        unmatchedBackend: 0, // Not tracked in summary
      },
    };
  }

  // Fallback: Validate directly from context
  const projectContext = await getProjectContext(projectPath);
  return validateApiContractsFromContext(projectContext);
}

/**
 * Quick check for critical API contract issues
 */
export async function checkCriticalApiIssues(projectPath: string): Promise<ApiContractIssue[]> {
  const result = await validateApiContracts(projectPath);
  return result.issues.filter((i) => i.severity === "critical");
}

/**
 * Check if a specific endpoint exists in the backend
 */
export async function checkEndpointExists(
  projectPath: string,
  method: string,
  endpoint: string,
): Promise<boolean> {
  const projectContext = await getProjectContext(projectPath);

  if (!projectContext.apiContract) {
    return false;
  }

  for (const mapping of projectContext.apiContract.endpointMappings.values()) {
    if (
      mapping.frontend.method.toUpperCase() === method.toUpperCase() &&
      mapping.frontend.endpoint === endpoint
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Get contract information for a specific endpoint
 */
export async function getEndpointContract(
  projectPath: string,
  endpoint: string,
): Promise<{
  frontend?: {
    method: string;
    name: string;
    requestType?: string;
    responseType?: string;
  };
  backend?: {
    method: string;
    path: string;
    handler: string;
    requestModel?: string;
    responseModel?: string;
  };
} | null> {
  const projectContext = await getProjectContext(projectPath);

  if (!projectContext.apiContract) {
    return null;
  }

  const mapping = projectContext.apiContract.endpointMappings.get(endpoint);
  if (!mapping) {
    return null;
  }

  return {
    frontend: {
      method: mapping.frontend.method,
      name: mapping.frontend.name,
      requestType: mapping.frontend.requestType,
      responseType: mapping.frontend.responseType,
    },
    backend: {
      method: mapping.backend.method,
      path: mapping.backend.path,
      handler: mapping.backend.handler,
      requestModel: mapping.backend.requestModel,
      responseModel: mapping.backend.responseModel,
    },
  };
}

/**
 * Generate a validation report
 */
export async function generateValidationReport(projectPath: string): Promise<{
  timestamp: string;
  projectPath: string;
  summary: {
    totalIssues: number;
    critical: number;
    high: number;
    matchedEndpoints: number;
    matchedTypes: number;
  };
  issues: ApiContractIssue[];
  recommendations: string[];
}> {
  const result = await validateApiContracts(projectPath);

  const recommendations: string[] = [];

  if (result.summary.critical > 0) {
    recommendations.push(
      `Address ${result.summary.critical} critical issues immediately to prevent runtime errors`,
    );
  }

  if (result.summary.totalIssues > 0) {
    recommendations.push(
      `${result.summary.totalIssues} API contract issues detected - review recommended`,
    );
  }

  return {
    timestamp: new Date().toISOString(),
    projectPath,
    summary: {
      totalIssues: result.summary.totalIssues,
      critical: result.summary.critical,
      high: result.summary.high,
      matchedEndpoints: result.summary.matchedEndpoints,
      matchedTypes: result.summary.matchedTypes,
    },
    issues: result.issues,
    recommendations,
  };
}

/**
 * Format validation results for display
 */
export function formatValidationResults(result: {
  issues: ApiContractIssue[];
  summary: {
    totalIssues: number;
    critical: number;
    high: number;
    matchedEndpoints: number;
    matchedTypes: number;
  };
}): string {
  const lines: string[] = [];

  lines.push("=".repeat(80));
  lines.push("API CONTRACT VALIDATION RESULTS");
  lines.push("=".repeat(80));
  lines.push("");

  // Summary
  lines.push("📊 Summary:");
  lines.push(`  Total Issues: ${result.summary.totalIssues}`);
  lines.push(`    - Critical: ${result.summary.critical} 🔴`);
  lines.push(`    - High: ${result.summary.high} 🟠`);
  lines.push("");
  lines.push(`  Matched Endpoints: ${result.summary.matchedEndpoints}`);
  lines.push(`  Matched Types: ${result.summary.matchedTypes}`);
  lines.push("");

  // Issues by severity
  if (result.issues.length > 0) {
    lines.push("🔍 Issues by Severity:");
    lines.push("");

    const critical = result.issues.filter((i) => i.severity === "critical");
    const high = result.issues.filter((i) => i.severity === "high");

    if (critical.length > 0) {
      lines.push("🔴 Critical Issues:");
      critical.slice(0, 5).forEach((issue) => {
        lines.push(`  - ${issue.message}`);
        lines.push(`    File: ${issue.file}:${issue.line}`);
        lines.push(`    Suggestion: ${issue.suggestion}`);
        lines.push("");
      });
      if (critical.length > 5) {
        lines.push(`  ... and ${critical.length - 5} more critical issues`);
        lines.push("");
      }
    }

    if (high.length > 0) {
      lines.push("🟠 High Severity Issues:");
      high.slice(0, 5).forEach((issue) => {
        lines.push(`  - ${issue.message}`);
      });
      if (high.length > 5) {
        lines.push(`  ... and ${high.length - 5} more high severity issues`);
      }
      lines.push("");
    }
  } else {
    lines.push("✅ No API contract issues found!");
  }

  lines.push("=".repeat(80));

  return lines.join("\n");
}
