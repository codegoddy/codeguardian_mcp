/**
 * Comprehensive tests for validate_code tool
 * The core hallucination detector - must be bulletproof
 *
 * @format
 */

import { validateCodeTool } from "../../src/tools/validateCode.js";
import { clearContextCache } from "../../src/context/projectContext.js";
import * as fs from "fs/promises";
import * as path from "path";

describe("validate_code", () => {
  const testProjectPath = "tests/fixtures/sample-project";

  beforeEach(() => {
    // Clear context cache between tests to avoid stale data
    clearContextCache();
  });

  beforeAll(async () => {
    // Create test fixture project
    await fs.mkdir(testProjectPath, { recursive: true });
    await fs.mkdir(`${testProjectPath}/src`, { recursive: true });
    await fs.mkdir(`${testProjectPath}/utils`, { recursive: true });

    // Create sample source files
    await fs.writeFile(
      `${testProjectPath}/src/userService.ts`,
      `
export function getUserById(id: string): Promise<User> {
  return db.findUser(id);
}

export function createUser(name: string, email: string): Promise<User> {
  return db.insertUser({ name, email });
}

export async function deleteUser(id: string): Promise<boolean> {
  return db.removeUser(id);
}

export class UserValidator {
  validate(user: User): boolean {
    return !!user.name && !!user.email;
  }
}
`
    );

    await fs.writeFile(
      `${testProjectPath}/src/authService.ts`,
      `
import { getUserById } from './userService';

export async function login(email: string, password: string): Promise<Token> {
  const user = await findUserByEmail(email);
  if (!user) throw new Error('User not found');
  return generateToken(user);
}

export function verifyToken(token: string): boolean {
  return jwt.verify(token);
}

function generateToken(user: User): Token {
  return jwt.sign({ userId: user.id });
}

function findUserByEmail(email: string): Promise<User | null> {
  return db.findByEmail(email);
}
`
    );

    await fs.writeFile(
      `${testProjectPath}/utils/helpers.ts`,
      `
export function formatDate(date: Date): string {
  return date.toISOString();
}

export function parseJSON<T>(str: string): T {
  return JSON.parse(str);
}

export const MAX_RETRIES = 3;
`
    );
  });

  afterAll(async () => {
    await fs.rm(testProjectPath, { recursive: true, force: true });
  });

  describe("Hallucination Detection", () => {
    test("should detect non-existent function calls", async () => {
      const result = await validateCodeTool.handler({
        projectPath: testProjectPath,
        newCode: `
          const user = await getUserById("123");
          const result = await authenticateUser(user); // DOES NOT EXIST
          await sendWelcomeEmail(user.email); // DOES NOT EXIST
        `,
        language: "typescript",
      });

      const data = JSON.parse(result.content[0].text);

      expect(data.success).toBe(true);
      expect(data.hallucinationDetected).toBe(true);
      expect(data.hallucinations.length).toBeGreaterThanOrEqual(2);

      const functionIssues = data.hallucinations.filter(
        (i: any) => i.type === "nonExistentFunction"
      );
      expect(
        functionIssues.some((i: any) => i.message.includes("authenticateUser"))
      ).toBe(true);
      expect(
        functionIssues.some((i: any) => i.message.includes("sendWelcomeEmail"))
      ).toBe(true);
    });

    test("should detect non-existent class instantiation", async () => {
      const result = await validateCodeTool.handler({
        projectPath: testProjectPath,
        newCode: `
          const validator = new UserValidator();
          const emailValidator = new EmailValidator(); // DOES NOT EXIST
          const dataProcessor = new DataProcessor(); // DOES NOT EXIST
        `,
        language: "typescript",
      });

      const data = JSON.parse(result.content[0].text);

      expect(data.hallucinationDetected).toBe(true);
      const classIssues = data.hallucinations.filter(
        (i: any) => i.type === "nonExistentClass"
      );
      expect(
        classIssues.some((i: any) => i.message.includes("EmailValidator"))
      ).toBe(true);
      expect(
        classIssues.some((i: any) => i.message.includes("DataProcessor"))
      ).toBe(true);
    });

    test("should NOT flag existing functions", async () => {
      const result = await validateCodeTool.handler({
        projectPath: testProjectPath,
        newCode: `
          const user = await getUserById("123");
          const newUser = await createUser("John", "john@example.com");
          const deleted = await deleteUser("456");
          const date = formatDate(new Date());
        `,
        language: "typescript",
      });

      const data = JSON.parse(result.content[0].text);

      expect(data.score).toBeGreaterThanOrEqual(80);
      const criticalIssues = data.hallucinations.filter(
        (i: any) => i.severity === "critical"
      );
      expect(criticalIssues.length).toBe(0);
    });

    test("should NOT flag existing classes", async () => {
      const result = await validateCodeTool.handler({
        projectPath: testProjectPath,
        newCode: `
          const validator = new UserValidator();
          const isValid = validator.validate(user);
        `,
        language: "typescript",
      });

      const data = JSON.parse(result.content[0].text);

      const classIssues = data.hallucinations.filter(
        (i: any) => i.type === "nonExistentClass"
      );
      expect(classIssues.length).toBe(0);
    });

    test("should NOT flag built-in functions", async () => {
      const result = await validateCodeTool.handler({
        projectPath: testProjectPath,
        newCode: `
          console.log("test");
          const parsed = JSON.parse('{}');
          const num = parseInt("42");
          const arr = Array.from([1, 2, 3]);
          const promise = Promise.resolve(true);
          setTimeout(() => {}, 1000);
        `,
        language: "typescript",
      });

      const data = JSON.parse(result.content[0].text);

      expect(data.score).toBe(100);
      expect(data.hallucinations.length).toBe(0);
    });

    test("should NOT flag functions defined in the new code itself", async () => {
      const result = await validateCodeTool.handler({
        projectPath: testProjectPath,
        newCode: `
          function myNewHelper(x: number): number {
            return x * 2;
          }
          
          const result = myNewHelper(5);
          const doubled = myNewHelper(10);
        `,
        language: "typescript",
      });

      const data = JSON.parse(result.content[0].text);

      expect(data.score).toBe(100);
      const funcIssues = data.hallucinations.filter((i: any) =>
        i.message.includes("myNewHelper")
      );
      expect(funcIssues.length).toBe(0);
    });
  });

  describe("Suggestions", () => {
    test("should suggest similar function names", async () => {
      const result = await validateCodeTool.handler({
        projectPath: testProjectPath,
        newCode: `
          const user = await getUser("123"); // Similar to getUserById
        `,
        language: "typescript",
      });

      const data = JSON.parse(result.content[0].text);

      const issue = data.hallucinations.find((i: any) =>
        i.message.includes("getUser")
      );
      expect(issue).toBeDefined();
      expect(issue.suggestion).toContain("getUserById");
    });
  });

  describe("Score Calculation", () => {
    test("should return score 100 for valid code", async () => {
      const result = await validateCodeTool.handler({
        projectPath: testProjectPath,
        newCode: `
          const user = await getUserById("123");
          console.log(user);
        `,
        language: "typescript",
      });

      const data = JSON.parse(result.content[0].text);
      expect(data.score).toBe(100);
    });

    test("should heavily penalize critical issues", async () => {
      const result = await validateCodeTool.handler({
        projectPath: testProjectPath,
        newCode: `
          await nonExistent1();
          await nonExistent2();
          await nonExistent3();
        `,
        language: "typescript",
      });

      const data = JSON.parse(result.content[0].text);
      expect(data.score).toBeLessThan(50);
    });
  });

  describe("Recommendation", () => {
    test("should REJECT code with critical issues", async () => {
      const result = await validateCodeTool.handler({
        projectPath: testProjectPath,
        newCode: `
          await fakeFunction();
          new FakeClass();
        `,
        language: "typescript",
      });

      const data = JSON.parse(result.content[0].text);
      expect(data.recommendation.verdict).toBe("REJECT");
    });

    test("should ACCEPT valid code", async () => {
      const result = await validateCodeTool.handler({
        projectPath: testProjectPath,
        newCode: `
          const user = await getUserById("123");
          const valid = new UserValidator().validate(user);
        `,
        language: "typescript",
      });

      const data = JSON.parse(result.content[0].text);
      expect(data.recommendation.verdict).toBe("ACCEPT");
    });
  });

  describe("Edge Cases", () => {
    test("should handle empty code", async () => {
      const result = await validateCodeTool.handler({
        projectPath: testProjectPath,
        newCode: "",
        language: "typescript",
      });

      const data = JSON.parse(result.content[0].text);
      expect(data.success).toBe(true);
      expect(data.score).toBe(100);
    });

    test("should handle code with only comments", async () => {
      const result = await validateCodeTool.handler({
        projectPath: testProjectPath,
        newCode: `
          // This is a comment
          /* Multi-line
             comment */
        `,
        language: "typescript",
      });

      const data = JSON.parse(result.content[0].text);
      expect(data.success).toBe(true);
    });

    test("should handle non-existent project path gracefully", async () => {
      const result = await validateCodeTool.handler({
        projectPath: "non/existent/path",
        newCode: "const x = test();",
        language: "typescript",
      });

      const data = JSON.parse(result.content[0].text);
      expect(data.success).toBe(true);
      // With no files found, it still validates but against empty symbol table
      // This means all function calls will be flagged as hallucinations
      expect(data.stats.filesScanned).toBe(0);
    });

    test("should ignore function calls in strings", async () => {
      const result = await validateCodeTool.handler({
        projectPath: testProjectPath,
        newCode: `
          const msg = "Call fakeFunction() to test";
          const template = \`Use nonExistent() here\`;
        `,
        language: "typescript",
      });

      const data = JSON.parse(result.content[0].text);
      // Should not flag functions mentioned in strings
      expect(data.score).toBe(100);
    });
  });

  describe("Python Support", () => {
    beforeAll(async () => {
      await fs.mkdir(`${testProjectPath}/python`, { recursive: true });
      await fs.writeFile(
        `${testProjectPath}/python/services.py`,
        `
def get_user(user_id: str):
    return db.find_user(user_id)

def create_user(name: str, email: str):
    return db.insert_user(name, email)

class UserValidator:
    def validate(self, user):
        return bool(user.name)
`
      );
    });

    test("should detect hallucinations in Python code", async () => {
      const result = await validateCodeTool.handler({
        projectPath: `${testProjectPath}/python`,
        newCode: `
user = get_user("123")
result = authenticate_user(user)  # DOES NOT EXIST
send_notification(user.email)  # DOES NOT EXIST
        `,
        language: "python",
      });

      const data = JSON.parse(result.content[0].text);
      expect(data.hallucinationDetected).toBe(true);
    });

    test("should NOT flag Python built-ins", async () => {
      const result = await validateCodeTool.handler({
        projectPath: `${testProjectPath}/python`,
        newCode: `
print("hello")
length = len([1, 2, 3])
numbers = list(range(10))
text = str(42)
        `,
        language: "python",
      });

      const data = JSON.parse(result.content[0].text);
      expect(data.score).toBe(100);
    });
  });

  describe("Performance", () => {
    test("should complete within reasonable time for large codebase", async () => {
      const start = Date.now();

      await validateCodeTool.handler({
        projectPath: testProjectPath,
        newCode: `
          const a = getUserById("1");
          const b = createUser("test", "test@test.com");
          const c = deleteUser("2");
          const d = formatDate(new Date());
        `,
        language: "typescript",
      });

      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(5000); // Should complete in under 5 seconds
    });
  });
});
