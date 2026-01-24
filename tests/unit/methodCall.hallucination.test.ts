/**
 * Test for Method Call Hallucination Detection
 *
 * These are the types of errors that are currently being missed:
 * - SuperAnalytics.trackPageView() - non-existent method call
 * - quantumState.entangle(theme) - non-existent method call
 * - AITaskPredictor.connect() - non-existent method call
 *
 * @format
 */

import { validateCodeTool } from "../../src/tools/validateCode.js";

describe("Method Call Hallucination Detection", () => {
  const projectPath = ".";

  it("should catch method calls on non-existent objects", async () => {
    const newCode = `
// These objects don't exist anywhere
SuperAnalytics.trackPageView('/home');
AITaskPredictor.connect();
QuantumStateManager.initialize();
CloudBackup.sync(data);
    `;

    const result = await validateCodeTool.handler({
      projectPath,
      newCode,
      language: "javascript",
      strictMode: false, // This is the default mode
    });

    const parsed = JSON.parse(result.content[0].text);
    console.log(
      "Issues found:",
      JSON.stringify(parsed.hallucinations, null, 2),
    );

    // These should be caught as hallucinations
    expect(parsed.hallucinationDetected).toBe(true);

    const issues = parsed.hallucinations;
    expect(issues.some((i: any) => i.message.includes("SuperAnalytics"))).toBe(
      true,
    );
    expect(issues.some((i: any) => i.message.includes("AITaskPredictor"))).toBe(
      true,
    );
    expect(
      issues.some((i: any) => i.message.includes("QuantumStateManager")),
    ).toBe(true);
  });

  it("should catch method calls on imported but hallucinated objects", async () => {
    const newCode = `
import { TaskOptimizer } from './fake-module.js';
import { TaskAnalytics } from './another-fake.js';

// These imports are fake, so the method calls should be caught
const result = TaskOptimizer.analyze(tasks);
const stats = TaskAnalytics.compute(tasks);
    `;

    const result = await validateCodeTool.handler({
      projectPath,
      newCode,
      language: "javascript",
      strictMode: false,
    });

    const parsed = JSON.parse(result.content[0].text);
    console.log(
      "Issues found:",
      JSON.stringify(parsed.hallucinations, null, 2),
    );

    // Should catch the fake imports first
    expect(parsed.hallucinationDetected).toBe(true);

    // Should have import issues
    const importIssues = parsed.hallucinations.filter(
      (i: any) => i.type === "nonExistentImport",
    );
    expect(importIssues.length).toBeGreaterThan(0);
  });

  it("should catch method calls on objects from hallucinated packages", async () => {
    const newCode = `
import { devtools, persist, immer } from 'zustand/middleware';
import AIPredictor from 'ai-predictor-lib';
import CloudBackup from 'cloud-backup-service';

// These packages don't exist in package.json
AIPredictor.initialize();
CloudBackup.connect();
const store = devtools(persist(immer(storeConfig)));
    `;

    const result = await validateCodeTool.handler({
      projectPath,
      newCode,
      language: "javascript",
      strictMode: false,
    });

    const parsed = JSON.parse(result.content[0].text);
    console.log(
      "Issues found:",
      JSON.stringify(parsed.hallucinations, null, 2),
    );

    // Should catch the missing packages
    expect(parsed.hallucinationDetected).toBe(true);

    const depIssues = parsed.hallucinations.filter(
      (i: any) => i.type === "dependencyHallucination",
    );
    expect(depIssues.length).toBeGreaterThan(0);
  });

  it("should NOT flag method calls on real imported objects", async () => {
    const newCode = `
import { logger } from '../utils/logger.js';

// This is a real import, should not be flagged
logger.info('test');
logger.debug('debug');
    `;

    const result = await validateCodeTool.handler({
      projectPath,
      newCode,
      language: "javascript",
      strictMode: false,
    });

    const parsed = JSON.parse(result.content[0].text);

    // Should not have issues
    expect(parsed.hallucinationDetected).toBe(false);
  });
});
