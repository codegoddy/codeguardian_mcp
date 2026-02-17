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

  it("should prefer write-intent same-path mismatch route and detect typed payload gaps", async () => {
    await writeProjectFile(
      tempDir,
      "frontend/package.json",
      JSON.stringify({
        name: "frontend",
        private: true,
        dependencies: { react: "^18.0.0" },
      }),
    );

    await writeProjectFile(
      tempDir,
      "frontend/src/types/index.ts",
      `
export interface PantryItem {
  id: string;
  name: string;
  category: string;
  quantity: number;
  unit: string;
  expirationDate: string;
}
`,
    );

    await writeProjectFile(
      tempDir,
      "frontend/src/services/api.ts",
      `
import type { PantryItem } from '../types';

const API_BASE_URL = 'http://localhost:3001/api';

async function fetchApi(endpoint: string, options?: RequestInit) {
  return fetch(\`${"${API_BASE_URL}"}${"${endpoint}"}\`, options);
}

export const pantryApi = {
  update: (id: string, data: Partial<PantryItem>) =>
    fetchApi(\`/pantry/${"${id}"}\`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};
`,
    );

    await writeProjectFile(
      tempDir,
      "backend/package.json",
      JSON.stringify({
        name: "backend",
        private: true,
        dependencies: { express: "^4.18.0", "@prisma/client": "^5.0.0" },
      }),
    );

    await writeProjectFile(
      tempDir,
      "backend/prisma/schema.prisma",
      `
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model PantryItem {
  id             String   @id @default(uuid())
  name           String
  category       String
  quantity       Float
  unit           String
  expirationDate DateTime
}
`,
    );

    await writeProjectFile(
      tempDir,
      "backend/src/types/pantry.ts",
      `
export interface PantryItem {
  id: string;
  name: string;
  category: string;
  quantity: number;
  unit: string;
  expirationDate: Date;
}
`,
    );

    await writeProjectFile(
      tempDir,
      "backend/src/controllers/pantryController.ts",
      `
declare const prisma: any;

export const getPantryItemById = async (req: any, res: any) => {
  const item = await prisma.pantryItem.findUnique({ where: { id: req.params.id } });
  return res.json(item);
};

export const updatePantryItem = async (req: any, res: any) => {
  const { updatedBy } = req.body;
  const existingItem = await prisma.pantryItem.findUnique({ where: { id: req.params.id } });

  // @ts-ignore
  if (existingItem?.isLocked) {
    return res.status(403).json({ error: 'locked' });
  }

  if (!updatedBy) {
    return res.status(400).json({ error: 'updatedBy field is required' });
  }

  return res.json(existingItem);
};
`,
    );

    await writeProjectFile(
      tempDir,
      "backend/src/routes/pantry.ts",
      `
import { Router } from 'express';
import { getPantryItemById, updatePantryItem } from '../controllers/pantryController';

const router = Router();
router.get('/:id', getPantryItemById);
router.put('/:id', updatePantryItem);

export default router;
`,
    );

    await writeProjectFile(
      tempDir,
      "backend/src/server.ts",
      `
import express from 'express';
import pantryRoutes from './routes/pantry';

const app = express();
app.use(express.json());
app.use('/api/pantry', pantryRoutes);
`,
    );

    const result = await validateApiContracts(tempDir);

    expect(
      result.issues.some(
        (issue) =>
          issue.type === "apiMethodMismatch" &&
          issue.message.includes("frontend uses POST") &&
          issue.message.includes("backend expects PUT"),
      ),
    ).toBe(true);

    expect(
      result.issues.some(
        (issue) =>
          issue.type === "apiMissingRequiredField" && issue.message.includes("'updatedBy'"),
      ),
    ).toBe(true);

    expect(
      result.issues.some(
        (issue) =>
          issue.type === "apiContractMismatch" && issue.message.includes("existingItem.isLocked"),
      ),
    ).toBe(true);
  });
});
