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
import { invalidateContext, refreshFileContext } from "../context/projectContext.js";
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

  // Thresholds for smart mode
  private static readonly NEW_PROJECT_THRESHOLD = 5; // Less than 5 files = new project
  private static readonly LEARNING_MODE_FILE_COUNT = 10; // After 10 files created, switch to strict

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

    // Pre-build context for existing codebase (use cache by default)
    logger.info("Loading project context...");
    const orchestration = await orchestrateContext({
      projectPath: this.projectPath,
      language: this.language,
    });
    const context = orchestration.projectContext;
    logger.info("Context built.");

    // Detect project type
    this.projectFileCount = context.files?.size || 0;
    const detectedMode = this.detectProjectMode();
    logger.info(`VibeGuard Initialized: Found ${this.projectFileCount} files in ${this.projectPath}`);
    logger.info(`Operating Mode: ${detectedMode} (Language: ${this.language})`);

    // Load manifest and Python exports
    logger.info("Loading dependency manifests...");
    this.manifest = await loadManifestDependencies(this.projectPath, this.language);
    if (this.language === "python") {
        this.pythonExports = await loadPythonModuleExports(this.projectPath);
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
      // Run dead code detection on existing codebase
      const deadCodeIssues = await detectDeadCode(context);

      if (deadCodeIssues.length > 0) {
        const alert: ValidationAlert = {
          file: "INITIAL_SCAN",
          issues: deadCodeIssues.map((dc) => ({
            type: "deadCode",
            severity: dc.severity,
            message: dc.message,
            suggestion: (dc as any).suggestion,
            line: (dc as any).line,
          })),
          timestamp: Date.now(),
          llmMessage: this.createInitialScanMessage(deadCodeIssues),
          isInitialScan: true,
        };

        logger.info(`Initial scan found ${deadCodeIssues.length} issues in existing codebase`);

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

  stop(): void {
    this.watcher.stop();
    this.debounceTimers.forEach((timer) => clearTimeout(timer));
    this.debounceTimers.clear();
  }

  private handleFileChange(event: FileChangeEvent): void {
    // Track new files
    if (event.type === "add") {
      this.newFilesTracked.add(event.path);
      this.projectFileCount++;
      
      // Check if we should exit learning mode
      if (this.mode === "auto" && this.projectFileCount >= AutoValidator.LEARNING_MODE_FILE_COUNT) {
        // Only switch if we were previously in learning mode (implied by auto + threshold)
        // But for simplicity, we just let the next detectProjectMode call handle it
      }
    } else if (event.type === "unlink") {
      this.newFilesTracked.delete(event.path);
      this.projectFileCount = Math.max(0, this.projectFileCount - 1);
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

      const content = await fs.readFile(filePath, "utf-8");
      const relativePath = path.relative(this.projectPath, filePath);

      logger.info(`Auto-validating (${isLenient ? "Lenient" : "Strict"}): ${relativePath}`);

      // Use orchestrateContext (Augment Secrets)
      const orchestration = await orchestrateContext({
        projectPath: this.projectPath,
        language: this.language,
        currentFile: filePath,
      });
      const context = orchestration.projectContext;

      // Extract symbols and imports from the changed file
      const imports = extractImportsAST(content, this.language);
      const usedSymbols = extractUsagesAST(content, this.language, imports);
      const symbolTable = buildSymbolTable(context, orchestration.relevantSymbols);

      // Tier 0: Check manifest dependencies (if manifest loaded)
      let manifestIssues: any[] = [];
      if (this.manifest) {
          manifestIssues = validateManifest(imports, this.manifest, content);
      }

      // Tier 1: Validate symbols (hallucination detection)
      let symbolIssues = validateSymbols(
        usedSymbols,
        symbolTable,
        content,
        this.language,
        false, // strictMode
        imports,
        this.pythonExports,
        context,
        filePath
      );

      // Validate usage patterns (architectural consistency)
      let patternIssues = validateUsagePatterns(usedSymbols, context);

      // Tier 1.5: Change Impact Analysis (Blast Radius) - Proactive Alerting
      let impactIssues: any[] = [];
      if (context.symbolGraph) {
        const symbolsInFile = extractSymbolsAST(content, filePath, this.language);
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

      // Tier 2: Check for dead code (only if file is substantial > 50 lines)
      let deadCodeIssues: any[] = [];
      if (content.split('\n').length > 50) {
          deadCodeIssues = await detectDeadCode(context, content);
      }

      // === SMART MODE FILTERING ===
      if (isLenient) {
        // In learning/new file mode:
        // 1. Ignore architectural deviations (we are learning patterns)
        patternIssues = []; 
        
        // 2. Ignore dead code in new/changing files
        deadCodeIssues = [];

        // 3. Filter out "Medium" severity symbol issues
        symbolIssues = symbolIssues.filter(i => i.severity === "critical" || i.severity === "high");
      }

      const allIssues = [...manifestIssues, ...symbolIssues, ...patternIssues, ...deadCodeIssues, ...impactIssues];

      if (allIssues.length > 0) {
        const alert = this.formatAlert(filePath, allIssues);
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

  private formatAlert(filePath: string, issues: any[]): ValidationAlert {
    const relativePath = path.relative(this.projectPath, filePath);

    // Format issues for LLM consumption
    const issueList = issues.map((issue) => ({
      type: issue.type,
      severity: issue.severity,
      message: issue.message,
      suggestion: issue.suggestion,
      line: issue.line,
    }));

    // Create a natural language message for the LLM
    const llmMessage = this.createLLMMessage(relativePath, issues);

    return {
      file: relativePath,
      issues: issueList,
      timestamp: Date.now(),
      llmMessage,
    };
  }

  private createLLMMessage(file: string, issues: any[]): string {
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
      return item;
    }).join("\n");
    
    return `${constrainedMsg}\n\nDETECTED ISSUES:\n${issuesList}`;
  }

  getStatus(): { watching: boolean; projectPath: string; name: string } {
    return {
      ...this.watcher.getStatus(),
      name: this.agentName,
    };
  }
}
