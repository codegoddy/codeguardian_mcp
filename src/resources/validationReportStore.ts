/**
 * Validation Report Store
 * 
 * In-memory store for validation reports, exposed via MCP Resources.
 * This allows LLMs to receive a compact URI instead of massive JSON blobs.
 * 
 * @format
 */

import { logger } from '../utils/logger.js';
import * as fs from 'fs/promises';
import * as path from 'path';

const REPORTS_DIR = ".codeguardian/reports";

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

  constructor(baseDir: string = REPORTS_DIR) {
    this.reportsDir = baseDir;
    
    // Initialize persistence
    this.initializePersistence().then(() => {
        // Start cleanup interval after initialization
        this.cleanupInterval = setInterval(() => this.cleanup(), 60 * 1000);
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
   * Save report to disk in the project-specific directory
   */
  private async saveReportToDisk(projectPath: string, report: StoredReport): Promise<void> {
    try {
      const reportsDir = path.resolve(projectPath, ".codeguardian/reports");
      await fs.mkdir(reportsDir, { recursive: true });
      
      const filePath = path.join(reportsDir, `${report.jobId}.json`);
      await fs.writeFile(filePath, JSON.stringify(report, null, 2), "utf-8");
      
      logger.info(`Report saved to project disk: ${filePath}`);
    } catch (error) {
      logger.error(`Failed to save report ${report.jobId} to project ${projectPath}:`, error);
    }
  }

  /**
   * Delete report from disk (best effort across known paths or just memory cleanup)
   */
  private async deleteReportFromDisk(jobId: string): Promise<void> {
    // Note: Deleting from project disk is complex if we don't track which project owned which job
    // For now, we mainly manage the in-memory life and the initial save.
  }

  /**
   * Load all reports from disk
   * (Simplified: for now we focus on active session reports, but we could scan known project paths)
   */
  private async loadAllReports(): Promise<void> {
    // This could be enhanced to scan the current directory's .codeguardian/reports if needed
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
    
    // Save to the specific project path and wait for it to complete
    // This ensures the file exists immediately when the method returns
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
