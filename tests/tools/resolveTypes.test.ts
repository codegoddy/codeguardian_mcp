/**
 * Comprehensive tests for resolve_types tool
 *
 * @format
 */

import { resolveTypesTool } from "../../src/tools/resolveTypes.js";
import * as fs from "fs/promises";
import * as path from "path";

describe("resolve_types", () => {
  const testProjectPath = "tests/fixtures/types-project";

  beforeAll(async () => {
    await fs.mkdir(`${testProjectPath}/src`, { recursive: true });
    await fs.mkdir(`${testProjectPath}/src/types`, { recursive: true });
    await fs.mkdir(`${testProjectPath}/src/utils`, { recursive: true });

    // Type definitions
    await fs.writeFile(
      `${testProjectPath}/src/types/user.ts`,
      `
export interface User {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
  role: UserRole;
}

export interface UserProfile extends User {
  bio: string;
  avatar: string;
  followers: number;
}

export type UserRole = 'admin' | 'user' | 'guest';

export type UserId = string;

export type UserWithPosts = User & {
  posts: Post[];
};

export interface Post {
  id: string;
  title: string;
  content: string;
  authorId: string;
}
`
    );

    // Enum definitions
    await fs.writeFile(
      `${testProjectPath}/src/types/enums.ts`,
      `
export enum Status {
  Active = 'active',
  Inactive = 'inactive',
  Pending = 'pending',
}

export enum Priority {
  Low = 1,
  Medium = 2,
  High = 3,
}
`
    );

    // Functions with return types
    await fs.writeFile(
      `${testProjectPath}/src/userService.ts`,
      `
import { User, UserProfile, UserId } from './types/user';

export async function getUserById(id: UserId): Promise<User | null> {
  return db.findUser(id);
}

export async function getUserProfile(id: string): Promise<UserProfile> {
  const user = await getUserById(id);
  return { ...user, bio: '', avatar: '', followers: 0 };
}

export function createUser(name: string, email: string): User {
  return {
    id: generateId(),
    name,
    email,
    createdAt: new Date(),
    role: 'user',
  };
}

export async function getUsers(): Promise<User[]> {
  return db.findAllUsers();
}

export function formatUser(user: User): string {
  return \`\${user.name} <\${user.email}>\`;
}
`
    );

    // Generic functions
    await fs.writeFile(
      `${testProjectPath}/src/utils/generic.ts`,
      `
export function identity<T>(value: T): T {
  return value;
}

export function first<T>(arr: T[]): T | undefined {
  return arr[0];
}

export async function fetchData<T>(url: string): Promise<T> {
  const response = await fetch(url);
  return response.json();
}

export function mapValues<K extends string, V, R>(
  obj: Record<K, V>,
  fn: (value: V) => R
): Record<K, R> {
  const result = {} as Record<K, R>;
  for (const key in obj) {
    result[key] = fn(obj[key]);
  }
  return result;
}
`
    );

    // Variables with types
    await fs.writeFile(
      `${testProjectPath}/src/config.ts`,
      `
import { User } from './types/user';
import { Status } from './types/enums';

export const DEFAULT_USER: User = {
  id: '0',
  name: 'Guest',
  email: 'guest@example.com',
  createdAt: new Date(),
  role: 'guest',
};

export const API_CONFIG: {
  baseUrl: string;
  timeout: number;
  retries: number;
} = {
  baseUrl: 'https://api.example.com',
  timeout: 5000,
  retries: 3,
};

export const DEFAULT_STATUS: Status = Status.Pending;

export const userCache: Map<string, User> = new Map();
`
    );

    // Complex types
    await fs.writeFile(
      `${testProjectPath}/src/types/complex.ts`,
      `
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type Nullable<T> = T | null;

export type AsyncFunction<T> = () => Promise<T>;

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export type ApiResponse<T> = 
  | { success: true; data: T }
  | { success: false; error: string };
`
    );
  });

  afterAll(async () => {
    await fs.rm(testProjectPath, { recursive: true, force: true });
  });

  describe("Interface Resolution", () => {
    test("should resolve interface properties", async () => {
      const result = await resolveTypesTool.handler({
        projectPath: testProjectPath,
        query: "User",
      });

      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      expect(data.resolved).toBeDefined();

      const resolved =
        Array.isArray(data.resolved) ? data.resolved[0] : data.resolved;
      expect(resolved.name).toBe("User");
      expect(resolved.properties).toBeDefined();
      expect(resolved.properties.id).toBe("string");
      expect(resolved.properties.name).toBe("string");
      expect(resolved.properties.email).toBe("string");
    });

    test("should resolve extended interface", async () => {
      const result = await resolveTypesTool.handler({
        projectPath: testProjectPath,
        query: "UserProfile",
      });

      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      const resolved =
        Array.isArray(data.resolved) ? data.resolved[0] : data.resolved;
      expect(resolved.properties.bio).toBeDefined();
      expect(resolved.properties.avatar).toBeDefined();
    });
  });

  describe("Type Alias Resolution", () => {
    test("should resolve union type", async () => {
      const result = await resolveTypesTool.handler({
        projectPath: testProjectPath,
        query: "UserRole",
      });

      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      const resolved =
        Array.isArray(data.resolved) ? data.resolved[0] : data.resolved;
      expect(resolved.resolvedType).toContain("admin");
      expect(resolved.resolvedType).toContain("user");
      expect(resolved.resolvedType).toContain("guest");
    });

    test("should resolve simple type alias", async () => {
      const result = await resolveTypesTool.handler({
        projectPath: testProjectPath,
        query: "UserId",
      });

      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      const resolved =
        Array.isArray(data.resolved) ? data.resolved[0] : data.resolved;
      expect(resolved.resolvedType).toContain("string");
    });
  });

  describe("Enum Resolution", () => {
    test("should resolve string enum", async () => {
      const result = await resolveTypesTool.handler({
        projectPath: testProjectPath,
        query: "Status",
      });

      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      const resolved =
        Array.isArray(data.resolved) ? data.resolved[0] : data.resolved;
      expect(resolved.resolvedType).toContain("enum");
      expect(resolved.properties).toBeDefined();
      expect(resolved.properties.Active).toBeDefined();
      expect(resolved.properties.Inactive).toBeDefined();
    });

    test("should resolve numeric enum", async () => {
      const result = await resolveTypesTool.handler({
        projectPath: testProjectPath,
        query: "Priority",
      });

      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      const resolved =
        Array.isArray(data.resolved) ? data.resolved[0] : data.resolved;
      expect(resolved.properties.Low).toBeDefined();
      expect(resolved.properties.High).toBeDefined();
    });
  });

  describe("Function Return Type Resolution", () => {
    test("should resolve async function return type", async () => {
      const result = await resolveTypesTool.handler({
        projectPath: testProjectPath,
        query: "getUserById",
      });

      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      const resolved =
        Array.isArray(data.resolved) ? data.resolved[0] : data.resolved;
      expect(resolved.resolvedType).toContain("Promise");
      expect(resolved.resolvedType).toContain("User");
      expect(resolved.source).toContain("function");
    });

    test("should resolve sync function return type", async () => {
      const result = await resolveTypesTool.handler({
        projectPath: testProjectPath,
        query: "createUser",
      });

      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      const resolved =
        Array.isArray(data.resolved) ? data.resolved[0] : data.resolved;
      expect(resolved.resolvedType).toContain("User");
    });

    test("should resolve array return type", async () => {
      const result = await resolveTypesTool.handler({
        projectPath: testProjectPath,
        query: "getUsers",
      });

      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      const resolved =
        Array.isArray(data.resolved) ? data.resolved[0] : data.resolved;
      expect(resolved.resolvedType).toContain("User[]");
    });
  });

  describe("Variable Type Resolution", () => {
    test("should resolve typed constant", async () => {
      const result = await resolveTypesTool.handler({
        projectPath: testProjectPath,
        query: "DEFAULT_USER",
      });

      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      const resolved =
        Array.isArray(data.resolved) ? data.resolved[0] : data.resolved;
      expect(resolved.resolvedType).toContain("User");
    });

    test("should resolve inline object type", async () => {
      const result = await resolveTypesTool.handler({
        projectPath: testProjectPath,
        query: "API_CONFIG",
      });

      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      const resolved =
        Array.isArray(data.resolved) ? data.resolved[0] : data.resolved;
      expect(resolved.resolvedType).toContain("baseUrl");
      expect(resolved.resolvedType).toContain("timeout");
    });

    test("should resolve generic type variable", async () => {
      const result = await resolveTypesTool.handler({
        projectPath: testProjectPath,
        query: "userCache",
      });

      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      const resolved =
        Array.isArray(data.resolved) ? data.resolved[0] : data.resolved;
      expect(resolved.resolvedType).toContain("Map");
    });
  });

  describe("Code Snippet Analysis", () => {
    test("should analyze types in provided code", async () => {
      const result = await resolveTypesTool.handler({
        projectPath: testProjectPath,
        query: "user",
        code: `
          const user: User = await getUserById("123");
          const profile: UserProfile = await getUserProfile("123");
        `,
      });

      const data = JSON.parse(result.content[0].text);
      expect(data.success).toBe(true);
    });

    test("should infer type from function call", async () => {
      const result = await resolveTypesTool.handler({
        projectPath: testProjectPath,
        query: "result",
        code: `
          const result = await getUserById("123");
        `,
      });

      const data = JSON.parse(result.content[0].text);
      expect(data.success).toBe(true);
    });
  });

  describe("Fuzzy Search", () => {
    test("should find similar types when exact match not found", async () => {
      const result = await resolveTypesTool.handler({
        projectPath: testProjectPath,
        query: "usr", // Partial match for User
      });

      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      // Should find User, UserProfile, UserRole, etc.
      if (data.resolved) {
        const names =
          Array.isArray(data.resolved) ?
            data.resolved.map((r: any) => r.name)
          : [data.resolved.name];
        expect(
          names.some((n: string) => n.toLowerCase().includes("user"))
        ).toBe(true);
      }
    });

    test("should provide suggestions when no match found", async () => {
      const result = await resolveTypesTool.handler({
        projectPath: testProjectPath,
        query: "NonExistentType",
      });

      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      expect(data.resolved).toBeNull();
      expect(data.suggestions).toBeDefined();
    });
  });

  describe("File-Specific Query", () => {
    test("should search in specific file", async () => {
      const result = await resolveTypesTool.handler({
        projectPath: testProjectPath,
        query: "getUserById",
        file: "src/userService.ts",
      });

      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      expect(data.resolved).toBeDefined();
    });
  });

  describe("Statistics", () => {
    test("should provide indexing statistics", async () => {
      const result = await resolveTypesTool.handler({
        projectPath: testProjectPath,
        query: "User",
      });

      const data = JSON.parse(result.content[0].text);

      expect(data.stats).toBeDefined();
      expect(data.stats.typesIndexed).toBeGreaterThan(0);
      expect(data.stats.functionsIndexed).toBeGreaterThan(0);
      expect(data.stats.analysisTime).toBeDefined();
    });
  });

  describe("Edge Cases", () => {
    test("should handle empty query", async () => {
      const result = await resolveTypesTool.handler({
        projectPath: testProjectPath,
        query: "",
      });

      const data = JSON.parse(result.content[0].text);
      expect(data.success).toBe(true);
    });

    test("should handle non-existent project path", async () => {
      const result = await resolveTypesTool.handler({
        projectPath: "non/existent/path",
        query: "User",
      });

      const data = JSON.parse(result.content[0].text);
      expect(data.success).toBe(true);
      expect(data.resolved).toBeNull();
    });

    test("should handle project with no TypeScript files", async () => {
      await fs.mkdir(`${testProjectPath}/empty`, { recursive: true });

      const result = await resolveTypesTool.handler({
        projectPath: `${testProjectPath}/empty`,
        query: "User",
      });

      const data = JSON.parse(result.content[0].text);
      expect(data.success).toBe(true);
    });
  });

  describe("Performance", () => {
    test("should complete within reasonable time", async () => {
      const start = Date.now();

      await resolveTypesTool.handler({
        projectPath: testProjectPath,
        query: "User",
      });

      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(5000);
    });
  });
});
