# CodeGuardian MCP - Performance Optimization Plan

## Executive Summary

Based on the test results in `PROBLEMS.md`, the tools are **too slow** for production use and generate **too many false positives**. This document outlines a comprehensive optimization plan to achieve:

- **50-70% speedup** with quick wins (Phase 1)
- **2-5x speedup** with architecture improvements (Phase 2)  
- **5-10x speedup** with advanced optimizations (Phase 3)

## Current Performance Issues

### Test Results Analysis

| Tool | Files | Avg Time/File | Total Time | Issues Found |
|------|-------|---------------|------------|--------------|
| prevent_hallucinations (Backend) | 250 | 32ms | ~8s | 271 (mostly false positives) |
| prevent_hallucinations (Frontend) | 204 | 69ms | ~14s | 4406 (mostly false positives) |
| analyze_code_quality (Backend) | 250 | ~1ms | ~0.25s | 289 |
| analyze_code_quality (Frontend) | 204 | ~2ms | ~0.4s | 11106 (too noisy) |
| run_security_scan | 454 | varies | ~5s | 97 (many false positives) |

**Total analysis time for 454 files: ~30-40 seconds**

### Root Causes

1. **No caching** - Symbol tables rebuilt for every file
2. **No batching** - Files processed one-by-one
3. **External tools** - pylint/mypy run for every Python file
4. **Regex-heavy** - Inefficient pattern matching
5. **No filtering** - Analyzing test files, config files, etc.
6. **False positives** - Generating thousands of invalid issues
7. **Large output** - 46MB JSON with all the false positives

## Optimization Roadmap

---

## Phase 1: Quick Wins (1-2 hours, 50-70% speedup)

### 1.1 Fix Critical Bugs

#### Bug: Broken Comment Regex in importValidator.ts

**Location:** `src/analyzers/importValidator.ts:47`

**Current (BROKEN):**
```typescript
return code.replace(/\/\/.*/g, '').replace(/\/[\s\S]*?\//g, '');
```

**Problem:** The second regex `/\/[\s\S]*?\//g` removes ANY text between slashes, including:
- URLs: `https://example.com`
- File paths: `/api/users/${id}`
- Division operators: `a / b / c`

**Fix:**
```typescript
return code.replace(/\/\/.*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
```

**Impact:** Fixes hundreds of false positive "unused import" errors

---

### 1.2 Disable External Tools by Default

**Location:** `src/tools/preventHallucinations.ts:145-180`

**Current:** Runs pylint and mypy for EVERY Python file

**Problem:** 
- External process spawning is slow (50-100ms per file)
- Often fails or times out
- Adds minimal value for hallucination detection

**Fix:** Add option to disable external tools

```typescript
// In preventHallucinations.ts handler
const opts = {
  checkNonExistentReferences: true,
  checkImportConsistency: true,
  checkTypeConsistency: true,
  checkLogicContradictions: true,
  checkParameterMismatches: true,
  checkReturnValueConsistency: true,
  runExternalTools: false, // NEW: default to false
  ...options,
};

// Only run external tools if explicitly enabled
if (language === 'python' && opts.runExternalTools) {
  // ... pylint/mypy code ...
}
```

**Impact:** 30-50% speedup on Python files

---

### 1.3 Add File Type Filtering

**Create:** `src/utils/fileFilter.ts`

```typescript
/**
 * Determine if a file should be analyzed based on path and type
 */
export function shouldAnalyzeFile(filePath: string, options?: {
  includeTests?: boolean;
  includeConfigs?: boolean;
  customExclusions?: string[];
}): boolean {
  const opts = {
    includeTests: false,
    includeConfigs: false,
    customExclusions: [],
    ...options,
  };

  const path = filePath.toLowerCase();

  // Exclude vendor/generated directories
  const excludedDirs = [
    'node_modules', 'venv', '.venv', 'dist', 'build', 
    '.next', 'coverage', '__pycache__', '.git'
  ];
  if (excludedDirs.some(dir => path.includes(`/${dir}/`) || path.includes(`\\${dir}\\`))) {
    return false;
  }

  // Exclude test files unless explicitly included
  if (!opts.includeTests) {
    const testPatterns = [
      '/test/', '/tests/', '/e2e/', '/__tests__/',
      '.test.', '.spec.', '_test.', 'test_'
    ];
    if (testPatterns.some(pattern => path.includes(pattern))) {
      return false;
    }
  }

  // Exclude config files unless explicitly included
  if (!opts.includeConfigs) {
    const configPatterns = [
      '.config.', 'config.', 'setup.', '.rc.', 
      'jest.config', 'webpack.config', 'babel.config'
    ];
    if (configPatterns.some(pattern => path.includes(pattern))) {
      return false;
    }
  }

  // Custom exclusions
  if (opts.customExclusions.some(pattern => path.includes(pattern))) {
    return false;
  }

  return true;
}
```

**Usage:** Add to tool handlers before processing files

**Impact:** 30-50% reduction in files to analyze

---

### 1.4 Pre-compile Regex Patterns

**Location:** `src/analyzers/symbolTable.ts`, `src/analyzers/referenceValidator.ts`

**Current:** Regex patterns compiled inside loops

**Fix:** Move regex compilation outside loops

```typescript
// In symbolTable.ts - buildJavaScriptSymbolTable
const FUNCTION_PATTERNS = [
  /function\s+(\w+)\s*\(/g,
  /const\s+(\w+)\s*=\s*\([^)]*\)\s*=>/g,
  /const\s+(\w+)\s*=\s*function/g,
  /(\w+)\s*:\s*function\s*\(/g,
];

const CLASS_METHOD_PATTERN = /(?:async\s+)?(\w+)\s*\([^)]*\)\s*(?::[^\{]+)?\s*{/g;
const CLASS_PATTERN = /class\s+(\w+)/g;
const INTERFACE_PATTERN = /interface\s+(\w+)/g;
// ... etc

// Then use them in loops
for (const pattern of FUNCTION_PATTERNS) {
  let match;
  while ((match = pattern.exec(code)) !== null) {
    // ...
  }
}
```

**Impact:** 10-20% speedup in symbol table building

---

### 1.5 Use Set for Deduplication

**Location:** Multiple files using `Array.includes()` for deduplication

**Current:**
```typescript
if (!symbolTable.functions.includes(funcName)) {
  symbolTable.functions.push(funcName);
}
```

**Fix:**
```typescript
// Use Set during collection
const functionsSet = new Set<string>();
// ... collect functions ...
functionsSet.add(funcName);

// Convert to array at the end
symbolTable.functions = Array.from(functionsSet);
```

**Impact:** 5-10% speedup for large codebases

---

## Phase 2: Architecture Improvements (3-5 hours, 2-5x speedup)

### 2.1 Implement Symbol Table Caching

**Create:** `src/utils/cache.ts`

```typescript
import crypto from 'crypto';

interface CacheEntry<T> {
  data: T;
  hash: string;
  timestamp: number;
}

export class AnalysisCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private maxAge: number;

  constructor(maxAgeMs: number = 5 * 60 * 1000) { // 5 minutes default
    this.maxAge = maxAgeMs;
  }

  /**
   * Generate hash for content
   */
  private hash(content: string): string {
    return crypto.createHash('md5').update(content).digest('hex');
  }

  /**
   * Get cached entry if valid
   */
  get(key: string, content: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // Check if expired
    if (Date.now() - entry.timestamp > this.maxAge) {
      this.cache.delete(key);
      return null;
    }

    // Check if content changed
    const currentHash = this.hash(content);
    if (currentHash !== entry.hash) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  /**
   * Store entry in cache
   */
  set(key: string, content: string, data: T): void {
    this.cache.set(key, {
      data,
      hash: this.hash(content),
      timestamp: Date.now(),
    });
  }

  /**
   * Clear cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  stats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }
}

// Global caches
export const symbolTableCache = new AnalysisCache<any>();
export const issuesCache = new AnalysisCache<any[]>();
```

**Usage in symbolTable.ts:**

```typescript
import { symbolTableCache } from '../utils/cache.js';

export async function buildSymbolTable(
  codebase: string,
  language: string
): Promise<SymbolTable> {
  const cacheKey = `symbol-${language}`;
  
  // Check cache first
  const cached = symbolTableCache.get(cacheKey, codebase);
  if (cached) {
    logger.debug('Using cached symbol table');
    return cached;
  }

  logger.debug(`Building symbol table for ${language}...`);
  
  // ... existing symbol table building code ...
  
  // Cache the result
  symbolTableCache.set(cacheKey, codebase, symbolTable);
  
  return symbolTable;
}
```

**Impact:** 50-90% speedup for repeated analyses

---

### 2.2 Batch Processing Mode

**Create:** `src/tools/batchAnalyze.ts`

```typescript
import { buildSymbolTable } from '../analyzers/symbolTable.js';
import { validateReferences } from '../analyzers/referenceValidator.js';
import { shouldAnalyzeFile } from '../utils/fileFilter.js';
import { promises as fs } from 'fs';
import path from 'path';

interface BatchAnalysisOptions {
  directory: string;
  language: string;
  includeTests?: boolean;
  includeConfigs?: boolean;
  maxFiles?: number;
}

export async function batchAnalyzeDirectory(options: BatchAnalysisOptions) {
  const { directory, language, includeTests, includeConfigs, maxFiles = 1000 } = options;
  
  // Step 1: Collect all files to analyze
  const files = await collectFiles(directory, language, { includeTests, includeConfigs });
  const filesToAnalyze = files.slice(0, maxFiles);
  
  logger.info(`Analyzing ${filesToAnalyze.length} files in batch mode`);
  
  // Step 2: Build symbol table ONCE for entire codebase
  const allCode = await Promise.all(
    filesToAnalyze.map(f => fs.readFile(f, 'utf-8'))
  );
  const combinedCode = allCode.join('\n\n');
  
  const symbolTable = await buildSymbolTable(combinedCode, language);
  logger.info(`Built symbol table: ${symbolTable.functions.length} functions, ${symbolTable.classes.length} classes`);
  
  // Step 3: Analyze files in parallel (with concurrency limit)
  const results = await analyzeFilesInParallel(
    filesToAnalyze,
    allCode,
    symbolTable,
    language,
    10 // concurrency limit
  );
  
  return {
    totalFiles: filesToAnalyze.length,
    symbolTable,
    results,
  };
}

async function collectFiles(
  dir: string,
  language: string,
  options: { includeTests?: boolean; includeConfigs?: boolean }
): Promise<string[]> {
  const files: string[] = [];
  const extensions = getExtensionsForLanguage(language);
  
  async function walk(currentDir: string) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      
      if (entry.isDirectory()) {
        // Skip excluded directories
        if (shouldAnalyzeFile(fullPath, options)) {
          await walk(fullPath);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        if (extensions.includes(ext) && shouldAnalyzeFile(fullPath, options)) {
          files.push(fullPath);
        }
      }
    }
  }
  
  await walk(dir);
  return files;
}

function getExtensionsForLanguage(language: string): string[] {
  const extensionMap: Record<string, string[]> = {
    javascript: ['.js', '.jsx'],
    typescript: ['.ts', '.tsx'],
    python: ['.py'],
    go: ['.go'],
  };
  return extensionMap[language] || [];
}

async function analyzeFilesInParallel(
  files: string[],
  codes: string[],
  symbolTable: any,
  language: string,
  concurrency: number
): Promise<any[]> {
  const results: any[] = [];
  
  // Process in chunks to limit concurrency
  for (let i = 0; i < files.length; i += concurrency) {
    const chunk = files.slice(i, i + concurrency);
    const codeChunk = codes.slice(i, i + concurrency);
    
    const chunkResults = await Promise.all(
      chunk.map(async (file, idx) => {
        try {
          const issues = await validateReferences(codeChunk[idx], symbolTable, language);
          return { file, issues, success: true };
        } catch (error) {
          return { file, error: String(error), success: false };
        }
      })
    );
    
    results.push(...chunkResults);
  }
  
  return results;
}
```

**Impact:** 2-3x speedup for directory-wide analysis

---

### 2.3 Optimize Regex Patterns with Word Boundaries

**Location:** `src/analyzers/referenceValidator.ts`, `src/analyzers/security/securityScanner.ts`

**Problem:** Current patterns match substrings (e.g., "Updated" matches "UPDATE")

**Fix:** Use word boundaries and more precise patterns

```typescript
// In security scanner - SQL injection detection
// BEFORE (too broad):
const SQL_PATTERNS = [
  /SELECT.*FROM/gi,
  /INSERT.*INTO/gi,
  /UPDATE.*SET/gi,
  /DELETE.*FROM/gi,
];

// AFTER (more precise):
const SQL_PATTERNS = [
  /\bSELECT\b.*\bFROM\b/gi,
  /\bINSERT\b.*\bINTO\b/gi,
  /\bUPDATE\b.*\bSET\b/gi,
  /\bDELETE\b.*\bFROM\b/gi,
];

// Even better: Check for actual SQL context
function isSQLInjectionRisk(code: string, line: string): boolean {
  // Must have SQL keyword AND string concatenation/interpolation
  const hasSQLKeyword = /\b(SELECT|INSERT|UPDATE|DELETE)\b/gi.test(line);
  const hasStringConcat = /\+\s*["']|["']\s*\+|`.*\$\{/.test(line);
  const hasExecuteMethod = /\.(execute|query|raw)\s*\(/.test(line);
  
  return hasSQLKeyword && (hasStringConcat || hasExecuteMethod);
}
```

**Impact:** 50-80% reduction in false positives

---

### 2.4 Add Configurable Severity Thresholds

**Location:** All tool handlers

**Add option to filter results by severity:**

```typescript
// In tool options
interface AnalysisOptions {
  minSeverity?: 'low' | 'medium' | 'high' | 'critical';
  maxIssues?: number;
  // ... other options
}

// Filter results before returning
function filterIssuesBySeverity(
  issues: Issue[],
  minSeverity: string = 'medium'
): Issue[] {
  const severityOrder = { low: 0, medium: 1, high: 2, critical: 3 };
  const threshold = severityOrder[minSeverity as keyof typeof severityOrder] || 1;
  
  return issues.filter(issue => {
    const issueSeverity = severityOrder[issue.severity as keyof typeof severityOrder] || 0;
    return issueSeverity >= threshold;
  });
}
```

**Impact:** Reduces output size and processing time

---

## Phase 3: Advanced Optimizations (1-2 days, 5-10x speedup)

### 3.1 Worker Thread Parallelization

**Create:** `src/workers/analysisWorker.ts`

```typescript
import { parentPort, workerData } from 'worker_threads';
import { validateReferences } from '../analyzers/referenceValidator.js';

// Worker receives: { code, symbolTable, language, fileIndex }
// Worker sends back: { fileIndex, issues, error }

if (parentPort) {
  const { code, symbolTable, language, fileIndex } = workerData;
  
  validateReferences(code, symbolTable, language)
    .then(issues => {
      parentPort!.postMessage({ fileIndex, issues, success: true });
    })
    .catch(error => {
      parentPort!.postMessage({ fileIndex, error: String(error), success: false });
    });
}
```

**Usage in batch analyzer:**

```typescript
import { Worker } from 'worker_threads';

async function analyzeFilesWithWorkers(
  files: string[],
  codes: string[],
  symbolTable: any,
  language: string,
  maxWorkers: number = 4
): Promise<any[]> {
  const results: any[] = new Array(files.length);
  const workers: Worker[] = [];
  
  return new Promise((resolve, reject) => {
    let completed = 0;
    let nextFileIndex = 0;
    
    // Create worker pool
    for (let i = 0; i < Math.min(maxWorkers, files.length); i++) {
      createWorker();
    }
    
    function createWorker() {
      if (nextFileIndex >= files.length) return;
      
      const fileIndex = nextFileIndex++;
      const worker = new Worker('./analysisWorker.js', {
        workerData: {
          code: codes[fileIndex],
          symbolTable,
          language,
          fileIndex,
        },
      });
      
      worker.on('message', (result) => {
        results[result.fileIndex] = result;
        completed++;
        
        worker.terminate();
        
        if (completed === files.length) {
          resolve(results);
        } else {
          createWorker(); // Start next file
        }
      });
      
      worker.on('error', reject);
    }
  });
}
```

**Impact:** 3-4x speedup on multi-core systems

---

### 3.2 Incremental Analysis (Git Diff Based)

**Create:** `src/utils/incrementalAnalysis.ts`

```typescript
import { exec } from 'child_process';
import { promisify } from 'util';
const execPromise = promisify(exec);

export async function getChangedFiles(
  repoPath: string,
  baseBranch: string = 'main'
): Promise<string[]> {
  try {
    const { stdout } = await execPromise(
      `git diff --name-only ${baseBranch}...HEAD`,
      { cwd: repoPath }
    );
    return stdout.trim().split('\n').filter(f => f);
  } catch (error) {
    logger.warn('Could not get git diff, analyzing all files');
    return [];
  }
}

export async function analyzeOnlyChangedFiles(
  repoPath: string,
  language: string,
  baseBranch?: string
): Promise<any> {
  const changedFiles = await getChangedFiles(repoPath, baseBranch);
  
  if (changedFiles.length === 0) {
    logger.info('No changed files detected');
    return { changedFiles: [], results: [] };
  }
  
  logger.info(`Analyzing ${changedFiles.length} changed files`);
  
  // Only analyze changed files
  return batchAnalyzeFiles(changedFiles, language);
}
```

**Impact:** 10-100x speedup for incremental analysis

---

### 3.3 AST-Based Parsing

**Replace regex-based parsing with proper AST parsing:**

```typescript
// For TypeScript/JavaScript: use @typescript-eslint/parser
import { parse } from '@typescript-eslint/parser';

function buildSymbolTableFromAST(code: string): SymbolTable {
  const ast = parse(code, {
    ecmaVersion: 2022,
    sourceType: 'module',
  });
  
  const symbolTable: SymbolTable = {
    functions: [],
    classes: [],
    variables: [],
    imports: [],
  };
  
  // Traverse AST
  traverse(ast, {
    FunctionDeclaration(node) {
      symbolTable.functions.push(node.id.name);
    },
    ClassDeclaration(node) {
      symbolTable.classes.push(node.id.name);
    },
    // ... etc
  });
  
  return symbolTable;
}
```

**Impact:** More accurate, potentially faster for large files

---

## Implementation Priority

### Immediate (Do First)
1. ✅ Fix importValidator regex bug (5 minutes)
2. ✅ Disable external tools by default (10 minutes)
3. ✅ Add file type filtering (30 minutes)

### Short-term (This Week)
4. ✅ Pre-compile regex patterns (1 hour)
5. ✅ Use Set for deduplication (30 minutes)
6. ✅ Implement symbol table caching (2 hours)
7. ✅ Add severity filtering (1 hour)

### Medium-term (Next Sprint)
8. ✅ Batch processing mode (4 hours)
9. ✅ Optimize regex patterns (2 hours)
10. ✅ Incremental analysis (3 hours)

### Long-term (Future)
11. Worker thread parallelization (1 day)
12. AST-based parsing (2 days)
13. Persistent cache with file watching (2 days)

---

## Expected Performance Improvements

| Phase | Changes | Expected Speedup | Effort |
|-------|---------|------------------|--------|
| Phase 1 | Quick wins | 50-70% | 1-2 hours |
| Phase 2 | Architecture | 2-5x | 3-5 hours |
| Phase 3 | Advanced | 5-10x | 1-2 days |

### Target Performance (After Phase 1 + 2)

| Tool | Current | Target | Improvement |
|------|---------|--------|-------------|
| prevent_hallucinations | 32-69ms/file | 5-10ms/file | 5-7x faster |
| analyze_code_quality | 1-2ms/file | 0.5-1ms/file | 2x faster |
| run_security_scan | varies | 1-2ms/file | 3-5x faster |
| **Full directory scan** | **30-40s** | **3-5s** | **8-10x faster** |

---

## Monitoring & Validation

### Add Performance Metrics

```typescript
// In each tool handler
const metrics = {
  startTime: Date.now(),
  cacheHits: 0,
  cacheMisses: 0,
  filesAnalyzed: 0,
  issuesFound: 0,
};

// ... analysis code ...

const result = {
  // ... existing result fields ...
  performance: {
    totalTime: Date.now() - metrics.startTime,
    avgTimePerFile: (Date.now() - metrics.startTime) / metrics.filesAnalyzed,
    cacheHitRate: metrics.cacheHits / (metrics.cacheHits + metrics.cacheMisses),
    filesPerSecond: metrics.filesAnalyzed / ((Date.now() - metrics.startTime) / 1000),
  },
};
```

### Benchmark Suite

Create `scripts/benchmark.ts` to track performance over time:

```typescript
import { preventHallucinationsTool } from '../src/tools/preventHallucinations.js';

async function benchmark() {
  const testCases = [
    { name: 'Small file', size: '100 lines', path: 'test/fixtures/small.ts' },
    { name: 'Medium file', size: '500 lines', path: 'test/fixtures/medium.ts' },
    { name: 'Large file', size: '2000 lines', path: 'test/fixtures/large.ts' },
  ];
  
  for (const testCase of testCases) {
    const start = Date.now();
    await preventHallucinationsTool.handler({ /* ... */ });
    const elapsed = Date.now() - start;
    
    console.log(`${testCase.name}: ${elapsed}ms`);
  }
}
```

---

## Conclusion

The current implementation is **too slow** and generates **too many false positives** for production use. By implementing the optimizations in this plan, we can achieve:

1. **8-10x faster** analysis (30-40s → 3-5s for full directory)
2. **50-80% fewer** false positives
3. **Better user experience** with real-time feedback
4. **Scalability** to handle large codebases (10,000+ files)

**Recommended approach:** Start with Phase 1 (quick wins) to get immediate improvements, then implement Phase 2 (architecture) for long-term scalability.
