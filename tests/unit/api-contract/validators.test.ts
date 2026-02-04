/**
 * Unit tests for API Contract Guardian - Validators
 *
 * @format
 */

import { validateEndpoint, validateAllEndpoints } from "../../../src/api-contract/validators/endpoint.js";
import { validateParameters, validateAllParameters } from "../../../src/api-contract/validators/parameter.js";
import { validateTypeCompatibility, validateAllTypes } from "../../../src/api-contract/validators/type.js";
import type {
  EndpointMapping,
  TypeMapping,
  ContractContext,
  ServiceDefinition,
  RouteDefinition,
  TypeDefinition,
  ModelDefinition,
} from "../../../src/api-contract/types.js";

describe("API Contract Validators", () => {
  describe("Endpoint Validator", () => {
    it("should pass for matching HTTP methods", () => {
      const mapping: EndpointMapping = {
        frontend: {
          name: "createClient",
          method: "POST",
          endpoint: "/api/clients",
          file: "services.ts",
          line: 10,
        },
        backend: {
          method: "POST",
          path: "/api/clients",
          handler: "create_client",
          file: "routes.py",
          line: 15,
        },
        score: 100,
      };

      const issues = validateEndpoint(mapping);
      expect(issues).toHaveLength(0);
    });

    it("should detect HTTP method mismatch", () => {
      const mapping: EndpointMapping = {
        frontend: {
          name: "getClient",
          method: "GET",
          endpoint: "/api/clients",
          file: "services.ts",
          line: 10,
        },
        backend: {
          method: "POST",
          path: "/api/clients",
          handler: "create_client",
          file: "routes.py",
          line: 15,
        },
        score: 50,
      };

      const issues = validateEndpoint(mapping);
      expect(issues).toHaveLength(1);
      expect(issues[0].type).toBe("apiMethodMismatch");
      expect(issues[0].severity).toBe("critical");
    });

    it("should detect missing path parameters", () => {
      const mapping: EndpointMapping = {
        frontend: {
          name: "getClient",
          method: "GET",
          endpoint: "/api/clients", // Missing {id}
          file: "services.ts",
          line: 10,
        },
        backend: {
          method: "GET",
          path: "/api/clients/{client_id}",
          handler: "get_client",
          file: "routes.py",
          line: 15,
        },
        score: 80,
      };

      const issues = validateEndpoint(mapping);
      expect(issues.some((i) => i.message.includes("Missing path parameter"))).toBe(true);
    });
  });

  describe("Parameter Validator", () => {
    it("should pass for compatible types", () => {
      const typeMapping: TypeMapping = {
        frontend: {
          name: "ClientCreate",
          fields: [
            { name: "name", type: "string", required: true },
            { name: "email", type: "string", required: true },
          ],
          file: "types.ts",
          line: 1,
          kind: "interface",
        },
        backend: {
          name: "ClientCreate",
          fields: [
            { name: "name", type: "str", required: true },
            { name: "email", type: "str", required: true },
          ],
          file: "models.py",
          line: 5,
        },
        compatibility: { score: 100, issues: [] },
      };

      const issues = validateParameters(typeMapping);
      expect(issues).toHaveLength(0);
    });

    it("should detect missing required fields", () => {
      const typeMapping: TypeMapping = {
        frontend: {
          name: "ClientCreate",
          fields: [
            { name: "name", type: "string", required: true },
            // Missing email
          ],
          file: "types.ts",
          line: 1,
          kind: "interface",
        },
        backend: {
          name: "ClientCreate",
          fields: [
            { name: "name", type: "str", required: true },
            { name: "email", type: "str", required: true },
          ],
          file: "models.py",
          line: 5,
        },
        compatibility: { score: 50, issues: ["Missing required field: email"] },
      };

      const issues = validateParameters(typeMapping);
      expect(issues.some((i) => i.type === "apiMissingRequiredField")).toBe(true);
    });

    it("should detect naming convention mismatches", () => {
      const typeMapping: TypeMapping = {
        frontend: {
          name: "ClientCreate",
          fields: [
            { name: "userId", type: "string", required: true }, // camelCase
          ],
          file: "types.ts",
          line: 1,
          kind: "interface",
        },
        backend: {
          name: "ClientCreate",
          fields: [
            { name: "user_id", type: "str", required: true }, // snake_case
          ],
          file: "models.py",
          line: 5,
        },
        compatibility: { score: 90, issues: [] },
      };

      const issues = validateParameters(typeMapping);
      expect(issues.some((i) => i.type === "apiNamingConventionMismatch")).toBe(true);
    });

    it("should detect type mismatches", () => {
      const typeMapping: TypeMapping = {
        frontend: {
          name: "Client",
          fields: [
            { name: "id", type: "number", required: true },
          ],
          file: "types.ts",
          line: 1,
          kind: "interface",
        },
        backend: {
          name: "Client",
          fields: [
            { name: "id", type: "UUID", required: true },
          ],
          file: "models.py",
          line: 5,
        },
        compatibility: { score: 50, issues: ["Type mismatch"] },
      };

      const issues = validateParameters(typeMapping);
      expect(issues.some((i) => i.type === "apiTypeMismatch")).toBe(true);
    });
  });

  describe("Type Validator", () => {
    it("should pass for high compatibility scores", () => {
      const typeMapping: TypeMapping = {
        frontend: {
          name: "Client",
          fields: [
            { name: "id", type: "string", required: true },
            { name: "name", type: "string", required: true },
          ],
          file: "types.ts",
          line: 1,
          kind: "interface",
        },
        backend: {
          name: "Client",
          fields: [
            { name: "id", type: "UUID", required: true },
            { name: "name", type: "str", required: true },
          ],
          file: "models.py",
          line: 5,
        },
        compatibility: { score: 90, issues: [] },
      };

      const issues = validateTypeCompatibility(typeMapping);
      expect(issues).toHaveLength(0);
    });

    it("should flag low compatibility scores", () => {
      const typeMapping: TypeMapping = {
        frontend: {
          name: "Client",
          fields: [
            { name: "id", type: "number", required: true },
          ],
          file: "types.ts",
          line: 1,
          kind: "interface",
        },
        backend: {
          name: "Client",
          fields: [
            { name: "id", type: "UUID", required: true },
            { name: "name", type: "str", required: true },
          ],
          file: "models.py",
          line: 5,
        },
        compatibility: { score: 30, issues: ["Low field coverage"] },
      };

      const issues = validateTypeCompatibility(typeMapping);
      expect(issues.some((i) => i.message.includes("Low compatibility score"))).toBe(true);
    });

    it("should handle UUID type compatibility", () => {
      const typeMapping: TypeMapping = {
        frontend: {
          name: "Client",
          fields: [
            { name: "id", type: "string", required: true }, // Correct for UUID
          ],
          file: "types.ts",
          line: 1,
          kind: "interface",
        },
        backend: {
          name: "Client",
          fields: [
            { name: "id", type: "UUID", required: true },
          ],
          file: "models.py",
          line: 5,
        },
        compatibility: { score: 100, issues: [] },
      };

      const issues = validateTypeCompatibility(typeMapping);
      // Should not flag string/UUID as an issue
      expect(issues).toHaveLength(0);
    });

    it("should flag datetime type mismatch", () => {
      const typeMapping: TypeMapping = {
        frontend: {
          name: "Event",
          fields: [
            { name: "createdAt", type: "Date", required: true }, // Wrong type
          ],
          file: "types.ts",
          line: 1,
          kind: "interface",
        },
        backend: {
          name: "Event",
          fields: [
            { name: "created_at", type: "datetime", required: true },
          ],
          file: "models.py",
          line: 5,
        },
        compatibility: { score: 50, issues: [] },
      };

      const issues = validateTypeCompatibility(typeMapping);
      expect(issues.some((i) => i.message.includes("datetime"))).toBe(true);
    });
  });

  describe("Integration Tests", () => {
    it("should validate all endpoints in context", () => {
      const context: ContractContext = {
        endpoints: new Map([
          [
            "/api/clients",
            {
              frontend: {
                name: "createClient",
                method: "POST",
                endpoint: "/api/clients",
                file: "services.ts",
                line: 10,
              },
              backend: {
                method: "POST",
                path: "/api/clients",
                handler: "create_client",
                file: "routes.py",
                line: 15,
              },
              score: 100,
            },
          ],
        ]),
        types: new Map(),
        unmatchedFrontend: [],
        unmatchedBackend: [],
      };

      const issues = validateAllEndpoints(context);
      expect(issues).toHaveLength(0);
    });

    it("should validate all parameters in context", () => {
      const context: ContractContext = {
        endpoints: new Map(),
        types: new Map([
          [
            "ClientCreate",
            {
              frontend: {
                name: "ClientCreate",
                fields: [{ name: "name", type: "string", required: true }],
                file: "types.ts",
                line: 1,
                kind: "interface",
              },
              backend: {
                name: "ClientCreate",
                fields: [
                  { name: "name", type: "str", required: true },
                  { name: "email", type: "str", required: true },
                ],
                file: "models.py",
                line: 5,
              },
              compatibility: { score: 50, issues: ["Missing field"] },
            },
          ],
        ]),
        unmatchedFrontend: [],
        unmatchedBackend: [],
      };

      const issues = validateAllParameters(context);
      expect(issues.length).toBeGreaterThan(0);
      expect(issues.some((i) => i.type === "apiMissingRequiredField")).toBe(true);
    });

    it("should validate all types in context", () => {
      const context: ContractContext = {
        endpoints: new Map(),
        types: new Map([
          [
            "Client",
            {
              frontend: {
                name: "Client",
                fields: [{ name: "id", type: "number", required: true }],
                file: "types.ts",
                line: 1,
                kind: "interface",
              },
              backend: {
                name: "Client",
                fields: [
                  { name: "id", type: "UUID", required: true },
                  { name: "name", type: "str", required: true },
                ],
                file: "models.py",
                line: 5,
              },
              compatibility: { score: 30, issues: ["Low compatibility"] },
            },
          ],
        ]),
        unmatchedFrontend: [],
        unmatchedBackend: [],
      };

      const issues = validateAllTypes(context);
      expect(issues.length).toBeGreaterThan(0);
    });
  });
});
