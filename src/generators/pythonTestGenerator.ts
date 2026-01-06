/**
 * Test Generator for Python
 * 
 * Generates comprehensive unit tests for Python code
 */

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
 * Generate tests for Python code
 */
export async function generatePythonTests(
  code: string,
  options: {
    framework?: string;
    includeEdgeCases?: boolean;
    generateIntegrationTests?: boolean;
  } = {}
): Promise<GeneratedTests> {
  const framework = options.framework || 'pytest';
  const includeEdgeCases = options.includeEdgeCases !== false;
  const generateIntegrationTests = options.generateIntegrationTests || false;

  logger.debug('Generating Python tests...');

  try {
    // Extract functions from Python code
    const functions = extractPythonFunctions(code);

    // Generate test cases
    const testCases: TestCase[] = [];
    const imports: string[] = [];

    // Add framework imports
    if (framework === 'pytest') {
      imports.push('import pytest');
    } else if (framework === 'unittest') {
      imports.push('import unittest');
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
    logger.error('Error generating Python tests:', error);
    throw error;
  }
}

/**
 * Extract functions from Python code
 */
function extractPythonFunctions(code: string): Array<{
  name: string;
  params: string[];
  isAsync: boolean;
  line: number;
}> {
  const functions: Array<{
    name: string;
    params: string[];
    isAsync: boolean;
    line: number;
  }> = [];

  const lines = code.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Match function definitions
    const funcMatch = trimmed.match(/^(?:(async)\s+)?def\s+(\w+)\s*\(([^)]*)\)/);
    if (funcMatch) {
      const isAsync = !!funcMatch[1];
      const name = funcMatch[2];
      const paramsStr = funcMatch[3];

      // Parse parameters
      const params = paramsStr
        .split(',')
        .map(p => p.trim().split(':')[0].split('=')[0].trim())
        .filter(p => p && p !== 'self' && p !== 'cls');

      functions.push({
        name,
        params,
        isAsync,
        line: i + 1,
      });
    }
  }

  return functions;
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
      return '"test"';
    } else if (param.includes('flag') || param.includes('is')) {
      return 'True';
    } else if (param.includes('list') || param.includes('arr')) {
      return '[]';
    } else if (param.includes('dict') || param.includes('data')) {
      return '{}';
    }
    return `param${idx}`;
  }).join(', ');

  let testCode: string;

  if (framework === 'pytest') {
    testCode = `
${asyncKeyword}def test_${func.name}_basic():
    """Test that ${func.name} executes successfully"""
    result = ${awaitKeyword}${func.name}(${sampleParams})
    assert result is not None`;
  } else {
    // unittest
    testCode = `
def test_${func.name}_basic(self):
    """Test that ${func.name} executes successfully"""
    result = ${func.name}(${sampleParams})
    self.assertIsNotNone(result)`;
  }

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

  if (framework === 'pytest') {
    // Test with None
    if (func.params.length > 0) {
      tests.push({
        name: `${func.name} - None input`,
        description: `Tests ${func.name} with None input`,
        type: 'edge-case',
        code: `
${asyncKeyword}def test_${func.name}_none_input():
    """Test ${func.name} with None input"""
    result = ${awaitKeyword}${func.name}(None)
    assert result is not None  # Or handle appropriately`,
      });
    }

    // Test with empty values
    if (func.params.some(p => p.includes('list') || p.includes('arr'))) {
      tests.push({
        name: `${func.name} - empty list`,
        description: `Tests ${func.name} with empty list`,
        type: 'edge-case',
        code: `
${asyncKeyword}def test_${func.name}_empty_list():
    """Test ${func.name} with empty list"""
    result = ${awaitKeyword}${func.name}([])
    assert result is not None`,
      });
    }

    if (func.params.some(p => p.includes('str') || p.includes('name'))) {
      tests.push({
        name: `${func.name} - empty string`,
        description: `Tests ${func.name} with empty string`,
        type: 'edge-case',
        code: `
${asyncKeyword}def test_${func.name}_empty_string():
    """Test ${func.name} with empty string"""
    result = ${awaitKeyword}${func.name}("")
    assert result is not None`,
      });
    }

    // Test with large values
    if (func.params.some(p => p.includes('num') || p.includes('count'))) {
      tests.push({
        name: `${func.name} - large number`,
        description: `Tests ${func.name} with large number`,
        type: 'edge-case',
        code: `
${asyncKeyword}def test_${func.name}_large_number():
    """Test ${func.name} with large number"""
    result = ${awaitKeyword}${func.name}(999999999)
    assert result is not None`,
      });
    }

    // Test with negative values
    if (func.params.some(p => p.includes('num') || p.includes('count'))) {
      tests.push({
        name: `${func.name} - negative number`,
        description: `Tests ${func.name} with negative number`,
        type: 'edge-case',
        code: `
${asyncKeyword}def test_${func.name}_negative_number():
    """Test ${func.name} with negative number"""
    result = ${awaitKeyword}${func.name}(-1)
    assert result is not None`,
      });
    }
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

  let testCode: string;

  if (framework === 'pytest') {
    testCode = `
${asyncKeyword}def test_${func.name}_integration():
    """Integration test for ${func.name}"""
    # Setup: Create necessary dependencies
    # TODO: Add actual integration setup
    
    result = ${awaitKeyword}${func.name}()
    
    # Verify integration behavior
    assert result is not None
    
    # Cleanup: Remove test data
    # TODO: Add cleanup logic`;
  } else {
    testCode = `
def test_${func.name}_integration(self):
    """Integration test for ${func.name}"""
    # Setup: Create necessary dependencies
    # TODO: Add actual integration setup
    
    result = ${func.name}()
    
    # Verify integration behavior
    self.assertIsNotNone(result)
    
    # Cleanup: Remove test data
    # TODO: Add cleanup logic`;
  }

  return {
    name: `${func.name} - integration test`,
    description: `Integration test for ${func.name}`,
    type: 'integration',
    code: testCode,
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
  // Convert file path to a Python module path
  const moduleName = sourceFileName.replace(/\.py$/, '').replace(/\//g, '.');
  lines.push(`from ${moduleName} import *`);
  lines.push('');

  // Add setup if needed
  if (generatedTests.setup) {
    if (generatedTests.framework === 'pytest') {
      lines.push('@pytest.fixture');
      lines.push('def setup():');
      lines.push(`    ${generatedTests.setup}`);
      lines.push('    yield');
      if (generatedTests.teardown) {
        lines.push(`    ${generatedTests.teardown}`);
      }
      lines.push('');
    }
  }

  // Add test cases
  for (const test of generatedTests.testCases) {
    lines.push(test.code);
    lines.push('');
  }

  return lines.join('\n');
}
