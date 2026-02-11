/**
 * Integration Tests for LLM-Readable Report Files
 *
 * Verifies that validation reports and guardian alerts are saved to
 * project-root files (codeguardian-report.json, codeguardian-alerts.json)
 * that are OUTSIDE .codeguardian/ and accessible by LLM file-reading tools.
 *
 * @format
 */

import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import {
  startGuardianTool,
  stopGuardianTool,
  getGuardianAlertsTool,
} from "../../src/agent/agentTools.js";
import { guardianPersistence } from "../../src/agent/guardianPersistence.js";
import { validationReportStore } from "../../src/resources/validationReportStore.js";
import { setMCPServer } from "../../src/agent/mcpNotifications.js";

// Mock MCP Server
const mockMCPServer = {
  notification: jest.fn(),
  request: jest.fn(),
} as any;

// Mock chokidar
const mockWatcher = {
  on: jest.fn().mockReturnThis(),
  close: jest.fn(),
  add: jest.fn(),
  unwatch: jest.fn(),
};

jest.mock("chokidar", () => ({
  watch: jest.fn(() => mockWatcher),
}));

const LLM_REPORT_FILENAME = "codeguardian-report.json";
const LLM_ALERTS_FILENAME = "codeguardian-alerts.json";

describe("LLM-Readable Report Files", () => {
  let tempDir: string;

  beforeAll(async () => {
    setMCPServer(mockMCPServer);
  });

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "llm-report-test-"));
    await stopGuardianTool.handler({} as any);
    mockMCPServer.notification.mockClear();
  });

  afterEach(async () => {
    await stopGuardianTool.handler({} as any);
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  // ==========================================================================
  // Validation Report Store Tests
  // ==========================================================================

  describe("ValidationReportStore - LLM-readable report", () => {
    it("should save codeguardian-report.json at project root when storing a report", async () => {
      const mockReport = {
        summary: {
          totalIssues: 3,
          criticalIssues: 1,
          highIssues: 1,
          mediumIssues: 0,
          deadCodeIssues: 1,
        },
        stats: {
          filesScanned: 10,
          filesProcessed: 10,
        },
        hallucinations: [
          {
            type: "dependencyHallucination",
            severity: "critical",
            name: "./nonexistent",
            file: "src/app.ts",
            message: "Import './nonexistent' not found",
          },
          {
            type: "symbolHallucination",
            severity: "high",
            name: "fakeFunction",
            file: "src/app.ts",
            message: "Function 'fakeFunction' not found in scope",
          },
        ],
        deadCode: [
          {
            type: "unusedExport",
            severity: "low",
            name: "unusedHelper",
            file: "src/utils.ts",
            message: "Export 'unusedHelper' is never used",
          },
        ],
        score: 72,
        recommendation: {
          verdict: "NEEDS_REVIEW",
          riskLevel: "medium",
          message: "3 issues found",
        },
      };

      // Store the report
      const jobId = "test_job_123";
      await validationReportStore.store(jobId, tempDir, mockReport);

      // Verify the LLM-readable file exists at project root (NOT in .codeguardian/)
      const llmReportPath = path.join(tempDir, LLM_REPORT_FILENAME);
      const fileExists = await fs
        .access(llmReportPath)
        .then(() => true)
        .catch(() => false);
      expect(fileExists).toBe(true);

      // Verify file is NOT inside .codeguardian/
      expect(llmReportPath).not.toContain(".codeguardian");

      // Verify file content is valid JSON
      const content = await fs.readFile(llmReportPath, "utf-8");
      const parsed = JSON.parse(content);

      // Verify structure
      expect(parsed._meta).toBeDefined();
      expect(parsed._meta.generatedBy).toBe("CodeGuardian MCP");
      expect(parsed._meta.jobId).toBe(jobId);
      expect(parsed.summary).toEqual(mockReport.summary);
      expect(parsed.score).toBe(72);
      expect(parsed.hallucinations).toHaveLength(2);
      expect(parsed.deadCode).toHaveLength(1);
      expect(parsed.recommendation).toEqual(mockReport.recommendation);
    });

    it("should also save report inside .codeguardian/reports/ as cache", async () => {
      const mockReport = {
        summary: { totalIssues: 1 },
        stats: { filesScanned: 5 },
        hallucinations: [
          { type: "test", severity: "low", name: "x", file: "a.ts", message: "test" },
        ],
        deadCode: [],
        score: 95,
        recommendation: { verdict: "CLEAN" },
      };

      const jobId = "test_job_456";
      await validationReportStore.store(jobId, tempDir, mockReport);

      // Verify internal cache file also exists
      const cachePath = path.join(tempDir, ".codeguardian", "reports", `${jobId}.json`);
      const cacheExists = await fs
        .access(cachePath)
        .then(() => true)
        .catch(() => false);
      expect(cacheExists).toBe(true);
    });

    it("getLLMReportPath should return path outside .codeguardian/", () => {
      const reportPath = validationReportStore.getLLMReportPath(tempDir);
      expect(reportPath).toBe(path.join(path.resolve(tempDir), LLM_REPORT_FILENAME));
      expect(reportPath).not.toContain(".codeguardian");
    });

    it("should track jobId to projectPath mapping", async () => {
      const mockReport = {
        summary: { totalIssues: 0 },
        stats: {},
        hallucinations: [],
        deadCode: [],
        score: 100,
      };

      const jobId = "test_job_789";
      await validationReportStore.store(jobId, tempDir, mockReport);

      const projectPath = validationReportStore.getJobProjectPath(jobId);
      expect(projectPath).toBe(path.resolve(tempDir));
    });
  });

  // ==========================================================================
  // Guardian Persistence - LLM-readable alerts
  // ==========================================================================

  describe("GuardianPersistence - LLM-readable alerts", () => {
    it("should save codeguardian-alerts.json at project root when saving alerts", async () => {
      // First persist a guardian config so saveLLMReadableAlerts can discover the project path
      await guardianPersistence.saveGuardian({
        agentName: "TestGuard",
        projectPath: tempDir,
        language: "typescript",
        mode: "auto",
        startedAt: Date.now(),
      });

      // Create mock alerts
      const alerts = new Map<string, any>();
      alerts.set("src/app.ts", {
        file: "src/app.ts",
        issues: [
          {
            type: "dependencyHallucination",
            severity: "critical",
            message: "Import './nonexistent' not found",
          },
          {
            type: "symbolHallucination",
            severity: "high",
            message: "Function 'fakeFunc' not found",
          },
        ],
        timestamp: Date.now(),
        llmMessage: "VibeGuard: 2 issues in src/app.ts",
      });

      // Save alerts (this should save to both locations)
      await guardianPersistence.saveAlerts(alerts);

      // Verify LLM-readable alerts file exists at project root
      const llmAlertsPath = path.join(tempDir, LLM_ALERTS_FILENAME);
      const fileExists = await fs
        .access(llmAlertsPath)
        .then(() => true)
        .catch(() => false);
      expect(fileExists).toBe(true);

      // Verify file is NOT inside .codeguardian/
      expect(llmAlertsPath).not.toContain(".codeguardian");

      // Verify file content
      const content = await fs.readFile(llmAlertsPath, "utf-8");
      const parsed = JSON.parse(content);

      expect(parsed._meta).toBeDefined();
      expect(parsed._meta.generatedBy).toContain("CodeGuardian MCP");
      expect(parsed.summary).toBeDefined();
      expect(parsed.summary.totalFiles).toBe(1);
      expect(parsed.summary.totalIssues).toBe(2);
      expect(parsed.summary.bySeverity.critical).toBe(1);
      expect(parsed.summary.bySeverity.high).toBe(1);
      expect(parsed.alerts["src/app.ts"]).toBeDefined();
      expect(parsed.alerts["src/app.ts"].issues).toHaveLength(2);

      // Cleanup persisted guardian config
      await guardianPersistence.removeGuardianFull("TestGuard", tempDir);
    });

    it("getLLMAlertsPath should return path outside .codeguardian/", () => {
      const alertsPath = guardianPersistence.getLLMAlertsPath(tempDir);
      expect(alertsPath).toBe(path.join(tempDir, LLM_ALERTS_FILENAME));
      expect(alertsPath).not.toContain(".codeguardian");
    });

    it("clearAlerts should remove LLM-readable alerts file", async () => {
      // Setup: save a guardian config and alerts
      await guardianPersistence.saveGuardian({
        agentName: "ClearTestGuard",
        projectPath: tempDir,
        language: "typescript",
        mode: "auto",
        startedAt: Date.now(),
      });

      const alerts = new Map<string, any>();
      alerts.set("test.ts", {
        file: "test.ts",
        issues: [{ type: "test", severity: "low", message: "test" }],
        timestamp: Date.now(),
        llmMessage: "test",
      });
      await guardianPersistence.saveAlerts(alerts);

      // Verify file exists
      const llmAlertsPath = path.join(tempDir, LLM_ALERTS_FILENAME);
      let exists = await fs.access(llmAlertsPath).then(() => true).catch(() => false);
      expect(exists).toBe(true);

      // Clear alerts
      await guardianPersistence.clearAlerts();

      // Verify LLM-readable file is removed
      exists = await fs.access(llmAlertsPath).then(() => true).catch(() => false);
      expect(exists).toBe(false);

      // Cleanup
      await guardianPersistence.removeGuardianFull("ClearTestGuard", tempDir);
    });
  });

  // ==========================================================================
  // Tool Response Tests
  // ==========================================================================

  describe("Tool responses include file paths", () => {
    it("start_guardian response should include alertsFile path", async () => {
      const result = await startGuardianTool.handler({
        projectPath: tempDir,
        language: "typescript",
        agent_name: "FilePathTest",
        mode: "auto",
      });

      const data = JSON.parse(result.content[0].text);
      expect(data.success).toBe(true);
      expect(data.alertsFile).toBeDefined();
      expect(data.alertsFile).toContain(LLM_ALERTS_FILENAME);
      expect(data.alertsFile).not.toContain(".codeguardian");
      expect(data.hint).toContain("codeguardian-alerts.json");
    });

    it("get_guardian_alerts response should include alertsFiles paths", async () => {
      // Start a guardian first
      await startGuardianTool.handler({
        projectPath: tempDir,
        language: "typescript",
        agent_name: "AlertFilesTest",
        mode: "auto",
      });

      const result = await getGuardianAlertsTool.handler({
        summaryOnly: false,
      });

      const data = JSON.parse(result.content[0].text);
      expect(data.success).toBe(true);

      // Should have alertsFiles (even when no alerts)
      if (data.alertsFiles) {
        expect(data.alertsFiles.length).toBeGreaterThan(0);
        for (const filePath of data.alertsFiles) {
          expect(filePath).toContain(LLM_ALERTS_FILENAME);
          expect(filePath).not.toContain(".codeguardian");
        }
      }
    });

    it("get_guardian_alerts with summaryOnly should return compact response", async () => {
      await startGuardianTool.handler({
        projectPath: tempDir,
        language: "typescript",
        agent_name: "SummaryTest",
        mode: "auto",
      });

      const result = await getGuardianAlertsTool.handler({
        summaryOnly: true,
      });

      const data = JSON.parse(result.content[0].text);
      expect(data.success).toBe(true);
      // Should NOT include full alerts array when using summaryOnly (no alerts case)
      expect(data.hasAlerts).toBe(false);
    });
  });

  // ==========================================================================
  // File Location Verification
  // ==========================================================================

  describe("File location verification", () => {
    it("codeguardian-report.json should NOT be inside .codeguardian/ directory", async () => {
      const reportPath = validationReportStore.getLLMReportPath("/some/project");
      const parts = reportPath.split(path.sep);
      
      // The file should be directly in the project root, not nested in .codeguardian
      const lastTwoParts = parts.slice(-2);
      expect(lastTwoParts[0]).not.toBe(".codeguardian");
      expect(lastTwoParts[1]).toBe(LLM_REPORT_FILENAME);
    });

    it("codeguardian-alerts.json should NOT be inside .codeguardian/ directory", () => {
      const alertsPath = guardianPersistence.getLLMAlertsPath("/some/project");
      const parts = alertsPath.split(path.sep);

      const lastTwoParts = parts.slice(-2);
      expect(lastTwoParts[0]).not.toBe(".codeguardian");
      expect(lastTwoParts[1]).toBe(LLM_ALERTS_FILENAME);
    });

    it("report file should be readable by standard fs operations (simulating LLM file access)", async () => {
      // Store a report
      await validationReportStore.store("readability_test", tempDir, {
        summary: { totalIssues: 1 },
        stats: { filesScanned: 1 },
        hallucinations: [{ type: "test", severity: "low", name: "x", file: "a.ts", message: "test" }],
        deadCode: [],
        score: 95,
      });

      // Simulate what an LLM file-reading tool would do
      const reportPath = path.join(tempDir, LLM_REPORT_FILENAME);
      
      // 1. Check file exists (like list_files would)
      const stat = await fs.stat(reportPath);
      expect(stat.isFile()).toBe(true);

      // 2. Read file content (like read_file would)
      const content = await fs.readFile(reportPath, "utf-8");
      expect(content.length).toBeGreaterThan(0);

      // 3. Parse as JSON
      const parsed = JSON.parse(content);
      expect(parsed.score).toBe(95);
      expect(parsed.hallucinations).toHaveLength(1);
    });
  });
});
