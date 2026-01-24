/**
 * End-to-End Flow Validation
 *
 * Verifies the complete Augmented CodeGuardian flow:
 * 1. Start Guardian (VibeGuard)
 * 2. Build Context (with mocked Git Lineage & Hot Files)
 * 3. User Intent (File Edit)
 * 4. Auto-Validation Trigger
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
} from "../../src/agent/agentTools.js";
import { buildContextTool } from "../../src/tools/buildContext.js";
import { intentTracker } from "../../src/context/intentTracker.js";
import { contextLineage } from "../../src/context/contextLineage.js";

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

// Mock simple-git
const mockGit = {
  checkIsRepo: jest.fn().mockResolvedValue(true),
  log: jest.fn(),
  show: jest.fn(),
  raw: jest.fn(),
};
jest.mock("simple-git", () => {
  return jest.fn(() => mockGit);
});

describe("End-to-End Augmented Flow", () => {
  let tempDir: string;
  let projectPath: string;

  beforeAll(async () => {
    // Setup temp workspace
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "guardian-e2e-"));
    projectPath = path.join(tempDir, "e2e-project");
    await fs.mkdir(projectPath, { recursive: true });

    // Create some initial files
    await fs.writeFile(path.join(projectPath, "main.ts"), "console.log('hello');");
    await fs.writeFile(path.join(projectPath, "utils.ts"), "export const u = 1;");
  });

  afterAll(async () => {
    await stopGuardianTool.handler({} as any);
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    jest.clearAllMocks();
    intentTracker.clear(); // Reset intent for each test
    contextLineage.clear();
  });

  it("should build context with Augment Secrets (Git Lineage)", async () => {
    // 1. Mock Git Log to return a history
    // We simulate that 'utils.ts' is a hot file (changed often)
    mockGit.log.mockResolvedValue({
      all: [
        { hash: "1", date: new Date().toISOString(), author_name: "Alice" },
        { hash: "2", date: new Date().toISOString(), author_name: "Bob" },
      ],
      latest: { message: "feat: update utils" },
    } as any);

    // Mock Git Show to say commits touched 'utils.ts'
    mockGit.show.mockResolvedValue("utils.ts\n");

    // 2. Run Build Context explicitly
    const result = await buildContextTool.handler({
      projectPath: projectPath,
      language: "typescript",
      forceRebuild: true,
    });

    const data = JSON.parse(result.content[0].text);
    
    // 3. Verify Augment Secrets are present
    expect(data.success).toBe(true);
    expect(data.data.augmentSecrets).toBeDefined();
    
    // Check Hot Files (should contain utils.ts because we mocked it heavily)
    const hotFiles = data.data.augmentSecrets.hotFiles;
    expect(hotFiles.length).toBeGreaterThan(0);
    expect(hotFiles).toContain("utils.ts");

    // Check Recent Authors
    const authors = data.data.augmentSecrets.recentAuthors;
    expect(authors).toContain("Alice");
    expect(authors).toContain("Bob");
  });

  it("should capture User Intent via IntentTracker", async () => {
    // 1. Simulate a file edit via the Tracker directly
    // (In reality, the IDE/Extension would call a tool or the Agent watches files)
    // The Agent calls `intentTracker.recordEdit` when it detects a change.
    
    const editedFile = path.join(projectPath, "main.ts");
    intentTracker.recordEdit({
      filePath: editedFile,
      timestamp: Date.now(),
      symbols: ["main"],
      language: "typescript",
    });

    // 2. Verify Intent State
    const intent = intentTracker.getCurrentIntent();
    expect(intent.recentFiles).toContain(editedFile);
    expect(intent.focusArea).toBeDefined();
  });

  it("should integrate everything in the Guardian Agent loop", async () => {
    // 1. Start Guardian
    const start = await startGuardianTool.handler({
      projectPath,
      agent_name: "EndToEndGuard",
    });
    expect(JSON.parse(start.content[0].text).success).toBe(true);

    // 2. Simulate User Intent (Editing 'main.ts')
    // This happens via the file watcher in the real world
    // We will verify that 'main.ts' becomes a "Focused Intent" file
    const mainFile = path.join(projectPath, "main.ts");
    intentTracker.recordEdit({ filePath: mainFile, timestamp: Date.now(), symbols: [], language: "typescript" });

    // 3. Run Build Context again (Guardian does this internally for validation)
    const result = await buildContextTool.handler({
        projectPath,
        forceRebuild: false
    });
    
    const data = JSON.parse(result.content[0].text);

    // 4. Verify "Focused Intent" in Augment Secrets matches our edit
    const focusedIntent = data.data.augmentSecrets.focusedIntent;
    expect(focusedIntent).toContain(mainFile);
  });
});
