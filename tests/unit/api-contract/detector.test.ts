/**
 * Unit tests for API Contract Guardian - Detector
 *
 * @format
 */


import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import {
  detectProjectStructure,
  createProjectStructureFromConfig,
} from "../../../src/api-contract/detector.js";
import type { ProjectStructure } from "../../../src/api-contract/types.js";

describe("API Contract Detector", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "api-contract-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("detectProjectStructure", () => {
    it("should detect Next.js frontend project", async () => {
      // Create a mock Next.js project
      const packageJson = {
        name: "test-frontend",
        dependencies: {
          next: "^14.0.0",
          react: "^18.0.0",
        },
      };

      await fs.writeFile(
        path.join(tempDir, "package.json"),
        JSON.stringify(packageJson, null, 2),
      );

      // Create services folder
      await fs.mkdir(path.join(tempDir, "src", "services"), { recursive: true });
      await fs.writeFile(
        path.join(tempDir, "src", "services", "api.ts"),
        "export const api = { get: () => {} }",
      );

      const result = await detectProjectStructure(tempDir);

      expect(result.frontend).toBeDefined();
      expect(result.frontend?.framework).toBe("nextjs");
      expect(result.frontend?.apiPattern).toBe("rest");
      expect(result.relationship).toBe("frontend-only");
    });

    it("should detect React frontend with axios", async () => {
      const packageJson = {
        name: "test-react",
        dependencies: {
          react: "^18.0.0",
          axios: "^1.0.0",
        },
      };

      await fs.writeFile(
        path.join(tempDir, "package.json"),
        JSON.stringify(packageJson, null, 2),
      );

      const result = await detectProjectStructure(tempDir);

      expect(result.frontend).toBeDefined();
      expect(result.frontend?.framework).toBe("react");
      expect(result.frontend?.httpClient).toBe("axios");
    });

    it("should detect FastAPI backend project", async () => {
      const requirementsTxt = `
fastapi==0.104.0
uvicorn==0.24.0
pydantic==2.0.0
`;

      await fs.writeFile(path.join(tempDir, "requirements.txt"), requirementsTxt);

      // Create routes folder
      await fs.mkdir(path.join(tempDir, "app", "routes"), { recursive: true });
      await fs.writeFile(
        path.join(tempDir, "app", "main.py"),
        "from fastapi import FastAPI\napp = FastAPI()",
      );

      const result = await detectProjectStructure(tempDir);

      expect(result.backend).toBeDefined();
      expect(result.backend?.framework).toBe("fastapi");
      expect(result.relationship).toBe("backend-only");
    });

    it("should detect Express backend project", async () => {
      const packageJson = {
        name: "test-backend",
        dependencies: {
          express: "^4.18.0",
        },
      };

      await fs.writeFile(
        path.join(tempDir, "package.json"),
        JSON.stringify(packageJson, null, 2),
      );

      // Create routes folder
      await fs.mkdir(path.join(tempDir, "routes"), { recursive: true });
      await fs.writeFile(
        path.join(tempDir, "server.ts"),
        "import express from 'express';",
      );

      const result = await detectProjectStructure(tempDir);

      expect(result.backend).toBeDefined();
      expect(result.backend?.framework).toBe("express");
    });

    it("should detect monorepo with frontend and backend", async () => {
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
        "fastapi==0.104.0",
      );

      const result = await detectProjectStructure(tempDir);

      expect(result.frontend).toBeDefined();
      expect(result.frontend?.framework).toBe("nextjs");
      expect(result.backend).toBeDefined();
      expect(result.backend?.framework).toBe("fastapi");
      expect(result.relationship).toBe("separate");
    });

    it("should detect Vue frontend", async () => {
      const packageJson = {
        name: "test-vue",
        dependencies: {
          vue: "^3.0.0",
        },
      };

      await fs.writeFile(
        path.join(tempDir, "package.json"),
        JSON.stringify(packageJson, null, 2),
      );

      const result = await detectProjectStructure(tempDir);

      expect(result.frontend).toBeDefined();
      expect(result.frontend?.framework).toBe("vue");
    });

    it("should detect Flask backend", async () => {
      await fs.writeFile(
        path.join(tempDir, "requirements.txt"),
        "flask==3.0.0",
      );

      const result = await detectProjectStructure(tempDir);

      expect(result.backend).toBeDefined();
      expect(result.backend?.framework).toBe("flask");
    });

    it("should return frontend-only for empty project", async () => {
      const result = await detectProjectStructure(tempDir);

      expect(result.frontend).toBeUndefined();
      expect(result.backend).toBeUndefined();
      expect(result.relationship).toBe("frontend-only");
    });

    it("should detect react-query HTTP client", async () => {
      const packageJson = {
        name: "test-react-query",
        dependencies: {
          react: "^18.0.0",
          "@tanstack/react-query": "^5.0.0",
        },
      };

      await fs.writeFile(
        path.join(tempDir, "package.json"),
        JSON.stringify(packageJson, null, 2),
      );

      const result = await detectProjectStructure(tempDir);

      expect(result.frontend?.httpClient).toBe("react-query");
    });

    it("should detect GraphQL API pattern", async () => {
      const packageJson = {
        name: "test-graphql",
        dependencies: {
          react: "^18.0.0",
          "apollo-client": "^3.0.0",
          graphql: "^16.0.0",
        },
      };

      await fs.writeFile(
        path.join(tempDir, "package.json"),
        JSON.stringify(packageJson, null, 2),
      );

      const result = await detectProjectStructure(tempDir);

      expect(result.frontend?.apiPattern).toBe("graphql");
    });
  });

  describe("createProjectStructureFromConfig", () => {
    it("should create structure from manual config", () => {
      const config = {
        frontend: {
          path: "./frontend",
          framework: "nextjs" as const,
        },
        backend: {
          path: "./backend",
          framework: "fastapi" as const,
        },
      };

      const result = createProjectStructureFromConfig(config);

      expect(result.frontend?.path).toBe("./frontend");
      expect(result.frontend?.framework).toBe("nextjs");
      expect(result.backend?.path).toBe("./backend");
      expect(result.backend?.framework).toBe("fastapi");
      expect(result.relationship).toBe("separate");
    });

    it("should create frontend-only structure", () => {
      const config = {
        frontend: {
          path: "./web",
          framework: "react" as const,
        },
      };

      const result = createProjectStructureFromConfig(config);

      expect(result.frontend).toBeDefined();
      expect(result.backend).toBeUndefined();
      expect(result.relationship).toBe("frontend-only");
    });

    it("should create backend-only structure", () => {
      const config = {
        backend: {
          path: "./api",
          framework: "express" as const,
        },
      };

      const result = createProjectStructureFromConfig(config);

      expect(result.frontend).toBeUndefined();
      expect(result.backend).toBeDefined();
      expect(result.relationship).toBe("backend-only");
    });
  });
});
