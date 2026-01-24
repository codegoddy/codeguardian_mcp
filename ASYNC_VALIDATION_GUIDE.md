# Async Validation System - Complete Guide

## Overview

The async validation system solves the timeout problem for large codebases by running validation jobs in the background. Jobs can take as long as needed without hitting MCP timeout limits.

## The Problem It Solves

**Before (Synchronous):**
```
validate_code_batch({ projectPath: "/frontend", ... })
→ Timeout after 60 seconds ❌
```

**After (Asynchronous):**
```
1. start_validation({ projectPath: "/frontend", ... })
   → Returns immediately with job ID ✅

2. get_validation_status({ jobId: "..." })
   → Check progress (45% complete...)

3. get_validation_results({ jobId: "..." })
   → Get full results when done ✅
```

## Architecture

### Components

1. **Job Queue** (`src/queue/jobQueue.ts`)
   - Manages background jobs
   - Processes up to 3 jobs concurrently
   - Stores results for 24 hours
   - Auto-cleanup of expired jobs

2. **Validation Job Handler** (`src/queue/validationJob.ts`)
   - Executes validation in background
   - Reports progress through 6 phases
   - Same validation quality as synchronous tools

3. **MCP Tools** (`src/tools/asyncValidation.ts`)
   - `start_validation` - Submit job
   - `get_validation_status` - Check progress
   - `get_validation_results` - Retrieve results

### Job Lifecycle

```
QUEUED → PROCESSING → COMPLETE
   ↓          ↓
CANCELLED  FAILED
```

## Usage

### 1. Start Validation

```typescript
start_validation({
  projectPath: "/path/to/frontend",
  language: "typescript",
  batchSize: 50,        // Optional
  strictMode: false,    // Optional
  includeTests: true    // Optional
})
```

**Returns:**
```json
{
  "success": true,
  "jobId": "validation_abc123_xyz789",
  "status": "queued",
  "message": "Validation job submitted successfully",
  "nextSteps": [
    "Use get_validation_status({ jobId: \"...\" }) to check progress",
    "Use get_validation_results({ jobId: \"...\" }) to get results when complete"
  ]
}
```

### 2. Check Progress

**Option A: Single Status Check**
```typescript
get_validation_status({
  jobId: "validation_abc123_xyz789"
})
```

**Option B: Wait for Completion (Recommended)**
```typescript
get_validation_status({
  jobId: "validation_abc123_xyz789",
  waitForCompletion: true,      // Polls internally every 3 seconds
  maxWaitSeconds: 300            // Optional: max 5 minutes (default)
})
```

**Returns (Processing):**
```json
{
  "success": true,
  "exists": true,
  "jobId": "validation_abc123_xyz789",
  "status": "processing",
  "progress": {
    "phase": "validating",
    "percent": 65,
    "message": "Processing batch 13/20 (50 files)",
    "details": {
      "currentBatch": 13,
      "totalBatches": 20,
      "filesInBatch": 50,
      "filesProcessed": 650,
      "totalFiles": 1000
    }
  }
}
```

**Returns (Complete with waitForCompletion):**
```json
{
  "success": true,
  "exists": true,
  "jobId": "validation_abc123_xyz789",
  "status": "complete",
  "progress": {...},
  "waitedSeconds": 45
}
```

### 3. Get Results

```typescript
get_validation_results({
  jobId: "validation_abc123_xyz789"
})
```

**Returns (Complete):**
```json
{
  "success": true,
  "exists": true,
  "jobId": "validation_abc123_xyz789",
  "status": "complete",
  "result": {
    "success": true,
    "validated": true,
    "score": 85,
    "hallucinationDetected": true,
    "deadCodeDetected": false,
    "hallucinations": [...],
    "deadCode": [...],
    "recommendation": {...},
    "summary": {
      "totalIssues": 12,
      "criticalIssues": 3,
      "highIssues": 5,
      "mediumIssues": 4,
      "deadCodeIssues": 0
    },
    "stats": {
      "filesScanned": 202,
      "filesProcessed": 202,
      "batchCount": 5,
      "batchSize": 50,
      "symbolsInProject": 1911,
      "contextBuildTime": "20500ms",
      "validationTime": "8200ms",
      "deadCodeTime": "2100ms",
      "totalTime": "30800ms"
    }
  }
}
```

## Progress Phases

Jobs go through 6 phases with progress updates:

| Phase | Percent | Description |
|-------|---------|-------------|
| `context_building` | 0-20% | Indexing project symbols |
| `loading_dependencies` | 20-30% | Loading package.json/requirements.txt |
| `discovering_files` | 30-35% | Finding source files |
| `validating` | 35-85% | Processing files in batches |
| `dead_code_detection` | 85-95% | Detecting unused exports |
| `finalizing` | 95-100% | Calculating scores |
| `complete` | 100% | Done |

## Workflow Examples

### Example 1: Basic Validation (Recommended)

```typescript
// 1. Start job
const start = await start_validation({
  projectPath: "/frontend",
  language: "typescript"
});
const jobId = start.jobId;

// 2. Wait for completion (polls internally every 3 seconds)
const status = await get_validation_status({ 
  jobId,
  waitForCompletion: true,
  maxWaitSeconds: 300  // 5 minutes max
});

if (status.status === "complete") {
  // 3. Get results
  const results = await get_validation_results({ jobId });
  console.log(`Score: ${results.result.score}`);
  console.log(`Issues: ${results.result.summary.totalIssues}`);
} else if (status.status === "failed") {
  console.error(`Validation failed: ${status.error}`);
}
```

### Example 2: Manual Polling (Advanced)

```typescript
// 1. Start job
const start = await start_validation({
  projectPath: "/frontend",
  language: "typescript"
});
const jobId = start.jobId;

// 2. Poll manually (use 3-5 second intervals minimum)
let complete = false;
while (!complete) {
  await sleep(3000); // Wait 3 seconds - IMPORTANT: Don't poll faster!
  
  const status = await get_validation_status({ jobId });
  
  if (status.status === "complete") {
    complete = true;
  } else if (status.status === "failed") {
    throw new Error(status.error);
  }
  
  // Show progress
  console.log(`${status.progress.percent}% - ${status.progress.message}`);
}

// 3. Get results
const results = await get_validation_results({ jobId });
console.log(`Score: ${results.result.score}`);
console.log(`Issues: ${results.result.summary.totalIssues}`);
```

### Example 2: With Progress Tracking

```typescript
const start = await start_validation({
  projectPath: "/frontend",
  language: "typescript",
  batchSize: 40
});

const jobId = start.jobId;
let lastPercent = 0;

const checkProgress = setInterval(async () => {
  const status = await get_validation_status({ jobId });
  
  if (status.progress && status.progress.percent > lastPercent) {
    lastPercent = status.progress.percent;
    console.log(`[${status.progress.percent}%] ${status.progress.phase}: ${status.progress.message}`);
    
    if (status.progress.details) {
      console.log(`  Files: ${status.progress.details.filesProcessed}/${status.progress.details.totalFiles}`);
    }
  }
  
  if (status.status === "complete" || status.status === "failed") {
    clearInterval(checkProgress);
    
    if (status.status === "complete") {
      const results = await get_validation_results({ jobId });
      console.log("Validation complete!");
      console.log(JSON.stringify(results.result.summary, null, 2));
    }
  }
}, 1000); // Check every second
```

### Example 3: Error Handling

```typescript
try {
  const start = await start_validation({
    projectPath: "/frontend",
    language: "typescript"
  });
  
  const jobId = start.jobId;
  
  // Wait for completion with timeout
  const maxWait = 300000; // 5 minutes
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWait) {
    const status = await get_validation_status({ jobId });
    
    if (status.status === "complete") {
      const results = await get_validation_results({ jobId });
      return results.result;
    }
    
    if (status.status === "failed") {
      throw new Error(`Validation failed: ${status.error}`);
    }
    
    await sleep(2000);
  }
  
  throw new Error("Validation timed out");
  
} catch (error) {
  console.error("Validation error:", error);
}
```

## Performance

### Timing Expectations

| Project Size | Context Build | Validation | Dead Code | Total |
|--------------|---------------|------------|-----------|-------|
| 100 files | ~10s | ~5s | ~2s | ~17s |
| 200 files | ~20s | ~8s | ~2s | ~30s |
| 500 files | ~45s | ~20s | ~5s | ~70s |
| 1000 files | ~90s | ~40s | ~10s | ~140s |

### Concurrency

- Max 3 jobs run simultaneously
- Additional jobs queue automatically
- Jobs process independently

## Job Management

### Job Expiration

- Jobs expire after 24 hours
- Expired jobs are auto-deleted
- Check `exists: false` in responses

### Job Status Codes

| Status | Description |
|--------|-------------|
| `queued` | Waiting to start |
| `processing` | Currently running |
| `complete` | Finished successfully |
| `failed` | Error occurred |
| `cancelled` | User cancelled (future feature) |

## Comparison: Sync vs Async

| Feature | validate_code_batch | Async Validation |
|---------|---------------------|------------------|
| **Timeout risk** | High (>200 files) | None |
| **Progress tracking** | No | Yes (6 phases) |
| **Tool calls** | 1 | 3 (start, status, results) |
| **Complexity** | Simple | Moderate |
| **Best for** | <200 files | Any size |
| **Cancellation** | No | Yes (future) |
| **History** | No | Yes (24 hours) |

## When to Use

### Use Async Validation When:
- ✅ Project has 200+ files
- ✅ Getting timeout errors
- ✅ Need progress tracking
- ✅ Running in CI/CD
- ✅ Want to check results later

### Use Sync Validation When:
- ✅ Project has <100 files
- ✅ Need immediate results
- ✅ Simpler workflow preferred
- ✅ One-off validation

## Troubleshooting

### Job Not Found

```json
{
  "success": false,
  "exists": false,
  "error": "Job not found: validation_abc123",
  "message": "Job may have expired (jobs expire after 24 hours)"
}
```

**Solution:** Job expired or invalid ID. Start a new validation.

### Job Failed

```json
{
  "success": true,
  "exists": true,
  "status": "failed",
  "error": "Cannot read property 'symbolIndex' of undefined"
}
```

**Solution:** Check error message. Common causes:
- Invalid project path
- Unsupported language
- File permission issues

### Job Stuck in Processing

If a job stays in "processing" for too long:

1. Check progress details - might be working on large files
2. Wait longer - 1000 files can take 2-3 minutes
3. If truly stuck (>10 minutes), restart the MCP server

## Future Enhancements

Planned features:

1. **Job Cancellation**
   ```typescript
   cancel_validation({ jobId: "..." })
   ```

2. **Job History**
   ```typescript
   list_validation_jobs({ limit: 10 })
   ```

3. **Webhooks**
   ```typescript
   start_validation({
     projectPath: "...",
     webhookUrl: "https://..."
   })
   ```

4. **Persistent Storage**
   - Redis backend for job queue
   - Survive server restarts
   - Share jobs across instances

## Technical Details

### Memory Usage

- Context cached per project
- Jobs store results in memory
- ~50MB per 1000-file project
- Auto-cleanup prevents leaks

### Thread Safety

- Job queue is single-threaded
- Jobs process sequentially per queue
- Multiple queues can run in parallel

### Error Recovery

- Failed jobs don't block queue
- Errors logged with full stack trace
- Queue continues processing

## Summary

The async validation system provides:

✅ **No timeout limits** - Validate projects of any size
✅ **Progress tracking** - Know what's happening
✅ **Same quality** - Uses identical validation logic
✅ **Future-proof** - Foundation for advanced features
✅ **Production-ready** - Tested and reliable

Use it for large codebases where synchronous validation times out.
