/**
 * Integration tests for API Contract Guardian
 *
 * @format
 */

import { validateApiContracts, formatValidationResults } from "../../src/api-contract/index.js";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

async function writeProjectFile(root: string, relativePath: string, content: string): Promise<void> {
  const absolutePath = path.join(root, relativePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, content);
}

async function createFrontendAllMethods(root: string): Promise<void> {
  await writeProjectFile(
    root,
    "frontend/package.json",
    JSON.stringify({
      name: "frontend",
      private: true,
      dependencies: { react: "^18.0.0", vite: "^5.0.0" },
    }),
  );

  await writeProjectFile(
    root,
    "frontend/src/services/usersApi.ts",
    `
export const usersApi = {
  listUsers: () => ApiService.get('/api/users'),
  createUser: (payload: any) => ApiService.post('/api/users', payload),
  updateUser: (id: string, payload: any) => ApiService.put(\`/api/users/\${id}\`, payload),
  patchUser: (id: string, payload: any) => ApiService.patch(\`/api/users/\${id}\`, payload),
  deleteUser: (id: string) => ApiService.delete(\`/api/users/\${id}\`),
};
`,
  );
}

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

  it("should match all common HTTP methods for React/Vite frontend + Express backend", async () => {
    await createFrontendAllMethods(tempDir);

    await writeProjectFile(
      tempDir,
      "backend/package.json",
      JSON.stringify({
        name: "backend",
        private: true,
        dependencies: { express: "^4.18.0" },
      }),
    );

    await writeProjectFile(
      tempDir,
      "backend/src/server.ts",
      `
import express from 'express';
const app = express();

app.get('/api/users', (_req, res) => res.json({ ok: true }));
app.post('/api/users', (_req, res) => res.json({ ok: true }));
app.put('/api/users/:id', (_req, res) => res.json({ ok: true }));
app.patch('/api/users/:id', (_req, res) => res.json({ ok: true }));
app.delete('/api/users/:id', (_req, res) => res.json({ ok: true }));
`,
    );

    const result = await validateApiContracts(tempDir);
    expect(result.summary.matchedEndpoints).toBeGreaterThanOrEqual(5);
    expect(result.issues.some((i) => i.type === "apiMethodMismatch")).toBe(false);
  });

  it("should match all common HTTP methods for React frontend + FastAPI backend", async () => {
    await createFrontendAllMethods(tempDir);

    await writeProjectFile(
      tempDir,
      "backend/requirements.txt",
      "fastapi==0.110.0\npydantic==2.0.0",
    );

    await writeProjectFile(
      tempDir,
      "backend/main.py",
      `
from fastapi import FastAPI

app = FastAPI()

@app.get('/api/users')
def list_users():
    return {"ok": True}

@app.post('/api/users')
def create_user():
    return {"ok": True}

@app.put('/api/users/{id}')
def update_user(id: str):
    return {"ok": True}

@app.patch('/api/users/{id}')
def patch_user(id: str):
    return {"ok": True}

@app.delete('/api/users/{id}')
def delete_user(id: str):
    return {"ok": True}
`,
    );

    const result = await validateApiContracts(tempDir);
    expect(result.summary.matchedEndpoints).toBeGreaterThanOrEqual(5);
    expect(result.issues.some((i) => i.type === "apiMethodMismatch")).toBe(false);
  });

  it("should match all common HTTP methods for React frontend + Flask backend", async () => {
    await createFrontendAllMethods(tempDir);

    await writeProjectFile(tempDir, "backend/requirements.txt", "flask==3.0.0");

    await writeProjectFile(
      tempDir,
      "backend/app.py",
      `
from flask import Flask

app = Flask(__name__)

@app.route('/api/users', methods=['GET'])
def list_users():
    return {"ok": True}

@app.route('/api/users', methods=['POST'])
def create_user():
    return {"ok": True}

@app.route('/api/users/<id>', methods=['PUT'])
def update_user(id):
    return {"ok": True}

@app.route('/api/users/<id>', methods=['PATCH'])
def patch_user(id):
    return {"ok": True}

@app.route('/api/users/<id>', methods=['DELETE'])
def delete_user(id):
    return {"ok": True}
`,
    );

    const result = await validateApiContracts(tempDir);
    expect(result.summary.matchedEndpoints).toBeGreaterThanOrEqual(5);
    expect(result.issues.some((i) => i.type === "apiMethodMismatch")).toBe(false);
  });
});
