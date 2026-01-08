/**
 * File filtering utilities for CodeGuardian MCP
 *
 * Provides consistent filtering of node_modules, venv, and other
 * directories that should be excluded from analysis.
 *
 * @format
 */

/**
 * Directories that should always be excluded from analysis
 * These patterns match anywhere in the path
 */
const EXCLUDED_DIRS = [
  "node_modules",
  "venv",
  ".venv",
  "env",
  "__pycache__",
  "dist",
  "build",
  ".next",
  "coverage",
  ".git",
  "vendor",
  ".cache",
  ".npm",
  ".yarn",
  "bower_components",
  "jspm_packages",
  ".tox",
  ".nox",
  ".pytest_cache",
  ".mypy_cache",
  "eggs",
  ".eggs",
  "site-packages",
];

/**
 * Check if a file path should be excluded based on directory patterns
 * This works regardless of where the excluded directory appears in the path
 *
 * @param filePath - The file path to check (can be absolute or relative)
 * @returns true if the file should be excluded
 */
export function shouldExcludeFile(filePath: string): boolean {
  // Normalize path separators
  const normalizedPath = filePath.replace(/\\/g, "/");
  const pathParts = normalizedPath.split("/");

  // Check if any part of the path matches an excluded directory
  for (const part of pathParts) {
    if (EXCLUDED_DIRS.includes(part)) {
      return true;
    }
  }

  return false;
}

/**
 * Filter an array of file paths, removing those in excluded directories
 *
 * @param files - Array of file paths to filter
 * @returns Filtered array with excluded files removed
 */
export function filterExcludedFiles(files: string[]): string[] {
  return files.filter((file) => !shouldExcludeFile(file));
}

/**
 * Get glob patterns for excluding directories
 * Use these with glob's ignore option
 */
export function getExcludePatterns(): string[] {
  return EXCLUDED_DIRS.map((dir) => `**/${dir}/**`);
}

/**
 * Get exclude patterns adjusted for an absolute base path
 * When the search directory is absolute, glob patterns need to be absolute too
 *
 * @param basePath - The base directory path (can be absolute or relative)
 * @returns Array of exclude patterns, adjusted for absolute paths if needed
 */
export function getExcludePatternsForPath(basePath: string): string[] {
  const patterns = getExcludePatterns();

  // Check if basePath is absolute
  const isAbsolute = basePath.startsWith("/") || /^[A-Za-z]:/.test(basePath);

  if (isAbsolute) {
    // For absolute paths, also add patterns with the base path prepended
    const absolutePatterns = EXCLUDED_DIRS.map(
      (dir) => `${basePath}/**/${dir}/**`
    );
    return [...patterns, ...absolutePatterns];
  }

  return patterns;
}
