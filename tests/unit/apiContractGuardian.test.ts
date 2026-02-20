/**
 * API Contract Guardian - Test Suite
 *
 * Tests for API Contract extraction, validation, and matching
 *
 * @format
 */

import { extractServicesFromFileAST } from "../../src/context/apiContractExtraction.js";
import { validateApiContractsFromContext } from "../../src/api-contract/validators/index.js";
import type { ProjectContext } from "../../src/context/projectContext.js";

// ============================================================================
// Mock Data
// ============================================================================

const mockTypeScriptServiceFile = `
import ApiService from './api';

export interface Client {
  id: string;
  name: string;
}

export const clientsApi = {
  getClients: (): Promise<Client[]> =>
    ApiService.get<Client[]>('/api/clients'),

  getClient: (id: string): Promise<Client> =>
    ApiService.get<Client>(\`/api/clients/\${id}\`),

  createClient: (data: ClientCreate): Promise<Client> =>
    ApiService.post<Client>('/api/clients', data),

  updateClient: (id: string, data: ClientUpdate): Promise<Client> =>
    ApiService.put<Client>(\`/api/clients/\${id}\`, data),

  deleteClient: (id: string): Promise<null> =>
    ApiService.delete<null>(\`/api/clients/\${id}\`),
};
`;

const mockPythonRouteFile = `
from fastapi import APIRouter

router = APIRouter(prefix="/clients", tags=["clients"])

@router.get("/", response_model=List[ClientResponse])
async def get_clients():
    pass

@router.get("/{client_id}", response_model=ClientResponse)
async def get_client(client_id: UUID):
    pass

@router.post("/", response_model=ClientResponse)
async def create_client(data: ClientCreate):
    pass

@router.put("/{client_id}", response_model=ClientResponse)
async def update_client(client_id: UUID, data: ClientUpdate):
    pass

@router.delete("/{client_id}")
async def delete_client(client_id: UUID):
    pass
`;

// ============================================================================
// Service Extraction Tests
// ============================================================================

describe("API Contract Guardian - Service Extraction", () => {
  describe("extractServicesFromFileAST", () => {
    it("should extract services from TypeScript file", async () => {
      // Create a temporary file for testing
      const fs = await import("fs/promises");
      const path = await import("path");
      const os = await import("os");

      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "api-contract-test-"));
      const tmpFile = path.join(tmpDir, "clients.ts");
      await fs.writeFile(tmpFile, mockTypeScriptServiceFile);

      try {
        const services = await extractServicesFromFileAST(tmpFile);

        expect(services).toHaveLength(5);
        expect(services[0]).toMatchObject({
          name: "getClients",
          method: "GET",
          endpoint: "/api/clients",
        });
        expect(services[1]).toMatchObject({
          name: "getClient",
          method: "GET",
          endpoint: "/api/clients/{id}",
        });
        expect(services[2]).toMatchObject({
          name: "createClient",
          method: "POST",
          endpoint: "/api/clients",
        });
      } finally {
        await fs.rm(tmpDir, { recursive: true });
      }
    });

    it("should extract query params from conditional template segments", async () => {
      const fs = await import("fs/promises");
      const path = await import("path");
      const os = await import("os");

      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "api-contract-query-conditional-"));
      const tmpFile = path.join(tmpDir, "api.ts");
      await fs.writeFile(
        tmpFile,
        `
        export const pantryApi = {
          getAll: (category?: string, status?: string) =>
            fetchApi(\`/pantry\${category ? \`?category=\${category}\` : ''}\${status ? \`&status=\${status}\` : ''}\`),
        };
        `,
      );

      try {
        const services = await extractServicesFromFileAST(tmpFile);
        expect(services).toHaveLength(1);
        expect(services[0].endpoint).toBe("/pantry");
        const paramNames = (services[0].queryParams || []).map((p) => p.name).sort();
        expect(paramNames).toEqual(["category", "status"]);
      } finally {
        await fs.rm(tmpDir, { recursive: true });
      }
    });

    it("should handle template strings with path parameters", async () => {
      const fs = await import("fs/promises");
      const path = await import("path");
      const os = await import("os");

      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "api-contract-test-"));
      const tmpFile = path.join(tmpDir, "test.ts");
      await fs.writeFile(
        tmpFile,
        `
        ApiService.get(\`/api/users/\${userId}/posts/\${postId}\`);
      `
      );

      try {
        const services = await extractServicesFromFileAST(tmpFile);
        expect(services).toHaveLength(1);
        expect(services[0].endpoint).toBe("/api/users/{user_id}/posts/{post_id}");
      } finally {
        await fs.rm(tmpDir, { recursive: true });
      }
    });

    it("should handle query parameters", async () => {
      const fs = await import("fs/promises");
      const path = await import("path");
      const os = await import("os");

      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "api-contract-test-"));
      const tmpFile = path.join(tmpDir, "test.ts");
      await fs.writeFile(
        tmpFile,
        `
        const query = params.toString() ? \`?\${params.toString()}\` : '';
        ApiService.get(\`/api/items\${query}\`);
      `
      );

      try {
        const services = await extractServicesFromFileAST(tmpFile);
        expect(services).toHaveLength(1);
        expect(services[0].endpoint).toBe("/api/items");
      } finally {
        await fs.rm(tmpDir, { recursive: true });
      }
    });

    it("should ignore fully dynamic fetch wrappers like `${BASE_URL}${endpoint}`", async () => {
      const fs = await import("fs/promises");
      const path = await import("path");
      const os = await import("os");

      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "api-contract-test-"));
      const tmpFile = path.join(tmpDir, "api.ts");
      await fs.writeFile(
        tmpFile,
        `
        const BASE_URL = 'http://localhost:3001/api';

        async function fetchApi(endpoint: string, options?: RequestInit) {
          return fetch(\`${"${BASE_URL}"}${"${endpoint}"}\`, options);
        }

        export const pantryApi = {
          getAll: () => fetchApi('/pantry'),
        };
      `,
      );

      try {
        const services = await extractServicesFromFileAST(tmpFile);
        expect(services).toHaveLength(1);
        expect(services[0].endpoint).toBe("/pantry");
      } finally {
        await fs.rm(tmpDir, { recursive: true });
      }
    });

    it("should strip URL origin for fetch() absolute URLs", async () => {
      const fs = await import("fs/promises");
      const path = await import("path");
      const os = await import("os");

      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "api-contract-test-"));
      const tmpFile = path.join(tmpDir, "api.ts");
      await fs.writeFile(
        tmpFile,
        `
        export async function getUser(id: string) {
          const res = await fetch(\`http://localhost:3000/api/users/\${id}\`);
          return res.json();
        }
        `,
      );

      try {
        const services = await extractServicesFromFileAST(tmpFile);
        expect(services).toHaveLength(1);
        expect(services[0].endpoint).toBe("/api/users/{id}");
      } finally {
        await fs.rm(tmpDir, { recursive: true });
      }
    });

    it("should resolve imported Express controller handlers for request field mismatch detection", async () => {
      const fs = await import("fs/promises");
      const path = await import("path");
      const os = await import("os");

      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "api-contract-imported-handler-"));
      const frontendDir = path.join(tmpDir, "frontend");
      const backendDir = path.join(tmpDir, "backend");
      await fs.mkdir(frontendDir);
      await fs.mkdir(backendDir, { recursive: true });

      const feFile = path.join(frontendDir, "api.ts");
      const beRoutesFile = path.join(backendDir, "routes.ts");
      const beControllerFile = path.join(backendDir, "pantryController.ts");

      await fs.writeFile(
        beRoutesFile,
        `
        import { Router } from 'express';
        import { consumePantryItem } from './pantryController';

        const router = Router();
        router.patch('/:id/consume', consumePantryItem);
        export default router;
        `,
      );

      await fs.writeFile(
        beControllerFile,
        `
        export const consumePantryItem = (req: any, res: any) => {
          const { amount } = req.body;
          return res.json({ success: true, amount });
        };
        `,
      );

      await fs.writeFile(
        feFile,
        `
        const API_BASE_URL = 'http://localhost:3001/api';

        async function fetchApi(endpoint: string, options?: RequestInit) {
          return fetch(\`${"${API_BASE_URL}"}${"${endpoint}"}\`, options);
        }

        export async function consumePantryItem(id: string, amount: number) {
          return fetchApi(\`/pantry/${"${id}"}/consume\`, {
            method: 'PATCH',
            body: JSON.stringify({ quantity: amount, consumedBy: 'user-123' }),
          });
        }
        `,
      );

      const ctx: ProjectContext = {
        projectPath: tmpDir,
        language: "typescript",
        buildTime: new Date().toISOString(),
        totalFiles: 0,
        files: new Map(),
        symbolIndex: new Map(),
        dependencies: [],
        importGraph: new Map(),
        reverseImportGraph: new Map(),
        keywordIndex: new Map(),
        externalDependencies: new Set(),
        entryPoints: [],
        frameworks: [],
        apiContract: {
          projectStructure: { relationship: "separate" },
          frontendServices: [
            {
              name: "consumePantryItem",
              method: "PATCH",
              endpoint: "/pantry/{id}/consume",
              file: feFile,
              line: 8,
            },
          ],
          frontendTypes: [],
          backendRoutes: [
            {
              method: "PATCH",
              path: "/api/pantry/:id/consume",
              handler: "consumePantryItem",
              file: beRoutesFile,
              line: 5,
            },
          ],
          backendModels: [],
          endpointMappings: new Map([
            [
              "PATCH /pantry/{id}/consume",
              {
                frontend: {
                  name: "consumePantryItem",
                  method: "PATCH",
                  endpoint: "/pantry/{id}/consume",
                  file: feFile,
                  line: 8,
                },
                backend: {
                  method: "PATCH",
                  path: "/api/pantry/:id/consume",
                  handler: "consumePantryItem",
                  file: beRoutesFile,
                  line: 5,
                },
                score: 100,
              },
            ],
          ]),
          typeMappings: new Map(),
          unmatchedFrontend: [],
          unmatchedBackend: [],
          lastUpdated: new Date().toISOString(),
        },
      };

      try {
        const result = validateApiContractsFromContext(ctx);

        expect(
          result.issues.some(
            (issue) =>
              issue.type === "apiExtraField" && issue.message.includes("quantity"),
          ),
        ).toBe(true);
        expect(
          result.issues.some(
            (issue) =>
              issue.type === "apiExtraField" && issue.message.includes("consumedBy"),
          ),
        ).toBe(true);
        expect(
          result.issues.some(
            (issue) =>
              issue.type === "apiMissingRequiredField" && issue.message.includes("'amount'"),
          ),
        ).toBe(true);
      } finally {
        await fs.rm(tmpDir, { recursive: true });
      }
    });

    it("should detect potential double /api prefix when base URL already includes /api", async () => {
      const fs = await import("fs/promises");
      const path = await import("path");
      const os = await import("os");

      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "api-contract-double-api-"));
      const frontendDir = path.join(tmpDir, "frontend");
      const backendDir = path.join(tmpDir, "backend");
      await fs.mkdir(frontendDir);
      await fs.mkdir(backendDir);

      const feFile = path.join(frontendDir, "api.ts");
      const beFile = path.join(backendDir, "routes.ts");

      await fs.writeFile(
        feFile,
        `
        const API_BASE_URL = 'http://localhost:3001/api';
        export async function getStats() {
          return fetch(\`${"${API_BASE_URL}"}/api/pantry/stats\`);
        }
        `,
      );
      await fs.writeFile(beFile, "export const routes = [];\n");

      const ctx: ProjectContext = {
        projectPath: tmpDir,
        language: "typescript",
        buildTime: new Date().toISOString(),
        totalFiles: 0,
        files: new Map(),
        symbolIndex: new Map(),
        dependencies: [],
        importGraph: new Map(),
        reverseImportGraph: new Map(),
        keywordIndex: new Map(),
        externalDependencies: new Set(),
        entryPoints: [],
        frameworks: [],
        apiContract: {
          projectStructure: { relationship: "separate" },
          frontendServices: [],
          frontendTypes: [],
          backendRoutes: [],
          backendModels: [],
          endpointMappings: new Map([
            [
              "GET /api/pantry/stats",
              {
                frontend: {
                  name: "getStats",
                  method: "GET",
                  endpoint: "/api/pantry/stats",
                  file: feFile,
                  line: 3,
                },
                backend: {
                  method: "GET",
                  path: "/api/pantry/stats",
                  handler: "getStats",
                  file: beFile,
                  line: 1,
                },
                score: 100,
              },
            ],
          ]),
          typeMappings: new Map(),
          unmatchedFrontend: [],
          unmatchedBackend: [],
          lastUpdated: new Date().toISOString(),
        },
      };

      try {
        const result = validateApiContractsFromContext(ctx);
        expect(
          result.issues.some(
            (issue) =>
              issue.type === "apiPathMismatch" && issue.message.includes("double '/api' prefix"),
          ),
        ).toBe(true);
      } finally {
        await fs.rm(tmpDir, { recursive: true });
      }
    });

    it("should report unmatched backend endpoints without duplicating method-mismatch paths", () => {
      const mockContext: ProjectContext = {
        projectPath: "/test",
        language: "typescript",
        buildTime: new Date().toISOString(),
        totalFiles: 0,
        files: new Map(),
        symbolIndex: new Map(),
        dependencies: [],
        importGraph: new Map(),
        reverseImportGraph: new Map(),
        keywordIndex: new Map(),
        externalDependencies: new Set(),
        entryPoints: [],
        frameworks: [],
        apiContract: {
          projectStructure: { relationship: "separate" },
          frontendServices: [
            {
              name: "toggle",
              method: "POST",
              endpoint: "/shopping/{id}/toggle",
              file: "/test/frontend/api.ts",
              line: 10,
            },
            {
              name: "getAll",
              method: "GET",
              endpoint: "/shopping",
              file: "/test/frontend/api.ts",
              line: 5,
            },
          ],
          frontendTypes: [],
          backendRoutes: [
            {
              method: "PATCH",
              path: "/api/shopping/:id/toggle",
              handler: "toggle",
              file: "/test/backend/routes.ts",
              line: 20,
            },
            {
              method: "POST",
              path: "/api/shopping/bulk-add",
              handler: "bulkAdd",
              file: "/test/backend/routes.ts",
              line: 23,
            },
          ],
          backendModels: [],
          endpointMappings: new Map(),
          typeMappings: new Map(),
          unmatchedFrontend: [
            {
              name: "toggle",
              method: "POST",
              endpoint: "/shopping/{id}/toggle",
              file: "/test/frontend/api.ts",
              line: 10,
            },
          ],
          unmatchedBackend: [
            {
              method: "PATCH",
              path: "/api/shopping/:id/toggle",
              handler: "toggle",
              file: "/test/backend/routes.ts",
              line: 20,
            },
            {
              method: "POST",
              path: "/api/shopping/bulk-add",
              handler: "bulkAdd",
              file: "/test/backend/routes.ts",
              line: 23,
            },
          ],
          lastUpdated: new Date().toISOString(),
        },
      };

      const result = validateApiContractsFromContext(mockContext);

      // Method mismatch should be reported from unmatched frontend logic
      expect(
        result.issues.some(
          (issue) =>
            issue.type === "apiMethodMismatch" && issue.message.includes("/shopping/{id}/toggle"),
        ),
      ).toBe(true);

      // Backend-only endpoint should be reported
      expect(
        result.issues.some(
          (issue) =>
            issue.type === "apiEndpointNotFound" && issue.message.includes("/api/shopping/bulk-add"),
        ),
      ).toBe(true);

      // But the toggle route should not be duplicated as backend-only since the path is already referenced by frontend
      expect(
        result.issues.some(
          (issue) =>
            issue.type === "apiEndpointNotFound" && issue.message.includes("/api/shopping/:id/toggle"),
        ),
      ).toBe(false);
    });

    it("should detect likely unregistered backend routes defined outside API mounts", () => {
      const mockContext: ProjectContext = {
        projectPath: "/test",
        language: "typescript",
        buildTime: new Date().toISOString(),
        totalFiles: 0,
        files: new Map(),
        symbolIndex: new Map(),
        dependencies: [],
        importGraph: new Map(),
        reverseImportGraph: new Map(),
        keywordIndex: new Map(),
        externalDependencies: new Set(),
        entryPoints: [],
        frameworks: [],
        apiContract: {
          projectStructure: { relationship: "separate" },
          frontendServices: [
            {
              name: "getPantry",
              method: "GET",
              endpoint: "/pantry",
              file: "/test/frontend/api.ts",
              line: 5,
            },
          ],
          frontendTypes: [],
          backendRoutes: [
            {
              method: "GET",
              path: "/analytics",
              handler: "getAnalytics",
              file: "/test/backend/src/routes/analytics.ts",
              line: 7,
            },
          ],
          backendModels: [],
          endpointMappings: new Map(),
          typeMappings: new Map(),
          unmatchedFrontend: [],
          unmatchedBackend: [
            {
              method: "GET",
              path: "/analytics",
              handler: "getAnalytics",
              file: "/test/backend/src/routes/analytics.ts",
              line: 7,
            },
          ],
          lastUpdated: new Date().toISOString(),
        },
      };

      const result = validateApiContractsFromContext(mockContext);

      expect(
        result.issues.some(
          (issue) =>
            issue.type === "apiEndpointNotFound" &&
            issue.message.includes("Potential unregistered backend route") &&
            issue.message.includes("GET /analytics"),
        ),
      ).toBe(true);
    });
  });
});

// ============================================================================
// Validation Tests
// ============================================================================

describe("API Contract Guardian - Validation", () => {
  describe("validateApiContractsFromContext", () => {
    it("should return empty result when no API contract context", () => {
      const mockContext: ProjectContext = {
        projectPath: "/test",
        language: "typescript",
        buildTime: new Date().toISOString(),
        totalFiles: 0,
        files: new Map(),
        symbolIndex: new Map(),
        dependencies: [],
        importGraph: new Map(),
        reverseImportGraph: new Map(),
        keywordIndex: new Map(),
        externalDependencies: new Set(),
        entryPoints: [],
        frameworks: [],
      };

      const result = validateApiContractsFromContext(mockContext);

      expect(result.issues).toHaveLength(0);
      expect(result.summary.totalIssues).toBe(0);
    });

    it("should detect method mismatch", () => {
      const mockContext: ProjectContext = {
        projectPath: "/test",
        language: "typescript",
        buildTime: new Date().toISOString(),
        totalFiles: 0,
        files: new Map(),
        symbolIndex: new Map(),
        dependencies: [],
        importGraph: new Map(),
        reverseImportGraph: new Map(),
        keywordIndex: new Map(),
        externalDependencies: new Set(),
        entryPoints: [],
        frameworks: [],
        apiContract: {
          projectStructure: {
            relationship: "separate",
            frontend: {
              path: "/test/frontend",
              framework: "react",
              apiPattern: "rest",
              httpClient: "axios",
            },
            backend: {
              path: "/test/backend",
              framework: "fastapi",
              apiPattern: "rest",
              apiPrefix: "/api",
            },
          },
          frontendServices: [
            {
              name: "createUser",
              method: "POST",
              endpoint: "/api/users",
              file: "/test/frontend/services/users.ts",
              line: 10,
            },
          ],
          frontendTypes: [],
          backendRoutes: [
            {
              method: "GET",
              path: "/api/users",
              handler: "get_users",
              file: "/test/backend/api/users.py",
              line: 15,
            },
          ],
          backendModels: [],
          endpointMappings: new Map([
            [
              "/api/users",
              {
                frontend: {
                  name: "createUser",
                  method: "POST",
                  endpoint: "/api/users",
                  file: "/test/frontend/services/users.ts",
                  line: 10,
                },
                backend: {
                  method: "GET",
                  path: "/api/users",
                  handler: "get_users",
                  file: "/test/backend/api/users.py",
                  line: 15,
                },
                score: 50,
              },
            ],
          ]),
          typeMappings: new Map(),
          unmatchedFrontend: [],
          unmatchedBackend: [],
          lastUpdated: new Date().toISOString(),
        },
      };

      const result = validateApiContractsFromContext(mockContext);

      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues[0].type).toBe("apiMethodMismatch");
      expect(result.issues[0].severity).toBe("critical");
    });

    it("should detect missing required fields in types", () => {
      const mockContext: ProjectContext = {
        projectPath: "/test",
        language: "typescript",
        buildTime: new Date().toISOString(),
        totalFiles: 0,
        files: new Map(),
        symbolIndex: new Map(),
        dependencies: [],
        importGraph: new Map(),
        reverseImportGraph: new Map(),
        keywordIndex: new Map(),
        externalDependencies: new Set(),
        entryPoints: [],
        frameworks: [],
        apiContract: {
          projectStructure: {
            relationship: "separate",
          },
          frontendServices: [],
          frontendTypes: [
            {
              name: "UserCreate",
              fields: [{ name: "name", type: "string", required: true }],
              file: "/test/frontend/types.ts",
              line: 1,
              kind: "interface",
            },
          ],
          backendRoutes: [],
          backendModels: [
            {
              name: "UserCreate",
              fields: [
                { name: "name", type: "str", required: true },
                { name: "email", type: "str", required: true },
              ],
              file: "/test/backend/models.py",
              line: 1,
            },
          ],
          endpointMappings: new Map(),
          typeMappings: new Map([
            [
              "UserCreate",
              {
                frontend: {
                  name: "UserCreate",
                  fields: [{ name: "name", type: "string", required: true }],
                  file: "/test/frontend/types.ts",
                  line: 1,
                  kind: "interface",
                },
                backend: {
                  name: "UserCreate",
                  fields: [
                    { name: "name", type: "str", required: true },
                    { name: "email", type: "str", required: true },
                  ],
                  file: "/test/backend/models.py",
                  line: 1,
                },
                compatibility: { score: 50, issues: [] },
              },
            ],
          ]),
          unmatchedFrontend: [],
          unmatchedBackend: [],
          lastUpdated: new Date().toISOString(),
        },
      };

      const result = validateApiContractsFromContext(mockContext);

      const missingFieldIssue = result.issues.find(
        (i) => i.type === "apiMissingRequiredField"
      );
      expect(missingFieldIssue).toBeDefined();
      expect(missingFieldIssue?.message).toContain("email");
    });

    it("should detect inline request/response field mismatches for Express + fetch", async () => {
      const fs = await import("fs/promises");
      const path = await import("path");
      const os = await import("os");

      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "api-contract-inline-"));
      const frontendDir = path.join(tmpDir, "frontend");
      const backendDir = path.join(tmpDir, "backend");
      await fs.mkdir(frontendDir);
      await fs.mkdir(backendDir);

      const feFile = path.join(frontendDir, "api.ts");
      const beFile = path.join(backendDir, "server.ts");

      await fs.writeFile(
        beFile,
        `
        import express from 'express';
        const app = express();

        app.get('/api/users/:id', (req, res) => {
          res.json({ id: req.params.id, name: 'John', email: 'john@example.com', age: 30 });
        });

        app.post('/api/users', (req, res) => {
          const { name, email, age } = req.body;
          res.json({ id: '123', name, email, age, createdAt: new Date() });
        });
        `,
      );

      await fs.writeFile(
        feFile,
        `
        export async function getUser(id: string) {
          const response = await fetch(\`http://localhost:3000/api/users/\${id}\`);
          const data = await response.json();
          return {
            id: data.id,
            username: data.username,
            email: data.email,
            age: data.age,
            status: data.status,
          };
        }

        export async function createUser(userData: { name: string; email: string; age: number; phone: string; }) {
          const response = await fetch('http://localhost:3000/api/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(userData),
          });
          return response.json();
        }
        `,
      );

      const ctx: ProjectContext = {
        projectPath: tmpDir,
        language: "typescript",
        buildTime: new Date().toISOString(),
        totalFiles: 0,
        files: new Map(),
        symbolIndex: new Map(),
        dependencies: [],
        importGraph: new Map(),
        reverseImportGraph: new Map(),
        keywordIndex: new Map(),
        externalDependencies: new Set(),
        entryPoints: [],
        frameworks: [],
        apiContract: {
          projectStructure: {
            relationship: "separate",
            frontend: {
              path: frontendDir,
              framework: "react",
              apiPattern: "rest",
              httpClient: "fetch",
            },
            backend: {
              path: backendDir,
              framework: "express",
              apiPattern: "rest",
              apiPrefix: "/api",
            },
          },
          frontendServices: [],
          frontendTypes: [],
          backendRoutes: [],
          backendModels: [],
          endpointMappings: new Map([
            [
              "/api/users/{id}",
              {
                frontend: { name: "getUser", method: "GET", endpoint: "/api/users/{id}", file: feFile, line: 2 },
                backend: { method: "GET", path: "/api/users/:id", handler: "getUser", file: beFile, line: 5 },
                score: 100,
              },
            ],
            [
              "/api/users",
              {
                frontend: { name: "createUser", method: "POST", endpoint: "/api/users", file: feFile, line: 12 },
                backend: { method: "POST", path: "/api/users", handler: "createUser", file: beFile, line: 9 },
                score: 100,
              },
            ],
          ]),
          typeMappings: new Map(),
          unmatchedFrontend: [],
          unmatchedBackend: [],
          lastUpdated: new Date().toISOString(),
        },
      };

      try {
        const result = validateApiContractsFromContext(ctx);
        // username + status missing in response
        expect(result.issues.some((i) => i.type === "apiMissingRequiredField" && i.message.includes("username"))).toBe(true);
        expect(result.issues.some((i) => i.type === "apiMissingRequiredField" && i.message.includes("status"))).toBe(true);
        // phone extra in request
        expect(result.issues.some((i) => i.type === "apiExtraField" && i.message.includes("phone"))).toBe(true);
      } finally {
        await fs.rm(tmpDir, { recursive: true });
      }
    });

    it("should detect request type coercion mismatches and Prisma write payload hallucinated fields", async () => {
      const fs = await import("fs/promises");
      const path = await import("path");
      const os = await import("os");

      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "api-contract-prisma-write-"));
      const frontendDir = path.join(tmpDir, "frontend");
      const backendDir = path.join(tmpDir, "backend");
      await fs.mkdir(frontendDir);
      await fs.mkdir(backendDir);

      const feFile = path.join(frontendDir, "api.ts");
      const beRoutesFile = path.join(backendDir, "routes.ts");
      const beControllerFile = path.join(backendDir, "pantryController.ts");

      await fs.writeFile(
        feFile,
        `
        type PantryItem = {
          id: string;
          name: string;
          quantity: number;
        };

        export async function updatePantryItem(id: string, data: Omit<PantryItem, 'id'>) {
          return fetch(\`http://localhost:3000/api/pantry/\${id}\`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...data, quantity: String(data.quantity) }),
          });
        }
        `,
      );

      await fs.writeFile(
        beRoutesFile,
        `
        import { Router } from 'express';
        import { updatePantryItem } from './pantryController';

        const router = Router();
        router.put('/:id', updatePantryItem);
        export default router;
        `,
      );

      await fs.writeFile(
        beControllerFile,
        `
        declare const prisma: any;

        export const updatePantryItem = async (req: any, res: any) => {
          const { name, quantity } = req.body;
          const parsedQuantity = Number(quantity);

          const updated = await prisma.pantryItem.update({
            where: { id: req.params.id },
            data: {
              name,
              quantity: parsedQuantity,
              calories: 150,
            },
          });

          return res.json(updated);
        };
        `,
      );

      const ctx: ProjectContext = {
        projectPath: tmpDir,
        language: "typescript",
        buildTime: new Date().toISOString(),
        totalFiles: 0,
        files: new Map(),
        symbolIndex: new Map(),
        dependencies: [],
        importGraph: new Map(),
        reverseImportGraph: new Map(),
        keywordIndex: new Map(),
        externalDependencies: new Set(),
        entryPoints: [],
        frameworks: [],
        apiContract: {
          projectStructure: {
            relationship: "separate",
            frontend: {
              path: frontendDir,
              framework: "react",
              apiPattern: "rest",
              httpClient: "fetch",
            },
            backend: {
              path: backendDir,
              framework: "express",
              apiPattern: "rest",
              apiPrefix: "/api",
            },
          },
          frontendServices: [
            {
              name: "updatePantryItem",
              method: "PUT",
              endpoint: "/pantry/{id}",
              file: feFile,
              line: 8,
            },
          ],
          frontendTypes: [
            {
              name: "PantryItem",
              fields: [
                { name: "id", type: "string", required: true },
                { name: "name", type: "string", required: true },
                { name: "quantity", type: "number", required: true },
              ],
              file: feFile,
              line: 2,
              kind: "type",
            },
          ],
          backendRoutes: [
            {
              method: "PUT",
              path: "/api/pantry/:id",
              handler: "updatePantryItem",
              file: beRoutesFile,
              line: 6,
            },
          ],
          backendModels: [
            {
              name: "PantryItem",
              file: beControllerFile,
              line: 1,
              fields: [
                { name: "id", type: "string", required: true },
                { name: "name", type: "string", required: true },
                { name: "quantity", type: "int", required: true },
              ],
            },
          ],
          endpointMappings: new Map([
            [
              "PUT /pantry/{id}",
              {
                frontend: {
                  name: "updatePantryItem",
                  method: "PUT",
                  endpoint: "/pantry/{id}",
                  file: feFile,
                  line: 8,
                },
                backend: {
                  method: "PUT",
                  path: "/api/pantry/:id",
                  handler: "updatePantryItem",
                  file: beRoutesFile,
                  line: 6,
                },
                score: 100,
              },
            ],
          ]),
          typeMappings: new Map(),
          unmatchedFrontend: [],
          unmatchedBackend: [],
          lastUpdated: new Date().toISOString(),
        },
      };

      try {
        const result = validateApiContractsFromContext(ctx);

        expect(
          result.issues.some(
            (issue) =>
              issue.type === "apiTypeMismatch" &&
              issue.message.toLowerCase().includes("frontend uses string"),
          ),
        ).toBe(true);

        expect(
          result.issues.some(
            (issue) =>
              issue.type === "apiContractMismatch" &&
              issue.message.includes("calories") &&
              issue.message.includes("does not exist on model"),
          ),
        ).toBe(true);
      } finally {
        await fs.rm(tmpDir, { recursive: true });
      }
    });

    it("should skip inline field mismatches for unused frontend service methods", async () => {
      const fs = await import("fs/promises");
      const path = await import("path");
      const os = await import("os");

      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "api-contract-unused-service-"));
      const frontendDir = path.join(tmpDir, "frontend");
      const backendDir = path.join(tmpDir, "backend");
      await fs.mkdir(frontendDir);
      await fs.mkdir(backendDir);

      const feFile = path.join(frontendDir, "api.ts");
      const feHooksFile = path.join(frontendDir, "useApi.ts");
      const beFile = path.join(backendDir, "server.ts");

      await fs.writeFile(
        feFile,
        `
        type PantryPayload = {
          id: string;
          dateAdded: string;
          name: string;
          checked: boolean;
        };

        async function fetchApi(endpoint: string, options?: RequestInit) {
          return fetch(endpoint, options);
        }

        export const pantryApi = {
          create: (data: Omit<PantryPayload, 'id' | 'dateAdded'>) =>
            fetchApi('/pantry', {
              method: 'POST',
              body: JSON.stringify(data),
            }),

          update: (id: string, data: Partial<PantryPayload>) =>
            fetchApi(\`/pantry/\${id}\`, {
              method: 'PUT',
              body: JSON.stringify(data),
            }),
        };
        `,
      );

      await fs.writeFile(
        feHooksFile,
        `
        import { pantryApi } from './api';

        export async function addItem() {
          return pantryApi.create({ name: 'Rice', checked: true });
        }
        `,
      );

      await fs.writeFile(
        beFile,
        `
        import express from 'express';
        const app = express();

        const createPantry = (req, res) => {
          const { name } = req.body;
          res.json({ name });
        };

        const updatePantry = (req, res) => {
          const { name } = req.body;
          res.json({ name });
        };

        app.post('/api/pantry', createPantry);
        app.put('/api/pantry/:id', updatePantry);
        `,
      );

      const ctx: ProjectContext = {
        projectPath: tmpDir,
        language: "typescript",
        buildTime: new Date().toISOString(),
        totalFiles: 0,
        files: new Map(),
        symbolIndex: new Map(),
        dependencies: [],
        importGraph: new Map(),
        reverseImportGraph: new Map(),
        keywordIndex: new Map(),
        externalDependencies: new Set(),
        entryPoints: [],
        frameworks: [],
        apiContract: {
          projectStructure: {
            relationship: "separate",
            frontend: {
              path: frontendDir,
              framework: "react",
              apiPattern: "rest",
              httpClient: "fetch",
            },
            backend: {
              path: backendDir,
              framework: "express",
              apiPattern: "rest",
              apiPrefix: "/api",
            },
          },
          frontendServices: [
            {
              name: "create",
              method: "POST",
              endpoint: "/api/pantry",
              file: feFile,
              line: 14,
            },
            {
              name: "update",
              method: "PUT",
              endpoint: "/api/pantry/{id}",
              file: feFile,
              line: 21,
            },
          ],
          frontendTypes: [
            {
              name: "PantryPayload",
              fields: [
                { name: "id", type: "string", required: true },
                { name: "dateAdded", type: "string", required: true },
                { name: "name", type: "string", required: true },
                { name: "checked", type: "boolean", required: true },
              ],
              file: feFile,
              line: 2,
              kind: "type",
            },
          ],
          backendRoutes: [
            {
              method: "POST",
              path: "/api/pantry",
              handler: "createPantry",
              file: beFile,
              line: 15,
            },
            {
              method: "PUT",
              path: "/api/pantry/:id",
              handler: "updatePantry",
              file: beFile,
              line: 16,
            },
          ],
          backendModels: [],
          endpointMappings: new Map([
            [
              "POST /api/pantry",
              {
                frontend: {
                  name: "create",
                  method: "POST",
                  endpoint: "/api/pantry",
                  file: feFile,
                  line: 14,
                },
                backend: {
                  method: "POST",
                  path: "/api/pantry",
                  handler: "createPantry",
                  file: beFile,
                  line: 15,
                },
                score: 100,
              },
            ],
            [
              "PUT /api/pantry/{id}",
              {
                frontend: {
                  name: "update",
                  method: "PUT",
                  endpoint: "/api/pantry/{id}",
                  file: feFile,
                  line: 21,
                },
                backend: {
                  method: "PUT",
                  path: "/api/pantry/:id",
                  handler: "updatePantry",
                  file: beFile,
                  line: 16,
                },
                score: 100,
              },
            ],
          ]),
          typeMappings: new Map(),
          unmatchedFrontend: [],
          unmatchedBackend: [],
          lastUpdated: new Date().toISOString(),
        },
      };

      try {
        const result = validateApiContractsFromContext(ctx);

        // Used method should still be validated.
        expect(
          result.issues.some(
            (i) => i.type === "apiExtraField" && i.message.includes("frontend sends 'checked'") && i.message.includes("POST /api/pantry"),
          ),
        ).toBe(true);

        // Unused service method should not emit inline field mismatch noise.
        const hasUnusedUpdateIdIssue = result.issues.some(
          (i) => i.type === "apiExtraField" && i.message.includes("frontend sends 'id'") && i.message.includes("PUT /api/pantry/:id"),
        );
        const hasUnusedUpdateDateAddedIssue = result.issues.some(
          (i) => i.type === "apiExtraField" && i.message.includes("frontend sends 'dateAdded'") && i.message.includes("PUT /api/pantry/:id"),
        );

        expect(hasUnusedUpdateIdIssue).toBe(false);
        expect(hasUnusedUpdateDateAddedIssue).toBe(false);
      } finally {
        await fs.rm(tmpDir, { recursive: true });
      }
    });

    it("should detect missing responses, unused locals, and unknown Prisma model queries in backend handlers", async () => {
      const fs = await import("fs/promises");
      const path = await import("path");
      const os = await import("os");

      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "api-contract-handler-checks-"));
      const frontendDir = path.join(tmpDir, "frontend");
      const backendDir = path.join(tmpDir, "backend");
      await fs.mkdir(frontendDir);
      await fs.mkdir(backendDir);

      const feFile = path.join(frontendDir, "api.ts");
      const beRoutesFile = path.join(backendDir, "routes.ts");
      const beControllerFile = path.join(backendDir, "analyticsController.ts");

      await fs.writeFile(
        feFile,
        `
        export async function getStats() {
          return fetch('http://localhost:3000/api/analytics/stats');
        }
        `,
      );

      await fs.writeFile(
        beRoutesFile,
        `
        import { Router } from 'express';
        import { getStats } from './analyticsController';

        const router = Router();
        router.get('/stats', getStats);
        export default router;
        `,
      );

      await fs.writeFile(
        beControllerFile,
        `
        declare const prisma: any;

        export const getStats = async (req: any, res: any) => {
          const unusedSummary = await prisma.recipe.findMany({});
          await prisma.cookingHistory.findMany({ where: { userId: 'abc' } });
          return { ok: true };
        };
        `,
      );

      const ctx: ProjectContext = {
        projectPath: tmpDir,
        language: "typescript",
        buildTime: new Date().toISOString(),
        totalFiles: 0,
        files: new Map(),
        symbolIndex: new Map(),
        dependencies: [],
        importGraph: new Map(),
        reverseImportGraph: new Map(),
        keywordIndex: new Map(),
        externalDependencies: new Set(),
        entryPoints: [],
        frameworks: [],
        apiContract: {
          projectStructure: { relationship: "separate" },
          frontendServices: [
            {
              name: "getStats",
              method: "GET",
              endpoint: "/analytics/stats",
              file: feFile,
              line: 2,
            },
          ],
          frontendTypes: [],
          backendRoutes: [
            {
              method: "GET",
              path: "/api/analytics/stats",
              handler: "getStats",
              file: beRoutesFile,
              line: 6,
            },
          ],
          backendModels: [
            {
              name: "Recipe",
              file: beControllerFile,
              line: 1,
              fields: [
                { name: "id", type: "string", required: true },
              ],
            },
          ],
          endpointMappings: new Map([
            [
              "GET /analytics/stats",
              {
                frontend: {
                  name: "getStats",
                  method: "GET",
                  endpoint: "/analytics/stats",
                  file: feFile,
                  line: 2,
                },
                backend: {
                  method: "GET",
                  path: "/api/analytics/stats",
                  handler: "getStats",
                  file: beRoutesFile,
                  line: 6,
                },
                score: 100,
              },
            ],
          ]),
          typeMappings: new Map(),
          unmatchedFrontend: [],
          unmatchedBackend: [],
          lastUpdated: new Date().toISOString(),
        },
      };

      try {
        const result = validateApiContractsFromContext(ctx);

        expect(
          result.issues.some(
            (issue) =>
              issue.type === "apiContractMismatch" &&
              issue.message.includes("Potential missing response") &&
              issue.message.includes("GET /api/analytics/stats"),
          ),
        ).toBe(true);

        expect(
          result.issues.some(
            (issue) =>
              issue.type === "apiContractMismatch" &&
              issue.message.includes("Unused local variable") &&
              issue.message.includes("unusedSummary"),
          ),
        ).toBe(true);

        expect(
          result.issues.some(
            (issue) =>
              issue.type === "apiContractMismatch" &&
              issue.message.includes("prisma.cookingHistory.findMany"),
          ),
        ).toBe(true);
      } finally {
        await fs.rm(tmpDir, { recursive: true });
      }
    });

    it("should not flag variables used via object shorthand in backend responses as unused", async () => {
      const fs = await import("fs/promises");
      const path = await import("path");
      const os = await import("os");

      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "api-contract-shorthand-usage-"));
      const frontendDir = path.join(tmpDir, "frontend");
      const backendDir = path.join(tmpDir, "backend");
      await fs.mkdir(frontendDir);
      await fs.mkdir(backendDir);

      const feFile = path.join(frontendDir, "api.ts");
      const beRoutesFile = path.join(backendDir, "routes.ts");
      const beControllerFile = path.join(backendDir, "recipeController.ts");

      await fs.writeFile(
        feFile,
        `
        export async function getRecipeMatch(id: string) {
          return fetch(\`http://localhost:3000/api/recipes/${"${id}"}/match\`);
        }
        `,
      );

      await fs.writeFile(
        beRoutesFile,
        `
        import { Router } from 'express';
        import { getRecipeMatch } from './recipeController';

        const router = Router();
        router.get('/:id/match', getRecipeMatch);
        export default router;
        `,
      );

      await fs.writeFile(
        beControllerFile,
        `
        export const getRecipeMatch = async (req: any, res: any) => {
          const matchPercentage = 87;
          return res.json({ matchPercentage });
        };
        `,
      );

      const ctx: ProjectContext = {
        projectPath: tmpDir,
        language: "typescript",
        buildTime: new Date().toISOString(),
        totalFiles: 0,
        files: new Map(),
        symbolIndex: new Map(),
        dependencies: [],
        importGraph: new Map(),
        reverseImportGraph: new Map(),
        keywordIndex: new Map(),
        externalDependencies: new Set(),
        entryPoints: [],
        frameworks: [],
        apiContract: {
          projectStructure: { relationship: "separate" },
          frontendServices: [
            {
              name: "getRecipeMatch",
              method: "GET",
              endpoint: "/recipes/{id}/match",
              file: feFile,
              line: 2,
            },
          ],
          frontendTypes: [],
          backendRoutes: [
            {
              method: "GET",
              path: "/api/recipes/:id/match",
              handler: "getRecipeMatch",
              file: beRoutesFile,
              line: 6,
            },
          ],
          backendModels: [],
          endpointMappings: new Map([
            [
              "GET /recipes/{id}/match",
              {
                frontend: {
                  name: "getRecipeMatch",
                  method: "GET",
                  endpoint: "/recipes/{id}/match",
                  file: feFile,
                  line: 2,
                },
                backend: {
                  method: "GET",
                  path: "/api/recipes/:id/match",
                  handler: "getRecipeMatch",
                  file: beRoutesFile,
                  line: 6,
                },
                score: 100,
              },
            ],
          ]),
          typeMappings: new Map(),
          unmatchedFrontend: [],
          unmatchedBackend: [],
          lastUpdated: new Date().toISOString(),
        },
      };

      try {
        const result = validateApiContractsFromContext(ctx);

        expect(
          result.issues.some(
            (issue) =>
              issue.type === "apiContractMismatch" &&
              issue.message.includes("Unused local variable") &&
              issue.message.includes("matchPercentage"),
          ),
        ).toBe(false);
      } finally {
        await fs.rm(tmpDir, { recursive: true });
      }
    });

    it("should detect Prisma-backed property hallucinations and ignore collection methods", async () => {
      const fs = await import("fs/promises");
      const path = await import("path");
      const os = await import("os");

      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "api-contract-prisma-hallucination-"));
      const frontendDir = path.join(tmpDir, "frontend");
      const backendDir = path.join(tmpDir, "backend");
      await fs.mkdir(frontendDir);
      await fs.mkdir(backendDir);

      const feFile = path.join(frontendDir, "api.ts");
      const beRoutesFile = path.join(backendDir, "routes.ts");
      const beControllerFile = path.join(backendDir, "recipeController.ts");

      await fs.writeFile(
        feFile,
        `
        export async function updateRecipe(id: string) {
          return fetch(\`http://localhost:3000/api/recipes/${"${id}"}\`, { method: 'PUT' });
        }
        `,
      );

      await fs.writeFile(
        beRoutesFile,
        `
        import { Router } from 'express';
        import { updateRecipe } from './recipeController';

        const router = Router();
        router.put('/:id', updateRecipe);
        export default router;
        `,
      );

      await fs.writeFile(
        beControllerFile,
        `
        declare const prisma: any;

        export const updateRecipe = async (req: any, res: any) => {
          const recipes = await prisma.recipe.findMany({});
          // Valid array method access: should NOT be flagged
          recipes.map((r: any) => r.name);
          // Collection item alias should still be validated against Recipe model
          recipes.forEach((recipeItem: any) => {
            // @ts-ignore
            console.log(recipeItem.socialMetrics?.likes);
          });

          const recipe = await prisma.recipe.findUnique({ where: { id: req.params.id } });
          // Hallucinated property access: should be flagged
          if (recipe.metadata?.lastUpdatedBy) {
            console.log(recipe.metadata.lastUpdatedBy);
          }

          return res.json(recipe);
        };
        `,
      );

      const ctx: ProjectContext = {
        projectPath: tmpDir,
        language: "typescript",
        buildTime: new Date().toISOString(),
        totalFiles: 0,
        files: new Map(),
        symbolIndex: new Map(),
        dependencies: [],
        importGraph: new Map(),
        reverseImportGraph: new Map(),
        keywordIndex: new Map(),
        externalDependencies: new Set(),
        entryPoints: [],
        frameworks: [],
        apiContract: {
          projectStructure: { relationship: "separate" },
          frontendServices: [
            {
              name: "updateRecipe",
              method: "PUT",
              endpoint: "/recipes/{id}",
              file: feFile,
              line: 2,
            },
          ],
          frontendTypes: [],
          backendRoutes: [
            {
              method: "PUT",
              path: "/api/recipes/:id",
              handler: "updateRecipe",
              file: beRoutesFile,
              line: 6,
            },
          ],
          backendModels: [
            {
              name: "Recipe",
              file: beControllerFile,
              line: 1,
              fields: [
                { name: "id", type: "string", required: true },
                { name: "name", type: "string", required: true },
              ],
            },
          ],
          endpointMappings: new Map([
            [
              "PUT /recipes/{id}",
              {
                frontend: {
                  name: "updateRecipe",
                  method: "PUT",
                  endpoint: "/recipes/{id}",
                  file: feFile,
                  line: 2,
                },
                backend: {
                  method: "PUT",
                  path: "/api/recipes/:id",
                  handler: "updateRecipe",
                  file: beRoutesFile,
                  line: 6,
                },
                score: 100,
              },
            ],
          ]),
          typeMappings: new Map(),
          unmatchedFrontend: [],
          unmatchedBackend: [],
          lastUpdated: new Date().toISOString(),
        },
      };

      try {
        const result = validateApiContractsFromContext(ctx);

        expect(
          result.issues.some(
            (issue) =>
              issue.type === "apiContractMismatch" && issue.message.includes("recipe.metadata"),
          ),
        ).toBe(true);

        expect(
          result.issues.some(
            (issue) =>
              issue.type === "apiContractMismatch" && issue.message.includes("recipeItem.socialMetrics"),
          ),
        ).toBe(true);

        expect(
          result.issues.some(
            (issue) =>
              issue.type === "apiContractMismatch" && issue.message.includes("recipes.map"),
          ),
        ).toBe(false);
      } finally {
        await fs.rm(tmpDir, { recursive: true });
      }
    });
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe("API Contract Guardian - Integration", () => {
  it("should handle full project validation flow", async () => {
    // This would be a full integration test with a real project structure
    // For now, we verify the components work together
    const mockContext: ProjectContext = {
      projectPath: "/test",
      language: "typescript",
      buildTime: new Date().toISOString(),
      totalFiles: 10,
      files: new Map(),
      symbolIndex: new Map(),
      dependencies: [],
      importGraph: new Map(),
      reverseImportGraph: new Map(),
      keywordIndex: new Map(),
      externalDependencies: new Set(),
      entryPoints: [],
      frameworks: [],
      apiContract: {
        projectStructure: {
          relationship: "separate",
          frontend: {
            path: "/test/frontend",
            framework: "react",
            apiPattern: "rest",
            httpClient: "axios",
          },
          backend: {
            path: "/test/backend",
            framework: "fastapi",
            apiPattern: "rest",
            apiPrefix: "/api",
          },
        },
        frontendServices: [
          {
            name: "getUsers",
            method: "GET",
            endpoint: "/api/users",
            file: "/test/frontend/services/users.ts",
            line: 10,
          },
        ],
        frontendTypes: [],
        backendRoutes: [
          {
            method: "GET",
            path: "/api/users",
            handler: "get_users",
            file: "/test/backend/api/users.py",
            line: 15,
          },
        ],
        backendModels: [],
        endpointMappings: new Map([
          [
            "/api/users",
            {
              frontend: {
                name: "getUsers",
                method: "GET",
                endpoint: "/api/users",
                file: "/test/frontend/services/users.ts",
                line: 10,
              },
              backend: {
                method: "GET",
                path: "/api/users",
                handler: "get_users",
                file: "/test/backend/api/users.py",
                line: 15,
              },
              score: 100,
            },
          ],
        ]),
        typeMappings: new Map(),
        unmatchedFrontend: [],
        unmatchedBackend: [],
        lastUpdated: new Date().toISOString(),
      },
    };

    const result = validateApiContractsFromContext(mockContext);

    expect(result.summary.matchedEndpoints).toBe(1);
    expect(result.summary.totalIssues).toBe(0);
  });
});
