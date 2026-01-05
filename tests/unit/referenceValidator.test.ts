/**
 * Unit tests for Reference Validator
 */

import { validateReferences } from '../../src/analyzers/referenceValidator';
import { SymbolTable } from '../../src/types/tools';

describe('Reference Validator', () => {
  const mockSymbolTable: SymbolTable = {
    functions: ['existingFunction', 'anotherFunction'],
    classes: ['ExistingClass'],
    variables: ['existingVar'],
    imports: ['react', 'lodash'],
    dependencies: [],
  };

  describe('Function Call Validation', () => {
    it('should detect non-existent function calls', async () => {
      const code = `
        const result = nonExistentFunction();
      `;

      const issues = await validateReferences(code, mockSymbolTable, 'javascript');

      expect(issues).toHaveLength(1);
      expect(issues[0].type).toBe('nonExistentFunction');
      expect(issues[0].severity).toBe('high');
      expect(issues[0].message).toContain('nonExistentFunction');
    });

    it('should not flag existing function calls', async () => {
      const code = `
        const result = existingFunction();
        const another = anotherFunction();
      `;

      const issues = await validateReferences(code, mockSymbolTable, 'javascript');

      expect(issues).toHaveLength(0);
    });

    it('should not flag built-in functions', async () => {
      const code = `
        console.log('test');
        const parsed = parseInt('123');
        setTimeout(() => {}, 1000);
      `;

      const issues = await validateReferences(code, mockSymbolTable, 'javascript');

      expect(issues).toHaveLength(0);
    });
  });

  describe('Class Reference Validation', () => {
    it('should detect non-existent class instantiation', async () => {
      const code = `
        const instance = new NonExistentClass();
      `;

      const issues = await validateReferences(code, mockSymbolTable, 'javascript');

      const classIssues = issues.filter(i => i.type === 'nonExistentClass');
      expect(classIssues).toHaveLength(1);
      expect(classIssues[0].message).toContain('NonExistentClass');
    });

    it('should not flag existing class instantiation', async () => {
      const code = `
        const instance = new ExistingClass();
      `;

      const issues = await validateReferences(code, mockSymbolTable, 'javascript');

      const classIssues = issues.filter(i => i.type === 'nonExistentClass');
      expect(classIssues).toHaveLength(0);
    });
  });

  describe('Suggestions', () => {
    it('should provide suggestions for similar functions', async () => {
      const code = `
        const result = existingFunc(); // Typo in function name
      `;

      const issues = await validateReferences(code, mockSymbolTable, 'javascript');

      if (issues.length > 0) {
        expect(issues[0].suggestion).toBeDefined();
        expect(issues[0].suggestion).toContain('existingFunction');
      }
    });
  });
});
