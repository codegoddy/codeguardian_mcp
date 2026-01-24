/**
 * Incremental Validation
 *
 * Validates only what changed since last validation, making iterative
 * development much faster. Inspired by Augment Code's edit event tracking.
 *
 * @format
 */

import { logger } from "../utils/logger.js";
import type { ValidationIssue, DeadCodeIssue } from "./validation/types.js";

export interface ValidationSnapshot {
  code: string;
  timestamp: number;
  issues: ValidationIssue[];
  deadCode: DeadCodeIssue[];
  hash: string;
}

export interface CodeChange {
  type: "addition" | "modification" | "deletion";
  startLine: number;
  endLine: number;
  oldContent?: string;
  newContent?: string;
}

class IncrementalValidationClass {
  private snapshots = new Map<string, ValidationSnapshot>();
  private readonly MAX_SNAPSHOTS = 10;
  private readonly SNAPSHOT_TTL_MS = 30 * 60 * 1000; // 30 minutes

  /**
   * Save validation snapshot for incremental validation
   */
  saveSnapshot(
    sessionId: string,
    code: string,
    issues: ValidationIssue[],
    deadCode: DeadCodeIssue[],
  ): void {
    const hash = this.hashCode(code);
    const snapshot: ValidationSnapshot = {
      code,
      timestamp: Date.now(),
      issues,
      deadCode,
      hash,
    };

    this.snapshots.set(sessionId, snapshot);

    // Cleanup old snapshots
    if (this.snapshots.size > this.MAX_SNAPSHOTS) {
      const oldest = Array.from(this.snapshots.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp)[0];
      this.snapshots.delete(oldest[0]);
    }

    // Cleanup expired snapshots
    this.cleanupExpiredSnapshots();
  }

  /**
   * Get previous snapshot for comparison
   */
  getSnapshot(sessionId: string): ValidationSnapshot | null {
    const snapshot = this.snapshots.get(sessionId);
    if (!snapshot) return null;

    // Check if expired
    if (Date.now() - snapshot.timestamp > this.SNAPSHOT_TTL_MS) {
      this.snapshots.delete(sessionId);
      return null;
    }

    return snapshot;
  }

  /**
   * Detect what changed between two code versions
   */
  detectChanges(oldCode: string, newCode: string): CodeChange[] {
    const oldLines = oldCode.split("\n");
    const newLines = newCode.split("\n");
    const changes: CodeChange[] = [];

    // Simple line-by-line diff
    let i = 0;
    let j = 0;

    while (i < oldLines.length || j < newLines.length) {
      if (i >= oldLines.length) {
        // Addition at end
        changes.push({
          type: "addition",
          startLine: j + 1,
          endLine: newLines.length,
          newContent: newLines.slice(j).join("\n"),
        });
        break;
      }

      if (j >= newLines.length) {
        // Deletion at end
        changes.push({
          type: "deletion",
          startLine: i + 1,
          endLine: oldLines.length,
          oldContent: oldLines.slice(i).join("\n"),
        });
        break;
      }

      if (oldLines[i] === newLines[j]) {
        // No change
        i++;
        j++;
        continue;
      }

      // Find next matching line
      const nextMatchOld = this.findNextMatch(oldLines, i, newLines[j]);
      const nextMatchNew = this.findNextMatch(newLines, j, oldLines[i]);

      if (nextMatchOld !== -1 && nextMatchOld < nextMatchNew) {
        // Deletion
        changes.push({
          type: "deletion",
          startLine: i + 1,
          endLine: nextMatchOld,
          oldContent: oldLines.slice(i, nextMatchOld).join("\n"),
        });
        i = nextMatchOld;
      } else if (nextMatchNew !== -1) {
        // Addition
        changes.push({
          type: "addition",
          startLine: j + 1,
          endLine: nextMatchNew,
          newContent: newLines.slice(j, nextMatchNew).join("\n"),
        });
        j = nextMatchNew;
      } else {
        // Modification
        changes.push({
          type: "modification",
          startLine: i + 1,
          endLine: i + 1,
          oldContent: oldLines[i],
          newContent: newLines[j],
        });
        i++;
        j++;
      }
    }

    return changes;
  }

  /**
   * Check if validation can be incremental
   */
  canUseIncremental(
    sessionId: string,
    newCode: string,
  ): { canUse: boolean; snapshot?: ValidationSnapshot; changes?: CodeChange[] } {
    const snapshot = this.getSnapshot(sessionId);
    if (!snapshot) {
      return { canUse: false };
    }

    // Check if code is too different (> 30% changed)
    const changes = this.detectChanges(snapshot.code, newCode);
    const totalLines = newCode.split("\n").length;
    const changedLines = changes.reduce(
      (sum, change) => sum + (change.endLine - change.startLine + 1),
      0,
    );

    if (changedLines / totalLines > 0.3) {
      logger.debug(
        `Too many changes (${changedLines}/${totalLines} lines), full validation needed`,
      );
      return { canUse: false };
    }

    return { canUse: true, snapshot, changes };
  }

  /**
   * Filter issues to only those affected by changes
   */
  filterAffectedIssues(
    oldIssues: ValidationIssue[],
    changes: CodeChange[],
  ): ValidationIssue[] {
    const affectedLines = new Set<number>();

    for (const change of changes) {
      for (let line = change.startLine; line <= change.endLine; line++) {
        affectedLines.add(line);
      }
    }

    // Keep issues that are NOT in affected lines (they're still valid)
    return oldIssues.filter((issue) => {
      if (!issue.line) return true; // Keep issues without line numbers
      return !affectedLines.has(issue.line);
    });
  }

  /**
   * Clear all snapshots
   */
  clear(): void {
    this.snapshots.clear();
  }

  /**
   * Simple hash function for code
   */
  private hashCode(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(36);
  }

  /**
   * Find next matching line
   */
  private findNextMatch(
    lines: string[],
    start: number,
    target: string,
  ): number {
    for (let i = start; i < Math.min(start + 10, lines.length); i++) {
      if (lines[i] === target) {
        return i;
      }
    }
    return -1;
  }

  /**
   * Cleanup expired snapshots
   */
  private cleanupExpiredSnapshots(): void {
    const now = Date.now();
    for (const [sessionId, snapshot] of this.snapshots.entries()) {
      if (now - snapshot.timestamp > this.SNAPSHOT_TTL_MS) {
        this.snapshots.delete(sessionId);
      }
    }
  }
}

// Singleton instance
export const incrementalValidation = new IncrementalValidationClass();
