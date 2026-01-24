/**
 * Job Persistence Layer
 *
 * Saves job state to disk so jobs survive server restarts.
 *
 * @format
 */

import * as fs from "fs/promises";
import * as path from "path";
import { logger } from "../utils/logger.js";
import type { Job } from "./jobQueue.js";

// ============================================================================
// Configuration
// ============================================================================

const JOBS_DIR = ".codeguardian/jobs";

// ============================================================================
// Persistence API
// ============================================================================

export class JobPersistence {
  private jobsDir: string;

  constructor(baseDir: string = JOBS_DIR) {
    this.jobsDir = baseDir;
  }

  /**
   * Initialize persistence (create directories)
   */
  async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.jobsDir, { recursive: true });
      logger.info(`Job persistence initialized: ${this.jobsDir}`);
    } catch (error) {
      logger.error("Failed to initialize job persistence:", error);
      throw error;
    }
  }

  /**
   * Save job to disk
   */
  async saveJob(job: Job): Promise<void> {
    try {
      const filePath = this.getJobPath(job.id);
      await fs.writeFile(filePath, JSON.stringify(job, null, 2), "utf-8");
      logger.debug(`Job saved: ${job.id}`);
    } catch (error) {
      logger.error(`Failed to save job ${job.id}:`, error);
      // Don't throw - persistence failure shouldn't break job execution
    }
  }

  /**
   * Load job from disk
   */
  async loadJob(jobId: string): Promise<Job | null> {
    try {
      const filePath = this.getJobPath(jobId);
      const content = await fs.readFile(filePath, "utf-8");
      const job = JSON.parse(content) as Job;
      logger.debug(`Job loaded: ${jobId}`);
      return job;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        logger.error(`Failed to load job ${jobId}:`, error);
      }
      return null;
    }
  }

  /**
   * Delete job from disk
   */
  async deleteJob(jobId: string): Promise<void> {
    try {
      const filePath = this.getJobPath(jobId);
      await fs.unlink(filePath);
      logger.debug(`Job deleted: ${jobId}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        logger.error(`Failed to delete job ${jobId}:`, error);
      }
    }
  }

  /**
   * Load all jobs from disk
   */
  async loadAllJobs(): Promise<Job[]> {
    try {
      const files = await fs.readdir(this.jobsDir);
      const jobs: Job[] = [];

      for (const file of files) {
        if (file.endsWith(".json")) {
          const jobId = file.replace(".json", "");
          const job = await this.loadJob(jobId);
          if (job) {
            jobs.push(job);
          }
        }
      }

      logger.info(`Loaded ${jobs.length} jobs from disk`);
      return jobs;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        // Directory doesn't exist yet
        return [];
      }
      logger.error("Failed to load jobs:", error);
      return [];
    }
  }

  /**
   * Clean up old jobs
   */
  async cleanupExpiredJobs(expirationTime: number): Promise<number> {
    try {
      const jobs = await this.loadAllJobs();
      const now = Date.now();
      let cleaned = 0;

      for (const job of jobs) {
        if (job.expiresAt < now) {
          await this.deleteJob(job.id);
          cleaned++;
        }
      }

      if (cleaned > 0) {
        logger.info(`Cleaned up ${cleaned} expired jobs from disk`);
      }

      return cleaned;
    } catch (error) {
      logger.error("Failed to cleanup expired jobs:", error);
      return 0;
    }
  }

  /**
   * Get job file path
   */
  private getJobPath(jobId: string): string {
    return path.join(this.jobsDir, `${jobId}.json`);
  }

  /**
   * Check if persistence is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      await fs.access(this.jobsDir);
      return true;
    } catch {
      return false;
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

export const jobPersistence = new JobPersistence();
