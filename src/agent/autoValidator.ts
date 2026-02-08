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
import { detectDeadCode } from "../tools/validation/deadCode.js";
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
      // Full-stack: load both TS/JS and Python manifests
      this.tsManifest = await loadManifestDependencies(this.projectPath, "typescript");
      this.pyManifest = await loadManifestDependencies(this.projectPath, "python");
      this.pythonExports = await loadPythonModuleExports(this.projectPath);
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

    // Quick heuristic: check for common full-stack markers
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

    // Also check for backend/frontend directory patterns
    const dirChecks = [
      { path: "backend", lang: "python" },
      { path: "server", lang: "python" },
      { path: "frontend", lang: "typescript" },
      { path: "client", lang: "typescript" },
    ];

    for (const check of dirChecks) {
      try {
        const stat = await fs.stat(path.join(this.projectPath, check.path));
        if (stat.isDirectory()) {
          if (check.lang === "python") hasPython = true;
          if (check.lang === "typescript") hasTypeScript = true;
        }
      } catch {
        // Not found
      }
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
      // In lenient mode, only show critical and high severity issues
      return issues.filter(issue => 
        issue.severity === 'critical' || issue.severity === 'high'
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
      const deadCodeIssues = await detectDeadCode(context);

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
    } catch (err) {
      logger.error("Error running initial health check:", err);
    }
  }

  private createInitialScanMessage(deadCodeIssues: any[]): string {
    return `📋 **${this.agentName}: Initial Scan Complete** - Found **${deadCodeIssues.length} potential issues** in existing codebase. Use 'get_guardian_alerts' to see details.`;
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

    // Track new files and refresh context
    if (event.type === "add") {
      this.newFilesTracked.add(event.path);
      this.projectFileCount++;
      
      // Refresh context when new files are added
      logger.debug(`New file detected: ${event.path} (${fileLang}) - refreshing context...`);
      refreshFileContext(this.projectPath, event.path, { language: refreshLang }).catch((err) => {
        logger.warn(`Failed to refresh context for new file ${event.path}:`, err);
      });
      
      // Check if we should exit learning mode
      if (this.mode === "auto" && this.projectFileCount >= AutoValidator.LEARNING_MODE_FILE_COUNT) {
        // Only switch if we were previously in learning mode (implied by auto + threshold)
        // But for simplicity, we just let the next detectProjectMode call handle it
      }
    } else if (event.type === "change") {
      // Refresh context when files are modified so symbols/imports stay current
      logger.debug(`File modified: ${event.path} (${fileLang}) - refreshing context...`);
      refreshFileContext(this.projectPath, event.path, { language: refreshLang }).catch((err) => {
        logger.warn(`Failed to refresh context for modified file ${event.path}:`, err);
      });
    } else if (event.type === "unlink") {
      this.newFilesTracked.delete(event.path);
      this.projectFileCount = Math.max(0, this.projectFileCount - 1);
      
      // Incrementally remove deleted file from context (not a full invalidation)
      logger.debug(`File deleted: ${event.path} (${fileLang}) - removing from context...`);
      refreshFileContext(this.projectPath, event.path, { language: refreshLang }).catch((err) => {
        logger.warn(`Failed to remove deleted file ${event.path} from context:`, err);
      });
    }

    // Debounce rapid changes to the same file
    const existingTimer = this.debounceTimers.get(event.path);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      this.validateFile(event.path);
      this.debounceTimers.delete(event.path);
    }, 500);

    this.debounceTimers.set(event.path, timer);
  }

  private async validateFile(filePath: string): Promise<void> {
    try {
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
      const imports = extractImportsAST(content, fileLang);
      const usedSymbols = extractUsagesAST(content, fileLang, imports);
      const symbolTable = buildSymbolTable(context, orchestration.relevantSymbols);
      
      // Extract type references for unused import detection
      // This is essential for TypeScript where imports might only be used as types
      const typeReferences = (fileLang === "typescript" || fileLang === "javascript") ? 
        (await import("../tools/validation/extractors/index.js")).extractTypeReferencesAST(content, fileLang) : 
        [];

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

      // Tier 2: Check for dead code (REMOVED 50-line limit - vibecoders write small files!)
      // Always run dead code detection to catch:
      // - Unused imports (most common vibecoder mistake)
      // - Orphaned exports (exports with no importers)
      // - Unused functions/constants
      let deadCodeIssues: any[] = [];
      deadCodeIssues = await detectDeadCode(context, content);

      // Tier 3: API Contract Validation (for service/route files)
      let apiContractIssues: any[] = [];
      const isServiceFile = filePath.includes('/services/') || filePath.includes('/api/');
      const isRouteFile = filePath.includes('/api/') && filePath.endsWith('.py');
      
      if (isServiceFile || isRouteFile) {
        logger.debug(`API Contract file changed: ${relativePath} - running contract validation...`);
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
        
        // 2. Ignore dead code in new/changing files
        allIssues = allIssues.filter(i => i.type !== 'deadCode' && i.type !== 'unusedExport' && i.type !== 'unusedFunction' && i.type !== 'orphanedFile');

        // 3. Filter out "Medium" severity symbol issues
        // BUT keep unusedImport warnings - they're the #1 vibecoder mistake!
        allIssues = allIssues.filter(i => 
          i.severity === "critical" || 
          i.severity === "high" || 
          i.type === "unusedImport"  // Always catch unused imports, even in learning mode
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
