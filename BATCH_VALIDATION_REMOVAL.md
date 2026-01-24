# Batch Validation Removal

## Problem

The `validate_code_batch` tool was designed to validate large codebases by processing files in batches. However, it had a critical flaw: **it always timed out on large codebases** because it tried to complete all work synchronously within the MCP timeout window (typically 60 seconds).

Even when we tried to make it delegate to the async job queue, it would wait synchronously for up to 5 minutes, which still caused timeout issues and poor UX.

## Solution

**Removed `validate_code_batch` entirely** and made `start_validation` the primary tool for large codebase validation.

## What Changed

### Removed Files
- `src/tools/validateCodeBatch.ts` - The problematic batch validation tool
- `tests/tools/validateCodeBatch.test.ts` - Associated tests

### Updated Files
- `src/tools/index.ts` - Removed batch tool from registration
- `src/tools/asyncValidation.ts` - Enhanced documentation for `start_validation`

## New Tool Architecture

### For Small Code Snippets (< 50 files)
Use `validate_code`:
```typescript
validate_code({
  projectPath: ".",
  newCode: "const user = getUserById(id);",
  language: "typescript"
})
```

### For Large Codebases (50+ files)
Use the async validation workflow:

**Step 1: Start validation**
```typescript
start_validation({
  projectPath: "frontend",
  language: "typescript"
})
// Returns: { jobId: "validation_abc123", status: "queued" }
```

**Step 2: Check status (recommended: use waitForCompletion)**
```typescript
get_validation_status({
  jobId: "validation_abc123",
  waitForCompletion: true  // Waits internally, returns when done
})
// Returns: { status: "complete", progress: { percent: 100, ... } }
```

**Step 3: Get results**
```typescript
get_validation_results({
  jobId: "validation_abc123"
})
// Returns: { score: 85, hallucinations: [...], deadCode: [...], ... }
```

## Benefits

1. **No More Timeouts**: Jobs run in background with no timeout limits
2. **Better Progress Tracking**: Real-time progress updates with detailed metrics
3. **Clearer UX**: LLMs know exactly which tool to use (no confusion between batch vs async)
4. **Simpler Codebase**: One less tool to maintain and test

## Migration Guide

If you were using `validate_code_batch`:

**Before:**
```typescript
validate_code_batch({
  projectPath: "frontend",
  language: "typescript",
  batchSize: 50
})
// Would timeout on large codebases
```

**After:**
```typescript
// Start the job
const startResult = await start_validation({
  projectPath: "frontend",
  language: "typescript",
  batchSize: 50
});
const jobId = JSON.parse(startResult.content[0].text).jobId;

// Wait for completion
const statusResult = await get_validation_status({
  jobId,
  waitForCompletion: true,
  maxWaitSeconds: 600  // 10 minutes max
});

// Get results
const resultsResult = await get_validation_results({ jobId });
const results = JSON.parse(resultsResult.content[0].text).result;
```

## Implementation Details

The async validation system uses a job queue (`src/queue/jobQueue.ts`) that:
- Processes jobs in the background
- Supports up to 3 concurrent jobs
- Provides real-time progress updates
- Stores results for 24 hours
- Never times out

The validation job handler (`src/queue/validationJob.ts`) implements the same batch processing logic that `validate_code_batch` used, but runs it asynchronously without timeout constraints.
