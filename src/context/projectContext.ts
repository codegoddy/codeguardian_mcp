/**
 * Shared Project Context
 *
 * A centralized context system that builds a comprehensive project map once
 * and shares it across all CodeGuardian tools. This enables:
 *
 * 1. Faster subsequent tool calls (no re-indexing)
 * 2. Cross-tool insights (e.g., dead code + test coverage)
 * 3. Smarter validation (knows what symbols exist in project)
 * 4. Better relevance scoring (understands project structure)
 *
 * @format
 */

import { glob } from "glob";
import * as fs from "fs/promises";
import * as fsSync from "fs";
import * as path from "path";
import { logger } from "../utils/logger.js";
import {
  filterExcludedFiles,
  getExcludePatternsForPath,
} from "../utils/fileFilter.js";
import {
  extractSymbolsAST,
  extractImportsAST,
} from "../tools/validation/extractors/index.js";
import {
  getGitInfo,
  generateCacheKey,
  hasGitChanged,
  type GitInfo,
} from "../utils/gitUtils.js";
import { buildSymbolGraph } from "../analyzers/symbolGraph.js";
import type { SymbolGraph } from "../types/symbolGraph.js";
import { serialize, deserialize } from "../utils/serialization.js";
import { extractApiContractContext } from "./apiContractContext.js";

// ============================================================================
// Helper Functions for Lazy API Contract Loading
// ============================================================================

/**
 * Detect if project has frontend code based on file patterns and symbols
 */
function detectFrontendPresence(context: ProjectContext): boolean {
  const frontendPatterns = [
    '/frontend/', '/client/', '/web/', '/app/src/',
    '/components/', '/pages/', '/views/', '/hooks/'
  ];
  
  // Check file paths
  for (const filePath of context.files.keys()) {
    const normalizedPath = filePath.toLowerCase();
    if (frontendPatterns.some(pattern => normalizedPath.includes(pattern))) {
      return true;
    }
    
    // Check for React/Vue/Angular imports
    const fileInfo = context.files.get(filePath);
    if (fileInfo?.imports.some(imp => 
      imp.source.includes('react') ||
      imp.source.includes('vue') ||
      imp.source.includes('@angular')
    )) {
      return true;
    }
  }
  
  // Check for frontend-specific symbols
  for (const [symbolName, symbolInfos] of context.symbolIndex) {
    for (const info of symbolInfos) {
      if (info.symbol.kind === 'component' || info.symbol.kind === 'hook') {
        return true;
      }
    }
  }
  
  return false;
}

/**
 * Detect if project has backend code based on file patterns and symbols
 */
function detectBackendPresence(context: ProjectContext): boolean {
  const backendPatterns = [
    '/backend/', '/server/', '/api/', '/routes/',
    '/routers/', '/controllers/', '/models/',
    'main.py', 'app.py', 'server.js', 'index.js'
  ];
  
  // Check file paths
  for (const filePath of context.files.keys()) {
    const normalizedPath = filePath.toLowerCase();
    if (backendPatterns.some(pattern => normalizedPath.includes(pattern))) {
      return true;
    }
    
    // Check for backend framework imports
    const fileInfo = context.files.get(filePath);
    if (fileInfo?.imports.some(imp =>
      imp.source.includes('express') ||
      imp.source.includes('fastapi') ||
      imp.source.includes('flask') ||
      imp.source.includes('fastify') ||
      imp.source.includes('django')
    )) {
      return true;
    }
  }
  
  // Check for backend-specific symbols (route handlers, etc.)
  for (const [symbolName, symbolInfos] of context.symbolIndex) {
    for (const info of symbolInfos) {
      // Check if symbol is in a backend file
      const fileInfo = context.files.get(info.file);
      if (fileInfo) {
        const normalizedPath = info.file.toLowerCase();
        if (backendPatterns.some(pattern => normalizedPath.includes(pattern))) {
          return true;
        }
      }
    }
  }
  
  return false;
}

/**
 * Check if a file is relevant to API contract validation.
 * When these files change, the API contract context should be refreshed.
 */
function isApiContractRelevantFile(filePath: string): boolean {
  const normalized = filePath.toLowerCase();
  // Frontend service files (API calls)
  if (normalized.includes('/services/') && (normalized.endsWith('.ts') || normalized.endsWith('.tsx') || normalized.endsWith('.js'))) {
    return true;
  }
  // Backend route/API files
  if ((normalized.includes('/api/') || normalized.includes('/routes/') || normalized.includes('/routers/')) && normalized.endsWith('.py')) {
    return true;
  }
  // Backend schema/model files (Pydantic models)
  if (normalized.includes('/schemas/') && normalized.endsWith('.py')) {
    return true;
  }
  // Frontend type definition files
  if ((normalized.includes('/types/') || normalized.includes('/interfaces/')) && (normalized.endsWith('.ts') || normalized.endsWith('.tsx'))) {
    return true;
  }
  return false;
}

// ============================================================================
// Types
// ============================================================================

export interface FileInfo {
  path: string;
  relativePath: string;
  language: string;
  size: number;
  symbols: SymbolInfo[];
  imports: ImportInfo[];
  exports: ExportInfo[];
  keywords: string[];
  isTest: boolean;
  isConfig: boolean;
  isEntryPoint: boolean;
  lastModified?: number;
}

export interface SymbolInfo {
  name: string;
  kind:
    | "function"
    | "class"
    | "interface"
    | "type"
    | "variable"
    | "enum"
    | "component"
    | "hook"
    | "method";
  line: number;
  exported: boolean;
  async?: boolean;
  returnType?: string;
  params?: Array<{ name: string; type?: string }>;
  scope?: string; // For object literal methods: the parent object name (e.g., "timeEntriesApi")
}

export interface ImportInfo {
  source: string;
  isRelative: boolean;
  isExternal: boolean;
  namedImports: string[];
  defaultImport?: string;
  namespaceImport?: string;
  line: number;
}

export interface ExportInfo {
  name: string;
  kind: string;
  isDefault: boolean;
  line: number;
}

export interface DependencyEdge {
  from: string;
  to: string;
  importedSymbols: string[];
}

export interface ProjectContext {
  // Metadata
  projectPath: string;
  language: string;
  buildTime: string;
  totalFiles: number;
  gitInfo?: GitInfo | null; // Git branch and commit info for branch-aware caching

  // File index
  files: Map<string, FileInfo>;

  // Symbol-level dependency graph
  symbolGraph?: SymbolGraph;

  // Symbol lookups (symbol name -> files defining it)
  symbolIndex: Map<string, Array<{ file: string; symbol: SymbolInfo }>>;

  // Dependency graph
  dependencies: DependencyEdge[];
  importGraph: Map<string, string[]>; // file -> files it imports
  reverseImportGraph: Map<string, string[]>; // file -> files that import it

  // Keyword index for semantic search
  keywordIndex: Map<string, string[]>;

  // External dependencies (npm packages, pip packages)
  externalDependencies: Set<string>;

  // Entry points (main files, index files, pages)
  entryPoints: string[];

  // Framework detection
  framework?: {
    name: string;
    version?: string;
    patterns: string[];
  };

  // API Contract Guardian - Frontend/Backend contract information
  apiContract?: ApiContractContext;
}

// ============================================================================
// API Contract Types
// ============================================================================

export interface ApiContractContext {
  // Project structure detection
  projectStructure: {
    frontend?: {
      path: string;
      framework: string;
      apiPattern: string;
      httpClient: string;
      apiBaseUrl?: string;
    };
    backend?: {
      path: string;
      framework: string;
      apiPattern: string;
      apiPrefix?: string;
    };
    relationship: "monorepo" | "separate" | "frontend-only" | "backend-only";
  };

  // Frontend API services extracted from TypeScript
  frontendServices: ApiServiceDefinition[];

  // Frontend types/interfaces
  frontendTypes: ApiTypeDefinition[];

  // Backend API routes extracted from Python/Node.js
  backendRoutes: ApiRouteDefinition[];

  // Backend models/schemas
  backendModels: ApiModelDefinition[];

  // Matched endpoints (frontend service <-> backend route)
  endpointMappings: Map<string, ApiEndpointMapping>;

  // Matched types (frontend type <-> backend model)
  typeMappings: Map<string, ApiTypeMapping>;

  // Unmatched items for reporting
  unmatchedFrontend: ApiServiceDefinition[];
  unmatchedBackend: ApiRouteDefinition[];

  // Last updated timestamp
  lastUpdated: string;
}

export interface ApiServiceDefinition {
  name: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  endpoint: string;
  requestType?: string;
  responseType?: string;
  queryParams?: ApiParameter[];
  file: string;
  line: number;
}

export interface ApiParameter {
  name: string;
  type: string;
  required: boolean;
}

export interface ApiTypeDefinition {
  name: string;
  fields: ApiTypeField[];
  file: string;
  line: number;
  kind: "interface" | "type" | "class";
}

export interface ApiTypeField {
  name: string;
  type: string;
  required: boolean;
  optional?: boolean;
}

export interface ApiRouteDefinition {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  handler: string;
  requestModel?: string;
  responseModel?: string;
  queryParams?: ApiParameter[];
  file: string;
  line: number;
}

export interface ApiModelDefinition {
  name: string;
  fields: ApiModelField[];
  file: string;
  line: number;
  baseClasses?: string[];
}

export interface ApiModelField {
  name: string;
  type: string;
  required: boolean;
  default?: unknown;
}

export interface ApiEndpointMapping {
  frontend: ApiServiceDefinition;
  backend: ApiRouteDefinition;
  score: number; // Match confidence 0-100
  hasMultipleMethods?: boolean; // True if multiple backend routes exist with same path
  availableMethods?: string[]; // List of available HTTP methods for this path
}

export interface ApiTypeMapping {
  frontend: ApiTypeDefinition;
  backend: ApiModelDefinition;
  compatibility: {
    score: number; // 0-100
    issues: string[];
  };
}

// ============================================================================
// Context Cache
// ============================================================================

interface CachedContext {
  context: ProjectContext;
  timestamp: number;
  fileHashes: Map<string, number>; // file -> mtime for invalidation
  fileCount: number; // Track file count for quick change detection
  gitInfo: GitInfo | null; // Git state when cache was created
}

const contextCache = new Map<string, CachedContext>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const QUICK_CHECK_SAMPLE_SIZE = 20; // Number of files to sample for quick staleness check
const CACHE_DIR_NAME = ".codeguardian";
const CACHE_FILE_NAME = "context_cache.json";

// Track projects with an active guardian — skips TTL/staleness checks since
// the file watcher keeps context fresh via refreshFileContext
const guardianActiveProjects = new Set<string>();

/**
 * Mark a project as having an active guardian.
 * While active, getProjectContext skips TTL/staleness checks and returns
 * the cached context directly (file watcher keeps it fresh).
 */
export function markGuardianActive(projectPath: string): void {
  guardianActiveProjects.add(projectPath);
  logger.info(`Guardian active for ${projectPath} — context cache will be kept fresh by file watcher`);
}

/**
 * Mark a project's guardian as stopped.
 * Resumes normal TTL/staleness checks for cache validity.
 */
export function markGuardianInactive(projectPath: string): void {
  guardianActiveProjects.delete(projectPath);
  logger.info(`Guardian stopped for ${projectPath} — resuming normal cache TTL`);
}

// ============================================================================
// Main API
// ============================================================================

/**
 * Get or build project context
 * Automatically builds context if not cached, and validates freshness
 * Uses smart invalidation based on file modification times
 */
export async function getProjectContext(
  projectPath: string,
  options: {
    language?: string;
    forceRebuild?: boolean;
    includeTests?: boolean;
    maxFiles?: number;
  } = {},
): Promise<ProjectContext> {
  const {
    language = "all",
    forceRebuild = false,
    includeTests = true,
    maxFiles = 1000,
  } = options;

  // Get git info for branch-aware caching
  const gitInfo = await getGitInfo(projectPath);
  const cacheKey = generateCacheKey(
    projectPath,
    language,
    includeTests,
    gitInfo,
  );
  const cached = contextCache.get(cacheKey);

  // If guardian is actively watching this project, trust the cache —
  // the file watcher keeps it fresh via refreshFileContext.
  // Check ALL cache keys for this project (different tools may use different language params)
  if (!forceRebuild && guardianActiveProjects.has(projectPath)) {
    if (cached) {
      logger.debug(`Using guardian-managed context for ${projectPath} (exact key match)`);
      return cached.context;
    }
    // Try to find any cached context for this project path (different language key)
    for (const [key, entry] of contextCache.entries()) {
      if (key.startsWith(projectPath + ":")) {
        logger.debug(`Using guardian-managed context for ${projectPath} (cross-language key match)`);
        return entry.context;
      }
    }
  }

  // Check if cache exists and is potentially valid
  if (!forceRebuild && cached) {
    const age = Date.now() - cached.timestamp;

    // Check if git state changed (branch switch or new commits)
    const gitChanged = await hasGitChanged(projectPath, cached.gitInfo);
    if (gitChanged) {
      logger.info(
        `Git state changed for ${projectPath} (branch/commit), rebuilding context...`,
      );
    } else {
      // If cache is within TTL, do a quick staleness check
      if (age < CACHE_TTL_MS) {
        const isStale = await isContextStale(cached, projectPath);
        if (!isStale) {
          logger.info(
            `Using cached context for ${projectPath} (validated fresh, age: ${age}ms)`,
          );
          return cached.context;
        }
        logger.info(`Cache is stale for ${projectPath}, rebuilding...`);
      }
    }
  }

  // Try to load from disk if memory cache missed
  if (!forceRebuild) {
    const diskContext = await loadContextFromDisk(projectPath, gitInfo);
    if (diskContext) {
      // Rehydrate into memory cache
      contextCache.set(cacheKey, diskContext);
      
      // Perform synchronization check to handle files edited while agent was offline
      return reconcileContextWithDisk(diskContext, projectPath, { language, includeTests });
    }
  }

  // Build fresh context (auto-build if not exists)
  const gitBranch =
    gitInfo ? `${gitInfo.branch}@${gitInfo.commitSHA}` : "no-git";
  logger.info(
    `Building project context for ${projectPath} [${gitBranch}]${cached ? " (cache invalidated)" : " (first build)"}`,
  );
  const startTime = Date.now();

  // Create .codeguardian directory early so users see immediate feedback
  // This ensures the directory exists before the potentially long context build
  try {
    const cacheDir = path.join(projectPath, CACHE_DIR_NAME);
    await fs.mkdir(cacheDir, { recursive: true });
    logger.debug(`Created ${CACHE_DIR_NAME} directory at ${cacheDir}`);
  } catch (err) {
    logger.warn(`Failed to create ${CACHE_DIR_NAME} directory: ${err}`);
  }

  const context = await buildProjectContext(projectPath, {
    language,
    includeTests,
    maxFiles,
  });
  
  const buildTime = Date.now() - startTime;
  logger.info(`Project context built in ${buildTime}ms - ${context.files.size} files indexed`);
  
  // Performance warning for large projects
  if (buildTime > 30000) {
    logger.warn(`Context build took ${buildTime}ms - consider using 'scope' parameter to limit files`);
  }

  // Store git info in context
  context.gitInfo = gitInfo;

  // Build file hash map for smart invalidation
  const fileHashes = new Map<string, number>();
  for (const [filePath, fileInfo] of context.files) {
    if (fileInfo.lastModified) {
      fileHashes.set(filePath, fileInfo.lastModified);
    }
  }

  // Cache it
  contextCache.set(cacheKey, {
    context,
    timestamp: Date.now(),
    fileHashes,
    fileCount: context.files.size,
    gitInfo,
  });

  logger.info(
    `Context built in ${Date.now() - startTime}ms (${context.files.size} files) [${gitBranch}]`,
  );

  // Save to disk for persistence
  try {
      await saveContextToDisk(projectPath, contextCache.get(cacheKey)!);
  } catch (err) {
      logger.warn(`Failed to save context to disk: ${err instanceof Error ? err.message : String(err)}`);
  }

  return context;
}

/**
 * Incrementally refresh a single file in the project context
 */
export async function refreshFileContext(
  projectPath: string,
  filePath: string,
  options: { language?: string; includeTests?: boolean } = {}
): Promise<ProjectContext> {
  const { language = "all", includeTests = true } = options;
  
  // Get git info
  const gitInfo = await getGitInfo(projectPath);
  const cacheKey = generateCacheKey(projectPath, language, includeTests, gitInfo);
  
  // Try memory cache first (exact key match)
  let cached = contextCache.get(cacheKey);
  
  // If exact key missed but guardian is active, try cross-language key match
  if (!cached && guardianActiveProjects.has(projectPath)) {
    for (const [key, entry] of contextCache.entries()) {
      if (key.startsWith(projectPath + ":")) {
        cached = entry;
        break;
      }
    }
  }
  
  // If not in memory, try disk
  if (!cached) {
    const diskContext = await loadContextFromDisk(projectPath, gitInfo);
    if (diskContext) {
      contextCache.set(cacheKey, diskContext);
      cached = diskContext;
    }
  }

  // If we still don't have a context, we have to build it full
  if (!cached) {
    return getProjectContext(projectPath, { language, includeTests });
  }

  // Update the file in the context
  await updateFileInContext(cached.context, filePath, projectPath);

  // If the changed file is relevant to API contracts (services, routes, schemas),
  // rebuild the API contract context so all tools see fresh data
  if (cached.context.apiContract && isApiContractRelevantFile(filePath)) {
    try {
      logger.debug(`API contract relevant file changed: ${filePath} — refreshing API contract context...`);
      cached.context.apiContract = await extractApiContractContext(cached.context);
    } catch (err) {
      logger.warn(`Failed to refresh API contract context: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Update file hashes in cached record
  try {
    const stats = await fs.stat(filePath);
    cached.fileHashes.set(filePath, stats.mtimeMs);
    cached.timestamp = Date.now(); // Update timestamp to extend TTL
  } catch (err) {
    // File might have been deleted
    cached.fileHashes.delete(filePath);
  }

  // Save updated context to disk
  try {
    await saveContextToDisk(projectPath, cached);
  } catch (err) {
    logger.warn(`Failed to save refreshed context to disk: ${err instanceof Error ? err.message : String(err)}`);
  }

  return cached.context;
}

/**
 * Synchronize a cached context with the current state of the filesystem.
 * Detects files changed while the agent was offline and performs an incremental catch-up.
 */
async function reconcileContextWithDisk(
  cached: CachedContext,
  projectPath: string,
  options: { language: string; includeTests: boolean }
): Promise<ProjectContext> {
  const { language, includeTests } = options;
  
  // We perform a full timestamp scan to ensure 100% accuracy as requested.
  // This detects any edits made while the agent was offline.
  logger.debug(`Reconciling context with disk for ${projectPath}...`);
  const startTime = Date.now();

  try {
    // 1. Find all current files on disk
    const currentFilesOnDisk = await findProjectFiles(projectPath, language, includeTests);
    const currentFileSet = new Set(currentFilesOnDisk);

    const toUpdate: string[] = [];
    
    // 2. Scan for deleted or modified files
    for (const [filePath, cachedMtime] of cached.fileHashes.entries()) {
      if (!currentFileSet.has(filePath)) {
        toUpdate.push(filePath); // Deleted
      } else {
        try {
          const stats = await fs.stat(filePath);
          if (stats.mtimeMs > cachedMtime) {
            toUpdate.push(filePath); // Modified
          }
        } catch {
          toUpdate.push(filePath);
        }
      }
    }

    // 3. Scan for new files
    for (const filePath of currentFilesOnDisk) {
      if (!cached.fileHashes.has(filePath)) {
        toUpdate.push(filePath); // New
      }
    }

    if (toUpdate.length === 0) {
      return cached.context;
    }

    logger.info(`Updating context: ${toUpdate.length} files changed while offline.`);

    // 4. Update files incrementally (skipping graph rebuild during batch)
    const BATCH_SIZE = 20;
    for (let i = 0; i < toUpdate.length; i += BATCH_SIZE) {
      const batch = toUpdate.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(file => updateFileInContext(cached.context, file, projectPath, true)));
      await new Promise(resolve => setImmediate(resolve));
    }

    // 5. Rebuild symbol graph ONCE at the end
    cached.context.symbolGraph = await buildSymbolGraph(cached.context as any, {
      includeCallRelationships: true,
      includeCoOccurrence: true,
      minCoOccurrenceCount: 2,
    });

    // 5b. Refresh API contract context if any changed files are API-relevant
    if (cached.context.apiContract && toUpdate.some(f => isApiContractRelevantFile(f))) {
      try {
        logger.info(`Refreshing API contract context after offline reconciliation...`);
        cached.context.apiContract = await extractApiContractContext(cached.context);
      } catch (err) {
        logger.warn(`Failed to refresh API contract context during reconciliation: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // 6. Update metadata and save
    cached.timestamp = Date.now();
    cached.fileCount = currentFilesOnDisk.length;
    
    for (const file of toUpdate) {
      try {
        const stats = await fs.stat(file);
        cached.fileHashes.set(file, stats.mtimeMs);
      } catch {
        cached.fileHashes.delete(file);
      }
    }

    // Save updated context back to disk
    await saveContextToDisk(projectPath, cached);
    
    logger.info(`Context synchronized in ${Date.now() - startTime}ms`);
    return cached.context;

  } catch (error) {
    logger.warn(`Failure during context reconciliation: ${error instanceof Error ? error.message : String(error)}`);
    return cached.context;
  }
}

/**
 * Check if cached context is stale by sampling file modification times
 * This is a quick check that doesn't require reading all files
 */
async function isContextStale(
  cached: CachedContext,
  projectPath: string,
): Promise<boolean> {
  try {
    // Quick check 1: See if file count changed significantly
    // Use the same search logic as building context to ensure consistency
    // PROTOTYPE: Only fully supported languages
    const extensions: Record<string, string[]> = {
      javascript: [".js", ".jsx", ".mjs", ".cjs"],
      typescript: [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx"], // Include js in ts projects
      python: [".py"],
      all: [".js", ".jsx", ".ts", ".tsx", ".py"], // Only TS/JS/Python for prototype
    };
    const exts = extensions[cached.context.language] || extensions.all;
    const patterns = exts.map((ext) => `${projectPath}/**/*${ext}`);
    
    const currentFiles = await glob(patterns, {
      ignore: ["**/node_modules/**", "**/dist/**", "**/.git/**", "**/venv/**"],
      nodir: true,
    });

    const countDiff = Math.abs(currentFiles.length - cached.fileCount);
    if (countDiff > 5) {
      logger.debug(
        `File count changed: ${cached.fileCount} -> ${currentFiles.length}`,
      );
      return true;
    }

    // Quick check 2: Sample some files and check their modification times
    const filesToCheck = Array.from(cached.fileHashes.keys())
      .sort(() => Math.random() - 0.5) // Shuffle
      .slice(0, QUICK_CHECK_SAMPLE_SIZE);

    for (const filePath of filesToCheck) {
      try {
        const stats = await fs.stat(filePath);
        const cachedMtime = cached.fileHashes.get(filePath);
        if (cachedMtime && stats.mtimeMs > cachedMtime) {
          logger.debug(`File modified: ${filePath}`);
          return true;
        }
      } catch {
        // File was deleted
        logger.debug(`File deleted: ${filePath}`);
        return true;
      }
    }

    // Quick check 3: Check for new files in common directories
    const commonDirs = [
      "src",
      "lib",
      "app",
      "components",
      "pages",
      "hooks",
      "utils",
    ];
    for (const dir of commonDirs) {
      const dirPath = path.join(projectPath, dir);
      try {
        const dirStats = await fs.stat(dirPath);
        // If directory was modified after cache, might have new files
        if (dirStats.mtimeMs > cached.timestamp) {
          const dirFiles = await glob(`${dirPath}/**/*.{ts,tsx,js,jsx,py}`, {
            nodir: true,
          });
          for (const file of dirFiles.slice(0, 5)) {
            if (!cached.fileHashes.has(file)) {
              logger.debug(`New file detected: ${file}`);
              return true;
            }
          }
        }
      } catch {
        // Directory doesn't exist, that's fine
      }
    }

    return false;
  } catch (error) {
    logger.warn(`Error checking cache staleness: ${error}`);
    return true; // Assume stale on error
  }
}

/**
 * Invalidate context cache for a project
 */
export function invalidateContext(projectPath: string): void {
  for (const key of contextCache.keys()) {
    if (key.startsWith(projectPath)) {
      contextCache.delete(key);
    }
  }
}

/**
 * Clear all cached contexts
 */
export function clearContextCache(): void {
  contextCache.clear();
}

// ============================================================================
// Context Building
// ============================================================================

async function buildProjectContext(
  projectPath: string,
  options: {
    language: string;
    includeTests: boolean;
    maxFiles: number;
  },
): Promise<ProjectContext> {
  const { language, includeTests, maxFiles } = options;

  // Initialize context
  const context: ProjectContext = {
    projectPath,
    language,
    buildTime: new Date().toISOString(),
    totalFiles: 0,
    files: new Map(),
    symbolIndex: new Map(),
    dependencies: [],
    importGraph: new Map(),
    reverseImportGraph: new Map(),
    keywordIndex: new Map(),
    externalDependencies: new Set(),
    entryPoints: [],
  };

  // Find source files (excluding tests if requested)
  const files = await findProjectFiles(projectPath, language, includeTests);
  
  logger.info(`Found ${files.length} source files (${language}) to analyze`);
  
  const filesToProcess = files.slice(0, maxFiles);

  // Always find test files separately for import tracking (dead code detection)
  // This ensures exports used only in tests aren't flagged as dead code
  let testFiles: string[] = [];
  if (!includeTests) {
    testFiles = await findTestFiles(projectPath, language);
  }

  // Detect framework
  context.framework = await detectFramework(projectPath, filesToProcess);

  // Process each file
  for (let i = 0; i < filesToProcess.length; i++) {
    const filePath = filesToProcess[i];
    try {
      const content = await fs.readFile(filePath, "utf-8");
      const stats = await fs.stat(filePath);
      const fileInfo = analyzeFile(
        filePath,
        content,
        projectPath,
        context.framework,
      );
      fileInfo.lastModified = stats.mtimeMs;

      context.files.set(filePath, fileInfo);

      // Build symbol index
      for (const symbol of fileInfo.symbols) {
        if (!context.symbolIndex.has(symbol.name)) {
          context.symbolIndex.set(symbol.name, []);
        }
        context.symbolIndex.get(symbol.name)!.push({ file: filePath, symbol });
      }

      // Build keyword index
      for (const keyword of fileInfo.keywords) {
        if (!context.keywordIndex.has(keyword)) {
          context.keywordIndex.set(keyword, []);
        }
        context.keywordIndex.get(keyword)!.push(filePath);
      }

      // Track external dependencies
      for (const imp of fileInfo.imports) {
        if (imp.isExternal) {
          context.externalDependencies.add(imp.source);
        }
      }

      // Track entry points
      if (fileInfo.isEntryPoint) {
        context.entryPoints.push(filePath);
      }
    } catch (err) {
      // Skip unreadable files
    }

    // Yield to event loop every 5 files to allow MCP requests to be processed
    if (i % 5 === 0 && i > 0) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    
    // Log progress periodically to avoid "stuck" feeling
    if (i % 50 === 0 && i > 0) {
        logger.info(`Context build progress: ${i}/${filesToProcess.length} files analyzed`);
    }
  }

  // Process test files for import tracking only (not for symbol indexing)
  // This ensures exports used only in tests aren't flagged as dead code
  for (let i = 0; i < testFiles.length; i++) {
    const testFilePath = testFiles[i];
    try {
      const content = await fs.readFile(testFilePath, "utf-8");
      const stats = await fs.stat(testFilePath);
      const fileInfo = analyzeFile(
        testFilePath,
        content,
        projectPath,
        context.framework,
      );
      fileInfo.lastModified = stats.mtimeMs;
      fileInfo.isTest = true; // Ensure it's marked as test

      // Add to files map (needed for dependency graph building)
      context.files.set(testFilePath, fileInfo);

      // DON'T add symbols to symbolIndex - we don't want to scan test code for issues
      // DON'T add keywords - not needed for test files
      // DON'T track entry points - test files aren't entry points
    } catch (err) {
      // Skip unreadable files
    }

    // Yield to event loop every 5 files to allow MCP requests to be processed
    if (i % 5 === 0 && i > 0) {
      await new Promise((resolve) => setImmediate(resolve));
    }
  }

  // Build dependency graph (second pass after all files indexed)
  // Use async version to read tsconfig.json for path aliases
  await buildDependencyGraphAsync(context);

  // Build symbol-level dependency graph (async/yielding)
  context.symbolGraph = await buildSymbolGraph(context as any, {
    includeCallRelationships: true,
    includeCoOccurrence: true,
    minCoOccurrenceCount: 2,
  });

  // Extract API Contract information (frontend/backend alignment)
  // This integrates API Contract Guardian into the existing context system
  // LAZY LOADING: Only build API contract context if both frontend and backend detected
  try {
    const hasFrontend = detectFrontendPresence(context);
    const hasBackend = detectBackendPresence(context);
    
    if (hasFrontend && hasBackend) {
      logger.info("Full-stack project detected - building API contract context...");
      const apiContractStart = Date.now();
      context.apiContract = await extractApiContractContext(context);
      logger.info(`API contract context built in ${Date.now() - apiContractStart}ms`);
    } else {
      logger.info(
        `${hasFrontend ? 'Frontend' : hasBackend ? 'Backend' : 'Unknown'}-only project - skipping API contract context`
      );
    }
  } catch (error) {
    logger.warn("Failed to extract API Contract context:", error);
    // Don't fail the entire context build if API Contract extraction fails
  }

  context.totalFiles = context.files.size;
  return context;
}

/**
 * Update a single file's information within an existing ProjectContext
 */
async function updateFileInContext(
  context: ProjectContext,
  filePath: string,
  projectPath: string,
  skipGraphRebuild: boolean = false
): Promise<void> {
  // 1. Remove old data for this file
  context.files.delete(filePath);
  
  // Remove from symbol index
  for (const [symbolName, infoArray] of context.symbolIndex) {
    const filtered = infoArray.filter(item => item.file !== filePath);
    if (filtered.length === 0) {
      context.symbolIndex.delete(symbolName);
    } else {
      context.symbolIndex.set(symbolName, filtered);
    }
  }

  // Remove from keyword index
  for (const [keyword, fileList] of context.keywordIndex) {
    const filtered = fileList.filter(f => f !== filePath);
    if (filtered.length === 0) {
      context.keywordIndex.delete(keyword);
    } else {
      context.keywordIndex.set(keyword, filtered);
    }
  }

  // Remove dependencies originating from this file
  context.dependencies = context.dependencies.filter(d => d.from !== filePath);
  
  // Update reverse import graph: remove this file from everyone it imported
  const oldImports = context.importGraph.get(filePath) || [];
  for (const impPath of oldImports) {
    const reverse = context.reverseImportGraph.get(impPath) || [];
    context.reverseImportGraph.set(impPath, reverse.filter(f => f !== filePath));
  }
  context.importGraph.delete(filePath);

  // Remove from entry points
  context.entryPoints = context.entryPoints.filter(f => f !== filePath);

  // 2. Re-analyze if file still exists
  try {
    if (fsSync.existsSync(filePath)) {
      const content = await fs.readFile(filePath, "utf-8");
      const stats = await fs.stat(filePath);
      const fileInfo = analyzeFile(
        filePath,
        content,
        projectPath,
        context.framework,
      );
      fileInfo.lastModified = stats.mtimeMs;

      // Ensure it's marked correctly if it's a test file
      const isTestDir = filePath.includes("/test/") || filePath.includes("/tests/") || filePath.includes("__tests__");
      const isTestFile = filePath.match(/\.(test|spec)\.[^.]+$/);
      if (isTestDir || isTestFile) {
        fileInfo.isTest = true;
      }

      context.files.set(filePath, fileInfo);

      // Add to symbol index (only if not a test file, matching buildProjectContext logic)
      if (!fileInfo.isTest) {
        for (const symbol of fileInfo.symbols) {
          if (!context.symbolIndex.has(symbol.name)) {
            context.symbolIndex.set(symbol.name, []);
          }
          context.symbolIndex.get(symbol.name)!.push({ file: filePath, symbol });
        }

        // Add keywords
        for (const keyword of fileInfo.keywords) {
          if (!context.keywordIndex.has(keyword)) {
            context.keywordIndex.set(keyword, []);
          }
          context.keywordIndex.get(keyword)!.push(filePath);
        }

        // Track entry points
        if (fileInfo.isEntryPoint) {
          context.entryPoints.push(filePath);
        }
      }

      // Track external dependencies
      for (const imp of fileInfo.imports) {
        if (imp.isExternal) {
          context.externalDependencies.add(imp.source);
        }
      }

      // 3. Re-resolve dependencies for this file
      const allFiles = Array.from(context.files.keys());
      const pathAliases = await detectPathAliasesAsync(context.projectPath, allFiles);
      const fileImports: string[] = [];

      for (const imp of fileInfo.imports) {
        let resolved: string | null = null;
        if (imp.isRelative) {
          resolved = resolveImport(imp.source, filePath, allFiles);
        } else {
          resolved = resolvePathAlias(imp.source, pathAliases, allFiles);
        }

        if (resolved) {
          fileImports.push(resolved);
          context.dependencies.push({
            from: filePath,
            to: resolved,
            importedSymbols: [...imp.namedImports, imp.defaultImport].filter(Boolean) as string[],
          });

          // Update reverse graph
          if (!context.reverseImportGraph.has(resolved)) {
            context.reverseImportGraph.set(resolved, []);
          }
          context.reverseImportGraph.get(resolved)!.push(filePath);
        }
      }
      context.importGraph.set(filePath, fileImports);
    }
  } catch (err) {
    logger.warn(`Failed to incrementally update context for ${filePath}: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 4. Rebuild symbol graph
  if (!skipGraphRebuild) {
    context.symbolGraph = await buildSymbolGraph(context as any, {
      includeCallRelationships: true,
      includeCoOccurrence: true,
      minCoOccurrenceCount: 2,
    });
  }

  context.buildTime = new Date().toISOString();
  context.totalFiles = context.files.size;
}

/**
 * Helper to detect common source root directories in a project.
 * This makes the tool smarter about where to look for code.
 */
function detectRootSourceDirs(projectPath: string, language: string): string[] {
  const commonDirs = language === "python" ? ["app", "src", "server", "core", "api"] : ["src", "app", "pages", "lib", "components", "actions", "services"];
  const found: string[] = [];

  for (const dir of commonDirs) {
    const fullPath = path.join(projectPath, dir);
    if (fsSync.existsSync(fullPath)) {
      found.push(dir);
    }
  }

  // If no common dirs found, return the root
  return found.length > 0 ? found : ["."];
}

async function findProjectFiles(
  projectPath: string,
  language: string,
  includeTests: boolean,
): Promise<string[]> {
  // PROTOTYPE: Only fully supported languages
  // TODO: Add support for Go, Java, and other languages in future versions
  const extensions: Record<string, string[]> = {
    javascript: [".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx"], // Include TS in JS projects for modern interop
    typescript: [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx"], // Include JS in TS projects for Vite/React
    python: [".py"],
    all: [".js", ".jsx", ".ts", ".tsx", ".py"], // Only TS/JS/Python for prototype
  };

  const exts = extensions[language] || extensions.all;
  
  // Intelligence: If running on project root, try to narrow down to common source dirs
  const sourceDirs = detectRootSourceDirs(projectPath, language);
  const patterns: string[] = [];
  
  for (const dir of sourceDirs) {
    for (const ext of exts) {
      // Use standard glob pattern from detected side dirs
      patterns.push(path.join(projectPath, dir, `**/*${ext}`));
    }
  }

  const excludes = [
    "**/node_modules/**",
    "**/venv/**",
    "**/.venv/**",
    "**/env/**",
    "**/__pycache__/**",
    "**/dist/**",
    "**/build/**",
    "**/.next/**",
    "**/coverage/**",
    "**/.git/**",
    "**/vendor/**",
    "**/*.min.js",
    ...getExcludePatternsForPath(projectPath),
  ];

  if (!includeTests) {
    excludes.push(
      "**/*.test.*",
      "**/*.spec.*",
      "**/test/**",
      "**/__tests__/**",
    );
  }

  const files = await glob(patterns, {
    ignore: excludes,
    nodir: true,
    absolute: true,
  });

  return filterExcludedFiles(files);
}

/**
 * Find test files only - used for import tracking when includeTests is false
 * This ensures exports used only in tests aren't flagged as dead code
 */
async function findTestFiles(
  projectPath: string,
  language: string,
): Promise<string[]> {
  const extensions: Record<string, string[]> = {
    javascript: [".js", ".jsx", ".mjs", ".cjs"],
    typescript: [".ts", ".tsx", ".mts", ".cts"],
    python: [".py"],
    go: [".go"],
    java: [".java"],
    all: [".js", ".jsx", ".ts", ".tsx", ".py", ".go", ".java"],
  };

  const exts = extensions[language] || extensions.all;

  // Only look for test files
  const testPatterns = [
    ...exts.map((ext) => `${projectPath}/**/*.test${ext}`),
    ...exts.map((ext) => `${projectPath}/**/*.spec${ext}`),
    ...exts.map((ext) => `${projectPath}/**/test/**/*${ext}`),
    ...exts.map((ext) => `${projectPath}/**/__tests__/**/*${ext}`),
    ...exts.map((ext) => `${projectPath}/**/tests/**/*${ext}`),
  ];

  const excludes = [
    "**/node_modules/**",
    "**/venv/**",
    "**/.venv/**",
    "**/env/**",
    "**/__pycache__/**",
    "**/dist/**",
    "**/build/**",
    "**/.next/**",
    "**/coverage/**",
    "**/.git/**",
    "**/vendor/**",
  ];

  const files = await glob(testPatterns, {
    ignore: excludes,
    nodir: true,
    absolute: true,
  });

  return filterExcludedFiles(files);
}

// ============================================================================
// File Analysis
// ============================================================================

function analyzeFile(
  filePath: string,
  content: string,
  projectPath: string,
  framework?: { name: string; patterns: string[] },
): FileInfo {
  const ext = path.extname(filePath);
  const language = getLanguageFromExt(ext);
  const relativePath = path.relative(projectPath, filePath);
  const fileName = path.basename(filePath);

  const fileInfo: FileInfo = {
    path: filePath,
    relativePath,
    language,
    size: content.length,
    symbols: [],
    imports: [],
    exports: [],
    keywords: [],
    isTest: isTestFile(filePath),
    isConfig: isConfigFile(fileName),
    isEntryPoint: isEntryPointFile(filePath, framework),
  };

  // Extract based on language - use AST for accurate multi-line parsing
  if (language === "typescript" || language === "javascript") {
    extractJSSymbolsAST(content, filePath, language, fileInfo);
    extractJSImportsAST(content, language, fileInfo);
    extractJSExportsRegex(content, fileInfo); // Keep regex for exports (simpler)
  } else if (language === "python") {
    extractPythonSymbolsAST(content, filePath, fileInfo);
    extractPythonImportsAST(content, fileInfo);
  }

  // Extract keywords from path and content
  fileInfo.keywords = extractKeywords(filePath, content);

  return fileInfo;
}

/**
 * AST-based JS/TS symbol extraction - handles multi-line signatures correctly
 */
function extractJSSymbolsAST(
  content: string,
  filePath: string,
  language: string,
  fileInfo: FileInfo,
): void {
  try {
    const astSymbols = extractSymbolsAST(content, filePath, language);

    for (const sym of astSymbols) {
      // Map AST symbol types to FileInfo symbol kinds
      let kind: SymbolInfo["kind"];
      switch (sym.type) {
        case "function":
          // Detect hooks and components
          if (
            sym.name.startsWith("use") &&
            sym.name[3]?.toUpperCase() === sym.name[3]
          ) {
            kind = "hook";
          } else if (/^[A-Z]/.test(sym.name)) {
            kind = "component";
          } else {
            kind = "function";
          }
          break;
        case "class":
          kind = "class";
          break;
        case "method":
          kind = "function"; // Methods are stored as functions with scope info
          break;
        case "variable":
          kind = "variable";
          break;
        case "interface":
          kind = "interface";
          break;
        case "type":
          kind = "type";
          break;
        default:
          kind = "function";
      }

      fileInfo.symbols.push({
        name: sym.name,
        kind,
        line: sym.line,
        exported: sym.isExported ?? false,
        async: sym.isAsync,
        params: sym.params?.map((p) => ({ name: p })),
        returnType: sym.returnType,
        scope: sym.scope,
      });
    }

    // Also extract interfaces, types, and enums using regex (AST doesn't cover these well)
    extractJSTypesRegex(content, fileInfo);
  } catch (err) {
    // Fallback to regex if AST parsing fails
    logger.debug(`AST parsing failed for ${filePath}, falling back to regex`);
    extractJSSymbolsRegex(content, fileInfo);
  }
}

/**
 * Extract TypeScript-specific types (interfaces, types, enums) using regex
 * These aren't well-supported by tree-sitter-javascript
 * 
 * NOTE: This now only adds symbols that weren't already extracted by AST parsing
 */
function extractJSTypesRegex(content: string, fileInfo: FileInfo): void {
  const lines = content.split("\n");
  
  // Helper to check if symbol already exists
  const symbolExists = (name: string) => fileInfo.symbols.some(s => s.name === name);

  lines.forEach((line, idx) => {
    const lineNum = idx + 1;

    // Interfaces - only add if not already extracted by AST
    const interfaceMatch = line.match(/(?:export\s+)?interface\s+(\w+)/);
    if (interfaceMatch && !symbolExists(interfaceMatch[1])) {
      fileInfo.symbols.push({
        name: interfaceMatch[1],
        kind: "interface",
        line: lineNum,
        exported: line.includes("export"),
      });
    }

    // Types - only add if not already extracted by AST
    const typeMatch = line.match(
      /(?:export\s+)?type\s+(\w+)\s*(?:<[^>]+>)?\s*=/,
    );
    if (typeMatch && !symbolExists(typeMatch[1])) {
      fileInfo.symbols.push({
        name: typeMatch[1],
        kind: "type",
        line: lineNum,
        exported: line.includes("export"),
      });
    }

    // Enums - only add if not already extracted by AST
    const enumMatch = line.match(/(?:export\s+)?enum\s+(\w+)/);
    if (enumMatch && !symbolExists(enumMatch[1])) {
      fileInfo.symbols.push({
        name: enumMatch[1],
        kind: "enum",
        line: lineNum,
        exported: line.includes("export"),
      });
    }
  });
}

/**
 * Fallback regex-based extraction for when AST fails
 */


function extractJSSymbolsRegex(content: string, fileInfo: FileInfo): void {
  const lines = content.split("\n");

  lines.forEach((line, idx) => {
    const lineNum = idx + 1;
    const funcMatch = line.match(
      /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*(?:<[^>]+>)?\s*\(([^)]*)\)(?:\s*:\s*([^{]+))?/,
    );
    if (funcMatch) {
      fileInfo.symbols.push({
        name: funcMatch[1],
        kind: "function",
        line: lineNum,
        exported: line.includes("export"),
        async: line.includes("async"),
        returnType: funcMatch[3]?.trim(),
        params: parseParams(funcMatch[2]),
      });
    }

    // Arrow functions
    const arrowMatch = line.match(
      /(?:export\s+)?const\s+(\w+)\s*(?::\s*[^=]+)?\s*=\s*(?:async\s*)?\(/,
    );
    if (arrowMatch && !fileInfo.symbols.find((s) => s.name === arrowMatch[1])) {
      const isHook =
        arrowMatch[1].startsWith("use") &&
        arrowMatch[1][3]?.toUpperCase() === arrowMatch[1][3];
      const isComponent = /^[A-Z]/.test(arrowMatch[1]);

      fileInfo.symbols.push({
        name: arrowMatch[1],
        kind:
          isHook ? "hook"
          : isComponent ? "component"
          : "function",
        line: lineNum,
        exported: line.includes("export"),
        async: line.includes("async"),
      });
    }

    // Classes
    const classMatch = line.match(/(?:export\s+)?class\s+(\w+)/);
    if (classMatch) {
      fileInfo.symbols.push({
        name: classMatch[1],
        kind: "class",
        line: lineNum,
        exported: line.includes("export"),
      });
    }

    // Interfaces
    const interfaceMatch = line.match(/(?:export\s+)?interface\s+(\w+)/);
    if (interfaceMatch) {
      fileInfo.symbols.push({
        name: interfaceMatch[1],
        kind: "interface",
        line: lineNum,
        exported: line.includes("export"),
      });
    }

    // Types
    const typeMatch = line.match(
      /(?:export\s+)?type\s+(\w+)\s*(?:<[^>]+>)?\s*=/,
    );
    if (typeMatch) {
      fileInfo.symbols.push({
        name: typeMatch[1],
        kind: "type",
        line: lineNum,
        exported: line.includes("export"),
      });
    }

    // Enums
    const enumMatch = line.match(/(?:export\s+)?enum\s+(\w+)/);
    if (enumMatch) {
      fileInfo.symbols.push({
        name: enumMatch[1],
        kind: "enum",
        line: lineNum,
        exported: line.includes("export"),
      });
    }

    // Exported variables/constants
    const varMatch = line.match(/export\s+(?:const|let|var)\s+(\w+)/);
    if (varMatch && !fileInfo.symbols.find((s) => s.name === varMatch[1])) {
      fileInfo.symbols.push({
        name: varMatch[1],
        kind: "variable",
        line: lineNum,
        exported: true,
      });
    }
  });
}

/**
 * AST-based JS/TS import extraction
 */
function extractJSImportsAST(
  content: string,
  language: string,
  fileInfo: FileInfo,
): void {
  try {
    const astImports = extractImportsAST(content, language);

    for (const imp of astImports) {
      fileInfo.imports.push({
        source: imp.module,
        isRelative: imp.module.startsWith("."),
        isExternal: imp.isExternal,
        defaultImport: imp.names.find((n) => n.imported === "default")?.local,
        namespaceImport: imp.names.find((n) => n.imported === "*")?.local,
        namedImports: imp.names
          .filter((n) => n.imported !== "default" && n.imported !== "*")
          .map((n) => n.local),
        line: imp.line,
      });
    }
  } catch (err) {
    // Fallback to regex if AST parsing fails
    extractJSImportsRegex(content, fileInfo);
  }
}

/**
 * Fallback regex-based import extraction
 */
function extractJSImportsRegex(content: string, fileInfo: FileInfo): void {
  const lines = content.split("\n");

  lines.forEach((line, idx) => {
    // ES imports
    const importMatch = line.match(
      /import\s+(?:(\w+)(?:\s*,\s*)?)?(?:\{([^}]+)\})?\s*from\s*['"]([^'"]+)['"]/,
    );
    if (importMatch) {
      const source = importMatch[3];
      const isRelative = source.startsWith(".");
      const isExternal =
        !isRelative &&
        !source.startsWith("/") &&
        !source.startsWith("@/") &&
        !source.startsWith("~/");

      fileInfo.imports.push({
        source,
        isRelative,
        isExternal,
        defaultImport: importMatch[1],
        namedImports:
          importMatch[2] ?
            importMatch[2].split(",").map((s) => s.trim().split(" ")[0])
          : [],
        line: idx + 1,
      });
    }

    // Dynamic imports: await import('...') or import('...')
    const dynamicImportMatch = line.match(
      /(?:await\s+)?import\s*\(\s*['"]([^'"]+)['"]\s*\)/,
    );
    if (dynamicImportMatch) {
      const source = dynamicImportMatch[1];
      const isRelative = source.startsWith(".");
      const isExternal =
        !isRelative &&
        !source.startsWith("/") &&
        !source.startsWith("@/") &&
        !source.startsWith("~/");

      // Try to extract destructured names from the same or next line
      // e.g., const { foo, bar } = await import('...')
      const destructureMatch = line.match(
        /\{\s*([^}]+)\s*\}\s*=\s*(?:await\s+)?import/,
      );
      const namedImports: string[] = [];
      if (destructureMatch) {
        const names = destructureMatch[1].split(",");
        for (const name of names) {
          const cleanName = name
            .trim()
            .split(/\s+as\s+/)[0]
            .trim();
          if (cleanName) namedImports.push(cleanName);
        }
      }

      fileInfo.imports.push({
        source,
        isRelative,
        isExternal,
        namedImports,
        line: idx + 1,
      });
    }

    // Require
    const requireMatch = line.match(
      /(?:const|let|var)\s+(?:(\w+)|\{([^}]+)\})\s*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/,
    );
    if (requireMatch) {
      const source = requireMatch[3];
      const isRelative = source.startsWith(".");
      const isExternal =
        !isRelative &&
        !source.startsWith("/") &&
        !source.startsWith("@/") &&
        !source.startsWith("~/");

      fileInfo.imports.push({
        source,
        isRelative,
        isExternal,
        defaultImport: requireMatch[1],
        namedImports:
          requireMatch[2] ?
            requireMatch[2].split(",").map((s) => s.trim())
          : [],
        line: idx + 1,
      });
    }
  });
}

/**
 * Regex-based export extraction (simple enough that AST isn't needed)
 */
function extractJSExportsRegex(content: string, fileInfo: FileInfo): void {
  const lines = content.split("\n");

  lines.forEach((line, idx) => {
    // Named exports
    const namedMatch = line.match(
      /export\s+(?:const|let|var|function|class|interface|type|enum)\s+(\w+)/,
    );
    if (namedMatch) {
      fileInfo.exports.push({
        name: namedMatch[1],
        kind: "named",
        isDefault: false,
        line: idx + 1,
      });
    }

    // Default export
    const defaultMatch = line.match(
      /export\s+default\s+(?:function\s+)?(\w+)?/,
    );
    if (defaultMatch) {
      fileInfo.exports.push({
        name: defaultMatch[1] || "default",
        kind: "default",
        isDefault: true,
        line: idx + 1,
      });
    }
  });
}

/**
 * AST-based Python symbol extraction
 */
function extractPythonSymbolsAST(
  content: string,
  filePath: string,
  fileInfo: FileInfo,
): void {
  try {
    const astSymbols = extractSymbolsAST(content, filePath, "python");

    for (const sym of astSymbols) {
      fileInfo.symbols.push({
        name: sym.name,
        kind: sym.type === "class" ? "class" : "function",
        line: sym.line,
        exported: !sym.name.startsWith("_"),
        async: sym.isAsync,
        params: sym.params?.map((p) => ({ name: p })),
      });
    }
  } catch (err) {
    // Fallback to regex if AST parsing fails
    extractPythonSymbolsRegex(content, fileInfo);
  }
}

/**
 * Fallback regex-based Python symbol extraction
 */
function extractPythonSymbolsRegex(content: string, fileInfo: FileInfo): void {
  const lines = content.split("\n");

  lines.forEach((line, idx) => {
    // Functions
    const funcMatch = line.match(/^(?:async\s+)?def\s+(\w+)\s*\(/);
    if (funcMatch) {
      fileInfo.symbols.push({
        name: funcMatch[1],
        kind: "function",
        line: idx + 1,
        exported: !funcMatch[1].startsWith("_"),
        async: line.includes("async"),
      });
    }

    // Classes
    const classMatch = line.match(/^class\s+(\w+)/);
    if (classMatch) {
      fileInfo.symbols.push({
        name: classMatch[1],
        kind: "class",
        line: idx + 1,
        exported: !classMatch[1].startsWith("_"),
      });
    }
  });
}

/**
 * AST-based Python import extraction
 */
function extractPythonImportsAST(content: string, fileInfo: FileInfo): void {
  try {
    const astImports = extractImportsAST(content, "python");

    for (const imp of astImports) {
      fileInfo.imports.push({
        source: imp.module,
        isRelative: imp.module.startsWith("."),
        isExternal: imp.isExternal,
        namedImports: imp.names.map((n) => n.local),
        defaultImport: imp.names.length === 1 ? imp.names[0].local : undefined,
        line: imp.line,
      });
    }
  } catch (err) {
    // Fallback to regex if AST parsing fails
    extractPythonImportsRegex(content, fileInfo);
  }
}

/**
 * Fallback regex-based Python import extraction
 */
function extractPythonImportsRegex(content: string, fileInfo: FileInfo): void {
  const lines = content.split("\n");

  lines.forEach((line, idx) => {
    // from X import Y
    const fromMatch = line.match(/from\s+([\w.]+)\s+import\s+(.+)/);
    if (fromMatch) {
      const source = fromMatch[1];
      const isRelative = source.startsWith(".");
      const isExternal = !isRelative && !source.includes(".");

      fileInfo.imports.push({
        source,
        isRelative,
        isExternal,
        namedImports: fromMatch[2]
          .split(",")
          .map((s) => s.trim().split(" ")[0]),
        line: idx + 1,
      });
    }

    // import X
    const importMatch = line.match(/^import\s+([\w.]+)/);
    if (importMatch) {
      const source = importMatch[1];
      fileInfo.imports.push({
        source,
        isRelative: false,
        isExternal: !source.includes("."),
        namedImports: [],
        defaultImport: source.split(".")[0],
        line: idx + 1,
      });
    }
  });
}

// ============================================================================
// Dependency Graph
// ============================================================================

/**
 * Build dependency graph with async tsconfig.json reading for path aliases
 */
async function buildDependencyGraphAsync(
  context: ProjectContext,
): Promise<void> {
  const allFiles = Array.from(context.files.keys());

  const pathAliases = await detectPathAliasesAsync(
    context.projectPath,
    allFiles,
  );

  let i = 0;
  for (const [filePath, fileInfo] of context.files) {
    i++;
    const imports: string[] = [];

    for (const imp of fileInfo.imports) {
      let resolved: string | null = null;

      if (imp.isRelative) {
        // Standard relative import: ./foo, ../bar
        resolved = resolveImport(imp.source, filePath, allFiles);
      } else {
        // Check if it's a path alias (e.g., @/services/timeEntries, ~/utils)
        resolved = resolvePathAlias(imp.source, pathAliases, allFiles);
      }

      if (resolved) {
        imports.push(resolved);

        // Add dependency edge
        context.dependencies.push({
          from: filePath,
          to: resolved,
          importedSymbols: [...imp.namedImports, imp.defaultImport].filter(
            Boolean,
          ) as string[],
        });

        // Update reverse graph
        if (!context.reverseImportGraph.has(resolved)) {
          context.reverseImportGraph.set(resolved, []);
        }
        context.reverseImportGraph.get(resolved)!.push(filePath);
      }
    }

    context.importGraph.set(filePath, imports);

    // Yield every 20 files
    if (i % 20 === 0) {
      await new Promise((resolve) => setImmediate(resolve));
    }
  }
}

// Unused function - kept for potential future use
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function buildDependencyGraph(context: ProjectContext): void {
  const allFiles = Array.from(context.files.keys());

  // Detect path aliases from common patterns (sync version)
  // For async tsconfig reading, we'd need to refactor buildProjectContext
  const pathAliases = detectPathAliases(context.projectPath, allFiles);

  for (const [filePath, fileInfo] of context.files) {
    const imports: string[] = [];

    for (const imp of fileInfo.imports) {
      let resolved: string | null = null;

      if (imp.isRelative) {
        // Standard relative import: ./foo, ../bar
        resolved = resolveImport(imp.source, filePath, allFiles);
      } else {
        // Check if it's a path alias (e.g., @/services/timeEntries, ~/utils)
        resolved = resolvePathAlias(imp.source, pathAliases, allFiles);
      }

      if (resolved) {
        imports.push(resolved);

        // Add dependency edge
        context.dependencies.push({
          from: filePath,
          to: resolved,
          importedSymbols: [...imp.namedImports, imp.defaultImport].filter(
            Boolean,
          ) as string[],
        });

        // Update reverse graph
        if (!context.reverseImportGraph.has(resolved)) {
          context.reverseImportGraph.set(resolved, []);
        }
        context.reverseImportGraph.get(resolved)!.push(filePath);
      }
    }

    context.importGraph.set(filePath, imports);
  }
}

/**
 * Detect path aliases from tsconfig.json or common patterns
 */
async function detectPathAliasesAsync(
  projectPath: string,
  allFiles: string[],
): Promise<Map<string, string>> {
  const aliases = new Map<string, string>();

  // Try to read tsconfig.json for actual path mappings
  try {
    const tsconfigPath = path.join(projectPath, "tsconfig.json");
    const tsconfigContent = await fs.readFile(tsconfigPath, "utf-8");
    const tsconfig = JSON.parse(tsconfigContent);

    if (tsconfig.compilerOptions?.paths) {
      const baseUrl = tsconfig.compilerOptions.baseUrl || ".";
      const basePath = path.join(projectPath, baseUrl);

      for (const [alias, targets] of Object.entries(
        tsconfig.compilerOptions.paths,
      )) {
        if (Array.isArray(targets) && targets.length > 0) {
          // Remove trailing /* from alias pattern
          const cleanAlias = alias.replace(/\/\*$/, "/");
          // Remove trailing /* from target and resolve path
          const target = (targets[0] as string).replace(/\/\*$/, "");
          const resolvedTarget = path.join(basePath, target);
          aliases.set(cleanAlias, resolvedTarget);
        }
      }
    }
  } catch {
    // tsconfig.json not found or invalid, use heuristics
  }

  // If no aliases found from tsconfig, use common patterns
  if (aliases.size === 0) {
    const commonAliases = [
      { prefix: "@/", dirs: ["src", "app", "lib", "."] },
      { prefix: "~/", dirs: ["src", "app", "lib", "."] },
      { prefix: "@", dirs: ["src", "app", "lib"] },
    ];

    for (const alias of commonAliases) {
      for (const dir of alias.dirs) {
        const testPath = path.join(projectPath, dir);
        const hasFiles = allFiles.some((f) =>
          f.startsWith(testPath + path.sep),
        );
        if (hasFiles) {
          aliases.set(alias.prefix, testPath);
          break;
        }
      }
    }
  }

  return aliases;
}

/**
 * Synchronous version for use in buildDependencyGraph
 */
function detectPathAliases(
  projectPath: string,
  allFiles: string[],
): Map<string, string> {
  const aliases = new Map<string, string>();

  // Common alias patterns and their typical mappings
  const commonAliases = [
    { prefix: "@/", dirs: ["src", "app", "lib", "."] },
    { prefix: "~/", dirs: ["src", "app", "lib", "."] },
    { prefix: "@", dirs: ["src", "app", "lib"] },
  ];

  for (const alias of commonAliases) {
    for (const dir of alias.dirs) {
      const testPath = path.join(projectPath, dir);
      const hasFiles = allFiles.some((f) => f.startsWith(testPath + path.sep));
      if (hasFiles) {
        aliases.set(alias.prefix, testPath);
        break;
      }
    }
  }

  return aliases;
}

/**
 * Resolve a path alias import to an actual file
 */
function resolvePathAlias(
  importPath: string,
  aliases: Map<string, string>,
  allFiles: string[],
): string | null {
  // Try each alias prefix
  for (const [prefix, basePath] of aliases) {
    if (importPath.startsWith(prefix)) {
      const relativePart = importPath.slice(prefix.length);
      const resolved = path.join(basePath, relativePart);

      // Try exact match
      if (allFiles.includes(resolved)) return resolved;

      // Try with extensions
      for (const ext of [".ts", ".tsx", ".js", ".jsx"]) {
        const withExt = resolved + ext;
        if (allFiles.includes(withExt)) return withExt;
      }

      // Try index files
      for (const indexFile of ["index.ts", "index.tsx", "index.js"]) {
        const withIndex = path.join(resolved, indexFile);
        if (allFiles.includes(withIndex)) return withIndex;
      }
    }
  }

  return null;
}

export function resolveImport(
  importPath: string,
  fromFile: string,
  allFiles: string[],
): string | null {
  const dir = path.dirname(fromFile);
  const resolved = path.normalize(path.join(dir, importPath));

  // Try exact match
  if (allFiles.includes(resolved)) return resolved;

  // Handle .js -> .ts extension mapping (common in TypeScript projects with ESM)
  // e.g., import from './foo.js' should resolve to './foo.ts'
  if (resolved.endsWith(".js")) {
    const withTs = resolved.slice(0, -3) + ".ts";
    if (allFiles.includes(withTs)) return withTs;
    const withTsx = resolved.slice(0, -3) + ".tsx";
    if (allFiles.includes(withTsx)) return withTsx;
  }
  if (resolved.endsWith(".jsx")) {
    const withTsx = resolved.slice(0, -4) + ".tsx";
    if (allFiles.includes(withTsx)) return withTsx;
    const withTs = resolved.slice(0, -4) + ".ts";
    if (allFiles.includes(withTs)) return withTs;
  }

  // Try with extensions
  for (const ext of [".ts", ".tsx", ".js", ".jsx", ".py"]) {
    const withExt = resolved + ext;
    if (allFiles.includes(withExt)) return withExt;
  }

  // Try index files
  for (const indexFile of [
    "index.ts",
    "index.tsx",
    "index.js",
    "__init__.py",
  ]) {
    const withIndex = path.join(resolved, indexFile);
    if (allFiles.includes(withIndex)) return withIndex;
  }

  return null;
}

// ============================================================================
// Helpers
// ============================================================================

function getLanguageFromExt(ext: string): string {
  const map: Record<string, string> = {
    ".js": "javascript",
    ".jsx": "javascript",
    ".mjs": "javascript",
    ".ts": "typescript",
    ".tsx": "typescript",
    ".mts": "typescript",
    ".py": "python",
    ".go": "go",
    ".java": "java",
  };
  return map[ext] || "unknown";
}

function parseParams(paramStr: string): Array<{ name: string; type?: string }> {
  if (!paramStr.trim()) return [];
  return paramStr.split(",").map((p) => {
    const parts = p.trim().split(":");
    return {
      name: parts[0].replace(/[?]$/, "").trim(),
      type: parts[1]?.trim(),
    };
  });
}

function isTestFile(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return (
    lower.includes(".test.") ||
    lower.includes(".spec.") ||
    lower.includes("__tests__") ||
    lower.includes("/test/") ||
    lower.includes("/tests/")
  );
}

function isConfigFile(fileName: string): boolean {
  const configPatterns = [
    /^\..*rc$/,
    /config\./,
    /\.config\./,
    /settings\./,
    /\.env/,
    /package\.json/,
    /tsconfig/,
    /jest\.config/,
    /webpack\.config/,
    /vite\.config/,
    /next\.config/,
  ];
  return configPatterns.some((p) => p.test(fileName.toLowerCase()));
}

function isEntryPointFile(
  filePath: string,
  framework?: { name: string; patterns: string[] },
): boolean {
  const fileName = path.basename(filePath).toLowerCase();
  const relativePath = filePath.toLowerCase();

  // Common entry points
  const commonEntryNames = ["index", "main", "app", "server", "cli", "tool", "handler", "mcp", "worker"];
  if (commonEntryNames.some((n) => fileName.startsWith(n))) {
    return true;
  }

  // Root files in src/ are often entry points or public APIs
  // For example: src/validateCode.ts
  const parts = relativePath.split(/[/\\]/);
  if (parts.length === 2 && parts[0] === "src") {
    return true;
  }

  // Bin directory
  if (relativePath.includes("/bin/")) {
    return true;
  }

  // Framework-specific
  if (framework?.name === "nextjs") {
    if (
      relativePath.includes("/app/") &&
      (fileName === "page.tsx" ||
        fileName === "page.ts" ||
        fileName === "layout.tsx")
    ) {
      return true;
    }
    if (relativePath.includes("/pages/") && !fileName.startsWith("_")) {
      return true;
    }
  }

  return false;
}

async function detectFramework(
  projectPath: string,
  files: string[],
): Promise<{ name: string; version?: string; patterns: string[] } | undefined> {
  // Check for Next.js
  const hasNextConfig = files.some((f) => f.includes("next.config"));
  const hasAppDir = files.some((f) => f.includes("/app/page."));
  const hasPagesDir = files.some((f) => f.includes("/pages/"));

  if (hasNextConfig || hasAppDir || hasPagesDir) {
    return {
      name: "nextjs",
      patterns: ["app/", "pages/", "components/", "lib/"],
    };
  }

  // Check for React (without Next)
  const hasReact = files.some(
    (f) => f.includes("App.tsx") || f.includes("App.jsx"),
  );
  if (hasReact) {
    return {
      name: "react",
      patterns: ["src/", "components/"],
    };
  }

  // Check for FastAPI/Flask
  const hasFastAPI = files.some((f) => {
    const name = path.basename(f);
    return name === "main.py" || name === "app.py";
  });
  if (hasFastAPI) {
    return {
      name: "fastapi",
      patterns: ["app/", "api/", "routers/", "services/"],
    };
  }

  return undefined;
}

function extractKeywords(filePath: string, content: string): string[] {
  const keywords: string[] = [];

  // From path
  const pathParts = filePath
    .split(/[/\\]/)
    .filter((p) => p && !p.startsWith("."));
  keywords.push(
    ...pathParts.map((p) => p.toLowerCase().replace(/\.[^.]+$/, "")),
  );

  // From content (top words by frequency)
  const words = content.match(/\b[a-zA-Z][a-zA-Z0-9_]{2,}\b/g) || [];
  const wordFreq = new Map<string, number>();
  const stopWords = new Set([
    "the",
    "and",
    "for",
    "from",
    "import",
    "export",
    "const",
    "let",
    "var",
    "function",
    "return",
    "this",
    "that",
    "with",
    "async",
    "await",
    "true",
    "false",
  ]);

  for (const word of words) {
    const lower = word.toLowerCase();
    if (!stopWords.has(lower) && lower.length > 3) {
      wordFreq.set(lower, (wordFreq.get(lower) || 0) + 1);
    }
  }

  const topKeywords = Array.from(wordFreq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([word]) => word);

  keywords.push(...topKeywords);
  return [...new Set(keywords)];
}

// ============================================================================
// Disk Persistence
// ============================================================================

/**
 * Load context from disk cache
 */
async function loadContextFromDisk(
  projectPath: string,
  currentGitInfo: GitInfo | null
): Promise<CachedContext | null> {
  try {
    const cacheDir = path.join(projectPath, CACHE_DIR_NAME);
    const cacheFile = path.join(cacheDir, CACHE_FILE_NAME);

    // Check if file exists
    try {
      await fs.access(cacheFile);
    } catch {
      return null;
    }

    const content = await fs.readFile(cacheFile, "utf-8");
    const cached = deserialize<CachedContext>(content);

    // Verify it belongs to this project path (just in case)
    if (cached.context.projectPath !== projectPath) {
        logger.info(`Disk cache path mismatch: ${cached.context.projectPath} vs ${projectPath}`);
        return null;
    }

    // Strict Git Check: If git info doesn't match exactly, discard cache
    if (currentGitInfo && cached.gitInfo) {
        if (currentGitInfo.branch !== cached.gitInfo.branch || 
            currentGitInfo.commitSHA !== cached.gitInfo.commitSHA) {
            logger.info(`Disk cache invalid: Git commit/branch mismatch (${currentGitInfo.commitSHA} vs ${cached.gitInfo.commitSHA})`);
            return null;
        }
    } else if (currentGitInfo || cached.gitInfo) {
        // One has git, the other doesn't -> mismatch
        logger.info("Disk cache invalid: Git presence mismatch");
        return null;
    }

    // If no git, check file count as basic proxy
    // (This is less reliable but better than nothing for non-git projects)
    if (!currentGitInfo) {
         // Simple age check - expire after 1 hour if no git
         if (Date.now() - cached.timestamp > 60 * 60 * 1000) {
             logger.info("Disk cache expired (no git)");
             return null;
         }
    }

    logger.info(`Hydrated context from disk for ${projectPath}`);
    return cached;

  } catch (error) {
    logger.warn(`Failed to load context from disk: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

/**
 * Save context to disk cache
 */
async function saveContextToDisk(
  projectPath: string,
  cachedContext: CachedContext
): Promise<void> {
  try {
    const cacheDir = path.join(projectPath, CACHE_DIR_NAME);
    
    // Ensure .gitignore exists and includes the cache directory
    const gitignorePath = path.join(projectPath, ".gitignore");
    try {
        const gitignore = await fs.readFile(gitignorePath, "utf-8");
        if (!gitignore.includes(CACHE_DIR_NAME)) {
            await fs.appendFile(gitignorePath, `\n# CodeGuardian Cache\n${CACHE_DIR_NAME}/\n`);
        }
    } catch {
        // No .gitignore, create one
        await fs.writeFile(gitignorePath, `# CodeGuardian Cache\n${CACHE_DIR_NAME}/\n`);
    }

    // Create cache directory
    await fs.mkdir(cacheDir, { recursive: true });

    const cacheFile = path.join(cacheDir, CACHE_FILE_NAME);
    const tempFile = `${cacheFile}.tmp`;
    const content = serialize(cachedContext);
    
    await fs.writeFile(tempFile, content, "utf-8");
    await fs.rename(tempFile, cacheFile);
    logger.debug(`Persisted context to ${cacheFile}`);

  } catch (error) {
    logger.warn(`Failed to save context to disk: ${error instanceof Error ? error.message : String(error)}`);
  }
}
