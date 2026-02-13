/**
 * Job Queue Manager - Noise Reduction Applied
 *
 * Handles long-running validation jobs that exceed MCP timeout limits.
 * Jobs run in background and results are retrieved separately.
 *
 * @format
 */

import { logger } from "../utils/logger.js";
import { EventEmitter } from "node:events";
import { jobPersistence } from "./jobPersistence.js";

// ============================================================================
// Types
// ============================================================================

export type JobStatus =
  | "queued"
  | "processing"
  | "complete"
  | "failed"
  | "cancelled";

export interface Job<TInput = any, TResult = any> {
  id: string;
  type: string;
  input: TInput;
  status: JobStatus;
  progress?: JobProgress;
  result?: TResult;
  error?: string;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  expiresAt: number;
}

export interface JobProgress {
  phase: string;
  percent: number;
  message?: string;
  details?: Record<string, any>;
}

export type JobHandler<TInput = any, TResult = any> = (
  input: TInput,
  updateProgress: (progress: JobProgress) => void,
) => Promise<TResult>;

// ============================================================================
// Job Queue
// ============================================================================

export class JobQueue extends EventEmitter {
  private jobs: Map<string, Job> = new Map();
  private handlers: Map<string, JobHandler> = new Map();
  private processing: Set<string> = new Set();
  private maxConcurrent: number;
  private jobTTL: number; // Time to live in milliseconds
  private cleanupInterval?: ReturnType<typeof setInterval>;

  constructor(options: { maxConcurrent?: number; jobTTL?: number } = {}) {
    super();
    this.maxConcurrent = options.maxConcurrent || 3;
    this.jobTTL = options.jobTTL || 24 * 60 * 60 * 1000; // 24 hours

    // Initialize persistence
    this.initializePersistence();

    // Start cleanup interval
    this.cleanupInterval = setInterval(
      () => this.cleanupExpiredJobs(),
      60 * 1000,
    ); // Every minute

    // Don't keep the process alive just for periodic cleanup
    this.cleanupInterval.unref?.();
  }

  /**
   * Initialize persistence and load existing jobs
   */
  private async initializePersistence(): Promise<void> {
    try {
      await jobPersistence.initialize();
      const loadedJobs = await jobPersistence.loadAllJobs();
      
      for (const job of loadedJobs) {
        // Only load jobs that haven't expired
        if (job.expiresAt > Date.now()) {
          this.jobs.set(job.id, job);
          
          // Re-queue jobs that were interrupted
          if (job.status === "processing" || job.status === "queued") {
            job.status = "queued";
            this.processNext();
          }
        } else {
          await jobPersistence.deleteJob(job.id);
        }
      }
      
      if (loadedJobs.length > 0) {
        logger.info(`Restored ${this.jobs.size} jobs from persistence`);
      }
    } catch (err) {
      logger.error("Failed to initialize job persistence:", err);
    }
  }

  /**
   * Register a job handler
   */
  registerHandler<TInput, TResult>(
    type: string,
    handler: JobHandler<TInput, TResult>,
  ): void {
    this.handlers.set(type, handler);
    logger.info(`Registered job handler: ${type}`);
  }

  /**
   * Submit a new job
   */
  async submitJob<TInput, TResult>(
    type: string,
    input: TInput,
  ): Promise<string> {
    const handler = this.handlers.get(type);
    if (!handler) {
      throw new Error(`No handler registered for job type: ${type}`);
    }

    const jobId = this.generateJobId(type);
    const now = Date.now();

    const job: Job<TInput, TResult> = {
      id: jobId,
      type,
      input,
      status: "queued",
      createdAt: now,
      expiresAt: now + this.jobTTL,
    };

    this.jobs.set(jobId, job);
    await jobPersistence.saveJob(job);
    logger.info(`Job submitted: ${jobId} (type: ${type})`);

    // Start processing if capacity available
    this.processNext();

    return jobId;
  }

  /**
   * Get job status
   */
  getJob(jobId: string): Job | undefined {
    return this.jobs.get(jobId);
  }

  /**
   * Get job status (public API)
   */
  getJobStatus(jobId: string): {
    exists: boolean;
    status?: JobStatus;
    progress?: JobProgress;
    error?: string;
  } {
    const job = this.jobs.get(jobId);
    if (!job) {
      return { exists: false };
    }

    return {
      exists: true,
      status: job.status,
      progress: job.progress,
      error: job.error,
    };
  }

  /**
   * Get job results
   */
  getJobResults<TResult>(jobId: string): {
    exists: boolean;
    status?: JobStatus;
    result?: TResult;
    error?: string;
  } {
    const job = this.jobs.get(jobId);
    if (!job) {
      return { exists: false };
    }

    return {
      exists: true,
      status: job.status,
      result: job.result as TResult,
      error: job.error,
    };
  }

  /**
   * Cancel a job
   */
  cancelJob(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job) {
      return false;
    }

    if (job.status === "queued") {
      job.status = "cancelled";
      job.completedAt = Date.now();
      jobPersistence.saveJob(job);
      logger.info(`Job cancelled: ${jobId}`);
      return true;
    }

    // Can't cancel jobs that are already processing/complete
    return false;
  }

  /**
   * List all jobs (for debugging)
   */
  listJobs(filter?: { status?: JobStatus; type?: string }): Job[] {
    let jobs = Array.from(this.jobs.values());

    if (filter?.status) {
      jobs = jobs.filter((j) => j.status === filter.status);
    }

    if (filter?.type) {
      jobs = jobs.filter((j) => j.type === filter.type);
    }

    return jobs.sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * Process next job in queue
   */
  private async processNext(): Promise<void> {
    // Check if we have capacity
    if (this.processing.size >= this.maxConcurrent) {
      return;
    }

    // Find next queued job
    const nextJob = Array.from(this.jobs.values()).find(
      (j) => j.status === "queued",
    );

    if (!nextJob) {
      return;
    }

    // Start processing
    this.processing.add(nextJob.id);
    nextJob.status = "processing";
    nextJob.startedAt = Date.now();
    await jobPersistence.saveJob(nextJob);

    logger.info(`Processing job: ${nextJob.id} (type: ${nextJob.type})`);

    try {
      const handler = this.handlers.get(nextJob.type);
      if (!handler) {
        throw new Error(`No handler for job type: ${nextJob.type}`);
      }

      // Create progress updater
      const updateProgress = (progress: JobProgress) => {
        nextJob.progress = progress;
        jobPersistence.saveJob(nextJob);
        this.emit("progress", nextJob.id, progress);
        logger.debug(
          `Job ${nextJob.id} progress: ${progress.phase} (${progress.percent}%)`,
        );
      };

      // Execute handler
      const result = await handler(nextJob.input, updateProgress);

      // Mark complete
      nextJob.status = "complete";
      nextJob.result = result;
      nextJob.completedAt = Date.now();

      const duration = nextJob.completedAt - nextJob.startedAt!;
      await jobPersistence.saveJob(nextJob);
      logger.info(`Job completed: ${nextJob.id} (${duration}ms)`);

      this.emit("complete", nextJob.id, result);
    } catch (err) {
      // Mark failed
      nextJob.status = "failed";
      nextJob.error = err instanceof Error ? err.message : String(err);
      nextJob.completedAt = Date.now();

      await jobPersistence.saveJob(nextJob);
      logger.error(`Job failed: ${nextJob.id}`, err);
      this.emit("failed", nextJob.id, err);
    } finally {
      this.processing.delete(nextJob.id);

      // Process next job if any
      setImmediate(() => this.processNext());
    }
  }

  /**
   * Cleanup expired jobs
   */
  private cleanupExpiredJobs(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [jobId, job] of this.jobs.entries()) {
      if (job.expiresAt < now) {
        this.jobs.delete(jobId);
        jobPersistence.deleteJob(jobId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.info(`Cleaned up ${cleaned} expired jobs`);
    }
  }

  /**
   * Generate unique job ID
   */
  private generateJobId(type: string): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 9);
    return `${type}_${timestamp}_${random}`;
  }

  /**
   * Get queue statistics
   */
  getStats(): {
    total: number;
    queued: number;
    processing: number;
    complete: number;
    failed: number;
    cancelled: number;
  } {
    const jobs = Array.from(this.jobs.values());
    return {
      total: jobs.length,
      queued: jobs.filter((j) => j.status === "queued").length,
      processing: jobs.filter((j) => j.status === "processing").length,
      complete: jobs.filter((j) => j.status === "complete").length,
      failed: jobs.filter((j) => j.status === "failed").length,
      cancelled: jobs.filter((j) => j.status === "cancelled").length,
    };
  }

  /**
   * Shutdown the job queue and cleanup resources
   */
  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
    logger.info("Job queue shutdown");
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

export const jobQueue = new JobQueue({
  maxConcurrent: 3,
  jobTTL: 24 * 60 * 60 * 1000, // 24 hours
});
