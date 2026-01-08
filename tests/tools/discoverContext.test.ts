/**
 * Comprehensive tests for discover_context tool
 *
 * @format
 */

import { discoverContextTool } from "../../src/tools/discoverContext.js";
import * as fs from "fs/promises";
import * as path from "path";

describe("discover_context", () => {
  const testProjectPath = "tests/fixtures/context-project";

  beforeAll(async () => {
    await fs.mkdir(`${testProjectPath}/src`, { recursive: true });
    await fs.mkdir(`${testProjectPath}/src/auth`, { recursive: true });
    await fs.mkdir(`${testProjectPath}/src/users`, { recursive: true });
    await fs.mkdir(`${testProjectPath}/src/utils`, { recursive: true });
    await fs.mkdir(`${testProjectPath}/src/api`, { recursive: true });

    // Auth module
    await fs.writeFile(
      `${testProjectPath}/src/auth/login.ts`,
      `
import { getUserByEmail } from '../users/userService';
import { hashPassword, verifyPassword } from '../utils/crypto';
import { generateToken } from './token';

export async function login(email: string, password: string) {
  const user = await getUserByEmail(email);
  if (!user) throw new Error('User not found');
  
  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) throw new Error('Invalid password');
  
  return generateToken(user);
}

export async function register(email: string, password: string, name: string) {
  const hashedPassword = await hashPassword(password);
  return createUser({ email, password: hashedPassword, name });
}
`
    );

    await fs.writeFile(
      `${testProjectPath}/src/auth/token.ts`,
      `
import jwt from 'jsonwebtoken';

export function generateToken(user: User): string {
  return jwt.sign({ userId: user.id }, process.env.JWT_SECRET);
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return null;
  }
}

export function refreshToken(token: string): string | null {
  const payload = verifyToken(token);
  if (!payload) return null;
  return generateToken({ id: payload.userId });
}
`
    );

    await fs.writeFile(
      `${testProjectPath}/src/auth/index.ts`,
      `
export { login, register } from './login';
export { generateToken, verifyToken, refreshToken } from './token';
`
    );

    // Users module
    await fs.writeFile(
      `${testProjectPath}/src/users/userService.ts`,
      `
import { db } from '../utils/database';

export async function getUserById(id: string): Promise<User | null> {
  return db.users.findUnique({ where: { id } });
}

export async function getUserByEmail(email: string): Promise<User | null> {
  return db.users.findUnique({ where: { email } });
}

export async function createUser(data: CreateUserInput): Promise<User> {
  return db.users.create({ data });
}

export async function updateUser(id: string, data: UpdateUserInput): Promise<User> {
  return db.users.update({ where: { id }, data });
}

export async function deleteUser(id: string): Promise<void> {
  await db.users.delete({ where: { id } });
}
`
    );

    await fs.writeFile(
      `${testProjectPath}/src/users/userProfile.ts`,
      `
import { getUserById } from './userService';

export async function getProfile(userId: string) {
  const user = await getUserById(userId);
  if (!user) return null;
  
  return {
    ...user,
    displayName: formatDisplayName(user),
    avatarUrl: getAvatarUrl(user),
  };
}

function formatDisplayName(user: User): string {
  return user.name || user.email.split('@')[0];
}

function getAvatarUrl(user: User): string {
  return \`https://avatars.example.com/\${user.id}\`;
}
`
    );

    // Utils
    await fs.writeFile(
      `${testProjectPath}/src/utils/crypto.ts`,
      `
import bcrypt from 'bcrypt';

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateRandomToken(): string {
  return crypto.randomBytes(32).toString('hex');
}
`
    );

    await fs.writeFile(
      `${testProjectPath}/src/utils/database.ts`,
      `
import { PrismaClient } from '@prisma/client';

export const db = new PrismaClient();

export async function connectDatabase(): Promise<void> {
  await db.$connect();
}

export async function disconnectDatabase(): Promise<void> {
  await db.$disconnect();
}
`
    );

    await fs.writeFile(
      `${testProjectPath}/src/utils/validation.ts`,
      `
export function isValidEmail(email: string): boolean {
  return /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email);
}

export function isValidPassword(password: string): boolean {
  return password.length >= 8;
}

export function sanitizeInput(input: string): string {
  return input.trim().replace(/<[^>]*>/g, '');
}
`
    );

    // API routes
    await fs.writeFile(
      `${testProjectPath}/src/api/authRoutes.ts`,
      `
import { Router } from 'express';
import { login, register } from '../auth';
import { isValidEmail, isValidPassword } from '../utils/validation';

const router = Router();

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'Invalid email' });
  }
  
  try {
    const token = await login(email, password);
    res.json({ token });
  } catch (error) {
    res.status(401).json({ error: error.message });
  }
});

router.post('/register', async (req, res) => {
  const { email, password, name } = req.body;
  
  if (!isValidEmail(email) || !isValidPassword(password)) {
    return res.status(400).json({ error: 'Invalid input' });
  }
  
  try {
    const user = await register(email, password, name);
    res.json({ user });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
`
    );

    await fs.writeFile(
      `${testProjectPath}/src/api/userRoutes.ts`,
      `
import { Router } from 'express';
import { getUserById, updateUser, deleteUser } from '../users/userService';
import { getProfile } from '../users/userProfile';
import { verifyToken } from '../auth';

const router = Router();

router.get('/me', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  const payload = verifyToken(token);
  
  if (!payload) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  const profile = await getProfile(payload.userId);
  res.json(profile);
});

router.put('/me', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  const payload = verifyToken(token);
  
  if (!payload) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  const user = await updateUser(payload.userId, req.body);
  res.json(user);
});

export default router;
`
    );

    // Main entry
    await fs.writeFile(
      `${testProjectPath}/src/index.ts`,
      `
import express from 'express';
import authRoutes from './api/authRoutes';
import userRoutes from './api/userRoutes';
import { connectDatabase } from './utils/database';

const app = express();

app.use(express.json());
app.use('/auth', authRoutes);
app.use('/users', userRoutes);

async function main() {
  await connectDatabase();
  app.listen(3000, () => {
    console.log('Server running on port 3000');
  });
}

main();
`
    );
  });

  afterAll(async () => {
    await fs.rm(testProjectPath, { recursive: true, force: true });
  });

  describe("Query-Based Discovery", () => {
    test("should find files related to authentication query", async () => {
      const result = await discoverContextTool.handler({
        projectPath: testProjectPath,
        query: "authentication login user session",
      });

      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      expect(data.relevantFiles.length).toBeGreaterThan(0);

      const filePaths = data.relevantFiles.map((f: any) => f.path);
      expect(
        filePaths.some((p: string) => p.includes("auth") || p.includes("login"))
      ).toBe(true);
    });

    test("should find files related to user management query", async () => {
      const result = await discoverContextTool.handler({
        projectPath: testProjectPath,
        query: "user profile update delete",
      });

      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      const filePaths = data.relevantFiles.map((f: any) => f.path);
      expect(filePaths.some((p: string) => p.includes("user"))).toBe(true);
    });

    test("should find files related to database query", async () => {
      const result = await discoverContextTool.handler({
        projectPath: testProjectPath,
        query: "database connection prisma",
      });

      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      const filePaths = data.relevantFiles.map((f: any) => f.path);
      expect(filePaths.some((p: string) => p.includes("database"))).toBe(true);
    });
  });

  describe("Code-Based Discovery", () => {
    test("should find files defining symbols used in new code", async () => {
      const result = await discoverContextTool.handler({
        projectPath: testProjectPath,
        newCode: `
          const user = await getUserById(id);
          const token = generateToken(user);
          const valid = await verifyPassword(password, user.passwordHash);
        `,
      });

      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      expect(data.relevantFiles.length).toBeGreaterThan(0);

      // Should find files that define these functions
      const filePaths = data.relevantFiles.map((f: any) => f.path);
      expect(
        filePaths.some(
          (p: string) =>
            p.includes("userService") ||
            p.includes("token") ||
            p.includes("crypto")
        )
      ).toBe(true);
    });

    test("should find files for import statements", async () => {
      const result = await discoverContextTool.handler({
        projectPath: testProjectPath,
        newCode: `
          import { login, register } from './auth';
          import { getUserById } from './users/userService';
        `,
      });

      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      expect(data.relevantFiles.length).toBeGreaterThan(0);
    });
  });

  describe("Combined Query and Code", () => {
    test("should combine query and code for better results", async () => {
      const result = await discoverContextTool.handler({
        projectPath: testProjectPath,
        query: "password validation",
        newCode: `
          const isValid = isValidPassword(password);
          const hashed = await hashPassword(password);
        `,
      });

      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      const filePaths = data.relevantFiles.map((f: any) => f.path);
      expect(
        filePaths.some(
          (p: string) => p.includes("validation") || p.includes("crypto")
        )
      ).toBe(true);
    });
  });

  describe("Relevance Scoring", () => {
    test("should rank files by relevance", async () => {
      const result = await discoverContextTool.handler({
        projectPath: testProjectPath,
        query: "login authentication",
      });

      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      expect(data.relevantFiles.length).toBeGreaterThan(1);

      // Files should be sorted by relevance score (descending)
      const scores = data.relevantFiles.map((f: any) => f.relevanceScore);
      for (let i = 1; i < scores.length; i++) {
        expect(scores[i - 1]).toBeGreaterThanOrEqual(scores[i]);
      }
    });

    test("should provide reason for relevance", async () => {
      const result = await discoverContextTool.handler({
        projectPath: testProjectPath,
        query: "login",
      });

      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      data.relevantFiles.forEach((file: any) => {
        expect(file.reason).toBeDefined();
        expect(typeof file.reason).toBe("string");
      });
    });
  });

  describe("Dependency Chain", () => {
    test("should follow imports to find related files", async () => {
      const result = await discoverContextTool.handler({
        projectPath: testProjectPath,
        query: "login",
        followImports: true,
      });

      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      expect(data.dependencyChain).toBeDefined();
      // Should include files that login.ts imports
    });

    test("should not follow imports when disabled", async () => {
      const withImports = await discoverContextTool.handler({
        projectPath: testProjectPath,
        query: "login",
        followImports: true,
      });

      const withoutImports = await discoverContextTool.handler({
        projectPath: testProjectPath,
        query: "login",
        followImports: false,
      });

      const withData = JSON.parse(withImports.content[0].text);
      const withoutData = JSON.parse(withoutImports.content[0].text);

      // With imports should potentially find more related files
      expect(withData.dependencyChain.length).toBeGreaterThanOrEqual(
        withoutData.dependencyChain.length
      );
    });
  });

  describe("Suggested Read Order", () => {
    test("should suggest optimal read order", async () => {
      const result = await discoverContextTool.handler({
        projectPath: testProjectPath,
        query: "authentication",
      });

      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      expect(data.suggestedReadOrder).toBeDefined();
      expect(Array.isArray(data.suggestedReadOrder)).toBe(true);
    });
  });

  describe("Language Filtering", () => {
    test("should filter by language", async () => {
      const result = await discoverContextTool.handler({
        projectPath: testProjectPath,
        query: "user",
        language: "typescript",
      });

      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      // All files should be TypeScript
      data.relevantFiles.forEach((file: any) => {
        expect(file.path).toMatch(/\.tsx?$/);
      });
    });
  });

  describe("Max Results", () => {
    test("should respect maxResults limit", async () => {
      const result = await discoverContextTool.handler({
        projectPath: testProjectPath,
        query: "user",
        maxResults: 3,
      });

      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      expect(data.relevantFiles.length).toBeLessThanOrEqual(3);
    });
  });

  describe("Include Tests Option", () => {
    beforeAll(async () => {
      await fs.mkdir(`${testProjectPath}/src/__tests__`, { recursive: true });
      await fs.writeFile(
        `${testProjectPath}/src/__tests__/auth.test.ts`,
        `
import { login } from '../auth/login';

describe('login', () => {
  test('should login user', async () => {
    const token = await login('test@test.com', 'password');
    expect(token).toBeDefined();
  });
});
`
      );
    });

    test("should exclude test files by default", async () => {
      const result = await discoverContextTool.handler({
        projectPath: testProjectPath,
        query: "login test",
        includeTests: false,
      });

      const data = JSON.parse(result.content[0].text);

      const filePaths = data.relevantFiles.map((f: any) => f.path);
      expect(filePaths.every((p: string) => !p.includes(".test."))).toBe(true);
    });

    test("should include test files when requested", async () => {
      const result = await discoverContextTool.handler({
        projectPath: testProjectPath,
        query: "login test",
        includeTests: true,
      });

      const data = JSON.parse(result.content[0].text);

      const filePaths = data.relevantFiles.map((f: any) => f.path);
      expect(filePaths.some((p: string) => p.includes(".test."))).toBe(true);
    });
  });

  describe("Entry Points Discovery", () => {
    test("should find entry points when no query provided", async () => {
      const result = await discoverContextTool.handler({
        projectPath: testProjectPath,
      });

      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      expect(data.relevantFiles.length).toBeGreaterThan(0);

      // Should include index files and main entry points
      const filePaths = data.relevantFiles.map((f: any) => f.path);
      expect(filePaths.some((p: string) => p.includes("index"))).toBe(true);
    });
  });

  describe("Summary Statistics", () => {
    test("should provide summary statistics", async () => {
      const result = await discoverContextTool.handler({
        projectPath: testProjectPath,
        query: "user",
      });

      const data = JSON.parse(result.content[0].text);

      expect(data.summary).toBeDefined();
      expect(data.summary.totalFilesIndexed).toBeGreaterThan(0);
      expect(data.summary.relevantFilesFound).toBeGreaterThan(0);
      expect(data.summary.indexTime).toBeDefined();
      expect(data.summary.searchTime).toBeDefined();
    });
  });

  describe("Edge Cases", () => {
    test("should handle empty project", async () => {
      await fs.mkdir(`${testProjectPath}/empty`, { recursive: true });

      const result = await discoverContextTool.handler({
        projectPath: `${testProjectPath}/empty`,
        query: "anything",
      });

      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      expect(data.relevantFiles).toEqual([]);
    });

    test("should handle non-existent path", async () => {
      const result = await discoverContextTool.handler({
        projectPath: "non/existent/path",
        query: "anything",
      });

      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      expect(data.relevantFiles).toEqual([]);
    });

    test("should handle empty query", async () => {
      const result = await discoverContextTool.handler({
        projectPath: testProjectPath,
        query: "",
      });

      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      // Should return entry points
    });
  });

  describe("Performance", () => {
    test("should complete within reasonable time", async () => {
      const start = Date.now();

      await discoverContextTool.handler({
        projectPath: testProjectPath,
        query: "authentication user login password",
      });

      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(5000);
    });
  });
});
