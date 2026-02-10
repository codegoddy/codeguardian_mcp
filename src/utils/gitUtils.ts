/**
 * Git Utilities
 *
 * Provides git-related functionality for branch-aware caching.
 * Inspired by Augment Code's per-branch context isolation.
 *
 * @format
 */

import { simpleGit, SimpleGit } from "simple-git";
import { logger } from "./logger.js";

export interface GitInfo {
  branch: string;
  commitSHA: string;
  isRepo: boolean;
}

// Short-lived cache for getGitInfo to avoid spawning redundant git subprocesses
// during rapid file changes (e.g., vibecoding)
const gitInfoCache: Map<string, { info: GitInfo | null; timestamp: number }> = new Map();
const GIT_INFO_CACHE_TTL_MS = 5_000; // 5 seconds

/**
 * Get current git branch and commit SHA for a project
 * Returns null if not a git repository
 */
export async function getGitInfo(projectPath: string): Promise<GitInfo | null> {
  // Return cached result if fresh enough (avoids spawning 2-3 git subprocesses per call)
  const cached = gitInfoCache.get(projectPath);
  if (cached && Date.now() - cached.timestamp < GIT_INFO_CACHE_TTL_MS) {
    return cached.info;
  }

  try {
    const git: SimpleGit = simpleGit(projectPath);

    // Check if it's a git repository
    const isRepo = await git.checkIsRepo();
    if (!isRepo) {
      logger.debug(`${projectPath} is not a git repository`);
      gitInfoCache.set(projectPath, { info: null, timestamp: Date.now() });
      return null;
    }

    // Get current branch
    const branch = await git.revparse(["--abbrev-ref", "HEAD"]);

    // Get current commit SHA (short version for cache key)
    const commitSHA = await git.revparse(["--short", "HEAD"]);

    logger.debug(`Git info for ${projectPath}: ${branch}@${commitSHA}`);

    const info: GitInfo = {
      branch: branch.trim(),
      commitSHA: commitSHA.trim(),
      isRepo: true,
    };
    gitInfoCache.set(projectPath, { info, timestamp: Date.now() });
    return info;
  } catch (error) {
    logger.debug(`Failed to get git info for ${projectPath}:`, error);
    gitInfoCache.set(projectPath, { info: null, timestamp: Date.now() });
    return null;
  }
}

/**
 * Generate a cache key that includes git context
 * Format: projectPath:language:includeTests:branch:commitSHA
 */
export function generateCacheKey(
  projectPath: string,
  language: string,
  includeTests: boolean,
  gitInfo: GitInfo | null,
): string {
  const baseKey = `${projectPath}:${language}:${includeTests}`;

  if (!gitInfo) {
    return baseKey;
  }

  return `${baseKey}:${gitInfo.branch}:${gitInfo.commitSHA}`;
}

/**
 * Check if git state has changed (branch switch or new commits)
 */
export async function hasGitChanged(
  projectPath: string,
  cachedGitInfo: GitInfo | null,
): Promise<boolean> {
  const currentGitInfo = await getGitInfo(projectPath);

  // If one is a repo and the other isn't, it changed
  if ((currentGitInfo === null) !== (cachedGitInfo === null)) {
    return true;
  }

  // If not a repo, no git changes
  if (!currentGitInfo || !cachedGitInfo) {
    return false;
  }

  // Check if branch or commit changed
  return (
    currentGitInfo.branch !== cachedGitInfo.branch ||
    currentGitInfo.commitSHA !== cachedGitInfo.commitSHA
  );
}
