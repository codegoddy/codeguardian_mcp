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

  it("should detect project structure", async () => {
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

    expect(result.success).toBe(true);
    expect(result.projectStructure.frontend).toBeDefined();
    expect(result.projectStructure.backend).toBeDefined();
    expect(result.projectStructure.relationship).toBe("separate");
  });

  it("should detect missing endpoints", async () => {
    // Create frontend only
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

    // No backend

    const result = await validateApiContracts(tempDir);

    expect(result.success).toBe(true);
    expect(result.projectStructure.backend).toBeUndefined();
  });

  it("should format validation results", async () => {
    const result = await validateApiContracts(tempDir);
    const formatted = formatValidationResults(result);

    expect(formatted).toContain("API CONTRACT VALIDATION RESULTS");
    expect(formatted).toContain("Project Structure:");
    expect(formatted).toContain("Summary:");
  });
});
