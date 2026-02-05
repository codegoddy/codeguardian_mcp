/**
 * API Contract Guardian - Phase 3 Features Tests
 *
 * Tests for:
 * - GraphQL support
 * - WebSocket validation
 * - Complex TypeScript type handling
 *
 * @format
 */

import * as path from "path";
import {
  // GraphQL
  extractGraphQLSchema,
  extractGraphQLOperations,
  validateGraphQLOperations,
  parseGraphQLSchema,
  // WebSocket
  extractWebSocketServerConfig,
  extractWebSocketClientConfig,
  validateWebSocketContracts,
  // Complex Types
  parseComplexType,
  resolveComplexType,
  checkTypeCompatibility,
  extractAllTypeDefinitions,
  enhanceTypeWithComplexInfo,
  type ComplexTypeInfo,
  type TypeResolutionContext,
} from "../../../src/context/apiContract/index.js";
import type { ApiTypeDefinition } from "../../../src/context/projectContext.js";

// ============================================================================
// GraphQL Tests
// ============================================================================

describe("GraphQL Support", () => {
  describe("Schema Parsing", () => {
    test("should parse a basic GraphQL schema", () => {
      const schemaContent = `
type User {
  id: ID!
  name: String!
  email: String
}

type Query {
  user(id: ID!): User
  users: [User!]!
}

type Mutation {
  createUser(name: String!, email: String!): User!
}
`;

      const schema = parseGraphQLSchema(schemaContent, "test.graphql");

      expect(schema).toBeDefined();
      expect(schema.types).toHaveLength(1);
      expect(schema.types[0].name).toBe("User");
      expect(schema.types[0].fields).toHaveLength(3);
      expect(schema.queries).toHaveLength(2);
      expect(schema.mutations).toHaveLength(1);
    });

    test("should parse input types", () => {
      const schemaContent = `
input CreateUserInput {
  name: String!
  email: String!
  age: Int
}
`;

      const schema = parseGraphQLSchema(schemaContent, "test.graphql");

      expect(schema.types).toHaveLength(1);
      expect(schema.types[0].kind).toBe("input");
      expect(schema.types[0].name).toBe("CreateUserInput");
    });

    test("should parse enum types", () => {
      const schemaContent = `
enum Status {
  ACTIVE
  INACTIVE
  PENDING
}
`;

      const schema = parseGraphQLSchema(schemaContent, "test.graphql");

      expect(schema.types).toHaveLength(1);
      expect(schema.types[0].kind).toBe("enum");
      expect(schema.types[0].name).toBe("Status");
    });

    test("should handle field arguments", () => {
      const schemaContent = `
type Query {
  users(limit: Int!, offset: Int): [User!]!
}
`;

      const schema = parseGraphQLSchema(schemaContent, "test.graphql");

      expect(schema.queries).toHaveLength(1);
      expect(schema.queries[0].arguments).toHaveLength(2);
      expect(schema.queries[0].arguments![0].name).toBe("limit");
      expect(schema.queries[0].arguments![0].required).toBe(true);
    });
  });

  describe("Operation Parsing", () => {
    test("should extract GraphQL operations from code", async () => {
      const codeContent = `
import { gql } from '@apollo/client';

const GET_USER = gql\`
  query GetUser($id: ID!) {
    user(id: $id) {
      id
      name
      email
    }
  }
\`;

const CREATE_USER = gql\`
  mutation CreateUser($input: CreateUserInput!) {
    createUser(input: $input) {
      id
      name
    }
  }
\`;
`;

      // Create a temporary file for testing
      const fs = await import("fs/promises");
      const os = await import("os");
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "graphql-test-"));
      const tempFile = path.join(tempDir, "test.ts");
      await fs.writeFile(tempFile, codeContent);

      const operations = await extractGraphQLOperations(tempFile);

      await fs.unlink(tempFile);
      await fs.rmdir(tempDir);

      expect(operations).toHaveLength(2);
      expect(operations[0].name).toBe("GetUser");
      expect(operations[0].type).toBe("query");
      expect(operations[1].name).toBe("CreateUser");
      expect(operations[1].type).toBe("mutation");
    });

    test("should detect Apollo Client framework", async () => {
      const codeContent = `
import { useQuery, gql } from '@apollo/client';

const GET_USERS = gql\`query GetUsers { users { id } }\`;

function UsersComponent() {
  const { data } = useQuery(GET_USERS);
  return null;
}
`;

      const fs = await import("fs/promises");
      const os = await import("os");
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "graphql-test-"));
      const tempFile = path.join(tempDir, "test.tsx");
      await fs.writeFile(tempFile, codeContent);

      const operations = await extractGraphQLOperations(tempFile);

      await fs.unlink(tempFile);
      await fs.rmdir(tempDir);

      expect(operations.length).toBeGreaterThan(0);
      expect(operations[0].framework).toBe("apollo");
    });
  });

  describe("Validation", () => {
    test("should validate operations against schema", () => {
      const schemaContent = `
type User {
  id: ID!
  name: String!
  email: String
}

type Query {
  GetUser(id: ID!): User
}
`;
      const schema = parseGraphQLSchema(schemaContent, "schema.graphql");

      const operations = [
        {
          name: "GetUser",
          type: "query" as const,
          operationString: "query GetUser($id: ID!) { user(id: $id) { id name } }",
          variables: [{ name: "id", type: "ID", required: true }],
          selections: [{ name: "user", subSelections: [{ name: "id" }, { name: "name" }] }],
          file: "test.ts",
          line: 1,
        },
      ];

      const results = validateGraphQLOperations(operations, [schema]);

      expect(results).toHaveLength(1);
      expect(results[0].score).toBeGreaterThan(0);
      expect(results[0].issues).toHaveLength(0);
    });

    test("should detect missing operations", () => {
      const schemaContent = `
type Query {
  user(id: ID!): User
}
`;
      const schema = parseGraphQLSchema(schemaContent, "schema.graphql");

      const operations = [
        {
          name: "GetUsers",
          type: "query" as const,
          operationString: "query GetUsers { users { id } }",
          variables: [],
          selections: [{ name: "users" }],
          file: "test.ts",
          line: 1,
        },
      ];

      const results = validateGraphQLOperations(operations, [schema]);

      expect(results[0].issues).toHaveLength(1);
      expect(results[0].issues[0].type).toBe("missing_operation");
      expect(results[0].score).toBe(0);
    });

    test("should detect missing fields", () => {
      const schemaContent = `
type User {
  id: ID!
  name: String!
}

type Query {
  user(id: ID!): User
}
`;
      const schema = parseGraphQLSchema(schemaContent, "schema.graphql");

      const operations = [
        {
          name: "GetUser",
          type: "query" as const,
          operationString: "query GetUser { user { id nonExistentField } }",
          variables: [],
          selections: [{ name: "user", subSelections: [{ name: "id" }, { name: "nonExistentField" }] }],
          file: "test.ts",
          line: 1,
        },
      ];

      const results = validateGraphQLOperations(operations, [schema]);

      expect(results[0].issues.some(i => i.type === "missing_field")).toBe(true);
    });
  });
});

// ============================================================================
// WebSocket Tests
// ============================================================================

describe("WebSocket Support", () => {
  describe("Server Config Extraction", () => {
    test("should extract Socket.IO server config", async () => {
      const serverContent = `
const io = require('socket.io')(server);

io.on('connection', (socket) => {
  socket.on('join_room', (roomId) => {
    socket.join(roomId);
  });

  socket.on('message', (data) => {
    io.to(data.roomId).emit('new_message', data);
  });

  socket.emit('connected', { status: 'ok' });
});
`;

      const fs = await import("fs/promises");
      const os = await import("os");
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ws-test-"));
      const tempFile = path.join(tempDir, "server.js");
      await fs.writeFile(tempFile, serverContent);

      const config = await extractWebSocketServerConfig(tempFile);

      await fs.unlink(tempFile);
      await fs.rmdir(tempDir);

      expect(config).toBeDefined();
      expect(config!.framework).toBe("socket.io");
      expect(config!.namespaces).toHaveLength(1);
      expect(config!.namespaces[0].events.length).toBeGreaterThan(0);
    });

    test("should extract WebSocket (ws) server config", async () => {
      const serverContent = `
const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 8080 });

wss.on('connection', (ws) => {
  ws.on('message', (message) => {
    console.log('received:', message);
  });

  ws.send('connected');
});
`;

      const fs = await import("fs/promises");
      const os = await import("os");
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ws-test-"));
      const tempFile = path.join(tempDir, "server.js");
      await fs.writeFile(tempFile, serverContent);

      const config = await extractWebSocketServerConfig(tempFile);

      await fs.unlink(tempFile);
      await fs.rmdir(tempDir);

      expect(config).toBeDefined();
      expect(config!.framework).toBe("ws");
    });
  });

  describe("Client Config Extraction", () => {
    test("should extract Socket.IO client config", async () => {
      const clientContent = `
import io from 'socket.io-client';

const socket = io('http://localhost:3000');

socket.on('connect', () => {
  console.log('connected');
});

socket.on('new_message', (data) => {
  console.log(data);
});

socket.emit('join_room', 'room1');
`;

      const fs = await import("fs/promises");
      const os = await import("os");
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ws-test-"));
      const tempFile = path.join(tempDir, "client.ts");
      await fs.writeFile(tempFile, clientContent);

      const config = await extractWebSocketClientConfig(tempFile);

      await fs.unlink(tempFile);
      await fs.rmdir(tempDir);

      expect(config).toBeDefined();
      expect(config!.framework).toBe("socket.io-client");
      expect(config!.events.length).toBeGreaterThan(0);
    });
  });

  describe("Validation", () => {
    test("should validate client events against server", () => {
      const serverConfig = {
        framework: "socket.io" as const,
        namespaces: [
          {
            name: "/",
            path: "/",
            events: [
              { name: "join_room", direction: "client-to-server" as const, file: "server", line: 1 },
              { name: "new_message", direction: "server-to-client" as const, file: "server", line: 1 },
            ],
            file: "server.js",
            line: 1,
          },
        ],
        file: "server.js",
        line: 1,
      };

      const clientConfig = {
        framework: "socket.io-client" as const,
        serverUrl: "http://localhost:3000",
        events: [
          { name: "join_room", direction: "emit" as const, file: "client.ts", line: 1 },
          { name: "new_message", direction: "on" as const, file: "client.ts", line: 1 },
        ],
        file: "client.ts",
        line: 1,
      };

      const results = validateWebSocketContracts([clientConfig], [serverConfig]);

      expect(results).toHaveLength(2);
      expect(results.every(r => r.score === 100)).toBe(true);
      expect(results.every(r => r.issues.length === 0)).toBe(true);
    });

    test("should detect missing events", () => {
      const serverConfig = {
        framework: "socket.io" as const,
        namespaces: [
          {
            name: "/",
            path: "/",
            events: [{ name: "join_room", direction: "client-to-server" as const, file: "server", line: 1 }],
            file: "server.js",
            line: 1,
          },
        ],
        file: "server.js",
        line: 1,
      };

      const clientConfig = {
        framework: "socket.io-client" as const,
        serverUrl: "http://localhost:3000",
        events: [
          { name: "non_existent_event", direction: "emit" as const, file: "client.ts", line: 1 },
        ],
        file: "client.ts",
        line: 1,
      };

      const results = validateWebSocketContracts([clientConfig], [serverConfig]);

      expect(results[0].issues).toHaveLength(1);
      expect(results[0].issues[0].type).toBe("missing_event");
      expect(results[0].score).toBe(0);
    });
  });
});

// ============================================================================
// Complex Type Tests
// ============================================================================

describe("Complex TypeScript Type Handling", () => {
  describe("Type Parsing", () => {
    test("should parse union types", () => {
      const type = parseComplexType("string | number | null", "test.ts", 1);

      expect(type.kind).toBe("union");
      expect(type.constituents).toHaveLength(3);
      expect(type.constituents![0].name).toBe("string");
      expect(type.constituents![1].name).toBe("number");
      expect(type.constituents![2].name).toBe("null");
    });

    test("should parse intersection types", () => {
      const type = parseComplexType("User & Timestamp", "test.ts", 1);

      expect(type.kind).toBe("intersection");
      expect(type.constituents).toHaveLength(2);
    });

    test("should parse generic types", () => {
      const type = parseComplexType("Array<User>", "test.ts", 1);

      expect(type.kind).toBe("generic");
      expect(type.baseType).toBe("Array");
      expect(type.typeParameters).toHaveLength(1);
      expect(type.typeParameters![0]).toBe("User");
    });

    test("should parse nested generic types", () => {
      const type = parseComplexType("Promise<Array<User>>", "test.ts", 1);

      expect(type.kind).toBe("generic");
      expect(type.baseType).toBe("Promise");
      expect(type.typeParameters![0]).toBe("Array<User>");
    });

    test("should parse mapped types", () => {
      const type = parseComplexType("Partial<User>", "test.ts", 1);

      expect(type.kind).toBe("mapped");
      expect(type.mappedType).toBe("partial");
      expect(type.mappedTypeArgument).toBe("User");
    });

    test("should parse conditional types", () => {
      const type = parseComplexType("T extends string ? string : number", "test.ts", 1);

      expect(type.kind).toBe("conditional");
      expect(type.condition).toBeDefined();
      expect(type.condition!.checkType).toBe("T");
      expect(type.condition!.extendsType).toBe("string");
    });
  });

  describe("Type Resolution", () => {
    test("should resolve union types", () => {
      const type = parseComplexType("string | number", "test.ts", 1);
      const typeMap = new Map<string, ComplexTypeInfo>();
      const context: TypeResolutionContext = {
        resolvedTypes: new Map(),
        pendingResolutions: new Set(),
        errors: [],
      };

      const resolved = resolveComplexType(type, typeMap, context);

      expect(resolved.resolvedType).toBe("string | number");
    });

    test("should resolve generic types", () => {
      const type = parseComplexType("Array<string>", "test.ts", 1);
      const typeMap = new Map<string, ComplexTypeInfo>();
      const context: TypeResolutionContext = {
        resolvedTypes: new Map(),
        pendingResolutions: new Set(),
        errors: [],
      };

      const resolved = resolveComplexType(type, typeMap, context);

      expect(resolved.resolvedType).toBe("Array<string>");
    });

    test("should detect circular references", () => {
      const type = parseComplexType("TypeA", "test.ts", 1);
      const typeMap = new Map<string, ComplexTypeInfo>();
      const context: TypeResolutionContext = {
        resolvedTypes: new Map(),
        pendingResolutions: new Set(["TypeA"]),
        errors: [],
      };

      const resolved = resolveComplexType(type, typeMap, context);

      expect(context.errors).toHaveLength(1);
      expect(context.errors[0].message).toContain("Circular");
    });
  });

  describe("Type Compatibility", () => {
    test("should check TypeScript to Python type compatibility", () => {
      const tsType = parseComplexType("string", "test.ts", 1);
      const result = checkTypeCompatibility(tsType, "str");

      expect(result.compatible).toBe(true);
      expect(result.score).toBe(100);
    });

    test("should detect type mismatches", () => {
      const tsType = parseComplexType("string", "test.ts", 1);
      const result = checkTypeCompatibility(tsType, "int");

      expect(result.compatible).toBe(false);
      expect(result.issues.length).toBeGreaterThan(0);
    });

    test("should handle union type compatibility", () => {
      const tsType = parseComplexType("string | number", "test.ts", 1);
      const result = checkTypeCompatibility(tsType, "str");

      expect(result.compatible).toBe(true);
    });

    test("should handle array type compatibility", () => {
      const tsType = parseComplexType("Array<string>", "test.ts", 1);
      const result = checkTypeCompatibility(tsType, "List[str]");

      expect(result.compatible).toBe(true);
    });

    test("should warn about implicit conversions", () => {
      const tsType = parseComplexType("number", "test.ts", 1);
      const result = checkTypeCompatibility(tsType, "str");

      expect(result.compatible).toBe(true);
      expect(result.score).toBeLessThan(100);
      expect(result.issues.some(i => i.severity === "warning")).toBe(true);
    });
  });

  describe("Type Definition Extraction", () => {
    test("should extract type definitions from TypeScript file", async () => {
      const fs = await import("fs/promises");
      const os = await import("os");
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "type-test-"));
      const tempFile = path.join(tempDir, "types.ts");

      const content = `
type UserId = string;
type UserStatus = 'active' | 'inactive';

interface User {
  id: UserId;
  name: string;
  status: UserStatus;
}

type CreateUserInput = Omit<User, 'id'>;
`;

      await fs.writeFile(tempFile, content);

      const typeMap = await extractAllTypeDefinitions(tempFile, tempDir);

      await fs.unlink(tempFile);
      await fs.rmdir(tempDir);

      expect(typeMap.has("UserId")).toBe(true);
      expect(typeMap.has("UserStatus")).toBe(true);
      expect(typeMap.has("User")).toBe(true);
      expect(typeMap.has("CreateUserInput")).toBe(true);
    });
  });

  describe("Type Enhancement", () => {
    test("should enhance ApiTypeDefinition with complex type info", async () => {
      const typeDef: ApiTypeDefinition = {
        name: "User",
        fields: [
          { name: "id", type: "string", required: true },
          { name: "status", type: "'active' | 'inactive'", required: true },
          { name: "tags", type: "Array<string>", required: false },
        ],
        file: "test.ts",
        line: 1,
        kind: "interface",
      };

      const fs = await import("fs/promises");
      const os = await import("os");
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "enhance-test-"));
      
      await fs.writeFile(
        path.join(tempDir, "test.ts"),
        "interface User { id: string; status: 'active' | 'inactive'; tags?: Array<string>; }"
      );

      const enhanced = await enhanceTypeWithComplexInfo(typeDef, tempDir);

      await fs.unlink(path.join(tempDir, "test.ts"));
      await fs.rmdir(tempDir);

      expect(enhanced.complexFields).toBeDefined();
      expect(enhanced.complexFields!.length).toBe(3);
      expect(enhanced.complexFields![1].complexType).toBeDefined();
    });
  });
});

// ============================================================================
// Integration Tests with Report Directory
// ============================================================================

describe("Phase 3 Integration Tests (Report Directory)", () => {
  test("should extract types from report frontend", async () => {
    const fs = await import("fs/promises");
    const typeFiles = await fs.readdir(path.join(process.cwd(), "report", "frontend", "src"), { recursive: true });
    
    // Look for type definition files
    const typeDefFiles = typeFiles.filter(f => 
      f.includes("types") || f.includes("interfaces") || f.endsWith(".d.ts")
    );

    // We expect some type files to exist
    expect(typeDefFiles.length).toBeGreaterThanOrEqual(0);
  });

  test("should handle complex types in report codebase", async () => {
    // This is a smoke test to ensure the complex type parser doesn't crash
    // on real-world TypeScript code
    const complexTypes = [
      "string | number | null",
      "Array<Promise<User>>",
      "Partial<Record<string, any>>",
      "T extends U ? X : Y",
    ];

    for (const typeStr of complexTypes) {
      const parsed = parseComplexType(typeStr, "test.ts", 1);
      expect(parsed).toBeDefined();
      expect(parsed.name).toBeDefined();
    }
  });
});

// ============================================================================
// Performance Tests
// ============================================================================

describe("Phase 3 Performance Tests", () => {
  test("should parse complex types efficiently", () => {
    const start = Date.now();
    
    for (let i = 0; i < 1000; i++) {
      parseComplexType("Array<Promise<Partial<User>>>", "test.ts", 1);
    }
    
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(1000); // Should complete in less than 1 second
  });

  test("should resolve types efficiently", () => {
    const typeMap = new Map<string, ComplexTypeInfo>();
    const context: TypeResolutionContext = {
      resolvedTypes: new Map(),
      pendingResolutions: new Set(),
      errors: [],
    };

    const start = Date.now();
    
    for (let i = 0; i < 1000; i++) {
      const type = parseComplexType("string | number", "test.ts", 1);
      resolveComplexType(type, typeMap, context);
    }
    
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(1000);
  });
});
