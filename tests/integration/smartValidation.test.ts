/**
 * Smart Validation Integration Test
 *
 * Tests the complete validation pipeline with smart context selection.
 * Validates that:
 * 1. Smart context reduces symbols checked
 * 2. Validation catches all types of issues (hallucinations, dependencies, dead code)
 * 3. Performance is improved with smart context
 *
 * @format
 */

import { validateCodeTool } from "../../src/tools/validateCode.js";
import { getProjectContext } from "../../src/context/projectContext.js";

describe("Smart Validation Integration", () => {
  const projectPath = process.cwd();

  // Pre-build context once for all tests
  beforeAll(async () => {
    await getProjectContext(projectPath, {
      language: "typescript",
      forceRebuild: false,
    });
  }, 30000);

  it("should validate code with smart context enabled", async () => {
    const testCode = `
import { logger } from './utils/logger.js';
import { glob } from 'glob';

export function testFunction() {
  logger.info('Testing smart validation');
  const files = glob('**/*.ts');
  return files;
}
`;

    const result = await validateCodeTool.handler({
      projectPath,
      newCode: testCode,
      language: "typescript",
      useSmartContext: true,
    });

    const response = JSON.parse(result.content[0].text);

    expect(response.success).toBe(true);
    expect(response.validated).toBe(true);
    expect(response.stats).toBeDefined();
    expect(response.stats.relevanceFiltering).toBe("enabled");

    console.log("\n=== Smart Validation Results ===");
    console.log(`Score: ${response.score}/100`);
    console.log(`Files scanned: ${response.stats.filesScanned}`);
    console.log(`Symbols in project: ${response.stats.symbolsInProject}`);
    console.log(
      `Symbols validated against: ${response.stats.symbolsValidatedAgainst}`,
    );
    console.log(`Hallucinations found: ${response.stats.hallucinationsFound}`);
    console.log(`Dead code found: ${response.stats.deadCodeFound}`);
    console.log(`Analysis time: ${response.stats.analysisTime}`);
    console.log(`Recommendation: ${response.recommendation.verdict}`);
  }, 60000);

  it("should catch hallucinations with smart context", async () => {
    const testCode = `
import { logger } from './utils/logger.js';

export function testFunction() {
  logger.info('Test');
  const result = nonExistentFunction(); // This should be caught
  return result;
}
`;

    const result = await validateCodeTool.handler({
      projectPath,
      newCode: testCode,
      language: "typescript",
      useSmartContext: true,
    });

    const response = JSON.parse(result.content[0].text);

    expect(response.hallucinationDetected).toBe(true);
    expect(response.hallucinations.length).toBeGreaterThan(0);

    const hallucination = response.hallucinations[0];
    expect(hallucination.type).toBe("nonExistentFunction");
    expect(hallucination.severity).toBe("critical");

    console.log("\n=== Hallucination Detected ===");
    console.log(`Message: ${hallucination.message}`);
    console.log(`Confidence: ${hallucination.confidence}%`);
    if (hallucination.suggestion) {
      console.log(`Suggestion: ${hallucination.suggestion}`);
    }
  }, 60000);

  it("should catch missing dependencies", async () => {
    const testCode = `
import { someFunction } from 'non-existent-package';

export function testFunction() {
  return someFunction();
}
`;

    const result = await validateCodeTool.handler({
      projectPath,
      newCode: testCode,
      language: "typescript",
      useSmartContext: true,
    });

    const response = JSON.parse(result.content[0].text);

    expect(response.hallucinationDetected).toBe(true);

    const depIssue = response.hallucinations.find(
      (h: any) => h.type === "dependencyHallucination",
    );

    expect(depIssue).toBeDefined();
    expect(depIssue.severity).toBe("critical");

    console.log("\n=== Dependency Issue Detected ===");
    console.log(`Message: ${depIssue.message}`);
    console.log(`Suggestion: ${depIssue.suggestion}`);
  }, 60000);

  it("should automatically check for dead code", async () => {
    const testCode = `
export function usedFunction() {
  return 'used';
}

export function unusedFunction() {
  return 'never called';
}
`;

    const result = await validateCodeTool.handler({
      projectPath,
      newCode: testCode,
      language: "typescript",
      useSmartContext: true,
    });

    const response = JSON.parse(result.content[0].text);

    // Dead code check should run automatically for code > 50 lines
    // or when no code is provided
    expect(response.stats.deadCodeFound).toBeDefined();

    console.log("\n=== Dead Code Check ===");
    console.log(`Dead code issues found: ${response.stats.deadCodeFound}`);
    if (response.deadCode && response.deadCode.length > 0) {
      console.log(`Example: ${response.deadCode[0].message}`);
    }
  }, 60000);

  it("should be faster with smart context than without", async () => {
    const testCode = `
import { logger } from './utils/logger.js';
import { glob } from 'glob';
import * as fs from 'fs/promises';
import * as path from 'path';

export async function complexFunction() {
  logger.info('Starting');
  const files = glob('**/*.ts');
  const content = await fs.readFile('test.txt', 'utf-8');
  const dir = path.dirname('test.txt');
  return { files, content, dir };
}
`;

    // With smart context
    const startSmart = Date.now();
    const resultSmart = await validateCodeTool.handler({
      projectPath,
      newCode: testCode,
      language: "typescript",
      useSmartContext: true,
    });
    const timeSmart = Date.now() - startSmart;

    // Without smart context
    const startFull = Date.now();
    const resultFull = await validateCodeTool.handler({
      projectPath,
      newCode: testCode,
      language: "typescript",
      useSmartContext: false,
    });
    const timeFull = Date.now() - startFull;

    const responseSmart = JSON.parse(resultSmart.content[0].text);
    const responseFull = JSON.parse(resultFull.content[0].text);

    console.log("\n=== Performance Comparison ===");
    console.log(
      `Smart context: ${timeSmart}ms (${responseSmart.stats.symbolsValidatedAgainst} symbols)`,
    );
    console.log(
      `Full context: ${timeFull}ms (${responseFull.stats.symbolsValidatedAgainst} symbols)`,
    );
    console.log(`Speedup: ${(timeFull / timeSmart).toFixed(2)}x`);
    console.log(
      `Symbol reduction: ${((1 - responseSmart.stats.symbolsValidatedAgainst / responseFull.stats.symbolsValidatedAgainst) * 100).toFixed(1)}%`,
    );

    // Smart context should check fewer symbols
    expect(responseSmart.stats.symbolsValidatedAgainst).toBeLessThan(
      responseFull.stats.symbolsValidatedAgainst,
    );
  }, 120000);

  it("should provide comprehensive validation in one pass", async () => {
    const testCode = `
import { logger } from './utils/logger.js';
import { nonExistentPackage } from 'fake-package';

export function myFunction() {
  logger.info('Test');
  nonExistentFunction(); // Hallucination
  nonExistentPackage.doSomething(); // Dependency issue
}
`;

    const result = await validateCodeTool.handler({
      projectPath,
      newCode: testCode,
      language: "typescript",
      useSmartContext: true,
    });

    const response = JSON.parse(result.content[0].text);

    console.log("\n=== Comprehensive Validation ===");
    console.log(`Total issues found: ${response.hallucinations.length}`);

    // Should catch both hallucinations and dependency issues
    const hallucinations = response.hallucinations.filter(
      (h: any) => h.type === "nonExistentFunction",
    );
    const depIssues = response.hallucinations.filter(
      (h: any) => h.type === "dependencyHallucination",
    );

    console.log(`Hallucinations: ${hallucinations.length}`);
    console.log(`Dependency issues: ${depIssues.length}`);
    console.log(
      `Dead code checked: ${response.stats.deadCodeFound >= 0 ? "Yes" : "No"}`,
    );

    expect(hallucinations.length).toBeGreaterThan(0);
    expect(depIssues.length).toBeGreaterThan(0);
  }, 60000);
});
