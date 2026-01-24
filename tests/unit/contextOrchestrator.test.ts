/**
 * Context Orchestrator Tests
 *
 * @format
 */

import {
  orchestrateContext,
  explainContextQuality,
} from "../../src/context/contextOrchestrator.js";

describe("ContextOrchestrator", () => {
  const projectPath = process.cwd();

  it("should orchestrate context for validation", async () => {
    const result = await orchestrateContext({
      projectPath,
      language: "typescript",
      imports: ["logger", "getProjectContext"],
    });

    expect(result.projectContext).toBeDefined();
    expect(result.contextQuality).toBeDefined();
    expect(["excellent", "good", "fair", "poor"]).toContain(
      result.contextQuality,
    );
  }, 10000);

  it("should provide context quality explanation", () => {
    const excellent = explainContextQuality("excellent");
    const good = explainContextQuality("good");
    const fair = explainContextQuality("fair");
    const poor = explainContextQuality("poor");

    expect(excellent).toContain("All context features");
    expect(good).toContain("Most context features");
    expect(fair).toContain("Basic context");
    expect(poor).toContain("Minimal context");
  });

  it("should recommend incremental validation for longer code", async () => {
    const longCode = Array(20).fill("const x = 1;").join("\n");

    const result = await orchestrateContext({
      projectPath,
      language: "typescript",
      newCode: longCode,
      sessionId: "test-session",
    });

    expect(result.useIncremental).toBe(true);
  }, 10000);

  it("should not recommend incremental for short code", async () => {
    const shortCode = "const x = 1;";

    const result = await orchestrateContext({
      projectPath,
      language: "typescript",
      newCode: shortCode,
      sessionId: "test-session",
    });

    expect(result.useIncremental).toBe(false);
  }, 10000);
});
