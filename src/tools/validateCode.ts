/**
 * Validate Code Tool - Unified AST-Based Validator
 *
 * THE UNIFIED AI CODE VALIDATOR
 *
 * Catches THREE types of AI mistakes:
 * 1. HALLUCINATIONS - References to things that don't exist
 * 2. DEPENDENCY HALLUCINATIONS - Imports from packages not in manifest
 * 3. DEAD CODE - Code that nothing uses (AI over-generation)
 *
 * Uses Tree-sitter AST parsing for accurate, production-grade validation.
 *
 * @format
 */

import { ToolDefinition } from "../types/tools.js";
import { logger } from "../utils/logger.js";
import { validationReportStore } from "../resources/validationReportStore.js";
import { getRelevantSymbolsForValidation } from "../analyzers/relevanceScorer.js";
import { incrementalValidation } from "./incrementalValidation.js";
import {
  orchestrateContext,
  recordValidationEvent,
  explainContextQuality,
} from "../context/contextOrchestrator.js";

// Import validation modules
import {
  extractUsagesAST,
  extractImportsAST,
  extractImportsASTWithOptions,
  type ASTUsage,
  type ASTImport,
} from "./validation/extractors/index.js";
import {
  loadManifestDependencies,
  loadPythonModuleExports,
} from "./validation/manifest.js";
import {
  validateManifest,
  validateSymbols,
  buildSymbolTable,
  validateUsagePatterns,
  getLineFromCode,
} from "./validation/validation.js";
import { extractSymbolsAST, extractTypeReferencesAST } from "./validation/extractors/index.js";
import { impactAnalyzer } from "../analyzers/impactAnalyzer.js";
import { usagePatternAnalyzer } from "../analyzers/usagePatterns.js";
import { detectDeadCode } from "./validation/deadCode.js";
import {
  calculateScore,
  generateRecommendation,
} from "./validation/scoring.js";
import {
  verifyFindingsAutomatically,
  getConfirmedFindings,
  type VerificationResult,
} from "../analyzers/findingVerifier.js";
import type { ValidationIssue, DeadCodeIssue } from "./validation/types.js";
import { PROMPT_PATTERNS, VALIDATION_CONSTRAINTS } from "../prompts/library.js";

// ============================================================================
// Tool Definition
// ============================================================================

export const validateCodeTool: ToolDefinition = {
  definition: {
    name: "validate_code",
    description:
      "Validate code snippets or single-file changes for hallucinations, missing dependencies, and dead code in one pass. For full-project or monorepo-wide audits, use start_validation on a scoped subdirectory (e.g., frontend/ or backend/).",
    inputSchema: {
      type: "object",
      properties: {
        projectPath: {
          type: "string",
          description:
            'Path to the relevant project scope for this snippet/file (e.g., ".", "src", "backend"). For large repository scans, prefer start_validation.',
        },
        newCode: {
          type: "string",
          description:
            "The AI-generated code to validate (optional - omit for dead code scan only)",
        },
        language: {
          type: "string",
          enum: ["javascript", "typescript", "python", "go"],
          description: "Programming language",
        },
        strictMode: {
          type: "boolean",
          description:
            "ONLY use true if explicitly requested. When true, flags ALL unresolved symbols including edge cases. Default is false which catches likely hallucinations without excessive noise.",
          default: false,
        },
        useSmartContext: {
          type: "boolean",
          description:
            "Use smart context selection for faster validation (default: true)",
        },
        sessionId: {
          type: "string",
          description:
            "Optional session ID for incremental validation (reuses previous results)",
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
    newCode?: string;
    language: string;
    strictMode?: boolean;
    useSmartContext?: boolean;
    sessionId?: string;
    recentlyEditedFiles?: string[];
  }) {
    const startTime = Date.now();
    const {
      projectPath,
      newCode,
      language,
      strictMode = false,
      useSmartContext = true,
      sessionId,
      recentlyEditedFiles = [],
    } = args;

    logger.info(`Validating code against project: ${projectPath} (strictMode: ${strictMode})`);

    try {
      const virtualFilePath = sessionId ? `session:${sessionId}` : "new_code_validation";

      // Step 0: Parse imports first (needed for context orchestration)
      let imports: ASTImport[] = [];
      let importedSymbols: string[] = [];
      if (newCode) {
        imports = extractImportsASTWithOptions(newCode, language, {
          filePath: virtualFilePath,
          cacheKey: virtualFilePath,
        });
        importedSymbols = imports
          .flatMap((imp) => [...imp.names.map((n) => n.local)])
          .filter(Boolean);
      }

      // Step 1: Orchestrate all context features to work together
      const orchestration = await orchestrateContext({
        projectPath,
        language,
        newCode,
        imports: importedSymbols,
        useSmartContext,
        sessionId,
        recentlyEditedFiles,
      });

      const {
        projectContext,
        lineageContext,
        relevantSymbols,
        contextQuality,
      } = orchestration;

      logger.info(
        `Context quality: ${contextQuality} - ${explainContextQuality(contextQuality)}`,
      );

      // Step 2: Check if we can use incremental validation
      let incrementalResult: {
        canUse: boolean;
        snapshot?: any;
        changes?: any;
      } = { canUse: false };
      if (sessionId && newCode && orchestration.useIncremental) {
        incrementalResult = incrementalValidation.canUseIncremental(
          sessionId,
          newCode,
        );
        if (incrementalResult.canUse) {
          logger.info(`Using incremental validation (session: ${sessionId})`);
        }
      }

      // Step 3: Load manifest dependencies (package.json / requirements.txt)
      const manifest = await loadManifestDependencies(projectPath, language);

      // Step 4: Load Python __all__ exports for module validation
      let pythonExports = new Map<string, Set<string>>();
      if (language === "python") {
        pythonExports = await loadPythonModuleExports(projectPath);
      }

      // Step 5: Build symbol table (filtered by smart context if available)
      const symbolTable = buildSymbolTable(
        projectContext,
        relevantSymbols.length > 0 ? relevantSymbols : undefined,
      );

      // Step 5: Run comprehensive validation if new code provided
      const issues: ValidationIssue[] = [];
      let usedSymbols: ASTUsage[] = [];

      if (newCode) {
        // Tier 0: Check manifest dependencies
        const manifestIssues = await validateManifest(imports, manifest, newCode, language);
        issues.push(...manifestIssues);

        // Tier 1: Validate symbols (hallucinations)
          // Don't skip imported symbols in extraction - we'll filter them intelligently in validation
          usedSymbols = extractUsagesAST(newCode, language, [], {
            filePath: virtualFilePath,
            cacheKey: virtualFilePath,
          });
          
          const missingPackages = new Set<string>();
          for (const issue of manifestIssues) {
            if (issue.type === "dependencyHallucination") {
              const match = issue.message.match(/Package '([^']+)'/);
              if (match) missingPackages.add(match[1]);
            }
          }

          // Extract type references for unused import detection
          // This is essential for TypeScript where imports might only be used as types
          const typeReferences = extractTypeReferencesAST(newCode, language, {
            filePath: virtualFilePath,
            cacheKey: virtualFilePath,
          });

          const symbolIssues = validateSymbols(
            usedSymbols,
            symbolTable,
            newCode,
            language,
            strictMode,
            imports,
            pythonExports,
            projectContext,
            // Don't pass a fake file path - let validation fall back to global symbol lookup
            // for relative imports.
            "",
            missingPackages,
            typeReferences
          );
        issues.push(...symbolIssues);

        // Secret #5: Usage Pattern Consistency (Rituals)
        const patternIssues = validateUsagePatterns(
          usedSymbols,
          projectContext,
        );
        issues.push(...patternIssues);

        // Secret #6: Change Impact Analysis (Blast Radius) - ONLY for changes
        const symbolsInNewCode = extractSymbolsAST(
          newCode,
          "new_code_validation",
          language,
        );
        for (const sym of symbolsInNewCode) {
          // Skip non-exported symbols and generic short names to reduce noise
          if (!sym.isExported || sym.name.length <= 2) {
            continue;
          }

          if (projectContext.symbolIndex.has(sym.name)) {
            const blast = impactAnalyzer.traceBlastRadius(
              sym.name,
              projectContext.symbolGraph!,
              2, // Shallow check for auto-validation
            );

            if (blast.severity === "high") {
              issues.push({
                type: "architecturalDeviation",
                severity: "high",
                file: "new_code_validation", // Virtual file for inline code validation
                message: `Modifying '${sym.name}' has a HIGH project-wide impact affecting ${blast.affectedFiles.length} files.`,
                line: sym.line,
                code: getLineFromCode(newCode, sym.line),
                suggestion: `Run 'analyze_change_impact' for '${sym.name}' to see the full list of affected symbols.`,
                confidence: 85,
                reasoning: `Found ${blast.impactedSymbols.length} downstream consumers in the symbol graph.`,
              });
            }
          }
        }
      }

      // Step 6: ALWAYS check for dead code (comprehensive validation)
      // Only run when validating large snippets (heuristic) or when no code is provided.
      // This keeps validate_code fast for small snippets while still supporting
      // full dead-code scans.
      const shouldCheckDeadCode = !newCode || newCode.split("\n").length > 50;
      let deadCodeIssues: DeadCodeIssue[] = [];

      if (shouldCheckDeadCode) {
        const DEAD_CODE_TIMEOUT = 30000; // 30 seconds max
        const deadCodePromise = detectDeadCode(projectContext, newCode);
        let timeoutId: NodeJS.Timeout | undefined;
        const timeoutPromise = new Promise<DeadCodeIssue[]>((resolve) => {
          timeoutId = setTimeout(() => {
            logger.warn(`Dead code detection timed out after ${DEAD_CODE_TIMEOUT}ms`);
            resolve([]);
          }, DEAD_CODE_TIMEOUT);
        });

        try {
          deadCodeIssues = await Promise.race([deadCodePromise, timeoutPromise]);
        } finally {
          if (timeoutId) clearTimeout(timeoutId);
        }
      }

      // Step 7: Automated Verification (eliminates false positives)
      logger.info(`Verifying ${issues.length} findings to eliminate false positives...`);
      const verificationResult = await verifyFindingsAutomatically(
        issues,
        deadCodeIssues,
        projectContext,
        projectPath,
        language,
      );

      // Get filtered findings (only confirmed, no false positives)
      const { hallucinations: confirmedIssues, deadCode: confirmedDeadCode } = 
        getConfirmedFindings(verificationResult);

      logger.info(`Verification complete: ${confirmedIssues.length} confirmed, ${verificationResult.stats.falsePositiveCount} false positives filtered`);

      // Step 8: Calculate score and recommendation using CONFIRMED issues only
      const score = calculateScore(confirmedIssues, confirmedDeadCode);
      const recommendation = generateRecommendation(
        score,
        confirmedIssues,
        confirmedDeadCode,
      );

      const elapsed = Date.now() - startTime;

      // Save snapshot for incremental validation (store ALL issues for analysis)
      if (sessionId && newCode) {
        incrementalValidation.saveSnapshot(
          sessionId,
          newCode,
          issues,  // Store original issues for comparison
          deadCodeIssues,
        );
      }

      // Use CONFIRMED issues for the response (no false positives)
      const totalIssues = confirmedIssues.length + confirmedDeadCode.length;
      const isLargeResult = totalIssues > 50;
      
      // Generate a unique ID for this validation run to store it in resources
      const validationId = `sync_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      
      // Store CONFIRMED issues in report store (wait for disk write to complete)
      await validationReportStore.store(validationId, projectPath, {
        summary: generateStructuredExplanation(confirmedIssues, confirmedDeadCode),
        stats: {
          filesScanned: projectContext.totalFiles,
          symbolsInProject: projectContext.symbolIndex.size,
          hallucinationsFound: confirmedIssues.length,
          deadCodeFound: confirmedDeadCode.length,
          analysisTime: `${elapsed}ms`,
          verification: {
            confirmed: verificationResult.stats.confirmedCount,
            falsePositivesFiltered: verificationResult.stats.falsePositiveCount,
            uncertain: verificationResult.stats.uncertainCount,
          },
        },
        hallucinations: confirmedIssues,
        deadCode: confirmedDeadCode,
        score,
        recommendation,
      });

      const reportUri = validationReportStore.getReportUri(validationId);

      // If the result is large, return a compact response with the URI
      if (isLargeResult) {
        return formatResponse({
          success: true,
          validated: true,
          score,
          hallucinationDetected: confirmedIssues.length > 0,
          deadCodeDetected: confirmedDeadCode.length > 0,
          reportUri,
          message: `Validation found ${totalIssues} confirmed issues (${verificationResult.stats.falsePositiveCount} false positives automatically filtered). Results are stored as an MCP Resource.`,
          recommendation,
          verification: {
            confirmedCount: verificationResult.stats.confirmedCount,
            falsePositiveCount: verificationResult.stats.falsePositiveCount,
            uncertainCount: verificationResult.stats.uncertainCount,
          },
          stats: {
            hallucinationsFound: confirmedIssues.length,
            deadCodeFound: confirmedDeadCode.length,
            analysisTime: `${elapsed}ms`,
          },
          resourceAccess: {
            summaryUri: reportUri,
            hallucinationsUri: `${reportUri}/hallucinations/0`,
            deadCodeUri: `${reportUri}/dead-code/0`,
            bySeverityUri: `${reportUri}/by-severity/critical`,
            byTypeUri: `${reportUri}/by-type/dependencyHallucination`,
            tip: "Use 'read_resource' to fetch chunks of issues from the URIs above. You can also filter by file: .../by-file/{filePath}",
          },
        });
      }

      // Small results can still be returned inline, but we also include the URI
      return formatResponse({
        success: true,
        validated: true,
        score,
        hallucinationDetected: confirmedIssues.length > 0,
        deadCodeDetected: confirmedDeadCode.length > 0,
        // Return ONLY confirmed findings (no false positives)
        hallucinations: confirmedIssues,
        deadCode: confirmedDeadCode,
        reportUri,
        recommendation,
        structuredExplanation: generateStructuredExplanation(
          confirmedIssues,
          confirmedDeadCode,
        ),
        /**
         * Automated verification results - shows confidence that findings are true positives
         */
        verification: {
          confirmedCount: verificationResult.stats.confirmedCount,
          falsePositiveCount: verificationResult.stats.falsePositiveCount,
          uncertainCount: verificationResult.stats.uncertainCount,
          /** Detailed breakdown of verification for each finding */
          details: verificationResult.confirmed.map(v => ({
            type: v.original.type,
            message: v.original.message,
            confidence: v.confidence,
            verificationMethod: v.verificationMethod,
            reasons: v.reasons,
          })),
        },
        stats: {
          filesScanned: projectContext.totalFiles,
          symbolsInProject: projectContext.symbolIndex.size,
          symbolsValidatedAgainst: symbolTable.length,
          relevanceFiltering:
            relevantSymbols.length > 0 ? "enabled" : "disabled",
          contextQuality,
          symbolsChecked: usedSymbols.length,
          importsChecked: imports.length,
          manifestPackages: manifest.all.size,
          hallucinationsFound: issues.length,
          deadCodeFound: deadCodeIssues.length,
          analysisTime: `${elapsed}ms`,
          incrementalValidation:
            incrementalResult.canUse ? "enabled" : "disabled",
        },
      });
    } catch (err) {
      logger.error("Validation error:", err);
      return formatResponse({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },
};

// ============================================================================
// Response Formatting
// ============================================================================

/**
 * Generate a structured explanation for the issues using prompt library patterns
 */
function generateStructuredExplanation(
  issues: ValidationIssue[],
  deadCode: DeadCodeIssue[],
): string {
  const total = issues.length + deadCode.length;
  if (total === 0) return "Code is clean. No issues detected.";

  const task = `Analyze ${total} issues found in the code and provide actionable feedback.`;
  const roleMsg = PROMPT_PATTERNS.role("Code Quality Auditor", task);

  const constrainedMsg = PROMPT_PATTERNS.withConstraints(
    roleMsg,
    VALIDATION_CONSTRAINTS,
  );

  const steps = [
    "Verify symbols against the project's current symbol table",
    "Check for missing package dependencies in manifest files",
    "Identify unused exports or dead code blocks",
    "Evaluate architectural impact on the wider project",
  ];
  const reasoningMsg = PROMPT_PATTERNS.stepByStep(constrainedMsg, steps);

  const issueDetails = [...issues, ...deadCode]
    .map((i, idx) => {
      let detail = `${idx + 1}. [${i.severity.toUpperCase()}] ${i.type}: ${i.message}`;
      if ("line" in i && i.line) detail += ` (Line ${i.line})`;
      if (i.suggestion) detail += `\n   Suggestion: ${i.suggestion}`;
      return detail;
    })
    .join("\n");

  return `${reasoningMsg}\n\nISSUE BREAKDOWN:\n${issueDetails}`;
}

function formatResponse(data: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}
