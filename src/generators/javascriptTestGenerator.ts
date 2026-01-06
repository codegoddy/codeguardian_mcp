/**
 * Strip TypeScript types to make code parseable by Acorn
 */
function stripTypeScriptTypes(code: string): string {
  let cleaned = code;
  
  // Remove interface declarations (multi-line)
  cleaned = cleaned.replace(/interface\s+\w+\s*\{[\s\S]*?\}/g, '');
  
  // Remove type aliases
  cleaned = cleaned.replace(/type\s+\w+\s*=\s*[^;]+;/g, '');
  
  // Remove type annotations from function parameters
  // Match : Type but not => (arrow functions)
  cleaned = cleaned.replace(/:\s*([\w\[\]<>|&]+)(?=\s*[,)=])/g, '');
  
  // Remove return type annotations from functions
  // Match ): Type { but preserve the parenthesis and brace
  cleaned = cleaned.replace(/\)\s*:\s*[\w\[\]<>|&]+\s*(?=\{)/g, ') ');
  
  // Remove generic type parameters from function declarations
  // Match <T> or <T, U> but not comparison operators
  cleaned = cleaned.replace(/\bfunction\s+\w+\s*<[^>]+>/g, (match) => {
    return match.replace(/<[^>]+>/, '');
  });
  
  // Remove 'as' type assertions
  cleaned = cleaned.replace(/\s+as\s+\w+/g, '');
  
  // Remove readonly, public, private, protected modifiers
  cleaned = cleaned.replace(/\b(readonly|public|private|protected)\s+/g, '');
  
  return cleaned;
}

/**
 * Test Generator for JavaScript/TypeScript
 * 
 * Generates comprehensive unit tests using AST analysis
 */

import * as acorn from 'acorn';
import * as walk from 'acorn-walk';
import { logger } from '../utils/logger.js';

export interface TestCase {
  name: string;
  description: string;
  type: 'unit' | 'integration' | 'edge-case';
  code: string;
  setup?: string;
  teardown?: string;
}

export interface GeneratedTests {
  framework: string;
  imports: string[];
  testCases: TestCase[];
  setup?: string;
  teardown?: string;
}

/**
 * Generate tests for JavaScript/TypeScript code
 */
export async function generateJavaScriptTests(
  code: string,
  options: {
    framework?: string;
    includeEdgeCases?: boolean;
    generateIntegrationTests?: boolean;
  } = {}
): Promise<GeneratedTests> {
  const framework = options.framework || 'jest';
  const includeEdgeCases = options.includeEdgeCases !== false;
  const generateIntegrationTests = options.generateIntegrationTests || false;

  logger.debug('Generating JavaScript/TypeScript tests...');

  try {
    // Strip TypeScript types for parsing
    const cleanedCode = stripTypeScriptTypes(code);
    
    // Parse code into AST
    const ast = acorn.parse(cleanedCode, {
      ecmaVersion: 2022,
      sourceType: 'module',
      locations: true,
    });

    const functions: Array<{
      name: string;
      params: string[];
      isAsync: boolean;
      line: number;
    }> = [];

    // Extract functions from AST
    walk.simple(ast as any, {
      FunctionDeclaration(node: any) {
        functions.push({
          name: node.id?.name || 'anonymous',
          params: node.params.map((p: any) => p.name || 'param'),
          isAsync: node.async || false,
          line: node.loc?.start.line || 0,
        });
      },
      VariableDeclarator(node: any) {
        if (
          node.init &&
          (node.init.type === 'FunctionExpression' ||
            node.init.type === 'ArrowFunctionExpression')
        ) {
          functions.push({
            name: node.id?.name || 'anonymous',
            params: node.init.params.map((p: any) => p.name || 'param'),
            isAsync: node.init.async || false,
            line: node.loc?.start.line || 0,
          });
        }
      },
    });

    // Generate test cases
    const testCases: TestCase[] = [];
    const imports: string[] = [];

    // Add framework imports
    if (framework === 'jest') {
      imports.push("import { describe, it, expect } from '@jest/globals';");
    } else if (framework === 'mocha') {
      imports.push("import { describe, it } from 'mocha';");
      imports.push("import { expect } from 'chai';");
    }

    // Generate tests for each function
    for (const func of functions) {
      // Basic unit test
      testCases.push(generateBasicTest(func, framework));

      // Edge case tests
      if (includeEdgeCases) {
        testCases.push(...generateEdgeCaseTests(func, framework));
      }

      // Integration tests
      if (generateIntegrationTests) {
        testCases.push(generateIntegrationTest(func, framework));
      }
    }

    logger.debug(`Generated ${testCases.length} test cases`);

    return {
      framework,
      imports,
      testCases,
    };
  } catch (error) {
    logger.error('Error generating JavaScript tests:', error);
    throw error;
  }
}

/**
 * Generate a basic unit test for a function
 */
function generateBasicTest(
  func: { name: string; params: string[]; isAsync: boolean },
  framework: string
): TestCase {
  const asyncKeyword = func.isAsync ? 'async ' : '';
  const awaitKeyword = func.isAsync ? 'await ' : '';
  
  // Generate sample parameters
  const sampleParams = func.params.map((param, idx) => {
    if (param.includes('count') || param.includes('num') || param.includes('id')) {
      return '1';
    } else if (param.includes('name') || param.includes('str')) {
      return "'test'";
    } else if (param.includes('flag') || param.includes('is')) {
      return 'true';
    } else if (param.includes('arr') || param.includes('list')) {
      return '[]';
    } else if (param.includes('obj') || param.includes('data')) {
      return '{}';
    }
    return `param${idx}`;
  }).join(', ');

  const testCode = `
  it('should execute ${func.name} successfully', ${asyncKeyword}() => {
    const result = ${awaitKeyword}${func.name}(${sampleParams});
    expect(result).toBeDefined();
  });`;

  return {
    name: `${func.name} - basic execution`,
    description: `Tests that ${func.name} executes without errors`,
    type: 'unit',
    code: testCode,
  };
}

/**
 * Generate edge case tests for a function
 */
function generateEdgeCaseTests(
  func: { name: string; params: string[]; isAsync: boolean },
  framework: string
): TestCase[] {
  const tests: TestCase[] = [];
  const asyncKeyword = func.isAsync ? 'async ' : '';
  const awaitKeyword = func.isAsync ? 'await ' : '';

  // Test with null/undefined
  if (func.params.length > 0) {
    tests.push({
      name: `${func.name} - null input`,
      description: `Tests ${func.name} with null input`,
      type: 'edge-case',
      code: `
  it('should handle null input', ${asyncKeyword}() => {
    expect(${asyncKeyword}() => ${awaitKeyword}${func.name}(null)).not.toThrow();
  });`,
    });

    tests.push({
      name: `${func.name} - undefined input`,
      description: `Tests ${func.name} with undefined input`,
      type: 'edge-case',
      code: `
  it('should handle undefined input', ${asyncKeyword}() => {
    expect(${asyncKeyword}() => ${awaitKeyword}${func.name}(undefined)).not.toThrow();
  });`,
    });
  }

  // Test with empty values
  if (func.params.some(p => p.includes('arr') || p.includes('list'))) {
    tests.push({
      name: `${func.name} - empty array`,
      description: `Tests ${func.name} with empty array`,
      type: 'edge-case',
      code: `
  it('should handle empty array', ${asyncKeyword}() => {
    const result = ${awaitKeyword}${func.name}([]);
    expect(result).toBeDefined();
  });`,
    });
  }

  if (func.params.some(p => p.includes('str') || p.includes('name'))) {
    tests.push({
      name: `${func.name} - empty string`,
      description: `Tests ${func.name} with empty string`,
      type: 'edge-case',
      code: `
  it('should handle empty string', ${asyncKeyword}() => {
    const result = ${awaitKeyword}${func.name}('');
    expect(result).toBeDefined();
  });`,
    });
  }

  // Test with large values
  if (func.params.some(p => p.includes('num') || p.includes('count'))) {
    tests.push({
      name: `${func.name} - large number`,
      description: `Tests ${func.name} with large number`,
      type: 'edge-case',
      code: `
  it('should handle large numbers', ${asyncKeyword}() => {
    const result = ${awaitKeyword}${func.name}(Number.MAX_SAFE_INTEGER);
    expect(result).toBeDefined();
  });`,
    });
  }

  return tests;
}

/**
 * Generate an integration test for a function
 */
function generateIntegrationTest(
  func: { name: string; params: string[]; isAsync: boolean },
  framework: string
): TestCase {
  const asyncKeyword = func.isAsync ? 'async ' : '';
  const awaitKeyword = func.isAsync ? 'await ' : '';

  return {
    name: `${func.name} - integration test`,
    description: `Integration test for ${func.name}`,
    type: 'integration',
    code: `
  it('should integrate with other components', ${asyncKeyword}() => {
    // Setup: Create necessary dependencies
    // TODO: Add actual integration setup
    
    const result = ${awaitKeyword}${func.name}();
    
    // Verify integration behavior
    expect(result).toBeDefined();
    
    // Cleanup: Remove test data
    // TODO: Add cleanup logic
  });`,
  };
}

/**
 * Format generated tests into a complete test file
 */
export function formatTestFile(
  generatedTests: GeneratedTests,
  sourceFileName: string
): string {
  const lines: string[] = [];

  // Add imports
  lines.push(...generatedTests.imports);
  lines.push('');

  // Import the module being tested
  const moduleName = sourceFileName.replace(/\.(js|ts)$/, '');
  lines.push(`import * as module from './${moduleName}';`);
  lines.push('');

  // Group tests by function
  const testsByFunction = new Map<string, TestCase[]>();
  for (const test of generatedTests.testCases) {
    const funcName = test.name.split(' - ')[0];
    if (!testsByFunction.has(funcName)) {
      testsByFunction.set(funcName, []);
    }
    testsByFunction.get(funcName)!.push(test);
  }

  // Generate describe blocks
  for (const [funcName, tests] of testsByFunction) {
    lines.push(`describe('${funcName}', () => {`);
    
    // Add setup if needed
    if (generatedTests.setup) {
      lines.push('  beforeEach(() => {');
      lines.push(`    ${generatedTests.setup}`);
      lines.push('  });');
      lines.push('');
    }

    // Add test cases
    for (const test of tests) {
      lines.push(test.code);
    }

    // Add teardown if needed
    if (generatedTests.teardown) {
      lines.push('');
      lines.push('  afterEach(() => {');
      lines.push(`    ${generatedTests.teardown}`);
      lines.push('  });');
    }

    lines.push('});');
    lines.push('');
  }

  return lines.join('\n');
}
