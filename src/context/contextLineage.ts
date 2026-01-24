/**
 * Context Lineage - Git History-Based Context
 *
 * Inspired by Augment Code's context lineage feature.
 * Uses git history to understand code evolution and prioritize
 * symbols from recently modified files.
 *
 * @format
 */

import { simpleGit, type SimpleGit, type LogResult } from "simple-git";
import * as path from "path";
import { logger } from "../utils/logger.js";

export interface FileHistory {
  filePath: string;
  lastModified: Date;
  commitCount: number; // Number of commits touching this file
  recentCommits: string[]; // Recent commit SHAs
  authors: Set<string>; // Contributors to this file
  changeFrequency: number; // Commits per day (recent activity)
}

export interface LineageContext {
  recentlyModifiedFiles: string[]; // Files modified in last N commits
  hotspotFiles: string[]; // Files with high change frequency
  relatedFiles: Map<string, string[]>; // Files often changed together
  fileHistories: Map<string, FileHistory>;
}

class ContextLineageClass {
  private git: SimpleGit | null = null;
  private projectPath: string = "";
  private cache: Map<string, LineageContext> = new Map();
  private readonly CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

  /**
   * Initialize git for a project
   */
  async initialize(projectPath: string): Promise<void> {
    this.projectPath = projectPath;
    this.git = simpleGit(projectPath);
  }

  /**
   * Get lineage context for a project
   */
  async getLineageContext(
    projectPath: string,
    options: {
      commitDepth?: number; // How many commits to analyze
      minChangeFrequency?: number; // Min commits/day to be a hotspot
    } = {},
  ): Promise<LineageContext | null> {
    const { commitDepth = 50, minChangeFrequency = 0.1 } = options;

    // Check cache
    const cacheKey = `${projectPath}:${commitDepth}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      if (!this.git || this.projectPath !== projectPath) {
        await this.initialize(projectPath);
      }

      if (!this.git) {
        return null;
      }

      // Check if we're in a git repo
      const isRepo = await this.git.checkIsRepo();
      if (!isRepo) {
        logger.debug("Not a git repository, skipping lineage context");
        return null;
      }

      // Get recent commits
      const log = await this.git.log({ maxCount: commitDepth });

      // Build file histories
      const fileHistories = await this.buildFileHistories(log, commitDepth);

      // Identify recently modified files (last 10 commits)
      const recentlyModifiedFiles = await this.getRecentlyModifiedFiles(10);

      // Identify hotspot files (high change frequency)
      const hotspotFiles = this.identifyHotspots(
        fileHistories,
        minChangeFrequency,
      );

      // Find files often changed together
      const relatedFiles = await this.findRelatedFiles(log);

      const context: LineageContext = {
        recentlyModifiedFiles,
        hotspotFiles,
        relatedFiles,
        fileHistories,
      };

      // Cache the result
      this.cache.set(cacheKey, context);
      setTimeout(() => this.cache.delete(cacheKey), this.CACHE_TTL_MS);

      return context;
    } catch (error) {
      logger.debug("Failed to get lineage context:", error);
      return null;
    }
  }

  /**
   * Get relevance score for a file based on git history
   */
  getFileLineageScore(
    filePath: string,
    context: LineageContext | null,
  ): number {
    if (!context) return 0;

    let score = 0;

    // Recently modified files get high score
    const recentIndex = context.recentlyModifiedFiles.indexOf(filePath);
    if (recentIndex !== -1) {
      score += 0.8 - recentIndex * 0.05; // Decay with position
    }

    // Hotspot files (frequently changed) get medium score
    if (context.hotspotFiles.includes(filePath)) {
      score += 0.4;
    }

    // Files with high commit count get small boost
    const history = context.fileHistories.get(filePath);
    if (history) {
      const commitBoost = Math.min(0.2, history.commitCount / 100);
      score += commitBoost;
    }

    return Math.min(1.0, score);
  }

  /**
   * Get symbols from files related to a given file
   */
  getRelatedFileSymbols(
    filePath: string,
    context: LineageContext | null,
  ): string[] {
    if (!context) return [];

    const related = context.relatedFiles.get(filePath) || [];
    return related;
  }

  /**
   * Clear all caches
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Build file histories from git log
   */
  private async buildFileHistories(
    log: LogResult,
    commitDepth: number,
  ): Promise<Map<string, FileHistory>> {
    const histories = new Map<string, FileHistory>();

    if (!this.git) return histories;

    // Get file stats for each commit
    for (const commit of log.all) {
      try {
        const diff = await this.git.show([
          "--name-only",
          "--format=",
          commit.hash,
        ]);
        const files = diff
          .split("\n")
          .filter((f) => f.trim() && !f.startsWith("diff"));

        for (const file of files) {
          if (!histories.has(file)) {
            histories.set(file, {
              filePath: file,
              lastModified: new Date(commit.date),
              commitCount: 0,
              recentCommits: [],
              authors: new Set(),
              changeFrequency: 0,
            });
          }

          const history = histories.get(file)!;
          history.commitCount++;
          if (history.recentCommits.length < 5) {
            history.recentCommits.push(commit.hash);
          }
          history.authors.add(commit.author_name);

          // Update last modified if this commit is more recent
          const commitDate = new Date(commit.date);
          if (commitDate > history.lastModified) {
            history.lastModified = commitDate;
          }
        }
      } catch (error) {
        // Skip commits that fail
        continue;
      }
    }

    // Calculate change frequency (commits per day)
    const now = Date.now();
    for (const history of histories.values()) {
      const daysSinceLastModified =
        (now - history.lastModified.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceLastModified > 0) {
        history.changeFrequency = history.commitCount / daysSinceLastModified;
      }
    }

    return histories;
  }

  /**
   * Get files modified in recent commits
   */
  private async getRecentlyModifiedFiles(
    commitCount: number,
  ): Promise<string[]> {
    if (!this.git) return [];

    try {
      const log = await this.git.log({ maxCount: commitCount });
      const files = new Set<string>();

      for (const commit of log.all) {
        try {
          const diff = await this.git.show([
            "--name-only",
            "--format=",
            commit.hash,
          ]);
          const commitFiles = diff
            .split("\n")
            .filter((f) => f.trim() && !f.startsWith("diff"));

          for (const file of commitFiles) {
            files.add(file);
          }
        } catch (error) {
          continue;
        }
      }

      return Array.from(files);
    } catch (error) {
      return [];
    }
  }

  /**
   * Identify hotspot files (frequently changed)
   */
  private identifyHotspots(
    histories: Map<string, FileHistory>,
    minFrequency: number,
  ): string[] {
    return Array.from(histories.entries())
      .filter(([_, history]) => history.changeFrequency >= minFrequency)
      .sort((a, b) => b[1].changeFrequency - a[1].changeFrequency)
      .map(([file, _]) => file)
      .slice(0, 20); // Top 20 hotspots
  }

  /**
   * Find files that are often changed together
   */
  private async findRelatedFiles(
    log: LogResult,
  ): Promise<Map<string, string[]>> {
    const relatedFiles = new Map<string, string[]>();
    const coChangeMatrix = new Map<string, Map<string, number>>();

    if (!this.git) return relatedFiles;

    // Build co-change matrix
    for (const commit of log.all) {
      try {
        const diff = await this.git.show([
          "--name-only",
          "--format=",
          commit.hash,
        ]);
        const files = diff
          .split("\n")
          .filter((f) => f.trim() && !f.startsWith("diff"));

        // Record co-changes
        for (const file1 of files) {
          if (!coChangeMatrix.has(file1)) {
            coChangeMatrix.set(file1, new Map());
          }

          for (const file2 of files) {
            if (file1 !== file2) {
              const matrix = coChangeMatrix.get(file1)!;
              matrix.set(file2, (matrix.get(file2) || 0) + 1);
            }
          }
        }
      } catch (error) {
        continue;
      }
    }

    // Extract top related files for each file
    for (const [file, coChanges] of coChangeMatrix.entries()) {
      const related = Array.from(coChanges.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5) // Top 5 related files
        .map(([f, _]) => f);

      if (related.length > 0) {
        relatedFiles.set(file, related);
      }
    }

    return relatedFiles;
  }
}

// Singleton instance
export const contextLineage = new ContextLineageClass();
