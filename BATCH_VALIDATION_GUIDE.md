# Batch Validation Guide

## Problem: Timeout Errors on Large Codebases

When validating large codebases (100+ files), you may encounter MCP timeout errors:

```
McpMCP error -32001: Request timed out
```

This happens because `validate_code` tries to process all files synchronously, which can exceed the MCP timeout threshold (typically 60 seconds).

## Solution: Use `validate_code_batch`

The `validate_code_batch` tool processes files in batches, staying under timeout limits while still validating your entire codebase.

## Basic Usage

```typescript
validate_code_batch({
  projectPath: "/path/to/your/project",
  language: "typescript",
  batchSize: 50  // Default: 50 files per batch
})
```

## Configuration Options

### Batch Size

Controls how many files are processed in each batch:

```typescript
// Small batches (safer for very large projects)
validate_code_batch({
  projectPath: ".",
  language: "typescript",
  batchSize: 25
})

// Large batches (faster for smaller projects)
validate_code_batch({
  projectPath: ".",
  language: "typescript",
  batchSize: 100  // Max: 100
})
```

**Recommended batch sizes:**
- 100-200 files: `batchSize: 50` (default)
- 200-500 files: `batchSize: 40`
- 500-1000 files: `batchSize: 30`
- 1000+ files: `batchSize: 25`

### Include/Exclude Tests

```typescript
// Skip test files (faster validation)
validate_code_batch({
  projectPath: ".",
  language: "typescript",
  includeTests: false
})

// Include test files (comprehensive validation)
validate_code_batch({
  projectPath: ".",
  language: "typescript",
  includeTests: true  // Default
})
```

### Strict Mode

```typescript
// Flag all unresolved symbols
validate_code_batch({
  projectPath: ".",
  language: "typescript",
  strictMode: true
})
```

## Understanding the Output

### Summary Section

```json
{
  "summary": {
    "totalIssues": 12,
    "criticalIssues": 3,    // Confidence >= 85%
    "highIssues": 5,        // Confidence 70-84%
    "mediumIssues": 4,      // Confidence 50-69%
    "deadCodeIssues": 0
  }
}
```

### Stats Section

```json
{
  "stats": {
    "filesScanned": 202,        // Total files found
    "filesProcessed": 202,      // Files actually validated
    "batchCount": 5,            // Number of batches
    "batchSize": 50,            // Files per batch
    "symbolsInProject": 1911,   // Total symbols indexed
    "contextBuildTime": "20500ms",  // Time to index project
    "validationTime": "8200ms",     // Time to validate files
    "totalTime": "28700ms"          // Total execution time
  }
}
```

## Performance Expectations

| Files | Batch Size | Expected Time |
|-------|------------|---------------|
| 100   | 50         | ~15 seconds   |
| 200   | 50         | ~30 seconds   |
| 500   | 40         | ~60 seconds   |
| 1000  | 30         | ~120 seconds  |

**Note:** Times vary based on:
- File size and complexity
- Number of symbols per file
- System performance
- Whether context is cached

## Workflow Recommendations

### 1. Initial Full Scan

When first validating a codebase:

```typescript
validate_code_batch({
  projectPath: ".",
  language: "typescript",
  batchSize: 50,
  includeTests: true
})
```

### 2. Focused Validation

After fixing issues, validate specific directories:

```typescript
validate_code_batch({
  projectPath: "./src/components",
  language: "typescript",
  batchSize: 50
})
```

### 3. CI/CD Integration

For continuous validation:

```typescript
validate_code_batch({
  projectPath: ".",
  language: "typescript",
  batchSize: 30,
  includeTests: false,  // Faster
  strictMode: true      // Catch everything
})
```

## Comparison: validate_code vs validate_code_batch

| Feature | validate_code | validate_code_batch |
|---------|---------------|---------------------|
| **Best for** | Code snippets, single files | Entire codebases |
| **File limit** | ~50 files | Unlimited |
| **Timeout risk** | High on large projects | None |
| **Processing** | Synchronous | Batched |
| **Progress tracking** | No | Yes (batch-by-batch) |
| **Use case** | AI-generated snippets | Codebase audits |

## Troubleshooting

### Still Getting Timeouts?

1. **Reduce batch size:**
   ```typescript
   batchSize: 20  // or even 10
   ```

2. **Exclude tests:**
   ```typescript
   includeTests: false
   ```

3. **Validate subdirectories separately:**
   ```typescript
   // Instead of validating entire project
   validate_code_batch({ projectPath: "./src/components", ... })
   validate_code_batch({ projectPath: "./src/services", ... })
   ```

### Context Building Takes Too Long?

The first validation builds context (indexes all symbols). Subsequent validations use cached context:

```typescript
// First run: ~20 seconds context build + validation
// Second run: ~5 seconds (cached context) + validation
```

To force rebuild:
```typescript
build_context({
  projectPath: ".",
  forceRebuild: true
})
```

### Memory Issues?

For extremely large projects (5000+ files), consider:

1. Validating in chunks by directory
2. Using `maxFiles` parameter in `build_context`
3. Increasing Node.js memory: `node --max-old-space-size=4096`

## Example: Validating a Next.js App

```typescript
// Full validation
validate_code_batch({
  projectPath: "/path/to/nextjs-app",
  language: "typescript",
  batchSize: 50,
  includeTests: true
})

// Just the app directory
validate_code_batch({
  projectPath: "/path/to/nextjs-app/app",
  language: "typescript",
  batchSize: 50
})

// Just components
validate_code_batch({
  projectPath: "/path/to/nextjs-app/components",
  language: "typescript",
  batchSize: 50
})
```

## Best Practices

1. **Start with default settings** - Only adjust if you hit issues
2. **Use includeTests: false for speed** - Unless you need comprehensive validation
3. **Validate subdirectories** - For faster iteration during development
4. **Cache context** - Let the tool reuse cached context between runs
5. **Monitor stats** - Use the stats section to optimize batch size

## When to Use Each Tool

- **validate_code**: Validating AI-generated code snippets in real-time
- **validate_code_batch**: Auditing existing codebases, CI/CD, comprehensive scans
- **build_context**: Pre-warming cache, forcing rebuild after major changes
- **get_dependency_graph**: Understanding file relationships and impact analysis
