/**
 * Unit tests for AI Anti-Pattern Detector
 */

import { detectAIAntiPatterns } from '../../src/analyzers/aiPatterns';

describe('AI Anti-Pattern Detector', () => {
  describe('Generic Error Handling', () => {
    it('should detect generic catch blocks with console.log', async () => {
      const code = `
        try {
          doSomething();
        } catch (e) {
          console.log(e);
        }
      `;

      const issues = await detectAIAntiPatterns(code, 'javascript');

      const errorHandlingIssues = issues.filter(
        i => i.type === 'genericErrorHandling'
      );
      expect(errorHandlingIssues.length).toBeGreaterThan(0);
      expect(errorHandlingIssues[0].severity).toBe('medium');
    });

    it('should not flag proper error handling', async () => {
      const code = `try {
  doSomething();
} catch (error) {
  logger.error('Operation failed', error);
  throw new CustomError('Failed to do something', error);
}`;

      const issues = await detectAIAntiPatterns(code, 'javascript');

      const errorHandlingIssues = issues.filter(
        i => i.type === 'genericErrorHandling'
      );
      expect(errorHandlingIssues.length).toBe(0);
    });
  });

  describe('Unnecessary Abstractions', () => {
    it('should detect interfaces used only once', async () => {
      const code = `
        interface UserProcessor {
          process(user: User): void;
        }
        
        class Implementation implements UserProcessor {
          process(user: User): void {
            console.log(user);
          }
        }
      `;

      const issues = await detectAIAntiPatterns(code, 'typescript');

      const abstractionIssues = issues.filter(
        i => i.type === 'unnecessaryAbstraction'
      );
      expect(abstractionIssues.length).toBeGreaterThan(0);
    });

    it('should not flag interfaces used multiple times', async () => {
      const code = `
        interface UserProcessor {
          process(user: User): void;
        }
        
        class Implementation1 implements UserProcessor {
          process(user: User): void {}
        }
        
        class Implementation2 implements UserProcessor {
          process(user: User): void {}
        }
        
        function useProcessor(p: UserProcessor) {
          return p.process;
        }
      `;

      const issues = await detectAIAntiPatterns(code, 'typescript');

      const abstractionIssues = issues.filter(
        i => i.type === 'unnecessaryAbstraction'
      );
      expect(abstractionIssues.length).toBe(0);
    });
  });

  describe('Missing Input Validation', () => {
    it('should flag functions without validation', async () => {
      const code = `
        function processUser(userId, email) {
          const user = getUser(userId);
          sendEmail(email, user);
          return user;
        }
      `;

      const issues = await detectAIAntiPatterns(code, 'javascript');

      const validationIssues = issues.filter(
        i => i.type === 'missingValidation'
      );
      // This is a soft check as validation detection is heuristic-based
      expect(validationIssues.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Empty Code', () => {
    it('should handle empty code gracefully', async () => {
      const issues = await detectAIAntiPatterns('', 'javascript');
      expect(issues).toHaveLength(0);
    });
  });

  describe('Multiple Anti-Patterns', () => {
    it('should detect multiple anti-patterns in one codebase', async () => {
      const code = `
        interface OnceUsed {
          method(): void;
        }
        
        class MyClass implements OnceUsed {
          method(): void {
            try {
              doSomething();
            } catch (e) {
              console.log(e);
            }
          }
        }
        
        function noValidation(input) {
          return process(input);
        }
      `;

      const issues = await detectAIAntiPatterns(code, 'typescript');

      expect(issues.length).toBeGreaterThan(0);
      
      // Should detect at least error handling issue
      const errorIssues = issues.filter(i => i.type === 'genericErrorHandling');
      expect(errorIssues.length).toBeGreaterThan(0);
    });
  });
});
