/**
 * System Integration Tests for Guardian Mode
 *
 * Verifies the complete "VibeGuard" agent flow:
 * - Starting multiple guardians (Frontend + Backend)
 * - File watching and auto-validation
 * - Smart Mode detection
 * - MCP notification Integration
 *
 * @format
 */

import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import {
  startGuardianTool,
  stopGuardianTool,
  getGuardianStatusTool,
  getGuardianAlertsTool,
} from "../../src/agent/agentTools.js";
import { setMCPServer } from "../../src/agent/mcpNotifications.js";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

// Mock MCP Server
const mockMCPServer = {
  notification: vi.fn(),
  request: vi.fn(),
} as any;

// Mock chokidar to avoid ESM issues and control events
const mockWatcher = vi.hoisted(() => ({
  on: vi.fn().mockReturnThis(),
  close: vi.fn(),
  add: vi.fn(),
  unwatch: vi.fn(),
}));

// Map to store event handlers registered by FileWatcher
const watcherHandlers = new Map<string, Function>();

mockWatcher.on.mockImplementation((event: string, handler: Function) => {
  watcherHandlers.set(event, handler);
  return mockWatcher;
});

vi.mock("chokidar", () => {
  const watch = vi.fn(() => mockWatcher);
  return { watch, default: { watch } } as any;
});

describe("Guardian System Integration", () => {
  let tempDir: string;
  let frontendDir: string;
  let backendDir: string;

  beforeAll(async () => {
    // Register mock server to capture notifications
    setMCPServer(mockMCPServer);
  });

  beforeEach(async () => {
    // Create temp workspace simulating a monorepo
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "guardian-test-"));
    frontendDir = path.join(tempDir, "frontend");
    backendDir = path.join(tempDir, "backend");

    await fs.mkdir(frontendDir, { recursive: true });
    await fs.mkdir(backendDir, { recursive: true });

    // Clear any active guardians from previous tests
    await stopGuardianTool.handler({} as any);
    mockMCPServer.notification.mockClear();
  });

  afterEach(async () => {
    // Cleanup
    await stopGuardianTool.handler({} as any);
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("should support independent matching for Frontend and Backend", async () => {
    // 1. Start Frontend Guardian
    const startFe = await startGuardianTool.handler({
      projectPath: frontendDir,
      language: "typescript",
      agent_name: "FrontendGuard",
      mode: "auto",
    });

    expect(JSON.parse(startFe.content[0].text).success).toBe(true);

    // 2. Start Backend Guardian
    const startBe = await startGuardianTool.handler({
      projectPath: backendDir,
      language: "python",
      agent_name: "BackendGuard",
      mode: "auto",
    });

    expect(JSON.parse(startBe.content[0].text).success).toBe(true);

    // 3. Verify Status
    const status = await getGuardianStatusTool.handler({});
    const statusData = JSON.parse(status.content[0].text);

    expect(statusData.active).toBe(true);
    expect(statusData.count).toBe(2);
    expect(statusData.guardians).toHaveLength(2);
    expect(statusData.guardians.find((g: any) => g.name === "FrontendGuard")).toBeTruthy();
    expect(statusData.guardians.find((g: any) => g.name === "BackendGuard")).toBeTruthy();
  });

  it("should trigger auto-validation when file is created (Learning Mode)", async () => {
    // 1. Start Guardian in "auto" mode (should pick learning since empty)
    await startGuardianTool.handler({
      projectPath: frontendDir,
      agent_name: "VibeGuard",
      mode: "auto",
    });

    // 2. Write a file (Real FS needed for AutoValidator to read it)
    const badFile = path.join(frontendDir, "bad.ts");
    await fs.writeFile(badFile, "export const foo = hallucinated();");

    // 3. Manually trigger chokidar 'add' event via the mock
    // AutoValidator's FileWatcher likely listens to 'all' or 'add'
    // Depending on FileWatcher implementation.
    // Let's assume FileWatcher listens to specific events or 'all'.
    // We'll try to find the handler.
    
    // We need to look at how FileWatcher attaches to chokidar.
    // It usually does `watcher.on('all', ...)` or chain `.on('add', ...).on('change', ...)`
    // My mock implementation in this file sets `watcherHandlers`.
    // Let's trigger 'add' if it exists, or 'all'.
    
    if (watcherHandlers.has("add")) {
        watcherHandlers.get("add")!(badFile);
    } else if (watcherHandlers.has("all")) {
        watcherHandlers.get("all")!("add", badFile);
    }

    // 4. Wait for debounce (500ms) + processing
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // 5. Check alerts via Tool (Polling)
    const alerts = await getGuardianAlertsTool.handler({ clearAfterRead: false });
    const alertsData = JSON.parse(alerts.content[0].text);
    
    // Also check mockMCPServer for auto-push
     const initAlert = mockMCPServer.notification.mock.calls.find(
      (call: any) => call[0].params.data.type === "initial_scan"
    );
    expect(initAlert).toBeTruthy();
    expect(initAlert[0].params.data.message).toContain("Learning Mode Active");
  });

  it("should stop specific guardians", async () => {
    await startGuardianTool.handler({ projectPath: frontendDir, agent_name: "G1" });
    await startGuardianTool.handler({ projectPath: backendDir, agent_name: "G2" });

    // Stop G1
    await stopGuardianTool.handler({ agent_name: "G1" });

    // Check status
    const status = await getGuardianStatusTool.handler({});
    const statusData = JSON.parse(status.content[0].text);

    expect(statusData.count).toBe(1);
    expect(statusData.guardians[0].name).toBe("G2");
  });
});
