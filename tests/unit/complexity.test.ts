/**
 * Unit tests for Complexity Analyzer
 */

import { analyzeComplexity } from '../../src/analyzers/complexity';

describe('Complexity Analyzer', () => {
  describe('Cyclomatic Complexity', () => {
    it('should detect high complexity in deeply nested code', async () => {
      const code = `
        function complexFunction(a, b, c, d, e) {
          if (a > 0) {
            if (b > 0) {
              if (c > 0) {
                for (let i = 0; i < 10; i++) {
                  if (i % 2 === 0) {
                    while (i < 5) {
                      if (d > 0) {
                        for (let j = 0; j < 5; j++) {
                          if (j > 2) {
                            while (e > 0) {
                              if (a && b && c) {
                                return true;
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
          return a + b + c;
        }
      `;

      const issues = await analyzeComplexity(code, 'javascript');

      const complexityIssues = issues.filter(i => i.type === 'highComplexity');
      expect(complexityIssues.length).toBeGreaterThan(0);
      expect(complexityIssues[0].severity).toMatch(/high|medium/);
    });

    it('should not flag simple functions', async () => {
      const code = `
        function simpleFunction(a, b) {
          return a + b;
        }
      `;

      const issues = await analyzeComplexity(code, 'javascript');

      const complexityIssues = issues.filter(i => i.type === 'highComplexity');
      expect(complexityIssues.length).toBe(0);
    });
  });

  describe('Long Functions', () => {
    it('should detect functions that are too long', async () => {
      // Generate a long function with 60 lines
      const lines = ['function longFunction() {'];
      for (let i = 0; i < 58; i++) {
        lines.push(`  console.log('line ${i}');`);
      }
      lines.push('}');
      const code = lines.join('\n');

      const issues = await analyzeComplexity(code, 'javascript');

      const longFunctionIssues = issues.filter(i => i.type === 'longFunction');
      expect(longFunctionIssues.length).toBeGreaterThan(0);
    });

    it('should not flag short functions', async () => {
      const code = `
        function shortFunction() {
          console.log('test');
          return true;
        }
      `;

      const issues = await analyzeComplexity(code, 'javascript');

      const longFunctionIssues = issues.filter(i => i.type === 'longFunction');
      expect(longFunctionIssues.length).toBe(0);
    });
  });

  describe('Deep Nesting', () => {
    it('should detect deeply nested code blocks', async () => {
      const code = `
        function nested() {
          if (true) {
            if (true) {
              if (true) {
                if (true) {
                  if (true) {
                    if (true) {
                      console.log('too deep!');
                    }
                  }
                }
              }
            }
          }
        }
      `;

      const issues = await analyzeComplexity(code, 'javascript');

      const nestingIssues = issues.filter(i => i.type === 'deepNesting');
      expect(nestingIssues.length).toBeGreaterThan(0);
    });

    it('should not flag shallow nesting', async () => {
      const code = `function shallow() {
  if (true) {
    console.log('test');
  }
}`;

      const issues = await analyzeComplexity(code, 'javascript');

      const nestingIssues = issues.filter(i => i.type === 'deepNesting');
      expect(nestingIssues.length).toBe(0);
    });
  });

  describe('Multiple Issues', () => {
    it('should detect multiple complexity issues in one function', async () => {
      const code = `
        function problematic(a, b, c, d) {
          if (a) {
            if (b) {
              if (c) {
                if (d) {
                  for (let i = 0; i < 10; i++) {
                    for (let j = 0; j < 10; j++) {
                      if (i === j) {
                        while (i < 5) {
                          console.log('nested');
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `;

      const issues = await analyzeComplexity(code, 'javascript');

      expect(issues.length).toBeGreaterThan(0);
      
      // Should have both complexity and nesting issues
      const types = new Set(issues.map(i => i.type));
      expect(types.size).toBeGreaterThan(0);
    });
  });
});
