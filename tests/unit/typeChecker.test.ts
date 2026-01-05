/**
 * Unit tests for Type Consistency Checker
 */

import { checkTypeConsistency } from '../../src/analyzers/typeChecker';
import { SymbolTable } from '../../src/types/tools';

describe('Type Consistency Checker', () => {
  const mockSymbolTable: SymbolTable = {
    functions: ['myFunction'],
    classes: ['MyClass'],
    variables: ['myVar'],
    imports: [],
    dependencies: [],
  };

  describe('TypeScript Type Checking', () => {
    it('should detect usage of any type', async () => {
      const code = `
        function process(data: any): any {
          return data;
        }
      `;

      const issues = await checkTypeConsistency(code, mockSymbolTable, 'typescript');

      const anyIssues = issues.filter(i => i.type === 'typeMismatch');
      expect(anyIssues.length).toBeGreaterThan(0);
      expect(anyIssues[0].message).toContain('any');
    });

    it('should detect missing return types', async () => {
      const code = `
        function calculate(x, y) {
          return x + y;
        }
      `;

      const issues = await checkTypeConsistency(code, mockSymbolTable, 'typescript');

      const returnTypeIssues = issues.filter(i => i.type === 'missingReturnType');
      expect(returnTypeIssues.length).toBeGreaterThan(0);
    });

    it('should detect implicit any parameters', async () => {
      const code = `
        const handler = (data) => {
          return data.value;
        };
      `;

      const issues = await checkTypeConsistency(code, mockSymbolTable, 'typescript');

      const implicitAnyIssues = issues.filter(i => i.type === 'implicitAny');
      expect(implicitAnyIssues.length).toBeGreaterThan(0);
    });

    it('should not flag properly typed code', async () => {
      const code = `
        function calculate(x: number, y: number): number {
          return x + y;
        }
        
        const handler = (data: string): void => {
          console.log(data);
        };
      `;

      const issues = await checkTypeConsistency(code, mockSymbolTable, 'typescript');

      // Should have minimal or no issues
      expect(issues.length).toBeLessThanOrEqual(1);
    });
  });

  describe('Non-TypeScript Languages', () => {
    it('should skip type checking for JavaScript', async () => {
      const code = `
        function calculate(x, y) {
          return x + y;
        }
      `;

      const issues = await checkTypeConsistency(code, mockSymbolTable, 'javascript');

      // JavaScript doesn't have type checking
      expect(issues.length).toBe(0);
    });

    it('should skip type checking for Python', async () => {
      const code = `
def calculate(x, y):
    return x + y
      `;

      const issues = await checkTypeConsistency(code, mockSymbolTable, 'python');

      expect(issues.length).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty code', async () => {
      const issues = await checkTypeConsistency('', mockSymbolTable, 'typescript');
      expect(issues.length).toBe(0);
    });

    it('should handle code with multiple type issues', async () => {
      const code = `
        function process(data: any) {
          const result: any = data;
          const handler = (x) => x;
          return result;
        }
      `;

      const issues = await checkTypeConsistency(code, mockSymbolTable, 'typescript');

      expect(issues.length).toBeGreaterThan(1);
    });
  });
});
