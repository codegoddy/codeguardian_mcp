/**
 * Integration tests for API Contract Guardian
 *
 * @format
 */

import { validateApiContracts, formatValidationResults } from "../../src/api-contract/index.js";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

describe("API Contract Guardian Integration", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "api-contract-integration-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("should return issues + summary for a mixed project", async () => {
    // Create frontend
    const frontendDir = path.join(tempDir, "frontend");
    await fs.mkdir(frontendDir, { recursive: true });
    await fs.writeFile(
      path.join(frontendDir, "package.json"),
      JSON.stringify({
        name: "frontend",
        dependencies: { next: "^14.0.0", react: "^18.0.0" },
      }),
    );

    // Create backend
    const backendDir = path.join(tempDir, "backend");
    await fs.mkdir(backendDir, { recursive: true });
    await fs.writeFile(
      path.join(backendDir, "requirements.txt"),
      "fastapi==0.104.0\npydantic==2.0.0",
    );

    // Run validation
    const result = await validateApiContracts(tempDir);

    expect(Array.isArray(result.issues)).toBe(true);
    expect(result.summary).toBeDefined();
    expect(typeof result.summary.totalIssues).toBe("number");
  });

  it("should detect missing endpoints", async () => {
    // Create frontend
    const frontendDir = path.join(tempDir, "frontend");
    await fs.mkdir(path.join(frontendDir, "src", "services"), { recursive: true });
    await fs.writeFile(
      path.join(frontendDir, "package.json"),
      JSON.stringify({
        name: "frontend",
        dependencies: { react: "^18.0.0" },
      }),
    );
    await fs.writeFile(
      path.join(frontendDir, "src", "services", "api.ts"),
      `
export const api = {
  getData: () => fetch('/api/data').then(r => r.json()),
};
`,
    );

    // Create backend with a different route
    const backendDir = path.join(tempDir, "backend");
    await fs.mkdir(backendDir, { recursive: true });
    await fs.writeFile(
      path.join(backendDir, "requirements.txt"),
      "fastapi==0.104.0\npydantic==2.0.0",
    );
    await fs.writeFile(
      path.join(backendDir, "main.py"),
      `
from fastapi import FastAPI

app = FastAPI()

@app.get("/api/other")
def other():
    return {"ok": True}
`,
    );

    const result = await validateApiContracts(tempDir);

    expect(result.summary.totalIssues).toBeGreaterThanOrEqual(0);
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it("should format validation results", async () => {
    const result = await validateApiContracts(tempDir);
    const formatted = formatValidationResults(result);

    expect(formatted).toContain("API CONTRACT VALIDATION RESULTS");
    expect(formatted).toContain("Summary:");
  });
});
