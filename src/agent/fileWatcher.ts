/**
 * File Watcher - Proactive Agent Mode
 *
 * Watches for file changes in the project directory and emits events
 * when code files are modified. This enables real-time validation.
 *
 * @format
 */

import chokidar, { FSWatcher } from "chokidar";
import { EventEmitter } from "events";
import { logger } from "../utils/logger.js";

const CODE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".py", ".go"];

export interface FileChangeEvent {
  type: "add" | "change" | "unlink";
  path: string;
  timestamp: number;
}

export class FileWatcher extends EventEmitter {
  private watcher: FSWatcher | null = null;
  private projectPath: string;
  private isWatching: boolean = false;

  constructor(projectPath: string) {
    super();
    this.projectPath = projectPath;
  }

  start(): void {
    if (this.isWatching) {
      logger.warn("FileWatcher is already running");
      return;
    }

    logger.info(`Starting file watcher for: ${this.projectPath}`);

    this.watcher = chokidar.watch(this.projectPath, {
      ignored: [
        "**/node_modules/**",
        "**/dist/**",
        "**/build/**",
        "**/.git/**",
        "**/venv/**",
        "**/__pycache__/**",
        "**/.codeguardian/**",
      ],
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 300,
        pollInterval: 100,
      },
    });

    this.watcher
      .on("add", (path: string) => this.handleChange("add", path))
      .on("change", (path: string) => this.handleChange("change", path))
      .on("unlink", (path: string) => this.handleChange("unlink", path))
      .on("error", (error: unknown) => logger.error("Watcher error:", error))
      .on("ready", () => {
        this.isWatching = true;
        logger.info("File watcher is ready");
        this.emit("ready");
      });
  }

  private handleChange(type: "add" | "change" | "unlink", filePath: string): void {
    // Only process code files
    const isCodeFile = CODE_EXTENSIONS.some((ext) => filePath.endsWith(ext));
    if (!isCodeFile) return;

    const event: FileChangeEvent = {
      type,
      path: filePath,
      timestamp: Date.now(),
    };

    logger.debug(`File ${type}: ${filePath}`);
    this.emit("fileChange", event);
  }

  stop(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
      this.isWatching = false;
      logger.info("File watcher stopped");
    }
  }

  getStatus(): { watching: boolean; projectPath: string } {
    return {
      watching: this.isWatching,
      projectPath: this.projectPath,
    };
  }
}
