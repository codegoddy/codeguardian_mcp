/**
 * Comprehensive tests for get_test_coverage_gaps tool
 *
 * @format
 */

import { getTestCoverageGapsTool } from "../../src/tools/getTestCoverageGaps.js";
import * as fs from "fs/promises";
import * as path from "path";

describe("get_test_coverage_gaps", () => {
  const testProjectPath = "tests/fixtures/coverage-gaps-project";

  beforeAll(async () => {
    await fs.mkdir(`${testProjectPath}/src`, { recursive: true });
    await fs.mkdir(`${testProjectPath}/src/__tests__`, { recursive: true });

    // Source file with various functions
    await fs.writeFile(
      `${testProjectPath}/src/userService.ts`,
      `
export async function getUserById(id: string): Promise<User> {
  if (!id) {
    throw new Error('ID required');
  }
  return db.findUser(id);
}

export async function createUser(name: string, email: string): Promise<User> {
  if (!name || !email) {
    throw new Error('Name and email required');
  }
  return db.insertUser({ name, email });
}

export async function deleteUser(id: string): Promise<boolean> {
  const user = await getUserById(id);
  if (!user) {
    return false;
  }
  return db.removeUser(id);
}

// Internal function - not exported
function validateEmail(email: string): boolean {
  return email.includes('@') && email.includes('.');
}

export function formatUserName(user: User): string {
  return \`\${user.firstName} \${user.lastName}\`.trim();
}

// Complex function with many branches
export function calculateUserScore(user: User): number {
  let score = 0;
  
  if (user.verified) score += 10;
  if (user.premium) score += 20;
  if (user.posts > 100) score += 15;
  else if (user.posts > 50) score += 10;
  else if (user.posts > 10) score += 5;
  
  if (user.followers > 1000 && user.following < 100) {
    score += 25;
  }
  
  return score;
}
`
    );

    // Another source file
    await fs.writeFile(
      `${testProjectPath}/src/authService.ts`,
      `
export async function login(email: string, password: string): Promise<Token | null> {
  try {
    const user = await findUserByEmail(email);
    if (!user) return null;
    
    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) return null;
    
    return generateToken(user);
  } catch (error) {
    console.error('Login failed:', error);
    return null;
  }
}

export function verifyToken(token: string): boolean {
  if (!token) return false;
  return jwt.verify(token);
}

export async function logout(token: string): Promise<void> {
  await invalidateToken(token);
}

// Not exported
async function findUserByEmail(email: string): Promise<User | null> {
  return db.findByEmail(email);
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

function generateToken(user: User): Token {
  return jwt.sign({ userId: user.id });
}

async function invalidateToken(token: string): Promise<void> {
  await cache.delete(token);
}
`
    );

    // Test file that covers SOME functions
    await fs.writeFile(
      `${testProjectPath}/src/__tests__/userService.test.ts`,
      `
import { getUserById, createUser } from '../userService';

describe('userService', () => {
  describe('getUserById', () => {
    test('should return user when found', async () => {
      const user = await getUserById('123');
      expect(user).toBeDefined();
    });

    test('should throw when id is empty', async () => {
      await expect(getUserById('')).rejects.toThrow();
    });
  });

  describe('createUser', () => {
    test('should create user with valid data', async () => {
      const user = await createUser('John', 'john@example.com');
      expect(user.name).toBe('John');
    });
  });

  // Note: deleteUser, formatUserName, calculateUserScore are NOT tested
});
`
    );

    // Partial test file for auth
    await fs.writeFile(
      `${testProjectPath}/src/__tests__/authService.test.ts`,
      `
import { verifyToken } from '../authService';

describe('authService', () => {
  describe('verifyToken', () => {
    test('should return false for empty token', () => {
      expect(verifyToken('')).toBe(false);
    });

    test('should verify valid token', () => {
      expect(verifyToken('valid-token')).toBe(true);
    });
  });

  // Note: login and logout are NOT tested
});
`
    );
  });

  afterAll(async () => {
    await fs.rm(testProjectPath, { recursive: true, force: true });
  });

  describe("Untested Function Detection", () => {
    test("should find functions without tests", async () => {
      const result = await getTestCoverageGapsTool.handler({
        sourceDir: `${testProjectPath}/src`,
        language: "typescript",
      });

      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);

      const untestedFunctions = data.gaps.filter(
        (g: any) => g.type === "function"
      );
      const untestedNames = untestedFunctions.map((g: any) => g.name);

      // These should be flagged as untested
      expect(untestedNames).toContain("deleteUser");
      expect(untestedNames).toContain("formatUserName");
      expect(untestedNames).toContain("calculateUserScore");
      expect(untestedNames).toContain("login");
      expect(untestedNames).toContain("logout");
    });

    test("should NOT flag tested functions", async () => {
      const result = await getTestCoverageGapsTool.handler({
        sourceDir: `${testProjectPath}/src`,
        language: "typescript",
      });

      const data = JSON.parse(result.content[0].text);

      const untestedFunctions = data.gaps.filter(
        (g: any) => g.type === "function"
      );
      const untestedNames = untestedFunctions.map((g: any) => g.name);

      // These have tests
      expect(untestedNames).not.toContain("getUserById");
      expect(untestedNames).not.toContain("createUser");
      expect(untestedNames).not.toContain("verifyToken");
    });
  });

  describe("Priority Assignment", () => {
    test("should mark exported functions as high priority", async () => {
      const result = await getTestCoverageGapsTool.handler({
        sourceDir: `${testProjectPath}/src`,
        language: "typescript",
      });

      const data = JSON.parse(result.content[0].text);

      const deleteUserGap = data.gaps.find((g: any) => g.name === "deleteUser");
      expect(deleteUserGap).toBeDefined();
      expect(deleteUserGap.priority).toBe("high");
    });

    test("should mark complex functions as high priority", async () => {
      const result = await getTestCoverageGapsTool.handler({
        sourceDir: `${testProjectPath}/src`,
        language: "typescript",
      });

      const data = JSON.parse(result.content[0].text);

      const complexGap = data.gaps.find(
        (g: any) => g.name === "calculateUserScore"
      );
      expect(complexGap).toBeDefined();
      expect(complexGap.priority).toBe("high");
    });
  });

  describe("Branch Coverage Gaps", () => {
    test("should identify error handlers without tests", async () => {
      const result = await getTestCoverageGapsTool.handler({
        sourceDir: `${testProjectPath}/src`,
        language: "typescript",
      });

      const data = JSON.parse(result.content[0].text);

      const errorHandlerGaps = data.gaps.filter(
        (g: any) => g.type === "errorHandler"
      );
      expect(errorHandlerGaps.length).toBeGreaterThan(0);
    });

    test("should identify null checks without tests", async () => {
      const result = await getTestCoverageGapsTool.handler({
        sourceDir: `${testProjectPath}/src`,
        language: "typescript",
      });

      const data = JSON.parse(result.content[0].text);

      const edgeCaseGaps = data.gaps.filter((g: any) => g.type === "edgeCase");
      expect(edgeCaseGaps.length).toBeGreaterThan(0);
    });

    test("should identify complex conditionals", async () => {
      const result = await getTestCoverageGapsTool.handler({
        sourceDir: `${testProjectPath}/src`,
        language: "typescript",
      });

      const data = JSON.parse(result.content[0].text);

      const branchGaps = data.gaps.filter((g: any) => g.type === "branch");
      expect(branchGaps.length).toBeGreaterThan(0);
    });
  });

  describe("Test Suggestions", () => {
    test("should provide test suggestions for untested functions", async () => {
      const result = await getTestCoverageGapsTool.handler({
        sourceDir: `${testProjectPath}/src`,
        language: "typescript",
      });

      const data = JSON.parse(result.content[0].text);

      const gapWithSuggestion = data.gaps.find(
        (g: any) => g.type === "function" && g.suggestedTest
      );

      expect(gapWithSuggestion).toBeDefined();
      expect(gapWithSuggestion.suggestedTest).toContain("test(");
      expect(gapWithSuggestion.suggestedTest).toContain("expect");
    });
  });

  describe("Summary Statistics", () => {
    test("should provide accurate coverage estimate", async () => {
      const result = await getTestCoverageGapsTool.handler({
        sourceDir: `${testProjectPath}/src`,
        language: "typescript",
      });

      const data = JSON.parse(result.content[0].text);

      expect(data.summary).toBeDefined();
      expect(data.summary.totalFunctions).toBeGreaterThan(0);
      expect(data.summary.testedFunctions).toBeGreaterThan(0);
      expect(data.summary.untestedFunctions).toBeGreaterThan(0);
      expect(data.summary.coverageEstimate).toBeGreaterThan(0);
      expect(data.summary.coverageEstimate).toBeLessThan(100);
    });

    test("should list found test files", async () => {
      const result = await getTestCoverageGapsTool.handler({
        sourceDir: `${testProjectPath}/src`,
        language: "typescript",
      });

      const data = JSON.parse(result.content[0].text);

      expect(data.testFiles).toBeDefined();
      expect(data.testFiles.found).toBeGreaterThan(0);
      expect(data.testFiles.paths.length).toBeGreaterThan(0);
    });
  });

  describe("Focus File", () => {
    test("should analyze only specified file", async () => {
      const result = await getTestCoverageGapsTool.handler({
        sourceDir: `${testProjectPath}/src`,
        language: "typescript",
        focusFile: "authService.ts",
      });

      const data = JSON.parse(result.content[0].text);

      // Should only have gaps from authService
      const files = data.gaps.map((g: any) => g.file);
      expect(files.every((f: string) => f.includes("authService"))).toBe(true);
    });
  });

  describe("Custom Test Directory", () => {
    beforeAll(async () => {
      await fs.mkdir(`${testProjectPath}/custom-tests`, { recursive: true });
      await fs.writeFile(
        `${testProjectPath}/custom-tests/auth.test.ts`,
        `
import { login } from '../src/authService';

describe('auth', () => {
  test('login works', async () => {
    const result = await login('test@test.com', 'password');
    expect(result).toBeDefined();
  });
});
`
      );
    });

    test("should use custom test directory", async () => {
      const result = await getTestCoverageGapsTool.handler({
        sourceDir: `${testProjectPath}/src`,
        testDir: `${testProjectPath}/custom-tests`,
        language: "typescript",
      });

      const data = JSON.parse(result.content[0].text);

      // login should now be considered tested
      const untestedNames = data.gaps
        .filter((g: any) => g.type === "function")
        .map((g: any) => g.name);

      expect(untestedNames).not.toContain("login");
    });
  });

  describe("Python Support", () => {
    beforeAll(async () => {
      await fs.mkdir(`${testProjectPath}/python`, { recursive: true });
      await fs.mkdir(`${testProjectPath}/python/tests`, { recursive: true });

      await fs.writeFile(
        `${testProjectPath}/python/services.py`,
        `
def get_user(user_id: str):
    return db.find_user(user_id)

def create_user(name: str, email: str):
    return db.insert_user(name, email)

def delete_user(user_id: str):
    return db.remove_user(user_id)
`
      );

      await fs.writeFile(
        `${testProjectPath}/python/tests/test_services.py`,
        `
from services import get_user

def test_get_user():
    user = get_user("123")
    assert user is not None
`
      );
    });

    test("should find untested Python functions", async () => {
      const result = await getTestCoverageGapsTool.handler({
        sourceDir: `${testProjectPath}/python`,
        language: "python",
      });

      const data = JSON.parse(result.content[0].text);

      const untestedNames = data.gaps
        .filter((g: any) => g.type === "function")
        .map((g: any) => g.name);

      expect(untestedNames).toContain("create_user");
      expect(untestedNames).toContain("delete_user");
      expect(untestedNames).not.toContain("get_user");
    });

    test("should generate Python test suggestions", async () => {
      const result = await getTestCoverageGapsTool.handler({
        sourceDir: `${testProjectPath}/python`,
        language: "python",
      });

      const data = JSON.parse(result.content[0].text);

      const pythonGap = data.gaps.find(
        (g: any) => g.type === "function" && g.suggestedTest
      );

      expect(pythonGap.suggestedTest).toContain("def test_");
      expect(pythonGap.suggestedTest).toContain("assert");
    });
  });

  describe("Edge Cases", () => {
    test("should handle project with no tests", async () => {
      await fs.mkdir(`${testProjectPath}/no-tests/src`, { recursive: true });
      await fs.writeFile(
        `${testProjectPath}/no-tests/src/module.ts`,
        `export function untested() { return 1; }`
      );

      const result = await getTestCoverageGapsTool.handler({
        sourceDir: `${testProjectPath}/no-tests/src`,
        language: "typescript",
      });

      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      expect(data.summary.coverageEstimate).toBe(0);
      expect(data.testFiles.found).toBe(0);
    });

    test("should handle empty source directory", async () => {
      await fs.mkdir(`${testProjectPath}/empty-src`, { recursive: true });

      const result = await getTestCoverageGapsTool.handler({
        sourceDir: `${testProjectPath}/empty-src`,
        language: "typescript",
      });

      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      expect(data.gaps.length).toBe(0);
    });
  });

  describe("Recommendation", () => {
    test("should provide actionable recommendation", async () => {
      const result = await getTestCoverageGapsTool.handler({
        sourceDir: `${testProjectPath}/src`,
        language: "typescript",
      });

      const data = JSON.parse(result.content[0].text);

      expect(data.recommendation).toBeDefined();
      expect(typeof data.recommendation).toBe("string");
      expect(data.recommendation.length).toBeGreaterThan(0);
    });
  });

  describe("Performance", () => {
    test("should complete within reasonable time", async () => {
      const start = Date.now();

      await getTestCoverageGapsTool.handler({
        sourceDir: `${testProjectPath}/src`,
        language: "typescript",
      });

      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(5000);
    });
  });
});
