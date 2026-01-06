/**
 * Generate Tests Tool
 * 
 * Automatically generate comprehensive tests for AI-generated code
 */

import { ToolDefinition } from '../types/tools.js';
import { logger } from '../utils/logger.js';
import { generateJavaScriptTests, formatTestFile as formatJSTestFile } from '../generators/javascriptTestGenerator.js';
import { generatePythonTests, formatTestFile as formatPyTestFile } from '../generators/pythonTestGenerator.js';

export const generateTestsTool: ToolDefinition = {
  definition: {
    name: 'generate_tests',
    description: 'Automatically generate comprehensive tests for AI-generated code, including edge cases',
    inputSchema: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'Code to generate tests for',
        },
        language: {
          type: 'string',
          enum: ['javascript', 'typescript', 'python', 'go', 'java'],
        },
        fileName: {
          type: 'string',
          description: 'Source file name (for generating test file name)',
        },
        testFramework: {
          type: 'string',
          description: 'Test framework to use (auto-detected if not specified)',
        },
        options: {
          type: 'object',
          properties: {
            generateUnitTests: { type: 'boolean' },
            generateIntegrationTests: { type: 'boolean' },
            includeEdgeCases: { type: 'boolean' },
            coverageTarget: { type: 'number', minimum: 0, maximum: 100 },
          },
        },
      },
      required: ['code', 'language'],
    },
  },

  async handler(args: any) {
    const startTime = Date.now();
    logger.info('Starting test generation...');

    const {
      code,
      language,
      fileName = 'module',
      testFramework = 'auto',
      options = {},
    } = args;

    const opts = {
      generateUnitTests: true,
      generateIntegrationTests: false,
      includeEdgeCases: true,
      coverageTarget: 80,
      ...options,
    };

    try {
      let generatedTests;
      let testFileContent: string;
      let testFileName: string;
      let framework: string;

      // Generate tests based on language
      if (language === 'javascript' || language === 'typescript') {
        framework = testFramework === 'auto' ? 'jest' : testFramework;
        generatedTests = await generateJavaScriptTests(code, {
          framework,
          includeEdgeCases: opts.includeEdgeCases,
          generateIntegrationTests: opts.generateIntegrationTests,
        });
        testFileContent = formatJSTestFile(generatedTests, fileName);
        testFileName = fileName.replace(/\.(js|ts)$/, '') + '.test.' + (language === 'typescript' ? 'ts' : 'js');
      } else if (language === 'python') {
        framework = testFramework === 'auto' ? 'pytest' : testFramework;
        generatedTests = await generatePythonTests(code, {
          framework,
          includeEdgeCases: opts.includeEdgeCases,
          generateIntegrationTests: opts.generateIntegrationTests,
        });
        testFileContent = formatPyTestFile(generatedTests, fileName);
        testFileName = 'test_' + fileName.replace(/\.py$/, '') + '.py';
      } else {
        throw new Error(`Test generation not yet implemented for ${language}`);
      }

      // Calculate estimated coverage
      const estimatedCoverage = calculateEstimatedCoverage(generatedTests.testCases, code);

      // Analyze test quality
      const testQuality = analyzeTestQuality(generatedTests.testCases);

      // Get required dependencies
      const dependencies = getRequiredDependencies(framework, language);

      const elapsedTime = Date.now() - startTime;
      logger.info(`Test generation completed in ${elapsedTime}ms`);

      const result = {
        success: true,
        tests: {
          fileName: testFileName,
          content: testFileContent,
          framework: generatedTests.framework,
          lineCount: testFileContent.split('\n').length,
        },
        testCases: generatedTests.testCases.map(tc => ({
          name: tc.name,
          description: tc.description,
          type: tc.type,
        })),
        summary: {
          totalTests: generatedTests.testCases.length,
          unitTests: generatedTests.testCases.filter(tc => tc.type === 'unit').length,
          edgeCaseTests: generatedTests.testCases.filter(tc => tc.type === 'edge-case').length,
          integrationTests: generatedTests.testCases.filter(tc => tc.type === 'integration').length,
        },
        coverage: {
          estimated: estimatedCoverage,
          target: opts.coverageTarget,
          meetsTarget: estimatedCoverage >= opts.coverageTarget,
        },
        quality: testQuality,
        setupRequired: dependencies.length > 0 ? `Install: ${dependencies.join(', ')}` : 'None',
        dependencies,
        recommendations: generateRecommendations(generatedTests.testCases, estimatedCoverage, opts.coverageTarget),
        analysisTime: `${elapsedTime}ms`,
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      logger.error('Error in test generation:', error);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
            }, null, 2),
          },
        ],
        isError: true,
      };
    }
  },
};

/**
 * Calculate estimated code coverage
 */
function calculateEstimatedCoverage(testCases: any[], code: string): number {
  // Simple heuristic: more tests = better coverage
  const lines = code.split('\n').filter(l => l.trim() && !l.trim().startsWith('//')).length;
  const testCount = testCases.length;
  
  // Estimate: each test covers ~10 lines on average
  const estimatedCoveredLines = Math.min(testCount * 10, lines);
  const coverage = (estimatedCoveredLines / lines) * 100;
  
  return Math.min(100, Math.round(coverage));
}

/**
 * Analyze test quality
 */
function analyzeTestQuality(testCases: any[]): {
  score: number;
  strengths: string[];
  weaknesses: string[];
} {
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  let score = 70; // Base score

  // Check for edge case coverage
  const edgeCaseTests = testCases.filter(tc => tc.type === 'edge-case');
  if (edgeCaseTests.length > 0) {
    strengths.push(`Includes ${edgeCaseTests.length} edge case test(s)`);
    score += 10;
  } else {
    weaknesses.push('No edge case tests');
    score -= 10;
  }

  // Check for integration tests
  const integrationTests = testCases.filter(tc => tc.type === 'integration');
  if (integrationTests.length > 0) {
    strengths.push(`Includes ${integrationTests.length} integration test(s)`);
    score += 10;
  }

  // Check test count
  if (testCases.length >= 5) {
    strengths.push('Good test coverage');
    score += 10;
  } else if (testCases.length < 3) {
    weaknesses.push('Limited test coverage');
    score -= 10;
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    strengths,
    weaknesses,
  };
}

/**
 * Get required dependencies for testing
 */
function getRequiredDependencies(framework: string, language: string): string[] {
  const deps: string[] = [];

  if (language === 'javascript' || language === 'typescript') {
    if (framework === 'jest') {
      deps.push('jest', '@types/jest');
    } else if (framework === 'mocha') {
      deps.push('mocha', 'chai', '@types/mocha', '@types/chai');
    }
  } else if (language === 'python') {
    if (framework === 'pytest') {
      deps.push('pytest', 'pytest-cov');
    } else if (framework === 'unittest') {
      // unittest is built-in
    }
  }

  return deps;
}

/**
 * Generate recommendations for improving tests
 */
function generateRecommendations(
  testCases: any[],
  estimatedCoverage: number,
  targetCoverage: number
): string[] {
  const recommendations: string[] = [];

  if (estimatedCoverage < targetCoverage) {
    recommendations.push(
      `Add more tests to reach ${targetCoverage}% coverage target (currently ~${estimatedCoverage}%)`
    );
  }

  const edgeCaseTests = testCases.filter(tc => tc.type === 'edge-case');
  if (edgeCaseTests.length < 2) {
    recommendations.push('Consider adding more edge case tests for better robustness');
  }

  const integrationTests = testCases.filter(tc => tc.type === 'integration');
  if (integrationTests.length === 0) {
    recommendations.push('Consider adding integration tests to verify component interactions');
  }

  if (testCases.length < 3) {
    recommendations.push('Add more test cases to improve coverage and confidence');
  }

  if (recommendations.length === 0) {
    recommendations.push('Test suite looks comprehensive! Consider running with coverage tool to verify.');
  }

  return recommendations;
}
