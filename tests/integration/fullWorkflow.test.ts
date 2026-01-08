/**
 * Integration tests - Full workflow testing all tools together
 * Simulates real-world usage patterns
 *
 * @format
 */

import { validateCodeTool } from "../../src/tools/validateCode.js";
import { discoverContextTool } from "../../src/tools/discoverContext.js";
import { getDependencyGraphTool } from "../../src/tools/getDependencyGraph.js";
import { findDeadCodeTool } from "../../src/tools/findDeadCode.js";
import { getTestCoverageGapsTool } from "../../src/tools/getTestCoverageGaps.js";
import { resolveTypesTool } from "../../src/tools/resolveTypes.js";
import { scanDirectoryTool } from "../../src/tools/scanDirectory.js";
import * as fs from "fs/promises";
import * as path from "path";

describe("Integration: Full Workflow", () => {
  const projectPath = "tests/fixtures/integration-project";

  beforeAll(async () => {
    // Create a realistic project structure
    await fs.mkdir(`${projectPath}/src/models`, { recursive: true });
    await fs.mkdir(`${projectPath}/src/services`, { recursive: true });
    await fs.mkdir(`${projectPath}/src/controllers`, { recursive: true });
    await fs.mkdir(`${projectPath}/src/utils`, { recursive: true });
    await fs.mkdir(`${projectPath}/src/__tests__`, { recursive: true });

    // Package.json
    await fs.writeFile(
      `${projectPath}/package.json`,
      JSON.stringify({ name: "integration-test", version: "1.0.0" })
    );

    // Types/Models
    await fs.writeFile(
      `${projectPath}/src/models/user.ts`,
      `
export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: Date;
}

export type UserRole = 'admin' | 'user' | 'guest';

export interface CreateUserInput {
  email: string;
  name: string;
  password: string;
}

export interface UpdateUserInput {
  name?: string;
  email?: string;
}
`
    );

    await fs.writeFile(
      `${projectPath}/src/models/post.ts`,
      `
import { User } from './user';

export interface Post {
  id: string;
  title: string;
  content: string;
  authorId: string;
  author?: User;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreatePostInput {
  title: string;
  content: string;
}
`
    );

    // Services
    await fs.writeFile(
      `${projectPath}/src/services/userService.ts`,
      `
import { User, CreateUserInput, UpdateUserInput } from '../models/user';
import { hashPassword } from '../utils/crypto';
import { db } from '../utils/database';

export async function getUserById(id: string): Promise<User | null> {
  return db.users.findUnique({ where: { id } });
}

export async function getUserByEmail(email: string): Promise<User | null> {
  return db.users.findUnique({ where: { email } });
}

export async function createUser(input: CreateUserInput): Promise<User> {
  const hashedPassword = await hashPassword(input.password);
  return db.users.create({
    data: {
      ...input,
      password: hashedPassword,
      role: 'user',
    },
  });
}

export async function updateUser(id: string, input: UpdateUserInput): Promise<User> {
  return db.users.update({ where: { id }, data: input });
}

export async function deleteUser(id: string): Promise<void> {
  await db.users.delete({ where: { id } });
}

// Unused function - should be detected as dead code
export async function legacyGetUser(id: string): Promise<User | null> {
  console.log('DEPRECATED: Use getUserById instead');
  return getUserById(id);
}
`
    );

    await fs.writeFile(
      `${projectPath}/src/services/postService.ts`,
      `
import { Post, CreatePostInput } from '../models/post';
import { getUserById } from './userService';
import { db } from '../utils/database';

export async function getPostById(id: string): Promise<Post | null> {
  return db.posts.findUnique({ where: { id } });
}

export async function getPostsByAuthor(authorId: string): Promise<Post[]> {
  return db.posts.findMany({ where: { authorId } });
}

export async function createPost(authorId: string, input: CreatePostInput): Promise<Post> {
  const author = await getUserById(authorId);
  if (!author) {
    throw new Error('Author not found');
  }
  
  return db.posts.create({
    data: {
      ...input,
      authorId,
    },
  });
}

export async function deletePost(id: string): Promise<void> {
  await db.posts.delete({ where: { id } });
}
`
    );

    await fs.writeFile(
      `${projectPath}/src/services/authService.ts`,
      `
import { User } from '../models/user';
import { getUserByEmail, createUser } from './userService';
import { verifyPassword, hashPassword } from '../utils/crypto';
import { generateToken, verifyToken } from '../utils/jwt';

export async function login(email: string, password: string): Promise<string | null> {
  const user = await getUserByEmail(email);
  if (!user) return null;
  
  const valid = await verifyPassword(password, user.password);
  if (!valid) return null;
  
  return generateToken(user);
}

export async function register(email: string, password: string, name: string): Promise<User> {
  return createUser({ email, password, name });
}

export function validateSession(token: string): User | null {
  return verifyToken(token);
}

export async function changePassword(userId: string, oldPassword: string, newPassword: string): Promise<boolean> {
  // Complex function with multiple branches - good test coverage gap candidate
  const user = await getUserById(userId);
  if (!user) return false;
  
  const valid = await verifyPassword(oldPassword, user.password);
  if (!valid) return false;
  
  const hashed = await hashPassword(newPassword);
  await updateUser(userId, { password: hashed });
  
  return true;
}

// Missing import - will cause validation error
async function getUserById(id: string) {
  // This shadows the import and will cause issues
  return null;
}

async function updateUser(id: string, data: any) {
  return null;
}
`
    );

    // Utils
    await fs.writeFile(
      `${projectPath}/src/utils/crypto.ts`,
      `
import bcrypt from 'bcrypt';

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
`
    );

    await fs.writeFile(
      `${projectPath}/src/utils/jwt.ts`,
      `
import jwt from 'jsonwebtoken';
import { User } from '../models/user';

const SECRET = process.env.JWT_SECRET || 'secret';

export function generateToken(user: User): string {
  return jwt.sign({ userId: user.id, role: user.role }, SECRET, { expiresIn: '1h' });
}

export function verifyToken(token: string): User | null {
  try {
    const payload = jwt.verify(token, SECRET) as any;
    return { id: payload.userId, role: payload.role } as User;
  } catch {
    return null;
  }
}
`
    );

    await fs.writeFile(
      `${projectPath}/src/utils/database.ts`,
      `
export const db = {
  users: {
    findUnique: async (query: any) => null,
    findMany: async (query: any) => [],
    create: async (data: any) => data.data,
    update: async (data: any) => data.data,
    delete: async (query: any) => {},
  },
  posts: {
    findUnique: async (query: any) => null,
    findMany: async (query: any) => [],
    create: async (data: any) => data.data,
    update: async (data: any) => data.data,
    delete: async (query: any) => {},
  },
};
`
    );

    // Unused utility file
    await fs.writeFile(
      `${projectPath}/src/utils/legacy.ts`,
      `
// This entire file is unused
export function oldHelper() {
  return 'old';
}

export function deprecatedUtil() {
  return 'deprecated';
}
`
    );

    // Controllers
    await fs.writeFile(
      `${projectPath}/src/controllers/userController.ts`,
      `
import { Request, Response } from 'express';
import { getUserById, createUser, updateUser, deleteUser } from '../services/userService';

export async function getUser(req: Request, res: Response) {
  const user = await getUserById(req.params.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  res.json(user);
}

export async function createUserHandler(req: Request, res: Response) {
  try {
    const user = await createUser(req.body);
    res.status(201).json(user);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}
`
    );

    // Tests (partial coverage)
    await fs.writeFile(
      `${projectPath}/src/__tests__/userService.test.ts`,
      `
import { getUserById, createUser } from '../services/userService';

describe('userService', () => {
  test('getUserById returns user', async () => {
    const user = await getUserById('1');
    expect(user).toBeDefined();
  });

  test('createUser creates user', async () => {
    const user = await createUser({ email: 'test@test.com', name: 'Test', password: 'pass' });
    expect(user).toBeDefined();
  });

  // Note: updateUser, deleteUser, legacyGetUser are NOT tested
});
`
    );

    // Index
    await fs.writeFile(
      `${projectPath}/src/index.ts`,
      `
export * from './services/userService';
export * from './services/postService';
export * from './services/authService';
`
    );
  });

  afterAll(async () => {
    await fs.rm(projectPath, { recursive: true, force: true });
  });

  describe("Workflow: Adding New Feature", () => {
    test("Step 1: Discover relevant files for authentication feature", async () => {
      const result = await discoverContextTool.handler({
        projectPath,
        query: "authentication login user session token",
      });

      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      expect(data.relevantFiles.length).toBeGreaterThan(0);

      // Should find auth-related files
      const paths = data.relevantFiles.map((f: any) => f.path);
      expect(paths.some((p: string) => p.includes("auth"))).toBe(true);
    });

    test("Step 2: Understand dependencies before making changes", async () => {
      const result = await getDependencyGraphTool.handler({
        target: `${projectPath}/src/services/authService.ts`,
        language: "typescript",
        depth: 2,
      });

      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      // Should show what authService depends on
      const files = Object.keys(data.graph.files);
      expect(files.length).toBeGreaterThan(0);
    });

    test("Step 3: Validate new code before committing", async () => {
      const newCode = `
        import { login, validateSession } from './services/authService';
        import { getUserById } from './services/userService';
        
        async function handleAuth(token: string) {
          const session = validateSession(token);
          if (!session) return null;
          
          const user = await getUserById(session.id);
          // Calling non-existent function - should be caught
          const permissions = await getPermissions(user);
          return { user, permissions };
        }
      `;

      const result = await validateCodeTool.handler({
        projectPath,
        newCode,
        language: "typescript",
      });

      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      expect(data.hallucinationDetected).toBe(true);
      expect(
        data.issues.some((i: any) => i.message.includes("getPermissions"))
      ).toBe(true);
    });

    test("Step 4: Resolve types to understand return values", async () => {
      const result = await resolveTypesTool.handler({
        projectPath,
        query: "User",
      });

      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      expect(data.resolved).toBeDefined();
    });
  });

  describe("Workflow: Code Cleanup", () => {
    test("Step 1: Find dead code in the project", async () => {
      const result = await findDeadCodeTool.handler({
        directory: `${projectPath}/src`,
        language: "typescript",
      });

      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);

      // Should find unused exports
      expect(data.unusedExports.length).toBeGreaterThan(0);

      // Should find legacy.ts as orphaned
      expect(data.orphanedFiles.some((f: string) => f.includes("legacy"))).toBe(
        true
      );

      // Should find legacyGetUser as unused
      expect(
        data.unusedExports.some((e: any) => e.symbol === "legacyGetUser")
      ).toBe(true);
    });

    test("Step 2: Identify test coverage gaps", async () => {
      const result = await getTestCoverageGapsTool.handler({
        sourceDir: `${projectPath}/src`,
        language: "typescript",
      });

      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      expect(data.gaps.length).toBeGreaterThan(0);

      // Should identify untested functions
      const untestedNames = data.gaps
        .filter((g: any) => g.type === "function")
        .map((g: any) => g.name);

      expect(untestedNames).toContain("updateUser");
      expect(untestedNames).toContain("deleteUser");
    });

    test("Step 3: Scan directory for all issues", async () => {
      const result = await scanDirectoryTool.handler({
        directory: `${projectPath}/src`,
        language: "typescript",
        outputMode: "summary",
      });

      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      expect(data.stats.filesScanned).toBeGreaterThan(0);
    });
  });

  describe("Workflow: Refactoring", () => {
    test("Step 1: Understand impact of changing userService", async () => {
      const result = await getDependencyGraphTool.handler({
        target: `${projectPath}/src/services/userService.ts`,
        language: "typescript",
        depth: 2,
        direction: "importedBy",
      });

      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);

      // Should show files that depend on userService
      const userServiceKey = Object.keys(data.graph.files).find((k) =>
        k.includes("userService")
      );

      if (userServiceKey) {
        const importedBy = data.graph.files[userServiceKey].importedBy;
        // authService and postService should import userService
        expect(importedBy.length).toBeGreaterThan(0);
      }
    });

    test("Step 2: Validate refactored code", async () => {
      // Simulating a refactor where we rename getUserById to findUserById
      const refactoredCode = `
        import { findUserById } from './services/userService'; // Renamed
        
        async function getProfile(id: string) {
          const user = await findUserById(id); // Using new name
          return user;
        }
      `;

      const result = await validateCodeTool.handler({
        projectPath,
        newCode: refactoredCode,
        language: "typescript",
      });

      const data = JSON.parse(result.content[0].text);

      // Should detect that findUserById doesn't exist (it's still getUserById)
      expect(data.hallucinationDetected).toBe(true);
      expect(
        data.issues.some((i: any) => i.message.includes("findUserById"))
      ).toBe(true);
    });
  });

  describe("Workflow: Code Review", () => {
    test("Full project scan for code review", async () => {
      const result = await scanDirectoryTool.handler({
        directory: `${projectPath}/src`,
        language: "typescript",
        scanTypes: ["all"],
        outputMode: "aggregated",
      });

      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      expect(data.summary).toBeDefined();
      expect(data.summary.totalIssues).toBeDefined();
    });
  });

  describe("Error Handling Across Tools", () => {
    test("All tools handle invalid paths gracefully", async () => {
      const invalidPath = "non/existent/path";

      const results = await Promise.all([
        validateCodeTool.handler({
          projectPath: invalidPath,
          newCode: "const x = 1;",
          language: "typescript",
        }),
        discoverContextTool.handler({
          projectPath: invalidPath,
          query: "test",
        }),
        getDependencyGraphTool.handler({
          target: invalidPath,
          language: "typescript",
        }),
        findDeadCodeTool.handler({
          directory: invalidPath,
          language: "typescript",
        }),
        getTestCoverageGapsTool.handler({
          sourceDir: invalidPath,
          language: "typescript",
        }),
        resolveTypesTool.handler({
          projectPath: invalidPath,
          query: "User",
        }),
        scanDirectoryTool.handler({
          directory: invalidPath,
          language: "typescript",
        }),
      ]);

      // All should complete without throwing
      results.forEach((result) => {
        const data = JSON.parse(result.content[0].text);
        expect(data).toBeDefined();
      });
    });
  });

  describe("Performance: All Tools", () => {
    test("All tools complete within reasonable time", async () => {
      const start = Date.now();

      await Promise.all([
        validateCodeTool.handler({
          projectPath,
          newCode: "const x = getUserById('1');",
          language: "typescript",
        }),
        discoverContextTool.handler({
          projectPath,
          query: "user authentication",
        }),
        getDependencyGraphTool.handler({
          target: `${projectPath}/src`,
          language: "typescript",
          depth: 2,
        }),
        findDeadCodeTool.handler({
          directory: `${projectPath}/src`,
          language: "typescript",
        }),
        getTestCoverageGapsTool.handler({
          sourceDir: `${projectPath}/src`,
          language: "typescript",
        }),
        resolveTypesTool.handler({
          projectPath,
          query: "User",
        }),
        scanDirectoryTool.handler({
          directory: `${projectPath}/src`,
          language: "typescript",
        }),
      ]);

      const elapsed = Date.now() - start;

      // All tools running in parallel should complete in under 15 seconds
      expect(elapsed).toBeLessThan(15000);
    });
  });
});
