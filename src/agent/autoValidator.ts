/**
 * Auto Validator - Proactive Agent Mode
 *
 * Automatically validates code when files change.
 * Formats issues for LLM consumption and triggers MCP sampling.
 *
 * @format
 */

import * as fs from "fs/promises";
import * as path from "path";
import { FileWatcher, FileChangeEvent } from "./fileWatcher.js";
import { orchestrateContext } from "../context/contextOrchestrator.js";
import { refreshFileContext, markGuardianActive, markGuardianInactive } from "../context/projectContext.js";
import {
  extractUsagesAST,
  extractImportsAST,
  extractImportsASTWithOptions,
  extractTypeReferencesAST,
} from "../tools/validation/extractors/index.js";
import {
  loadManifestDependencies,
  loadPythonModuleExports,
} from "../tools/validation/manifest.js";
import {
  extractSymbolsAST,
} from "../tools/validation/extractors/index.js";
import {
  validateManifest,
  validateSymbols,
  buildSymbolTable,
  validateUsagePatterns,
  getLineFromCode,
} from "../tools/validation/validation.js";
import { detectDeadCode, detectUnusedLocals, shouldSkipFrameworkPattern } from "../tools/validation/deadCode.js";
import { impactAnalyzer } from "../analyzers/impactAnalyzer.js";
import { logger } from "../utils/logger.js";
import { sendNotification } from "./mcpNotifications.js";
import { ManifestDependencies } from "../tools/validation/types.js";
import { PROMPT_PATTERNS, VALIDATION_CONSTRAINTS } from "../prompts/library.js";
import { generateAntiPatternContext, enrichIssuesWithAntiPatterns } from "../analyzers/antiPatterns.js";
import {
  verifyFindingsAutomatically,
  getConfirmedFindings,
} from "../analyzers/findingVerifier.js";
import {
  validateApiContracts,
  formatValidationResults,
  type ApiContractIssue,
} from "../api-contract/index.js";

// File scope types for smart filtering
type FileScope = "frontend" | "backend" | "shared" | "unknown";

export interface ValidationAlert {
  file: string;
  issues: Array<{
    type: string;
    severity: string;
    message: string;
    suggestion?: string;
    line?: number;
    file?: string; // Source file path (for initial scan issues, used to scrub stale alerts)
  }>;
  timestamp: number;
  llmMessage: string;
  isInitialScan?: boolean;
}

export type AgentMode = "auto" | "learning" | "strict";

export class AutoValidator {
  private watcher: FileWatcher;
  private projectPath: string;
  private language: string;
  private onAlert: ((alert: ValidationAlert) => void) | null = null;
  private debounceTimers: Map<string, any> = new Map();
  private mode: AgentMode = "auto";
  private projectFileCount: number = 0;
  private newFilesTracked: Set<string> = new Set();
  private manifest: ManifestDependencies | null = null;
  private pythonExports: Map<string, Set<string>> = new Map();
  private agentName: string;
  private projectStructure?: { frontend?: string; backend?: string };
  private isFullStack: boolean = false;
  private tsManifest: ManifestDependencies | null = null;
  private pyManifest: ManifestDependencies | null = null;
  private pendingRefreshes: Map<string, Promise<any>> = new Map();
  private lastApiContractValidation: number = 0;
  private static readonly API_CONTRACT_DEBOUNCE_MS = 30_000; // At most once per 30s
  private activeValidationCount: number = 0;
  private validationQueue: Set<string> = new Set();
  private activeRefreshCount: number = 0;
  private static readonly MAX_CONCURRENT_VALIDATIONS = 2;
  private static readonly MAX_CONCURRENT_REFRESHES = 3;

  // Thresholds for smart mode
  private static readonly NEW_PROJECT_THRESHOLD = 5; // Less than 5 files = new project
  private static readonly LEARNING_MODE_FILE_COUNT = 10; // After 10 files created, switch to strict
  
  // Common path patterns for scope detection
  private static readonly FRONTEND_PATTERNS = [
    '/frontend/', '/client/', '/web/', '/app/', '/src/',
    '/components/', '/pages/', '/views/', '/hooks/', '/services/'
  ];
  private static readonly BACKEND_PATTERNS = [
    '/backend/', '/server/', '/api/', '/services/',
    '/routes/', '/routers/', '/controllers/', '/models/', '/db/'
  ];
  private static readonly SHARED_PATTERNS = [
    '/shared/', '/common/', '/types/', '/interfaces/', '/utils/'
  ];

  /**
   * Detect language from file extension for per-file validation
   */
  private static detectFileLanguage(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const map: Record<string, string> = {
      ".js": "javascript",
      ".jsx": "javascript",
      ".mjs": "javascript",
      ".cjs": "javascript",
      ".ts": "typescript",
      ".tsx": "typescript",
      ".mts": "typescript",
      ".cts": "typescript",
      ".py": "python",
    };
    return map[ext] || "unknown";
  }

  constructor(
    projectPath: string,
    language: string = "typescript",
    mode: AgentMode = "auto",
    agentName: string = "The Guardian"
  ) {
    this.projectPath = projectPath;
    this.language = language;
    this.mode = mode;
    this.agentName = agentName;
    this.watcher = new FileWatcher(projectPath);

    this.watcher.on("fileChange", (event: FileChangeEvent) => {
      this.handleFileChange(event);
    });
  }

  setAlertHandler(handler: (alert: ValidationAlert) => void): void {
    this.onAlert = handler;
  }

  async start(): Promise<void> {
    logger.info(`Starting AutoValidator for: ${this.projectPath}`);

    // Silent initialization by default to avoid UI clutter
    /*
    await sendNotification("guardian_starting", {
      message: `🔄 ${this.agentName}: Initialization started...`,
      projectPath: this.projectPath,
      language: this.language,
    });
    */

    // Pre-build context: detect full-stack and use "all" to include every language
    logger.info("Loading project context...");
    this.isFullStack = await this.detectFullStackProject();
    const contextLanguage = this.isFullStack ? "all" : this.language;
    if (this.isFullStack) {
      logger.info("Full-stack project detected — building unified multi-language context");
    }
    const orchestration = await orchestrateContext({
      projectPath: this.projectPath,
      language: contextLanguage,
    });
    const context = orchestration.projectContext;
    logger.info("Context built.");

    // Mark this project as guardian-managed — all tools will now
    // use this cached context without TTL/staleness rebuilds
    markGuardianActive(this.projectPath);

    // Detect project type
    this.projectFileCount = context.files?.size || 0;
    const detectedMode = this.detectProjectMode();
    logger.info(`VibeGuard Initialized: Found ${this.projectFileCount} files in ${this.projectPath}`);
    logger.info(`Operating Mode: ${detectedMode} (Language: ${this.isFullStack ? "all (full-stack)" : this.language})`);

    // Load manifests for all detected languages
    logger.info("Loading dependency manifests...");
    if (this.isFullStack) {
      // Full-stack: load manifests from the correct subdirectories
      // (e.g., frontend/package.json and backend/requirements.txt)
      const tsRoot = this.projectStructure?.frontend || this.projectPath;
      const pyRoot = this.projectStructure?.backend || this.projectPath;
      this.tsManifest = await loadManifestDependencies(tsRoot, "typescript");
      this.pyManifest = await loadManifestDependencies(pyRoot, "python");
      this.pythonExports = await loadPythonModuleExports(pyRoot);
      // Keep this.manifest as the "primary" for backward compat
      this.manifest = this.language === "python" ? this.pyManifest : this.tsManifest;
    } else {
      this.manifest = await loadManifestDependencies(this.projectPath, this.language);
      if (this.language === "python") {
        this.pythonExports = await loadPythonModuleExports(this.projectPath);
      }
    }

    // Run initial health check on existing codebase (skip for new projects)
    if (detectedMode !== "learning") {
      logger.info("Running initial health check...");
      await this.runInitialHealthCheck(context);
    } else {
      logger.info("New project detected - skipping initial health check, entering Learning Mode");
      this.pushLearningModeNotification();
    }

    logger.info("Starting file watcher...");
    this.watcher.start();

    // Silent ready status to avoid UI clutter
    /*
    await sendNotification("guardian_ready", {
      message: `✅ ${this.agentName}: Ready and watching ${this.projectFileCount} files!`,
      fileCount: this.projectFileCount,
      mode: detectedMode,
      projectPath: this.projectPath,
    });
    */
  }

  private detectProjectMode(): AgentMode {
    if (this.mode !== "auto") return this.mode;

    if (this.projectFileCount < AutoValidator.NEW_PROJECT_THRESHOLD) {
      return "learning";
    }
    return "strict";
  }

  /**
   * Detect if this is a full-stack project with both frontend (TS/JS) and backend (Python) code.
   * Checks for common directory structures and file extensions.
   */
  private async detectFullStackProject(): Promise<boolean> {
    const fs = await import("fs/promises");
    let hasPython = false;
    let hasTypeScript = false;
    let pythonRoot: string | undefined;
    let tsRoot: string | undefined;

    // Quick heuristic: check for common full-stack markers at project root
    const markers = [
      { path: "requirements.txt", lang: "python" },
      { path: "pyproject.toml", lang: "python" },
      { path: "Pipfile", lang: "python" },
      { path: "package.json", lang: "typescript" },
      { path: "tsconfig.json", lang: "typescript" },
    ];

    for (const marker of markers) {
      try {
        await fs.access(path.join(this.projectPath, marker.path));
        if (marker.lang === "python") hasPython = true;
        if (marker.lang === "typescript") hasTypeScript = true;
      } catch {
        // Not found
      }
    }

    // Helper to detect language of a subdirectory based on its manifest files
    const detectDirLanguage = async (dirPath: string): Promise<"python" | "typescript" | "both" | "unknown"> => {
      let dirHasPython = false;
      let dirHasTS = false;
      for (const m of ["requirements.txt", "pyproject.toml", "Pipfile"]) {
        try { await fs.access(path.join(dirPath, m)); dirHasPython = true; break; } catch { /* Not found */ }
      }
      for (const m of ["package.json", "tsconfig.json"]) {
        try { await fs.access(path.join(dirPath, m)); dirHasTS = true; break; } catch { /* Not found */ }
      }
      if (dirHasPython && dirHasTS) return "both";
      if (dirHasPython) return "python";
      if (dirHasTS) return "typescript";
      return "unknown";
    };

    // Check common subdirectory patterns — detect ACTUAL language from manifests,
    // not from directory name (a "backend/" can be Python OR TypeScript)
    const dirCandidates = [
      { path: "backend", role: "backend" },
      { path: "server", role: "backend" },
      { path: "frontend", role: "frontend" },
      { path: "client", role: "frontend" },
    ];

    for (const check of dirCandidates) {
      try {
        const dirPath = path.join(this.projectPath, check.path);
        const stat = await fs.stat(dirPath);
        if (stat.isDirectory()) {
          const lang = await detectDirLanguage(dirPath);
          if (lang === "python" || lang === "both") {
            hasPython = true;
            if (!pythonRoot) pythonRoot = dirPath;
          }
          if (lang === "typescript" || lang === "both") {
            hasTypeScript = true;
            // For TS: prefer frontend-role dirs as tsRoot, backend-role dirs as separate
            if (check.role === "frontend" && !tsRoot) {
              tsRoot = dirPath;
            } else if (check.role === "backend" && !tsRoot) {
              // Backend is also TS — tsRoot tracks the frontend for structure
              // but we still know it's TypeScript on both sides (NOT full-stack Python+TS)
              tsRoot = tsRoot || dirPath;
            }
          }
        }
      } catch {
        // Not found
      }
    }

    // Store detected structure for manifest loading and scope resolution
    if (hasPython && hasTypeScript) {
      this.projectStructure = {
        backend: pythonRoot || this.projectPath,
        frontend: tsRoot || this.projectPath,
      };
      logger.info(`Full-stack structure detected: backend=${pythonRoot || this.projectPath}, frontend=${tsRoot || this.projectPath}`);
    }

    return hasPython && hasTypeScript;
  }

  /**
   * Get the correct manifest for a given file language
   */
  private getManifestForLanguage(fileLang: string): ManifestDependencies | null {
    if (!this.isFullStack) return this.manifest;
    if (fileLang === "python") return this.pyManifest;
    return this.tsManifest; // typescript, javascript
  }

  /**
   * Detect the scope of a file (frontend, backend, shared, or unknown)
   * Used for smart filtering of validation issues
   */
  private detectFileScope(filePath: string): FileScope {
    const normalizedPath = filePath.toLowerCase();
    
    // Check for shared patterns first (highest priority)
    for (const pattern of AutoValidator.SHARED_PATTERNS) {
      if (normalizedPath.includes(pattern)) {
        return "shared";
      }
    }
    
    // Check for frontend patterns
    for (const pattern of AutoValidator.FRONTEND_PATTERNS) {
      if (normalizedPath.includes(pattern)) {
        // But make sure it's not in a backend directory
        const isBackend = AutoValidator.BACKEND_PATTERNS.some(p => 
          normalizedPath.includes(p)
        );
        if (!isBackend) {
          return "frontend";
        }
      }
    }
    
    // Check for backend patterns
    for (const pattern of AutoValidator.BACKEND_PATTERNS) {
      if (normalizedPath.includes(pattern)) {
        return "backend";
      }
    }
    
    // Detect by file extension and content patterns
    if (filePath.endsWith('.tsx') || filePath.endsWith('.jsx')) {
      return "frontend";
    }
    
    if (filePath.endsWith('.py') && !filePath.includes('test')) {
      // Check if it's clearly a backend file
      if (normalizedPath.includes('main.py') || normalizedPath.includes('app.py')) {
        return "backend";
      }
    }
    
    return "unknown";
  }

  /**
   * Filter issues based on file scope for smart alerting
   * Shows all critical issues, but filters lower severity by relevance
   */
  private filterIssuesByScope(
    issues: any[],
    fileScope: FileScope,
    isLenient: boolean
  ): any[] {
    if (isLenient) {
      // In lenient mode, show critical/high severity issues
      // PLUS keep issue types that the later lenient filter explicitly preserves:
      // - unusedImport, unusedFunction, unusedExport (per-file code hygiene)
      // - dependencyHallucination, missingDependency (build-breaking or suspicious)
      return issues.filter(issue =>
        issue.severity === 'critical' ||
        issue.severity === 'high' ||
        issue.type === 'unusedImport' ||
        issue.type === 'unusedFunction' ||
        issue.type === 'unusedExport' ||
        issue.type === 'dependencyHallucination' ||
        issue.type === 'missingDependency'
      );
    }
    
    return issues.filter(issue => {
      // Always show critical issues
      if (issue.severity === 'critical') return true;
      
      // Always show API contract mismatches (they affect both sides)
      if (issue.type === 'apiContractMismatch') return true;
      
      // For high severity, show if relevant to scope
      if (issue.severity === 'high') {
        // If we can't determine scope, show all high severity
        if (fileScope === 'unknown') return true;
        
        // Dead code in shared files affects everyone
        if (issue.type === 'deadCode' && fileScope === 'shared') return true;
        
        // Unused imports are always relevant
        if (issue.type === 'unusedImport') return true;
        
        return true; // Show other high severity issues
      }
      
      // For medium/low severity, be more selective
      if (fileScope === 'frontend') {
        // In frontend files, prioritize frontend-specific issues
        if (issue.type === 'unusedImport') return true;
        if (issue.type === 'nonExistentFunction') return true;
        return false; // Filter out less relevant issues
      }
      
      if (fileScope === 'backend') {
        // In backend files, prioritize backend-specific issues
        if (issue.type === 'unusedImport') return true;
        if (issue.type === 'nonExistentFunction') return true;
        return false;
      }
      
      return true;
    });
  }

  private pushLearningModeNotification(): void {
    const alert: ValidationAlert = {
      file: "SYSTEM",
      issues: [],
      timestamp: Date.now(),
      llmMessage: `📚 **${this.agentName}: Learning Mode Active**\n\nThis appears to be a new project (${this.projectFileCount} files). I'll be lenient and learn your patterns as you build.\n\nOnce you have more than ${AutoValidator.LEARNING_MODE_FILE_COUNT} files, I'll switch to strict validation.`,
      isInitialScan: true,
    };

    if (this.onAlert) {
      this.onAlert(alert);
    }
  }

  private async runInitialHealthCheck(context: any): Promise<void> {
    try {
      // Run API Contract validation
      logger.info("Running API Contract validation...");
      const apiContractResult = await validateApiContracts(this.projectPath);

      if (apiContractResult.issues.length > 0) {
         const apiContractAlert: ValidationAlert = {
          file: "API_CONTRACT_SCAN",
          issues: apiContractResult.issues.map((issue) => ({
            type: issue.type,
            severity: issue.severity,
            message: issue.message,
            suggestion: issue.suggestion,
            line: issue.line,
            file: issue.file ? path.relative(this.projectPath, issue.file) : undefined,
          })),
          timestamp: Date.now(),
          llmMessage: this.createApiContractMessage(apiContractResult),
          isInitialScan: true,
        };

        logger.info(
          `API Contract scan found ${apiContractResult.issues.length} issues`,
        );

        if (this.onAlert) {
          this.onAlert(apiContractAlert);
        }
      }

      // Run dead code detection on existing codebase
      // For full-stack projects, run per-scope to avoid hitting the export cap
      let deadCodeIssues;
      if (this.isFullStack && this.projectStructure) {
        const backendRoot = this.projectStructure.backend!;
        const frontendRoot = this.projectStructure.frontend!;
        logger.info(`Running dead code detection per-scope: backend=${backendRoot}, frontend=${frontendRoot}`);
        const [backendDead, frontendDead] = await Promise.all([
          detectDeadCode(context, undefined, (fp) => fp.startsWith(backendRoot)),
          detectDeadCode(context, undefined, (fp) => fp.startsWith(frontendRoot)),
        ]);
        deadCodeIssues = [...backendDead, ...frontendDead];
        logger.info(`Dead code per-scope: backend=${backendDead.length}, frontend=${frontendDead.length}`);
      } else {
        deadCodeIssues = await detectDeadCode(context);
      }

      // Verify findings to eliminate false positives
      // Use "all" for full-stack projects so verification understands both languages
      let confirmedDeadCode = deadCodeIssues;
      const verifyLang = this.isFullStack ? "all" : this.language;
      if (deadCodeIssues.length > 0) {
        logger.debug(`Verifying ${deadCodeIssues.length} dead code findings...`);
        const verificationResult = await verifyFindingsAutomatically(
          [],
          deadCodeIssues,
          context,
          this.projectPath,
          verifyLang,
        );
        confirmedDeadCode = getConfirmedFindings(verificationResult).deadCode;
        logger.debug(`Verification complete: ${confirmedDeadCode.length} confirmed (filtered ${verificationResult.stats.falsePositiveCount} false positives)`);
      }

      if (confirmedDeadCode.length > 0) {
        const alert: ValidationAlert = {
          file: "INITIAL_SCAN",
          issues: confirmedDeadCode.map((dc) => ({
            type: "deadCode",
            severity: dc.severity,
            message: dc.message,
            suggestion: (dc as any).suggestion,
            line: (dc as any).line,
            file: (dc as any).file ? path.relative(this.projectPath, (dc as any).file) : undefined,
          })),
          timestamp: Date.now(),
          llmMessage: this.createInitialScanMessage(confirmedDeadCode),
          isInitialScan: true,
        };

        logger.info(`Initial scan found ${confirmedDeadCode.length} confirmed issues in existing codebase`);

        if (this.onAlert) {
          this.onAlert(alert);
        }
      } else {
        logger.info("Initial scan: No issues found in existing codebase");
      }

      // Phase 3: Per-file hallucination and local dead code scan
      // This catches issues that project-wide scans miss:
      // - Hallucinated imports (packages not in package.json / requirements.txt)
      // - Hallucinated function calls (bare calls to non-existent functions)
      // - Unused local functions/constants (non-exported dead code)
      // The project-wide scan only finds unused EXPORTS and orphaned files.
      // This per-file scan finds hallucinated dependencies, hallucinated calls, and local dead code.
      logger.info("Running per-file hallucination and local dead code scan...");
      const perFileHallucinations: any[] = [];
      const perFileDeadCode: any[] = [];

      // Build symbol table once for the whole project (used by validateSymbols)
      const contextLanguage = this.isFullStack ? "all" : this.language;
      const orchestrationForSymbols = await orchestrateContext({
        projectPath: this.projectPath,
        language: contextLanguage,
      });
      const symbolTable = buildSymbolTable(orchestrationForSymbols.projectContext, orchestrationForSymbols.relevantSymbols);

      const MAX_INITIAL_FILES_TO_SCAN = 100;
      let filesScanned = 0;

      for (const [filePath, fileInfo] of context.files) {
        if (filesScanned >= MAX_INITIAL_FILES_TO_SCAN) break;
        // Don't skip entry points — they can contain hallucinations and dead code too
        // (e.g., server.ts calling dispatchSystemDiagnostics() or defining legacyHelperOptimization())
        if (fileInfo.isTest || fileInfo.isConfig) continue;

        const fileLang = AutoValidator.detectFileLanguage(filePath);
        if (fileLang === "unknown") continue;

        try {
          const content = await fs.readFile(filePath, "utf-8");
          filesScanned++;

          // Tier 0: Manifest validation — catches hallucinated imports
          const imports = extractImportsAST(content, fileLang);
          const fileManifest = this.getManifestForLanguage(fileLang);
          if (fileManifest) {
            const manifestIssues = await validateManifest(imports, fileManifest, content, fileLang, filePath);
            for (const issue of manifestIssues) {
              // Attach file path so the verifier can read the file
              issue.file = filePath;
              perFileHallucinations.push(issue);
            }
          }

          // Tier 1: Symbol validation — catches hallucinated bare function calls
          // (e.g., reportInventoryMetricsToCloud(), dispatchSystemDiagnostics())
          // These are NOT imports, so validateManifest can't catch them.
          const usages = extractUsagesAST(content, fileLang, imports, { filePath });
          const typeReferences =
            fileLang === "typescript" || fileLang === "javascript" ?
              extractTypeReferencesAST(content, fileLang, { filePath })
            : [];
          const symbolIssues = validateSymbols(
            usages,
            symbolTable,
            content,
            fileLang,
            false, // strictMode
            imports,
            this.pythonExports,
            context,
            filePath,
            undefined, // missingPackages
            typeReferences,
          );
          for (const issue of symbolIssues) {
            issue.file = filePath;
            perFileHallucinations.push(issue);
          }

          // Tier 2: Local dead code — catches unused non-exported functions/constants
          const localDeadCode = detectUnusedLocals(content, filePath);
          perFileDeadCode.push(...localDeadCode);
        } catch (err) {
          logger.debug(`Skipping initial scan of ${filePath}: ${err}`);
        }
      }

      logger.info(`Per-file scan complete: ${filesScanned} files, ${perFileHallucinations.length} hallucinations, ${perFileDeadCode.length} local dead code`);

      // Verify per-file findings to eliminate false positives
      const allPerFileFindings = [...perFileHallucinations, ...perFileDeadCode];
      if (allPerFileFindings.length > 0) {
        logger.debug(`Verifying ${allPerFileFindings.length} per-file findings...`);
        const perFileVerification = await verifyFindingsAutomatically(
          perFileHallucinations,
          perFileDeadCode,
          context,
          this.projectPath,
          verifyLang,
        );
        const confirmedPerFile = getConfirmedFindings(perFileVerification);
        const confirmedPerFileAll = [...confirmedPerFile.hallucinations, ...confirmedPerFile.deadCode];
        logger.debug(`Per-file verification: ${confirmedPerFileAll.length} confirmed (filtered ${perFileVerification.stats.falsePositiveCount} false positives)`);

        if (confirmedPerFileAll.length > 0) {
          const perFileAlert: ValidationAlert = {
            file: "INITIAL_FILE_SCAN",
            issues: confirmedPerFileAll.map((issue: any) => ({
              type: issue.type || "unknown",
              severity: issue.severity || "medium",
              message: issue.message || "",
              suggestion: issue.suggestion,
              line: issue.line,
              file: issue.file ? path.relative(this.projectPath, issue.file) : undefined,
            })),
            timestamp: Date.now(),
            llmMessage: this.createPerFileScanMessage(confirmedPerFile.hallucinations, confirmedPerFile.deadCode),
            isInitialScan: true,
          };

          logger.info(`Per-file scan found ${confirmedPerFileAll.length} confirmed issues`);
          if (this.onAlert) {
            this.onAlert(perFileAlert);
          }
        }
      }
    } catch (err) {
      logger.error("Error running initial health check:", err);
    }
  }

  private createInitialScanMessage(deadCodeIssues: any[]): string {
    return `📋 **${this.agentName}: Initial Scan Complete** - Found **${deadCodeIssues.length} potential issues** in existing codebase. Use 'get_guardian_alerts' to see details.`;
  }

  private createPerFileScanMessage(hallucinations: any[], deadCode: any[]): string {
    const parts: string[] = [];
    parts.push(`🔍 **${this.agentName}: Per-File Scan Complete**`);
    parts.push("");

    if (hallucinations.length > 0) {
      parts.push(`**${hallucinations.length} Hallucinated Import(s):**`);
      for (const h of hallucinations.slice(0, 5)) {
        const relFile = path.relative(this.projectPath, h.file || "");
        parts.push(`- [${h.severity?.toUpperCase()}] ${h.message}${relFile ? ` in \`${relFile}\`` : ""}`);
        if (h.suggestion) parts.push(`  Suggestion: ${h.suggestion}`);
      }
      if (hallucinations.length > 5) {
        parts.push(`  ... and ${hallucinations.length - 5} more`);
      }
      parts.push("");
    }

    if (deadCode.length > 0) {
      parts.push(`**${deadCode.length} Unused Local Function(s)/Constant(s):**`);
      for (const dc of deadCode.slice(0, 5)) {
        const relFile = path.relative(this.projectPath, dc.file || "");
        parts.push(`- [${dc.severity?.toUpperCase()}] ${dc.message}${relFile ? ` in \`${relFile}\`` : ""}`);
      }
      if (deadCode.length > 5) {
        parts.push(`  ... and ${deadCode.length - 5} more`);
      }
      parts.push("");
    }

    parts.push("Use 'get_guardian_alerts' to see all details.");

    return parts.join("\n");
  }

  private createApiContractMessage(result: { issues: ApiContractIssue[]; summary: { totalIssues: number; critical: number; high: number; medium: number; low: number; matchedEndpoints: number; matchedTypes: number; unmatchedFrontend: number; unmatchedBackend: number; }; }): string {
    const lines: string[] = [];
    lines.push(`🔗 **${this.agentName}: API Contract Validation**`);
    lines.push("");
    lines.push(`Found **${result.issues.length}** API contract issues:`);
    lines.push(`- 🔴 Critical: ${result.summary.critical}`);
    lines.push(`- 🟠 High: ${result.summary.high}`);
    lines.push(`- 🟡 Medium: ${result.summary.medium}`);
    lines.push(`- 🟢 Low: ${result.summary.low}`);
    lines.push("");
    lines.push(`📊 Matched Endpoints: ${result.summary.matchedEndpoints}`);
    lines.push(`📊 Matched Types: ${result.summary.matchedTypes}`);
    lines.push("");

    if (result.summary.critical > 0) {
      lines.push("**Critical Issues (Fix Immediately):**");
      const critical = result.issues.filter((i: ApiContractIssue) => i.severity === "critical").slice(0, 3);
      critical.forEach((issue: ApiContractIssue) => {
        lines.push(`- ${issue.message}`);
        lines.push(`  Suggestion: ${issue.suggestion}`);
      });
      lines.push("");
    }

    if (result.summary.unmatchedFrontend > 0) {
      lines.push(
        `⚠️ **${result.summary.unmatchedFrontend} frontend services** don't have matching backend routes`,
      );
    }

    if (result.summary.unmatchedBackend > 0) {
      lines.push(
        `⚠️ **${result.summary.unmatchedBackend} backend routes** are not used by frontend`,
      );
    }

    return lines.join("\n");
  }

  stop(): void {
    this.watcher.stop();
    this.debounceTimers.forEach((timer) => clearTimeout(timer));
    this.debounceTimers.clear();
    markGuardianInactive(this.projectPath);
  }

  private handleFileChange(event: FileChangeEvent): void {
    // Detect language for this specific file (full-stack aware)
    const fileLang = AutoValidator.detectFileLanguage(event.path);
    const refreshLang = this.isFullStack ? "all" : this.language;

    // Track new files and refresh context — store promise so validateFile can await it.
    // Throttle concurrent refreshes to avoid spawning too many git subprocesses.
    let refreshPromise: Promise<any> | null = null;
    if (event.type === "add") {
      this.newFilesTracked.add(event.path);
      this.projectFileCount++;
      
      logger.debug(`New file detected: ${event.path} (${fileLang}) - refreshing context...`);
      refreshPromise = this.throttledRefresh(event.path, refreshLang);
      
      // Check if we should exit learning mode
      if (this.mode === "auto" && this.projectFileCount >= AutoValidator.LEARNING_MODE_FILE_COUNT) {
        // Only switch if we were previously in learning mode (implied by auto + threshold)
        // But for simplicity, we just let the next detectProjectMode call handle it
      }
    } else if (event.type === "change") {
      logger.debug(`File modified: ${event.path} (${fileLang}) - refreshing context...`);
      refreshPromise = this.throttledRefresh(event.path, refreshLang);
    } else if (event.type === "unlink") {
      this.newFilesTracked.delete(event.path);
      this.projectFileCount = Math.max(0, this.projectFileCount - 1);
      
      logger.debug(`File deleted: ${event.path} (${fileLang}) - removing from context...`);
      refreshPromise = this.throttledRefresh(event.path, refreshLang);

      // File is deleted — emit a clear alert immediately instead of trying to validate.
      // This clears both the per-file alert and any matching initial scan issues.
      const relativePath = path.relative(this.projectPath, event.path);
      if (this.onAlert) {
        const clearAlert: ValidationAlert = {
          file: relativePath,
          issues: [],
          timestamp: Date.now(),
          llmMessage: `🗑️ ${this.agentName}: File deleted - ${relativePath}. Issues cleared.`,
        };
        this.onAlert(clearAlert);
      }
      // Skip validation queueing for deleted files — nothing to validate
      return;
    }

    // Track the pending refresh so validateFile can await ALL pending refreshes
    if (refreshPromise) {
      this.pendingRefreshes.set(event.path, refreshPromise);
      refreshPromise.finally(() => this.pendingRefreshes.delete(event.path));
    }

    // Debounce rapid changes to the same file
    const existingTimer = this.debounceTimers.get(event.path);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      this.enqueueValidation(event.path);
      this.debounceTimers.delete(event.path);
    }, 500);

    this.debounceTimers.set(event.path, timer);
  }

  /**
   * Throttle concurrent refreshFileContext calls.
   * Without this, 30 file changes = 30 concurrent refreshes, each spawning
   * git subprocesses and writing to disk simultaneously.
   */
  private async throttledRefresh(filePath: string, language: string): Promise<void> {
    // Wait if too many refreshes are already running
    while (this.activeRefreshCount >= AutoValidator.MAX_CONCURRENT_REFRESHES) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    this.activeRefreshCount++;
    try {
      await refreshFileContext(this.projectPath, filePath, { language });
    } catch (err) {
      logger.warn(`Failed to refresh context for ${filePath}:`, err);
    } finally {
      this.activeRefreshCount--;
    }
  }

  /**
   * Enqueue a file for validation. Only one validation runs at a time.
   * Without this, N concurrent validateFile calls each spawn git subprocesses,
   * AST parsing, and verification — causing a subprocess storm that can hang the system.
   */
  private enqueueValidation(filePath: string): void {
    if (this.activeValidationCount >= AutoValidator.MAX_CONCURRENT_VALIDATIONS) {
      this.validationQueue.add(filePath);
      return;
    }
    this.runValidation(filePath);
  }

  private async runValidation(filePath: string): Promise<void> {
    this.activeValidationCount++;
    try {
      await this.validateFile(filePath);
    } finally {
      this.activeValidationCount--;
      this.processValidationQueue();
    }
  }

  private processValidationQueue(): void {
    // Drain queue up to concurrency limit
    while (this.validationQueue.size > 0 && this.activeValidationCount < AutoValidator.MAX_CONCURRENT_VALIDATIONS) {
      const next = this.validationQueue.values().next().value;
      if (!next) break;
      this.validationQueue.delete(next);
      this.runValidation(next);
    }
  }

  private async validateFile(filePath: string): Promise<void> {
    try {
      // Wait for ALL pending context refreshes to complete before validating.
      // This prevents race conditions where validation runs on stale/partial context
      // (e.g., reverseImportGraph missing entries because refreshFileContext hasn't finished).
      if (this.pendingRefreshes.size > 0) {
        logger.debug(`Waiting for ${this.pendingRefreshes.size} pending context refreshes...`);
        await Promise.all(this.pendingRefreshes.values());
      }

      const isNewFile = this.newFilesTracked.has(filePath);
      const mode = this.detectProjectMode();
      const isLenient = mode === "learning" || isNewFile;

      // Detect the correct language for THIS file (not the project-level language)
      const fileLang = AutoValidator.detectFileLanguage(filePath);
      if (fileLang === "unknown") {
        logger.debug(`Skipping unknown language file: ${filePath}`);
        return;
      }

      const content = await fs.readFile(filePath, "utf-8");
      const relativePath = path.relative(this.projectPath, filePath);

      logger.info(`Auto-validating (${isLenient ? "Lenient" : "Strict"}) [${fileLang}]: ${relativePath}`);

      // Use orchestrateContext with "all" for full-stack, or the file's language
      const contextLanguage = this.isFullStack ? "all" : this.language;
      const orchestration = await orchestrateContext({
        projectPath: this.projectPath,
        language: contextLanguage,
        currentFile: filePath,
      });
      const context = orchestration.projectContext;

      // Extract symbols and imports using the FILE's language (not the project language)
      const imports = extractImportsASTWithOptions(content, fileLang, {
        filePath,
      });
      const usedSymbols = extractUsagesAST(content, fileLang, imports, { filePath });
      const symbolTable = buildSymbolTable(context, orchestration.relevantSymbols);
      
      // Extract type references for unused import detection
      // This is essential for TypeScript where imports might only be used as types
      const typeReferences =
        fileLang === "typescript" || fileLang === "javascript" ?
          extractTypeReferencesAST(content, fileLang, { filePath })
        : [];

      // Tier 0: Check manifest dependencies (use the correct manifest for this file's language)
      let manifestIssues: any[] = [];
      const fileManifest = this.getManifestForLanguage(fileLang);
      if (fileManifest) {
          manifestIssues = await validateManifest(imports, fileManifest, content, fileLang, filePath);
      }

      // Tier 1: Validate symbols (hallucination detection)
      let symbolIssues = validateSymbols(
        usedSymbols,
        symbolTable,
        content,
        fileLang,
        false, // strictMode
        imports,
        this.pythonExports,
        context,
        filePath,
        undefined, // missingPackages (calculated internally)
        typeReferences
      );

      // Validate usage patterns (architectural consistency)
      let patternIssues = validateUsagePatterns(usedSymbols, context);

      // Tier 1.5: Change Impact Analysis (Blast Radius) - Proactive Alerting
      let impactIssues: any[] = [];
      if (context.symbolGraph) {
        const symbolsInFile = extractSymbolsAST(content, filePath, fileLang);
        for (const sym of symbolsInFile) {
          // Skip non-exported symbols and very short names to avoid noise
          if (!sym.isExported || sym.name.length <= 2) {
            continue;
          }

          if (context.symbolIndex.has(sym.name)) {
            const blast = impactAnalyzer.traceBlastRadius(
              sym.name,
              context.symbolGraph,
              2
            );
            
            if (blast.severity === "high") {
              impactIssues.push({
                type: "architecturalDeviation",
                severity: "high",
                message: `Modifying '${sym.name}' has a HIGH project-wide impact affecting ${blast.affectedFiles.length} files.`,
                line: sym.line,
                suggestion: `Run 'get_dependency_graph' for '${sym.name}' to see the full list of affected symbols.`,
              });
            }
          }
        }
      }

      // Tier 2: Dead code detection
      // We run BOTH per-file AND project-wide checks:
      // - Per-file: unused local functions/constants (fast, accurate)
      // - Project-wide: unused exports (slower, but catches exported dead code)
      //
      // Per-file checks find unused local functions and constants within the file.
      const deadCodeIssues = detectUnusedLocals(content, filePath);
      
      // Tier 2b: Project-wide dead code check for EXPORTED symbols in this file.
      // This catches exported functions that are never imported anywhere else.
      // We only run this for the changed file to avoid full project scans.
      const exportedDeadCodeIssues: any[] = [];
      const fileSymbols = extractSymbolsAST(content, filePath, fileLang);
      const exportedSymbols = fileSymbols.filter(s => s.isExported);
      
      if (exportedSymbols.length > 0 && context.reverseImportGraph) {
        for (const sym of exportedSymbols) {
          // Skip React components and framework patterns
          if (shouldSkipFrameworkPattern(sym.name)) continue;
          // Skip type exports (interfaces, types) - they might be used as type annotations
          if (sym.type === 'interface' || sym.type === 'type') continue;
          
          // Check if this exported symbol is imported anywhere
          const importers = context.reverseImportGraph.get(filePath);
          if (!importers || importers.length === 0) {
            // File has no importers - all exports are potentially dead
            exportedDeadCodeIssues.push({
              type: "unusedExport",
              severity: "medium",
              message: `Exported ${sym.type} '${sym.name}' is never imported anywhere in the project`,
              line: sym.line,
              file: relativePath,
              suggestion: `Consider removing this export or check if it's used dynamically`,
            });
          } else {
            // File has importers - check if THIS symbol is imported
            let isImported = false;
            for (const importerPath of importers) {
              const importerInfo = context.files.get(importerPath);
              if (importerInfo) {
                for (const imp of importerInfo.imports) {
                  if (imp.namedImports.includes(sym.name) || imp.defaultImport === sym.name) {
                    isImported = true;
                    break;
                  }
                }
              }
              if (isImported) break;
            }
            
            if (!isImported) {
              exportedDeadCodeIssues.push({
                type: "unusedExport",
                severity: "medium",
                message: `Exported ${sym.type} '${sym.name}' is never imported anywhere in the project`,
                line: sym.line,
                file: relativePath,
                suggestion: `Consider removing this export or check if it's used dynamically`,
              });
            }
          }
        }
      }
      
      deadCodeIssues.push(...exportedDeadCodeIssues);

      // Tier 3: API Contract Validation (for service/route files)
      // Debounced to at most once per 30s to avoid full project-wide scans on every keystroke
      let apiContractIssues: any[] = [];
      const isServiceFile = filePath.includes('/services/') || filePath.includes('/api/');
      const isRouteFile = filePath.includes('/routes/') || filePath.includes('/controllers/') ||
        (filePath.includes('/api/') && filePath.endsWith('.py'));
      const apiContractCooldown = Date.now() - this.lastApiContractValidation >= AutoValidator.API_CONTRACT_DEBOUNCE_MS;
      
      if ((isServiceFile || isRouteFile) && apiContractCooldown) {
        logger.debug(`API Contract file changed: ${relativePath} - running contract validation...`);
        this.lastApiContractValidation = Date.now();
        
        // IMPORTANT: Force a fresh context build to pick up the changed routes
        // The cached context may have stale route definitions
        const freshOrchestration = await orchestrateContext({
          projectPath: this.projectPath,
          language: "all",
          forceRebuild: true, // Force rebuild to get latest routes
        });
        
        // Use the fresh context for validation
        const apiContractResult = await validateApiContracts(this.projectPath);
        
        // Only report critical and high severity issues for real-time validation
        apiContractIssues = apiContractResult.issues
          .filter(issue => issue.severity === 'critical' || issue.severity === 'high')
          .map(issue => ({
            type: issue.type,
            severity: issue.severity,
            message: issue.message,
            line: issue.line,
            suggestion: issue.suggestion,
          }));
        
        if (apiContractIssues.length > 0) {
          logger.info(`API Contract validation found ${apiContractIssues.length} issues in ${relativePath}`);
        }
      }

      // Combine all issues for verification
      let allIssues = [...manifestIssues, ...symbolIssues, ...patternIssues, ...deadCodeIssues, ...impactIssues, ...apiContractIssues];

      // === SMART SCOPE FILTERING (NEW) ===
      // Detect file scope and filter issues by relevance
      const fileScope = this.detectFileScope(filePath);
      logger.debug(`File scope detected: ${fileScope} for ${relativePath}`);
      
      // Apply scope-based filtering
      allIssues = this.filterIssuesByScope(allIssues, fileScope, isLenient);
      logger.debug(`After scope filtering: ${allIssues.length} relevant issues`);

      // === AUTOMATED VERIFICATION (eliminates false positives) ===
      if (allIssues.length > 0) {
        logger.debug(`Verifying ${allIssues.length} findings to eliminate false positives...`);
        const verificationResult = await verifyFindingsAutomatically(
          allIssues.filter(i => i.type !== 'deadCode' && i.type !== 'unusedExport' && i.type !== 'unusedFunction' && i.type !== 'orphanedFile') as any,
          allIssues.filter(i => i.type === 'deadCode' || i.type === 'unusedExport' || i.type === 'unusedFunction' || i.type === 'orphanedFile') as any,
          context,
          this.projectPath,
          fileLang,
        );
        
        // Replace with confirmed findings only
        const confirmed = getConfirmedFindings(verificationResult);
        
        // Reconstruct allIssues with verified findings
        allIssues = [
          ...confirmed.hallucinations,
          ...confirmed.deadCode,
        ];
        
        logger.debug(`Verification complete: ${allIssues.length} confirmed (filtered ${verificationResult.stats.falsePositiveCount} false positives)`);
      }

      // === SMART MODE FILTERING ===
      if (isLenient) {
        // In learning/new file mode:
        // 1. Ignore architectural deviations (we are learning patterns)
        allIssues = allIssues.filter(i => i.type !== 'architecturalDeviation');
        
        // 2. Ignore PROJECT-WIDE dead code in new/changing files (orphaned files, etc.)
        // but KEEP per-file local dead code (unusedFunction, unusedExport from detectUnusedLocals)
        // because local unused functions/constants are genuine code hygiene issues
        // that are cheap to detect and valuable to report.
        allIssues = allIssues.filter(i => i.type !== 'deadCode' && i.type !== 'orphanedFile');

        // 3. Filter out "Medium" severity symbol issues
        // BUT keep unusedImport, unusedFunction, and unusedExport warnings
        // - unusedImport: the #1 vibecoder mistake
        // - unusedFunction/unusedExport: local dead code (cheap to detect, high signal)
        allIssues = allIssues.filter(i =>
          i.severity === "critical" ||
          i.severity === "high" ||
          i.type === "unusedImport" ||
          i.type === "unusedFunction" ||
          i.type === "unusedExport"
        );
      }

      if (allIssues.length > 0) {
        const alert = await this.formatAlert(filePath, allIssues, fileLang);
        logger.warn(`Found ${allIssues.length} issues in ${relativePath}`);

        if (this.onAlert) {
          this.onAlert(alert);
        }
      } else {
        logger.info(`No issues found in ${relativePath}`);
        // Notify handler that issues are cleared for this file
        if (this.onAlert) {
          const clearAlert: ValidationAlert = {
            file: relativePath,
            issues: [],
            timestamp: Date.now(),
            llmMessage: `✅ ${this.agentName}: Issues resolved in ${relativePath}`,
          };
          this.onAlert(clearAlert);
        }
      }
    } catch (err) {
      logger.error(`Error validating ${filePath}:`, err);
    }
  }

  private async formatAlert(filePath: string, issues: any[], fileLang: string): Promise<ValidationAlert> {
    const relativePath = path.relative(this.projectPath, filePath);

    // Enrich issues with anti-pattern context (async)
    const enrichedIssues = await enrichIssuesWithAntiPatterns(issues, fileLang);

    // Format issues for LLM consumption
    const issueList = enrichedIssues.map((issue) => ({
      type: issue.type,
      severity: issue.severity,
      message: issue.message,
      suggestion: issue.suggestion,
      line: issue.line,
      antiPattern: issue.antiPattern,
    }));

    // Create a natural language message for the LLM (async for anti-pattern context)
    const llmMessage = await this.createLLMMessage(relativePath, enrichedIssues, fileLang);

    return {
      file: relativePath,
      issues: issueList,
      timestamp: Date.now(),
      llmMessage,
    };
  }

  private async createLLMMessage(file: string, issues: any[], fileLang: string): Promise<string> {
    const critical = issues.filter((i) => i.severity === "critical" || i.severity === "high");
    const count = issues.length;
    
    const task = `There are ${count} issue(s) detected in \`${file}\`. ${critical.length > 0 ? `**${critical.length} issues are CRITICAL.**` : ""} Review the following issues and provide fixes according to the project context.`;
    
    // Use role-based prompting
    const roleMsg = PROMPT_PATTERNS.role(this.agentName, task);
    
    // Include validation constraints from the library
    const constrainedMsg = PROMPT_PATTERNS.withConstraints(roleMsg, VALIDATION_CONSTRAINTS);
    
    // Add specific issues
    const issuesList = issues.map((i, idx) => {
      let item = `${idx + 1}. [${i.severity.toUpperCase()}] ${i.type}: ${i.message}`;
      if (i.line) item += ` (Line ${i.line})`;
      if (i.suggestion) item += `\n   Suggestion: ${i.suggestion}`;
      // Include anti-pattern context if available
      if (i.antiPattern) {
        item += `\n   📚 ${i.antiPattern.id}: ${i.antiPattern.name} - ${i.antiPattern.description}`;
      }
      return item;
    }).join("\n");

    // Generate anti-pattern context for LLM
    const antiPatternContext = await generateAntiPatternContext(issues, fileLang);
    
    let message = `${constrainedMsg}\n\nDETECTED ISSUES:\n${issuesList}`;
    
    // Append anti-pattern guidance if relevant
    if (antiPatternContext) {
      message += `\n\n${antiPatternContext}`;
    }
    
    return message;
  }

  getStatus(): { watching: boolean; projectPath: string; name: string } {
    return {
      ...this.watcher.getStatus(),
      name: this.agentName,
    };
  }
}
