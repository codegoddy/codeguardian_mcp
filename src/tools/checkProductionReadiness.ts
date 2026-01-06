/**
 * Check Production Readiness Tool
 * 
 * Holistic production readiness assessment covering quality, security, tests, and documentation
 */

import { ToolDefinition } from '../types/tools.js';
import { logger } from '../utils/logger.js';
import { scanForVulnerabilities, calculateSecurityScore } from '../analyzers/security/securityScanner.js';
import { analyzeComplexity } from '../analyzers/complexity.js';
import { detectAntiPatterns } from '../analyzers/antiPatternDetector.js';

export const checkProductionReadinessTool: ToolDefinition = {
  definition: {
    name: 'check_production_readiness',
    description: 'Holistic production readiness assessment covering quality, security, tests, and documentation',
    inputSchema: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'Codebase to check',
        },
        language: {
          type: 'string',
          enum: ['javascript', 'typescript', 'python', 'go', 'java'],
          description: 'Programming language',
        },
        projectName: {
          type: 'string',
          description: 'Project name',
        },
        checks: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['quality', 'security', 'tests', 'documentation', 'performance', 'all'],
          },
          description: 'Types of checks to perform',
        },
        strictMode: {
          type: 'boolean',
          description: 'Use strict production standards',
        },
      },
      required: ['code', 'language'],
    },
  },

  async handler(args: any) {
    const startTime = Date.now();
    logger.info('Starting production readiness check...');

    const {
      code,
      language,
      projectName = 'Project',
      checks = ['all'],
      strictMode = false,
    } = args;

    try {
      const shouldCheckAll = checks.includes('all');
      const breakdown: any = {};
      const blockers: string[] = [];
      const warnings: string[] = [];
      const checklist: Array<{ item: string; status: 'pass' | 'fail' | 'warning' }> = [];

      // 1. Quality Check
      if (shouldCheckAll || checks.includes('quality')) {
        logger.debug('Running quality checks...');
        const qualityResult = await checkQuality(code, language, strictMode);
        breakdown.quality = qualityResult;
        
        if (qualityResult.status === 'fail') {
          blockers.push(`Code quality score too low: ${qualityResult.score}/100`);
        } else if (qualityResult.status === 'warning') {
          warnings.push(`Code quality could be improved: ${qualityResult.score}/100`);
        }

        checklist.push({
          item: 'Code quality meets standards',
          status: qualityResult.status as 'pass' | 'fail' | 'warning',
        });
      }

      // 2. Security Check
      if (shouldCheckAll || checks.includes('security')) {
        logger.debug('Running security checks...');
        const securityResult = await checkSecurity(code, language, strictMode);
        breakdown.security = securityResult;
        
        if (securityResult.status === 'fail') {
          blockers.push(`Critical security vulnerabilities found: ${securityResult.critical} critical, ${securityResult.high} high`);
        } else if (securityResult.status === 'warning') {
          warnings.push(`Security vulnerabilities found: ${securityResult.vulnerabilities} total`);
        }

        checklist.push({
          item: 'No critical security vulnerabilities',
          status: securityResult.status as 'pass' | 'fail' | 'warning',
        });
      }

      // 3. Test Coverage Check
      if (shouldCheckAll || checks.includes('tests')) {
        logger.debug('Checking test coverage...');
        const testResult = checkTestCoverage(code, language, strictMode);
        breakdown.tests = testResult;
        
        if (testResult.status === 'fail') {
          blockers.push(`Test coverage too low: ${testResult.coverage}%`);
        } else if (testResult.status === 'warning') {
          warnings.push(`Test coverage below recommended: ${testResult.coverage}%`);
        }

        checklist.push({
          item: 'Adequate test coverage',
          status: testResult.status as 'pass' | 'fail' | 'warning',
        });
      }

      // 4. Documentation Check
      if (shouldCheckAll || checks.includes('documentation')) {
        logger.debug('Checking documentation...');
        const docResult = checkDocumentation(code, language, strictMode);
        breakdown.documentation = docResult;
        
        if (docResult.status === 'fail') {
          blockers.push('Critical documentation missing');
        } else if (docResult.status === 'warning') {
          warnings.push('Documentation could be improved');
        }

        checklist.push({
          item: 'Adequate documentation',
          status: docResult.status as 'pass' | 'fail' | 'warning',
        });
      }

      // 5. Performance Check
      if (shouldCheckAll || checks.includes('performance')) {
        logger.debug('Checking performance...');
        const perfResult = checkPerformance(code, language, strictMode);
        breakdown.performance = perfResult;
        
        if (perfResult.status === 'warning') {
          warnings.push('Performance issues detected');
        }

        checklist.push({
          item: 'No performance issues',
          status: perfResult.status as 'pass' | 'fail' | 'warning',
        });
      }

      // Calculate overall score
      const overallScore = calculateOverallScore(breakdown);
      const ready = blockers.length === 0 && overallScore >= (strictMode ? 85 : 70);

      // Generate recommendation
      const recommendation = generateRecommendation(
        ready,
        overallScore,
        blockers,
        warnings,
        breakdown,
        strictMode
      );

      const elapsedTime = Date.now() - startTime;
      logger.info(`Production readiness check completed in ${elapsedTime}ms`);

      const result = {
        success: true,
        ready,
        overallScore,
        breakdown,
        checklist,
        blockers,
        warnings,
        recommendation,
        timestamp: new Date().toISOString(),
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
      logger.error('Error in production readiness check:', error);
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
 * Check code quality
 */
async function checkQuality(code: string, language: string, strictMode: boolean) {
  try {
    const complexityIssues = await analyzeComplexity(code, language);
    const antiPatterns = await detectAntiPatterns(code, language);
    
    const totalIssues = complexityIssues.length + antiPatterns.length;
    const criticalIssues = [...complexityIssues, ...antiPatterns].filter(
      i => i.severity === 'critical' || i.severity === 'high'
    ).length;

    // Calculate score
    let score = 100;
    score -= criticalIssues * 10;
    score -= (totalIssues - criticalIssues) * 3;
    score = Math.max(0, score);

    const threshold = strictMode ? 85 : 70;
    const status = score >= threshold ? 'pass' : score >= 50 ? 'warning' : 'fail';

    return {
      score,
      status,
      issues: totalIssues,
      criticalIssues,
      details: {
        complexityIssues: complexityIssues.length,
        antiPatterns: antiPatterns.length,
      },
    };
  } catch (error) {
    logger.error('Error in quality check:', error);
    return {
      score: 50,
      status: 'warning' as const,
      issues: 0,
      criticalIssues: 0,
      details: {},
    };
  }
}

/**
 * Check security
 */
async function checkSecurity(code: string, language: string, strictMode: boolean) {
  try {
    const vulnerabilities = await scanForVulnerabilities(code, language);
    const score = calculateSecurityScore(vulnerabilities);

    const critical = vulnerabilities.filter(v => v.severity === 'critical').length;
    const high = vulnerabilities.filter(v => v.severity === 'high').length;
    const medium = vulnerabilities.filter(v => v.severity === 'medium').length;

    const threshold = strictMode ? 90 : 75;
    let status: 'pass' | 'warning' | 'fail';
    
    if (critical > 0 || high > 2) {
      status = 'fail';
    } else if (score < threshold) {
      status = 'warning';
    } else {
      status = 'pass';
    }

    return {
      score,
      status,
      vulnerabilities: vulnerabilities.length,
      critical,
      high,
      medium,
    };
  } catch (error) {
    logger.error('Error in security check:', error);
    return {
      score: 50,
      status: 'warning' as const,
      vulnerabilities: 0,
      critical: 0,
      high: 0,
      medium: 0,
    };
  }
}

/**
 * Check test coverage (heuristic)
 */
function checkTestCoverage(code: string, language: string, strictMode: boolean) {
  // Heuristic: Check for test-related keywords
  const testKeywords = ['test', 'describe', 'it(', 'expect', 'assert', 'should'];
  const hasTests = testKeywords.some(keyword => code.includes(keyword));

  // Estimate coverage based on test presence
  const coverage = hasTests ? 75 : 0;
  const threshold = strictMode ? 80 : 60;

  const status = coverage >= threshold ? 'pass' : coverage >= 40 ? 'warning' : 'fail';

  return {
    score: coverage,
    status,
    coverage,
    hasTests,
    recommendation: hasTests 
      ? 'Tests detected. Consider measuring actual coverage with a coverage tool.'
      : 'No tests detected. Add unit and integration tests.',
  };
}

/**
 * Check documentation (heuristic)
 */
function checkDocumentation(code: string, language: string, strictMode: boolean) {
  const lines = code.split('\n');
  let commentLines = 0;
  let codeLines = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (language === 'python') {
      if (trimmed.startsWith('#') || trimmed.startsWith('"""') || trimmed.startsWith("'''")) {
        commentLines++;
      } else {
        codeLines++;
      }
    } else {
      if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
        commentLines++;
      } else {
        codeLines++;
      }
    }
  }

  const totalLines = commentLines + codeLines;
  const coverage = totalLines > 0 ? Math.round((commentLines / totalLines) * 100) : 0;
  
  const threshold = strictMode ? 20 : 10;
  const status = coverage >= threshold ? 'pass' : coverage >= 5 ? 'warning' : 'fail';

  return {
    score: Math.min(100, coverage * 5), // Scale up for scoring
    status,
    coverage,
    commentLines,
    codeLines,
  };
}

/**
 * Check performance (heuristic)
 */
function checkPerformance(code: string, language: string, strictMode: boolean) {
  const performanceIssues: string[] = [];

  // Check for common performance anti-patterns
  if (code.includes('for') && code.includes('for')) {
    const nestedLoops = (code.match(/for.*for/g) || []).length;
    if (nestedLoops > 2) {
      performanceIssues.push('Multiple nested loops detected');
    }
  }

  if (language === 'javascript' || language === 'typescript') {
    if (code.includes('document.querySelector') && code.match(/document\.querySelector/g)!.length > 5) {
      performanceIssues.push('Excessive DOM queries');
    }
  }

  const score = Math.max(0, 100 - performanceIssues.length * 15);
  const status = performanceIssues.length === 0 ? 'pass' : 'warning';

  return {
    score,
    status,
    issues: performanceIssues.length,
    details: performanceIssues,
  };
}

/**
 * Calculate overall score
 */
function calculateOverallScore(breakdown: any): number {
  const scores: number[] = [];
  const weights: Record<string, number> = {
    quality: 0.25,
    security: 0.35,
    tests: 0.20,
    documentation: 0.10,
    performance: 0.10,
  };

  let totalWeight = 0;
  for (const [key, value] of Object.entries(breakdown)) {
    if (value && typeof value === 'object' && 'score' in value) {
      const scoreValue = (value as any).score as number;
      scores.push(scoreValue * (weights[key] || 0.1));
      totalWeight += weights[key] || 0.1;
    }
  }

  return Math.round(scores.reduce((a, b) => a + b, 0) / totalWeight);
}

/**
 * Generate recommendation
 */
function generateRecommendation(
  ready: boolean,
  score: number,
  blockers: string[],
  warnings: string[],
  breakdown: any,
  strictMode: boolean
) {
  const nextSteps: string[] = [];

  if (blockers.length > 0) {
    return {
      deploy: false,
      message: `❌ NOT READY - ${blockers.length} blocker(s) must be resolved`,
      blockers,
      nextSteps: blockers.map(b => `Fix: ${b}`),
      estimatedTime: `${blockers.length * 2} hours`,
    };
  }

  if (warnings.length > 0) {
    warnings.forEach(w => nextSteps.push(`Address: ${w}`));
  }

  // Add specific recommendations based on breakdown
  if (breakdown.security && breakdown.security.score < 80) {
    nextSteps.push('Review and fix security vulnerabilities');
  }

  if (breakdown.tests && breakdown.tests.coverage < 70) {
    nextSteps.push('Increase test coverage');
  }

  if (breakdown.documentation && breakdown.documentation.coverage < 15) {
    nextSteps.push('Add more code documentation');
  }

  if (ready) {
    return {
      deploy: true,
      message: `✅ READY FOR PRODUCTION - Score: ${score}/100`,
      nextSteps: nextSteps.length > 0 ? nextSteps : ['Monitor production metrics', 'Set up alerts'],
      estimatedTime: 'Ready now',
    };
  } else {
    return {
      deploy: false,
      message: `⚠️ NEEDS IMPROVEMENT - Score: ${score}/100 (target: ${strictMode ? 85 : 70})`,
      nextSteps: nextSteps.length > 0 ? nextSteps : ['Improve overall code quality'],
      estimatedTime: `${Math.ceil((strictMode ? 85 : 70) - score) / 10} hours`,
    };
  }
}
