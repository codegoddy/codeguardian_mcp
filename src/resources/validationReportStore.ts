/**
 * Validation Report Store
 *
 * In-memory store for validation reports, exposed via MCP Resources.
 * This allows LLMs to receive a compact URI instead of massive JSON blobs.
 *
 * Reports are saved in TWO locations:
 * 1. `.codeguardian/reports/` - internal cache (gitignored)
 * 2. `codeguardian-report.json` - LLM-readable file at project root (NOT gitignored)
 *
 * The LLM-readable file allows AI assistants to access results via standard
 * file-reading tools, even when `.codeguardian/` is in `.gitignore`.
 *
 * @format
 */

import { logger } from '../utils/logger.js';
import * as fs from 'fs/promises';
import * as path from 'path';

const REPORTS_DIR = ".codeguardian/reports";

/**
 * The LLM-readable report filename.
 * This is placed at the project root, outside `.codeguardian/`, so that
 * LLM file-reading tools (which often respect .gitignore) can access it.
 */
const LLM_REPORT_FILENAME = "codeguardian-report.json";

// ============================================================================
// Types
// ============================================================================

export interface ValidationReportChunk {
  chunkIndex: number;
  totalChunks: number;
  type: 'hallucinations' | 'dead_code' | 'summary' | 'full';
  data: any;
}

export interface StoredReport {
  jobId: string;
  createdAt: number;
  expiresAt: number;
  summary: any;
  stats: any;
  hallucinations: any[];
  deadCode: any[];
  score?: number;
  recommendation?: any;
}

// ============================================================================
// Report Store
// ============================================================================

class ValidationReportStore {
  private reports: Map<string, StoredReport> = new Map();
  private readonly TTL = 24 * 60 * 60 * 1000; // 24 hours
  private cleanupInterval?: ReturnType<typeof setInterval>;
  private readonly CHUNK_SIZE = 25; // Issues per chunk
  private reportsDir: string;

  // Map from jobId → projectPath for tracking which project owns which report
  private jobProjectMap: Map<string, string> = new Map();

  constructor(baseDir: string = REPORTS_DIR) {
    this.reportsDir = baseDir;
    
    // Initialize persistence (non-blocking, with error handling)
    this.initializePersistence().then(() => {
        // Start cleanup interval after initialization
        this.cleanupInterval = setInterval(() => this.cleanup(), 60 * 1000);
        // Don't keep the process alive just for periodic cleanup
        this.cleanupInterval.unref?.();
    }).catch((err) => {
        logger.error("Failed to initialize report store persistence:", err);
        // Still start cleanup even if persistence failed
        this.cleanupInterval = setInterval(() => this.cleanup(), 60 * 1000);
        // Don't keep the process alive just for periodic cleanup
        this.cleanupInterval.unref?.();
    });
  }

  /**
   * Initialize persistence (create directories and load existing)
   */
  private async initializePersistence(): Promise<void> {
    try {
      await fs.mkdir(this.reportsDir, { recursive: true });
      logger.info(`Report persistence initialized: ${this.reportsDir}`);
      await this.loadAllReports();
    } catch (error) {
      logger.error("Failed to initialize report persistence:", error);
    }
  }

  /**
   * Save report to disk in the project-specific directory.
   *
   * Saves to TWO locations:
   * 1. `.codeguardian/reports/{jobId}.json` - internal cache (gitignored)
   * 2. `codeguardian-report.json` - LLM-readable file at project root
   *
   * The LLM-readable file is placed OUTSIDE `.codeguardian/` so that
   * AI assistants using file-reading tools (which often respect .gitignore)
   * can still access the validation results.
   */
  private async saveReportToDisk(projectPath: string, report: StoredReport): Promise<void> {
    try {
      // 1. Save to internal cache (.codeguardian/reports/)
      const reportsDir = path.resolve(projectPath, ".codeguardian/reports");
      await fs.mkdir(reportsDir, { recursive: true });
      
      const filePath = path.join(reportsDir, `${report.jobId}.json`);
      await fs.writeFile(filePath, JSON.stringify(report, null, 2), "utf-8");
      
      logger.info(`Report saved to project disk: ${filePath}`);

      // 2. Save LLM-readable report to project root (outside .codeguardian/)
      await this.saveLLMReadableReport(projectPath, report);
    } catch (error) {
      logger.error(`Failed to save report ${report.jobId} to project ${projectPath}:`, error);
    }
  }

  /**
   * Save an LLM-readable report file at the project root.
   *
   * This file is NOT inside `.codeguardian/` so it can be read by
   * LLM file-reading tools that respect `.gitignore`.
   *
   * The file is intentionally compact: it includes the summary, score,
   * recommendation, and the full issues list. For very large reports,
   * the LLM can use pagination via the MCP Resources API.
   */
  private async saveLLMReadableReport(projectPath: string, report: StoredReport): Promise<void> {
    try {
      const resolvedPath = path.resolve(projectPath);
      const llmReportPath = path.join(resolvedPath, LLM_REPORT_FILENAME);
      
      // Build a compact but complete report
      const llmReport = {
        _meta: {
          generatedBy: "CodeGuardian MCP",
          generatedAt: new Date(report.createdAt).toISOString(),
          purpose: "LLM-readable validation report. This file is placed outside .codeguardian/ so AI assistants can read it.",
          jobId: report.jobId,
          expiresAt: new Date(report.expiresAt).toISOString(),
        },
        summary: report.summary,
        stats: report.stats,
        score: report.score,
        recommendation: report.recommendation,
        hallucinations: report.hallucinations,
        deadCode: report.deadCode,
      };

      await fs.writeFile(llmReportPath, JSON.stringify(llmReport, null, 2), "utf-8");
      logger.info(`LLM-readable report saved: ${llmReportPath}`);
    } catch (error) {
      logger.error(`Failed to save LLM-readable report for ${report.jobId}:`, error);
    }
  }

  /**
   * Get the path to the LLM-readable report file for a project
   */
  getLLMReportPath(projectPath: string): string {
    return path.join(path.resolve(projectPath), LLM_REPORT_FILENAME);
  }

  /**
   * Get the project path associated with a job
   */
  getJobProjectPath(jobId: string): string | undefined {
    return this.jobProjectMap.get(jobId);
  }

  /**
   * Delete report from disk
   */
  private async deleteReportFromDisk(jobId: string): Promise<void> {
    const projectPath = this.jobProjectMap.get(jobId);
    if (!projectPath) return;

    try {
      // Delete from internal cache
      const filePath = path.join(path.resolve(projectPath), ".codeguardian/reports", `${jobId}.json`);
      await fs.unlink(filePath).catch(() => {});

      // Note: We don't delete the LLM-readable report here because it may have been
      // overwritten by a newer validation run. It will be overwritten on next validation.
      logger.debug(`Report deleted from disk: ${jobId}`);
    } catch (error) {
      // Ignore deletion errors
    }

    this.jobProjectMap.delete(jobId);
  }

  /**
   * Load all reports from disk by scanning known project paths
   * from guardian persistence configs.
   */
  private async loadAllReports(): Promise<void> {
    try {
      // Try to load guardian configs to discover project paths
      const { guardianPersistence } = await import('../agent/guardianPersistence.js');
      const configs = await guardianPersistence.loadAllGuardians();
      
      const projectPaths = new Set<string>();
      for (const config of configs) {
        projectPaths.add(config.projectPath);
      }

      // Scan each project's .codeguardian/reports/ directory
      for (const projectPath of projectPaths) {
        try {
          const reportsDir = path.resolve(projectPath, ".codeguardian/reports");
          const files = await fs.readdir(reportsDir);
          
          for (const file of files) {
            if (!file.endsWith('.json')) continue;
            
            try {
              const content = await fs.readFile(path.join(reportsDir, file), 'utf-8');
              const report = JSON.parse(content) as StoredReport;
              
              // Skip expired reports
              if (report.expiresAt < Date.now()) {
                logger.debug(`Skipping expired report: ${report.jobId}`);
                continue;
              }

              this.reports.set(report.jobId, report);
              this.jobProjectMap.set(report.jobId, projectPath);
              logger.debug(`Loaded persisted report: ${report.jobId}`);
            } catch (err) {
              logger.warn(`Failed to load report file ${file}:`, err);
            }
          }
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
            logger.warn(`Failed to scan reports in ${projectPath}:`, err);
          }
        }
      }

      if (this.reports.size > 0) {
        logger.info(`Loaded ${this.reports.size} persisted validation report(s) from disk`);
      }
    } catch (error) {
      logger.warn("Failed to load persisted reports:", error);
    }
  }

  /**
   * Store a validation report
   * 
   * IMPORTANT: This method is async and waits for the report to be written to disk.
   * This ensures the file exists immediately when the method resolves.
   */
  async store(jobId: string, projectPath: string, report: Omit<StoredReport, 'jobId' | 'createdAt' | 'expiresAt'>): Promise<string> {
    const now = Date.now();
    const storedReport: StoredReport = {
      jobId,
      createdAt: now,
      expiresAt: now + this.TTL,
      ...report,
    };

    this.reports.set(jobId, storedReport);
    
    // Track project path for this job
    if (projectPath) {
      this.jobProjectMap.set(jobId, path.resolve(projectPath));
    }
    
    // Save to the specific project path and wait for it to complete
    // This ensures the file exists immediately when the method returns
    // Saves to BOTH .codeguardian/reports/ AND codeguardian-report.json (LLM-readable)
    if (projectPath) {
      try {
        await this.saveReportToDisk(projectPath, storedReport);
      } catch (err) {
        logger.error(`Failed to save report to ${projectPath}:`, err);
        // Don't throw - we still have the report in memory
      }
    }
    
    logger.info(`Stored validation report for job ${jobId}`);

    return this.getReportUri(jobId);
  }

  /**
   * Get the resource URI for a report
   */
  getReportUri(jobId: string): string {
    return `codeguardian://validation-report/${jobId}`;
  }

  /**
   * Get a stored report
   */
  get(jobId: string): StoredReport | undefined {
    return this.reports.get(jobId);
  }

  /**
   * Check if a report exists
   */
  has(jobId: string): boolean {
    return this.reports.has(jobId);
  }

  /**
   * Get report summary (lightweight)
   */
  getSummary(jobId: string): object | undefined {
    const report = this.reports.get(jobId);
    if (!report) return undefined;

    return {
      jobId,
      uri: this.getReportUri(jobId),
      summary: report.summary,
      stats: report.stats,
      score: report.score,
      recommendation: report.recommendation,
      totalHallucinations: report.hallucinations.length,
      totalDeadCode: report.deadCode.length,
      availableChunks: {
        hallucinations: Math.ceil(report.hallucinations.length / this.CHUNK_SIZE),
        deadCode: Math.ceil(report.deadCode.length / this.CHUNK_SIZE),
      },
      createdAt: new Date(report.createdAt).toISOString(),
      expiresAt: new Date(report.expiresAt).toISOString(),
    };
  }

  /**
   * Get a chunk of hallucinations
   */
  getHallucinationsChunk(jobId: string, chunkIndex: number): ValidationReportChunk | undefined {
    const report = this.reports.get(jobId);
    if (!report) return undefined;

    const totalChunks = Math.ceil(report.hallucinations.length / this.CHUNK_SIZE);
    const start = chunkIndex * this.CHUNK_SIZE;
    const end = start + this.CHUNK_SIZE;
    const data = report.hallucinations.slice(start, end);

    return {
      chunkIndex,
      totalChunks,
      type: 'hallucinations',
      data,
    };
  }

  /**
   * Get a chunk of dead code
   */
  getDeadCodeChunk(jobId: string, chunkIndex: number): ValidationReportChunk | undefined {
    const report = this.reports.get(jobId);
    if (!report) return undefined;

    const totalChunks = Math.ceil(report.deadCode.length / this.CHUNK_SIZE);
    const start = chunkIndex * this.CHUNK_SIZE;
    const end = start + this.CHUNK_SIZE;
    const data = report.deadCode.slice(start, end);

    return {
      chunkIndex,
      totalChunks,
      type: 'dead_code',
      data,
    };
  }

  /**
   * Get filtered issues (with severity, file, etc.)
   */
  getFilteredIssues(
    jobId: string,
    options: {
      type?: 'hallucinations' | 'dead_code';
      severity?: string;
      file?: string;
      limit?: number;
      offset?: number;
    } = {}
  ): { issues: any[]; total: number; hasMore: boolean } | undefined {
    const report = this.reports.get(jobId);
    if (!report) return undefined;

    const { type, severity, file, limit = 25, offset = 0 } = options;

    let issues: any[] = [];

    if (!type || type === 'hallucinations') {
      issues = issues.concat(report.hallucinations.map(h => ({ ...h, _type: 'hallucination' })));
    }
    if (!type || type === 'dead_code') {
      issues = issues.concat(report.deadCode.map(d => ({ ...d, _type: 'dead_code' })));
    }

    // Apply filters
    if (severity) {
      issues = issues.filter(i => i.severity === severity);
    }
    if (file) {
      const fileLower = file.toLowerCase();
      issues = issues.filter(i => i.file?.toLowerCase().includes(fileLower));
    }

    const total = issues.length;
    const paged = issues.slice(offset, offset + limit);

    return {
      issues: paged,
      total,
      hasMore: offset + limit < total,
    };
  }

  /**
   * Get issues categorized by severity
   * Returns: { critical: [...], high: [...], medium: [...], low: [...], warning: [...] }
   */
  getBySeverity(jobId: string): Record<string, any[]> | undefined {
    const report = this.reports.get(jobId);
    if (!report) return undefined;

    const allIssues = [
      ...report.hallucinations.map(h => ({ ...h, _category: 'hallucination' })),
      ...report.deadCode.map(d => ({ ...d, _category: 'dead_code' })),
    ];

    const categories: Record<string, any[]> = {
      critical: [],
      high: [],
      medium: [],
      low: [],
      warning: [],
    };

    for (const issue of allIssues) {
      const severity = issue.severity || 'low';
      if (categories[severity]) {
        categories[severity].push(issue);
      } else {
        categories.low.push(issue);
      }
    }

    return categories;
  }

  /**
   * Get issues categorized by type
   * Returns: { dependencyHallucination: [...], nonExistentFunction: [...], deadCode: [...], etc. }
   */
  getByType(jobId: string): Record<string, any[]> | undefined {
    const report = this.reports.get(jobId);
    if (!report) return undefined;

    const categories: Record<string, any[]> = {};

    for (const issue of report.hallucinations) {
      const type = issue.type || 'unknown';
      if (!categories[type]) categories[type] = [];
      categories[type].push(issue);
    }

    // Dead code is its own category
    if (report.deadCode.length > 0) {
      categories['deadCode'] = report.deadCode;
    }

    return categories;
  }

  /**
   * Get issues categorized by file
   * Returns: { "src/foo.ts": [...], "src/bar.ts": [...], etc. }
   */
  getByFile(jobId: string): Record<string, any[]> | undefined {
    const report = this.reports.get(jobId);
    if (!report) return undefined;

    const categories: Record<string, any[]> = {};

    const allIssues = [
      ...report.hallucinations,
      ...report.deadCode,
    ];

    for (const issue of allIssues) {
      const file = issue.file || 'unknown';
      if (!categories[file]) categories[file] = [];
      categories[file].push(issue);
    }

    return categories;
  }

  /**
   * Get a categorized summary (counts only, no full issue data)
   * Lightweight for LLM decision-making on what to fetch next.
   */
  getCategorizedSummary(jobId: string): object | undefined {
    const report = this.reports.get(jobId);
    if (!report) return undefined;

    const bySeverity = this.getBySeverity(jobId)!;
    const byType = this.getByType(jobId)!;
    const byFile = this.getByFile(jobId)!;

    return {
      jobId,
      uri: this.getReportUri(jobId),
      score: report.score,
      recommendation: report.recommendation,
      totalIssues: report.hallucinations.length + report.deadCode.length,
      bySeverity: {
        critical: bySeverity.critical.length,
        high: bySeverity.high.length,
        medium: bySeverity.medium.length,
        low: bySeverity.low.length,
        warning: bySeverity.warning.length,
      },
      byType: Object.fromEntries(
        Object.entries(byType).map(([type, issues]) => [type, issues.length])
      ),
      byFile: Object.fromEntries(
        Object.entries(byFile)
          .sort((a, b) => b[1].length - a[1].length) // Most issues first
          .slice(0, 10) // Top 10 files
          .map(([file, issues]) => [file, issues.length])
      ),
      topAffectedFiles: Object.entries(byFile)
        .sort((a, b) => b[1].length - a[1].length)
        .slice(0, 5)
        .map(([file, issues]) => ({ file, count: issues.length })),
      availableCategories: {
        severities: ['critical', 'high', 'medium', 'low', 'warning'],
        types: Object.keys(byType),
        files: Object.keys(byFile).slice(0, 20), // First 20 files
      },
    };
  }

  /**
   * List all available reports
   */
  list(): Array<{ jobId: string; uri: string; createdAt: string; totalIssues: number }> {
    return Array.from(this.reports.values())
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(r => ({
        jobId: r.jobId,
        uri: this.getReportUri(r.jobId),
        createdAt: new Date(r.createdAt).toISOString(),
        totalIssues: r.hallucinations.length + r.deadCode.length,
      }));
  }

  /**
   * Cleanup expired reports
   */
  private async cleanup(): Promise<void> {
    try {
      const now = Date.now();
      let cleaned = 0;

      for (const [jobId, report] of this.reports.entries()) {
        if (report.expiresAt < now) {
          this.reports.delete(jobId);
          await this.deleteReportFromDisk(jobId);
          cleaned++;
        }
      }

      if (cleaned > 0) {
        logger.info(`Cleaned up ${cleaned} expired validation reports`);
      }
    } catch (error) {
       logger.error("Error during report cleanup:", error);
    }
  }

  /**
   * Shutdown
   */
  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
  }
}

// Singleton export
export const validationReportStore = new ValidationReportStore();
