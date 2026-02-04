/**
 * API Contract Guardian - Main Orchestrator
 *
 * Central coordinator for API contract validation.
 *
 * @format
 */

import { logger } from "../utils/logger.js";
import type {
  ProjectStructure,
  FrontendContext,
  BackendContext,
  ContractContext,
  ApiContractIssue,
  ApiContractConfig,
} from "./types.js";
import { detectProjectStructure } from "./detector.js";
import { buildFrontendContext } from "./context/frontend.js";
import { buildBackendContext } from "./context/backend.js";
import { buildContractContext } from "./context/contract.js";
import { validateAllEndpoints } from "./validators/endpoint.js";
import { validateAllParameters } from "./validators/parameter.js";
import { validateAllTypes } from "./validators/type.js";

// ============================================================================
// Main Validation Function
// ============================================================================

export interface ValidationResult {
  success: boolean;
  projectStructure: ProjectStructure;
  frontendContext?: FrontendContext;
  backendContext?: BackendContext;
  contractContext?: ContractContext;
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
}

/**
 * Validate API contracts for a project
 */
export async function validateApiContracts(
  projectPath: string,
  config?: Partial<ApiContractConfig>,
): Promise<ValidationResult> {
  const startTime = Date.now();
  logger.info(`Starting API Contract validation for ${projectPath}`);

  try {
    // Step 1: Detect project structure
    logger.info("Step 1: Detecting project structure...");
    const projectStructure = await detectProjectStructure(projectPath);

    if (!projectStructure.frontend && !projectStructure.backend) {
      return {
        success: false,
        projectStructure,
        issues: [],
        summary: {
          totalIssues: 0,
          critical: 0,
          high: 0,
          medium: 0,
          low: 0,
          matchedEndpoints: 0,
          matchedTypes: 0,
          unmatchedFrontend: 0,
          unmatchedBackend: 0,
        },
      };
    }

    // Step 2: Build contexts
    logger.info("Step 2: Building contexts...");
    let frontendContext: FrontendContext | undefined;
    let backendContext: BackendContext | undefined;
    let contractContext: ContractContext | undefined;

    if (projectStructure.frontend) {
      frontendContext = await buildFrontendContext(projectStructure.frontend);
    }

    if (projectStructure.backend) {
      backendContext = await buildBackendContext(projectStructure.backend);
    }

    // Step 3: Build contract context (if both frontend and backend exist)
    if (frontendContext && backendContext) {
      logger.info("Step 3: Building contract context...");
      contractContext = await buildContractContext(frontendContext, backendContext);
    }

    // Step 4: Run validators
    logger.info("Step 4: Running validators...");
    const issues: ApiContractIssue[] = [];

    if (contractContext) {
      // Validate endpoints
      if (config?.validation?.endpoint !== false) {
        logger.debug("Validating endpoints...");
        const endpointIssues = validateAllEndpoints(contractContext);
        issues.push(...endpointIssues);
      }

      // Validate parameters
      if (config?.validation?.parameters !== false) {
        logger.debug("Validating parameters...");
        const paramIssues = validateAllParameters(contractContext);
        issues.push(...paramIssues);
      }

      // Validate types
      if (config?.validation?.types !== false) {
        logger.debug("Validating types...");
        const typeIssues = validateAllTypes(contractContext);
        issues.push(...typeIssues);
      }
    }

    // Calculate summary
    const summary = {
      totalIssues: issues.length,
      critical: issues.filter((i) => i.severity === "critical").length,
      high: issues.filter((i) => i.severity === "high").length,
      medium: issues.filter((i) => i.severity === "medium").length,
      low: issues.filter((i) => i.severity === "low").length,
      matchedEndpoints: contractContext?.endpoints.size || 0,
      matchedTypes: contractContext?.types.size || 0,
      unmatchedFrontend: contractContext?.unmatchedFrontend.length || 0,
      unmatchedBackend: contractContext?.unmatchedBackend.length || 0,
    };

    const duration = Date.now() - startTime;
    logger.info(
      `API Contract validation complete in ${duration}ms. ` +
        `Found ${issues.length} issues (${summary.critical} critical, ${summary.high} high, ${summary.medium} medium, ${summary.low} low)`,
    );

    return {
      success: true,
      projectStructure,
      frontendContext,
      backendContext,
      contractContext,
      issues,
      summary,
    };
  } catch (error) {
    logger.error("API Contract validation failed:", error);
    return {
      success: false,
      projectStructure: {
        relationship: "frontend-only",
      },
      issues: [
        {
          type: "apiContractMismatch",
          severity: "critical",
          message: `Validation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
          file: projectPath,
          line: 0,
          suggestion: "Check project structure and try again",
        },
      ],
      summary: {
        totalIssues: 1,
        critical: 1,
        high: 0,
        medium: 0,
        low: 0,
        matchedEndpoints: 0,
        matchedTypes: 0,
        unmatchedFrontend: 0,
        unmatchedBackend: 0,
      },
    };
  }
}

// ============================================================================
// Quick Validation Functions
// ============================================================================

/**
 * Quick check for critical issues only
 */
export async function checkCriticalIssues(projectPath: string): Promise<ApiContractIssue[]> {
  const result = await validateApiContracts(projectPath);
  return result.issues.filter((i) => i.severity === "critical");
}

/**
 * Check if a specific endpoint exists
 */
export async function checkEndpointExists(
  projectPath: string,
  method: string,
  endpoint: string,
): Promise<boolean> {
  const result = await validateApiContracts(projectPath);

  if (!result.contractContext) {
    return false;
  }

  for (const mapping of result.contractContext.endpoints.values()) {
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
 * Get contract information for an endpoint
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
  const result = await validateApiContracts(projectPath);

  if (!result.contractContext) {
    return null;
  }

  const mapping = result.contractContext.endpoints.get(endpoint);
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

// ============================================================================
// Report Generation
// ============================================================================

export interface ValidationReport {
  timestamp: string;
  projectPath: string;
  summary: ValidationResult["summary"];
  issues: ApiContractIssue[];
  recommendations: string[];
}

/**
 * Generate a validation report
 */
export async function generateValidationReport(
  projectPath: string,
): Promise<ValidationReport> {
  const result = await validateApiContracts(projectPath);

  const recommendations: string[] = [];

  // Generate recommendations based on issues
  if (result.summary.critical > 0) {
    recommendations.push(
      `Address ${result.summary.critical} critical issues immediately to prevent runtime errors`,
    );
  }

  if (result.summary.unmatchedFrontend > 0) {
    recommendations.push(
      `${result.summary.unmatchedFrontend} frontend services don't have matching backend routes - verify endpoints or implement missing routes`,
    );
  }

  if (result.summary.unmatchedBackend > 0) {
    recommendations.push(
      `${result.summary.unmatchedBackend} backend routes are not used by frontend - consider removing unused endpoints or implementing frontend calls`,
    );
  }

  if (result.summary.high > 0) {
    recommendations.push(
      `Review ${result.summary.high} high severity issues for potential data integrity problems`,
    );
  }

  return {
    timestamp: new Date().toISOString(),
    projectPath,
    summary: result.summary,
    issues: result.issues,
    recommendations,
  };
}

/**
 * Format validation results for display
 */
export function formatValidationResults(result: ValidationResult): string {
  const lines: string[] = [];

  lines.push("=".repeat(80));
  lines.push("API CONTRACT VALIDATION RESULTS");
  lines.push("=".repeat(80));
  lines.push("");

  // Project structure
  lines.push("📁 Project Structure:");
  lines.push(`  Type: ${result.projectStructure.relationship}`);
  if (result.projectStructure.frontend) {
    lines.push(`  Frontend: ${result.projectStructure.frontend.framework} (${result.projectStructure.frontend.apiPattern})`);
  }
  if (result.projectStructure.backend) {
    lines.push(`  Backend: ${result.projectStructure.backend.framework} (${result.projectStructure.backend.apiPattern})`);
  }
  lines.push("");

  // Summary
  lines.push("📊 Summary:");
  lines.push(`  Total Issues: ${result.summary.totalIssues}`);
  lines.push(`    - Critical: ${result.summary.critical} 🔴`);
  lines.push(`    - High: ${result.summary.high} 🟠`);
  lines.push(`    - Medium: ${result.summary.medium} 🟡`);
  lines.push(`    - Low: ${result.summary.low} 🟢`);
  lines.push("");
  lines.push(`  Matched Endpoints: ${result.summary.matchedEndpoints}`);
  lines.push(`  Matched Types: ${result.summary.matchedTypes}`);
  lines.push(`  Unmatched Frontend: ${result.summary.unmatchedFrontend}`);
  lines.push(`  Unmatched Backend: ${result.summary.unmatchedBackend}`);
  lines.push("");

  // Issues by severity
  if (result.issues.length > 0) {
    lines.push("🔍 Issues by Severity:");
    lines.push("");

    const critical = result.issues.filter((i) => i.severity === "critical");
    const high = result.issues.filter((i) => i.severity === "high");
    const medium = result.issues.filter((i) => i.severity === "medium");

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
    lines.push("✅ No issues found!");
  }

  lines.push("=".repeat(80));

  return lines.join("\n");
}
