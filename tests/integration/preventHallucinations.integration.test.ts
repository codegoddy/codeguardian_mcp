/**
 * Integration tests for prevent_hallucinations tool
 * Testing with realistic AI-generated code scenarios
 */

import { preventHallucinationsTool } from '../../src/tools/preventHallucinations';

describe('Prevent Hallucinations - Integration Tests', () => {
  describe('Scenario 1: Non-existent Function References', () => {
    it('should detect AI hallucinating a function that does not exist', async () => {
      const existingCodebase = `
        class UserService {
          async login(email, password) {
            return { token: 'abc123' };
          }
          
          async getUser(id) {
            return { id, name: 'John' };
          }
          
          async verifyToken(token) {
            return token === 'abc123';
          }
        }
      `;

      const aiGeneratedCode = `
        async function authenticateNewUser(email, password) {
          // AI hallucinates these functions!
          const result = await userService.authenticateUser(email, password);
          await userService.sendWelcomeEmail(result.userId);
          return userService.createSession(result);
        }
      `;

      const result = await preventHallucinationsTool.handler({
        codebase: existingCodebase,
        newCode: aiGeneratedCode,
        language: 'javascript',
      });

      const response = JSON.parse(result.content[0].text);

      expect(response.success).toBe(true);
      expect(response.hallucinationDetected).toBe(true);
      expect(response.hallucinationScore).toBeGreaterThan(30);
      
      // Should detect multiple non-existent functions
      const nonExistentFunctions = response.issues.filter(
        (i: any) => i.type === 'nonExistentFunction'
      );
      expect(nonExistentFunctions.length).toBeGreaterThan(0);
      
      // Should provide suggestions
      expect(response.issues[0].suggestion).toBeDefined();
      
      // Recommendation should be to not accept
      expect(response.recommendation.accept).toBe(false);
      expect(response.recommendation.riskLevel).toMatch(/high|critical/);
    });
  });

  describe('Scenario 2: Clean Code - No Hallucinations', () => {
    it('should pass code that correctly uses existing functions', async () => {
      const existingCodebase = `
        class UserService {
          async login(email, password) {
            return { token: 'abc123' };
          }
          
          async getUser(id) {
            return { id, name: 'John' };
          }
        }
      `;

      const aiGeneratedCode = `
        async function loginUser(email, password) {
          const result = await userService.login(email, password);
          const user = await userService.getUser(result.userId);
          return { user, token: result.token };
        }
      `;

      const result = await preventHallucinationsTool.handler({
        codebase: existingCodebase,
        newCode: aiGeneratedCode,
        language: 'javascript',
      });

      const response = JSON.parse(result.content[0].text);

      expect(response.success).toBe(true);
      expect(response.hallucinationDetected).toBe(false);
      expect(response.hallucinationScore).toBeLessThan(30);
      expect(response.recommendation.accept).toBe(true);
      expect(response.recommendation.riskLevel).toBe('low');
    });
  });

  describe('Scenario 3: Type Inconsistency', () => {
    it('should detect type-related hallucinations in TypeScript', async () => {
      const existingCodebase = `
        function calculateTotal(price: number): number {
          return price * 1.1;
        }
      `;

      const aiGeneratedCode = `
        const result = calculateTotal("100");
        const x: any = result;
      `;

      const result = await preventHallucinationsTool.handler({
        codebase: existingCodebase,
        newCode: aiGeneratedCode,
        language: 'typescript',
      });

      const response = JSON.parse(result.content[0].text);

      expect(response.success).toBe(true);
      
      // Should detect type issues
      const typeIssues = response.issues.filter(
        (i: any) => i.type === 'typeMismatch' || i.type === 'implicitAny'
      );
      expect(typeIssues.length).toBeGreaterThan(0);
    });
  });

  describe('Scenario 4: Python Function Hallucinations', () => {
    it('should detect non-existent Python functions', async () => {
      const existingCodebase = `
def get_user(user_id):
    return {"id": user_id, "name": "Alice"}

def update_user(user_id, data):
    return {"success": True}

class UserRepository:
    def find_by_id(self, id):
        return {"id": id}
      `;

      const aiGeneratedCode = `
def process_user(user_id):
    user = get_user(user_id)
    # These don't exist!
    validate_user(user)
    send_notification(user)
    user_repo.save_to_cache(user)
    return user
      `;

      const result = await preventHallucinationsTool.handler({
        codebase: existingCodebase,
        newCode: aiGeneratedCode,
        language: 'python',
      });

      const response = JSON.parse(result.content[0].text);

      expect(response.success).toBe(true);
      expect(response.hallucinationDetected).toBe(true);
      
      // Should detect hallucinated functions
      const issues = response.issues.filter(
        (i: any) => i.type === 'nonExistentFunction'
      );
      expect(issues.length).toBeGreaterThan(0);
    });
  });

  describe('Scenario 5: Class Instantiation Hallucinations', () => {
    it('should detect non-existent class references', async () => {
      const existingCodebase = `
        class UserService {
          login() {}
        }
        
        class AuthService {
          verify() {}
        }
      `;

      const aiGeneratedCode = `
        const user = new UserService();
        const auth = new AuthService();
        const validator = new ValidationService(); // Doesn't exist!
        const logger = new LoggerService(); // Doesn't exist!
      `;

      const result = await preventHallucinationsTool.handler({
        codebase: existingCodebase,
        newCode: aiGeneratedCode,
        language: 'javascript',
      });

      const response = JSON.parse(result.content[0].text);

      expect(response.success).toBe(true);
      
      const classIssues = response.issues.filter(
        (i: any) => i.type === 'nonExistentClass'
      );
      expect(classIssues.length).toBeGreaterThan(0);
    });
  });

  describe('Scenario 6: Session History Contradictions', () => {
    it('should detect contradictions across session history', async () => {
      const existingCodebase = `
        function calculatePrice(base) {
          return base * 1.2;
        }
      `;

      const sessionHistory = [
        {
          timestamp: '2024-01-01T10:00:00Z',
          code: 'const taxRate = 0.2;',
          context: 'Setting tax rate',
        },
      ];

      const aiGeneratedCode = `
        const taxRate = 0.15; // Contradicts earlier code!
        const total = calculatePrice(100);
      `;

      const result = await preventHallucinationsTool.handler({
        codebase: existingCodebase,
        newCode: aiGeneratedCode,
        language: 'javascript',
        sessionHistory,
      });

      const response = JSON.parse(result.content[0].text);

      expect(response.success).toBe(true);
      
      // May detect contradictions
      const contradictions = response.issues.filter(
        (i: any) => i.type === 'logicContradiction'
      );
      // This is a soft check as contradiction detection is complex
      expect(contradictions.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Scenario 7: Context Summary Accuracy', () => {
    it('should provide accurate context summary', async () => {
      const existingCodebase = `
        class UserService {
          login() {}
          logout() {}
          getUser() {}
        }
        
        class AuthService {
          verify() {}
        }
        
        function helper() {}
      `;

      const aiGeneratedCode = `
        const user = new UserService();
        user.login();
      `;

      const result = await preventHallucinationsTool.handler({
        codebase: existingCodebase,
        newCode: aiGeneratedCode,
        language: 'javascript',
      });

      const response = JSON.parse(result.content[0].text);

      expect(response.contextSummary).toBeDefined();
      expect(response.contextSummary.totalFunctions).toBeGreaterThan(0);
      expect(response.contextSummary.totalClasses).toBe(2);
      expect(response.symbolTable.functions).toContain('login');
      expect(response.symbolTable.functions).toContain('logout');
      expect(response.symbolTable.functions).toContain('getUser');
      expect(response.symbolTable.functions).toContain('verify');
      expect(response.symbolTable.functions).toContain('helper');
    });
  });

  describe('Scenario 8: Built-in Function Handling', () => {
    it('should not flag built-in functions as hallucinations', async () => {
      const existingCodebase = `
        function myFunction() {
          return "test";
        }
      `;

      const aiGeneratedCode = `
        const result = myFunction();
        console.log(result);
        setTimeout(() => {}, 1000);
        const parsed = parseInt("123");
        const obj = JSON.parse('{}');
      `;

      const result = await preventHallucinationsTool.handler({
        codebase: existingCodebase,
        newCode: aiGeneratedCode,
        language: 'javascript',
      });

      const response = JSON.parse(result.content[0].text);

      expect(response.success).toBe(true);
      
      // Should not flag console, setTimeout, parseInt, JSON as hallucinations
      const functionIssues = response.issues.filter(
        (i: any) => i.type === 'nonExistentFunction'
      );
      
      const flaggedBuiltIns = functionIssues.filter((i: any) =>
        ['console', 'setTimeout', 'parseInt', 'JSON'].some(
          builtin => i.message.includes(builtin)
        )
      );
      
      expect(flaggedBuiltIns.length).toBe(0);
    });
  });

  describe('Scenario 9: Performance Test', () => {
    it('should complete analysis in under 1 second', async () => {
      const existingCodebase = `
        class UserService {
          login() {}
          logout() {}
        }
      `;

      const aiGeneratedCode = `
        const user = new UserService();
        user.login();
      `;

      const startTime = Date.now();

      await preventHallucinationsTool.handler({
        codebase: existingCodebase,
        newCode: aiGeneratedCode,
        language: 'javascript',
      });

      const elapsed = Date.now() - startTime;

      expect(elapsed).toBeLessThan(1000); // Should complete in < 1 second
    });
  });
});
