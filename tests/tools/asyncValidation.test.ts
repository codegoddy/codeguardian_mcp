/**
 * Tests for async validation tools
 * @format
 */

import {
  startValidationTool,
  getValidationStatusTool,
  getValidationResultsTool,
} from "../../src/tools/asyncValidation.js";
import { registerValidationJob } from "../../src/queue/validationJob.js";
import { jobQueue } from "../../src/queue/jobQueue.js";
import * as path from "path";
import * as fs from "fs/promises";
import * as os from "os";

async function cleanupTempDir(root: string): Promise<void> {
  const maxAttempts = 5;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await fs.rm(root, { recursive: true, force: true });
      return;
    } catch {
      if (attempt === maxAttempts) return;
      await new Promise((resolve) => setTimeout(resolve, 75));
    }
  }
}

// Initialize job queue before tests
beforeAll(() => {
  registerValidationJob();
});

// Cleanup after all tests
afterAll(() => {
  jobQueue.shutdown();
});

describe("Async Validation", () => {
  const fixtureDir = path.join(__dirname, "../fixtures/react-test");

  it("should start a validation job and return job ID", async () => {
    const result = await startValidationTool.handler({
      projectPath: fixtureDir,
      language: "typescript",
    });

    expect(result.content).toBeDefined();
    expect(result.content[0].type).toBe("text");

    const response = JSON.parse(result.content[0].text);
    expect(response.success).toBe(true);
    expect(response.jobId).toBeDefined();
    expect(response.status).toBe("queued");
    expect(response.jobId).toMatch(/^validation_/);
  });

  it("should block ambiguous monorepo root paths for start_validation", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "async-validation-scope-"));
    try {
      const frontendDir = path.join(tempDir, "frontend");
      const backendDir = path.join(tempDir, "backend");

      await fs.mkdir(frontendDir, { recursive: true });
      await fs.mkdir(backendDir, { recursive: true });

      // Root manifest exists, but there are multiple language scopes beneath it.
      // start_validation should force the caller to choose a scoped subdirectory.
      await fs.writeFile(path.join(tempDir, "package.json"), '{"name":"root","private":true}');
      await fs.writeFile(path.join(frontendDir, "package.json"), '{"name":"frontend"}');
      await fs.writeFile(path.join(backendDir, "package.json"), '{"name":"backend"}');

      const result = await startValidationTool.handler({
        projectPath: tempDir,
        language: "typescript",
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error).toBe("ambiguousValidationScope");
      expect(response.suggestedProjectPaths).toContain(frontendDir);
      expect(response.suggestedProjectPaths).toContain(backendDir);
    } finally {
      await cleanupTempDir(tempDir);
    }
  });

  it("should auto-scope start_validation when only one subproject manifest exists", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "async-validation-autoscope-"));
    try {
      const frontendDir = path.join(tempDir, "frontend");
      await fs.mkdir(frontendDir, { recursive: true });
      await fs.writeFile(path.join(frontendDir, "package.json"), '{"name":"frontend"}');

      const result = await startValidationTool.handler({
        projectPath: tempDir,
        language: "typescript",
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.requestedProjectPath).toBe(path.resolve(tempDir));
      expect(response.effectiveProjectPath).toBe(frontendDir);
    } finally {
      await cleanupTempDir(tempDir);
    }
  });

  it("should check job status", async () => {
    // Start a job
    const startResult = await startValidationTool.handler({
      projectPath: fixtureDir,
      language: "typescript",
    });

    const startResponse = JSON.parse(startResult.content[0].text);
    const jobId = startResponse.jobId;

    // Check status
    const statusResult = await getValidationStatusTool.handler({ jobId });
    const statusResponse = JSON.parse(statusResult.content[0].text);

    expect(statusResponse.success).toBe(true);
    expect(statusResponse.exists).toBe(true);
    expect(statusResponse.jobId).toBe(jobId);
    expect(statusResponse.status).toBeDefined();
    expect(["queued", "processing", "complete"]).toContain(
      statusResponse.status,
    );
  });

  it("should retrieve job results when complete", async () => {
    // Start a job
    const startResult = await startValidationTool.handler({
      projectPath: fixtureDir,
      language: "typescript",
    });

    const startResponse = JSON.parse(startResult.content[0].text);
    const jobId = startResponse.jobId;

    // Wait for completion (with timeout)
    let attempts = 0;
    const maxAttempts = 60; // 30 seconds
    let complete = false;

    while (attempts < maxAttempts && !complete) {
      await new Promise((resolve) => setTimeout(resolve, 500));

      const statusResult = await getValidationStatusTool.handler({ jobId });
      const statusResponse = JSON.parse(statusResult.content[0].text);

      if (statusResponse.status === "complete") {
        complete = true;
      } else if (statusResponse.status === "failed") {
        throw new Error(`Job failed: ${statusResponse.error}`);
      }

      attempts++;
    }

    expect(complete).toBe(true);

    // Get results
    const resultsResult = await getValidationResultsTool.handler({
      jobId,
      summaryOnly: true,
    });
    const resultsResponse = JSON.parse(resultsResult.content[0].text);

    expect(resultsResponse.success).toBe(true);
    expect(resultsResponse.exists).toBe(true);
    expect(resultsResponse.status).toBe("complete");
    expect(resultsResponse.summary).toBeDefined();
    expect(resultsResponse.stats).toBeDefined();
  }, 60000); // 60 second timeout

  it("should handle non-existent job ID", async () => {
    const statusResult = await getValidationStatusTool.handler({
      jobId: "validation_nonexistent",
    });

    const statusResponse = JSON.parse(statusResult.content[0].text);
    expect(statusResponse.success).toBe(false);
    expect(statusResponse.exists).toBe(false);
  });

  it("should not return results for incomplete job", async () => {
    // Start a job
    const startResult = await startValidationTool.handler({
      projectPath: fixtureDir,
      language: "typescript",
    });

    const startResponse = JSON.parse(startResult.content[0].text);
    const jobId = startResponse.jobId;

    // Try to get results immediately (should fail)
    const resultsResult = await getValidationResultsTool.handler({ jobId });
    const resultsResponse = JSON.parse(resultsResult.content[0].text);

    // Should either be queued or processing, not complete
    if (resultsResponse.status !== "complete") {
      expect(resultsResponse.success).toBe(false);
      expect(["queued", "processing"]).toContain(resultsResponse.status);
    }
  });
});
