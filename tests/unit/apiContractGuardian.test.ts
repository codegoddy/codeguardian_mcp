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
