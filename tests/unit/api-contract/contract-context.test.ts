/**
 * Unit tests for API Contract Guardian - Contract Context
 *
 * @format
 */

import {
  buildContractContext,
  getEndpointContract,
  getTypeContract,
  hasMatchingRoute,
  getUnmatchedFrontendServices,
  getUnmatchedBackendRoutes,
} from "../../../src/api-contract/context/contract.js";
import type {
  FrontendContext,
  BackendContext,
  ServiceDefinition,
  RouteDefinition,
  TypeDefinition,
  ModelDefinition,
} from "../../../src/api-contract/types.js";

describe("Contract Context", () => {
  const mockFrontendContext = (): FrontendContext => ({
    framework: "react",
    services: [
      {
        name: "createClient",
        method: "POST",
        endpoint: "/api/clients",
        requestType: "ClientCreate",
        responseType: "Client",
        file: "src/services/clients.ts",
        line: 10,
      },
      {
        name: "getClient",
        method: "GET",
        endpoint: "/api/clients/{client_id}",
        responseType: "Client",
        file: "src/services/clients.ts",
        line: 20,
      },
      {
        name: "unmatchedService",
        method: "POST",
        endpoint: "/api/unmatched",
        file: "src/services/unmatched.ts",
        line: 5,
      },
    ],
    types: [
      {
        name: "ClientCreate",
        fields: [
          { name: "name", type: "string", required: true },
          { name: "email", type: "string", required: true },
          { name: "userId", type: "string", required: true },
        ],
        file: "src/types/client.ts",
        line: 1,
        kind: "interface",
      },
      {
        name: "Client",
        fields: [
          { name: "id", type: "number", required: true },
          { name: "name", type: "string", required: true },
          { name: "email", type: "string", required: true },
          { name: "userId", type: "string", required: true },
        ],
        file: "src/types/client.ts",
        line: 10,
        kind: "interface",
      },
    ],
    apiBaseUrl: "/api",
    httpClient: "axios",
  });

  const mockBackendContext = (): BackendContext => ({
    framework: "fastapi",
    routes: [
      {
        method: "POST",
        path: "/api/clients",
        handler: "create_client",
        requestModel: "ClientCreate",
        responseModel: "Client",
        file: "app/routes/clients.py",
        line: 15,
      },
      {
        method: "GET",
        path: "/api/clients/{client_id}",
        handler: "get_client",
        responseModel: "Client",
        file: "app/routes/clients.py",
        line: 25,
      },
      {
        method: "DELETE",
        path: "/api/clients/{client_id}",
        handler: "delete_client",
        file: "app/routes/clients.py",
        line: 35,
      },
    ],
    models: [
      {
        name: "ClientCreate",
        fields: [
          { name: "name", type: "str", required: true },
          { name: "email", type: "str", required: true },
          { name: "user_id", type: "str", required: true },
        ],
        file: "app/models/client.py",
        line: 5,
      },
      {
        name: "Client",
        fields: [
          { name: "id", type: "int", required: true },
          { name: "name", type: "str", required: true },
          { name: "email", type: "str", required: true },
          { name: "user_id", type: "str", required: true },
        ],
        file: "app/models/client.py",
        line: 15,
      },
    ],
    apiPrefix: "/api",
  });

  describe("buildContractContext", () => {
    it("should match frontend services to backend routes", async () => {
      const frontend = mockFrontendContext();
      const backend = mockBackendContext();

      const context = await buildContractContext(frontend, backend);

      expect(context.endpoints.size).toBe(2);
      expect(context.endpoints.has("/api/clients")).toBe(true);
      expect(context.endpoints.has("/api/clients/{client_id}")).toBe(true);
    });

    it("should match frontend types to backend models", async () => {
      const frontend = mockFrontendContext();
      const backend = mockBackendContext();

      const context = await buildContractContext(frontend, backend);

      expect(context.types.size).toBe(2);
      expect(context.types.has("ClientCreate")).toBe(true);
      expect(context.types.has("Client")).toBe(true);
    });

    it("should track unmatched frontend services", async () => {
      const frontend = mockFrontendContext();
      const backend = mockBackendContext();

      const context = await buildContractContext(frontend, backend);

      expect(context.unmatchedFrontend).toHaveLength(1);
      expect(context.unmatchedFrontend[0].name).toBe("unmatchedService");
    });

    it("should track unmatched backend routes", async () => {
      const frontend = mockFrontendContext();
      const backend = mockBackendContext();

      const context = await buildContractContext(frontend, backend);

      expect(context.unmatchedBackend).toHaveLength(1);
      expect(context.unmatchedBackend[0].handler).toBe("delete_client");
    });

    it("should calculate endpoint match scores", async () => {
      const frontend = mockFrontendContext();
      const backend = mockBackendContext();

      const context = await buildContractContext(frontend, backend);

      const clientEndpoint = context.endpoints.get("/api/clients");
      expect(clientEndpoint).toBeDefined();
      expect(clientEndpoint!.score).toBeGreaterThan(0);
    });

    it("should detect naming convention mismatches", async () => {
      const frontend = mockFrontendContext();
      const backend = mockBackendContext();

      const context = await buildContractContext(frontend, backend);

      const typeMapping = context.types.get("ClientCreate");
      expect(typeMapping).toBeDefined();
      expect(typeMapping!.compatibility.issues.length).toBeGreaterThan(0);
      expect(typeMapping!.compatibility.issues.some((i) =>
        i.includes("userId") || i.includes("user_id")
      )).toBe(true);
    });
  });

  describe("getEndpointContract", () => {
    it("should return endpoint mapping for existing endpoint", async () => {
      const frontend = mockFrontendContext();
      const backend = mockBackendContext();
      const context = await buildContractContext(frontend, backend);

      const mapping = getEndpointContract(context, "/api/clients");

      expect(mapping).toBeDefined();
      expect(mapping!.frontend.name).toBe("createClient");
      expect(mapping!.backend.handler).toBe("create_client");
    });

    it("should return undefined for non-existing endpoint", async () => {
      const frontend = mockFrontendContext();
      const backend = mockBackendContext();
      const context = await buildContractContext(frontend, backend);

      const mapping = getEndpointContract(context, "/api/nonexistent");

      expect(mapping).toBeUndefined();
    });
  });

  describe("getTypeContract", () => {
    it("should return type mapping for existing type", async () => {
      const frontend = mockFrontendContext();
      const backend = mockBackendContext();
      const context = await buildContractContext(frontend, backend);

      const mapping = getTypeContract(context, "ClientCreate");

      expect(mapping).toBeDefined();
      expect(mapping!.frontend.name).toBe("ClientCreate");
      expect(mapping!.backend.name).toBe("ClientCreate");
    });

    it("should return undefined for non-existing type", async () => {
      const frontend = mockFrontendContext();
      const backend = mockBackendContext();
      const context = await buildContractContext(frontend, backend);

      const mapping = getTypeContract(context, "NonExistent");

      expect(mapping).toBeUndefined();
    });
  });

  describe("hasMatchingRoute", () => {
    it("should return true for matched service", async () => {
      const frontend = mockFrontendContext();
      const backend = mockBackendContext();
      const context = await buildContractContext(frontend, backend);

      const matchedService = frontend.services[0];
      expect(hasMatchingRoute(context, matchedService)).toBe(true);
    });

    it("should return false for unmatched service", async () => {
      const frontend = mockFrontendContext();
      const backend = mockBackendContext();
      const context = await buildContractContext(frontend, backend);

      const unmatchedService = frontend.services[2];
      expect(hasMatchingRoute(context, unmatchedService)).toBe(false);
    });
  });

  describe("getUnmatchedFrontendServices", () => {
    it("should return all unmatched frontend services", async () => {
      const frontend = mockFrontendContext();
      const backend = mockBackendContext();
      const context = await buildContractContext(frontend, backend);

      const unmatched = getUnmatchedFrontendServices(context);

      expect(unmatched).toHaveLength(1);
      expect(unmatched[0].name).toBe("unmatchedService");
    });
  });

  describe("getUnmatchedBackendRoutes", () => {
    it("should return all unmatched backend routes", async () => {
      const frontend = mockFrontendContext();
      const backend = mockBackendContext();
      const context = await buildContractContext(frontend, backend);

      const unmatched = getUnmatchedBackendRoutes(context);

      expect(unmatched).toHaveLength(1);
      expect(unmatched[0].handler).toBe("delete_client");
    });
  });
});
