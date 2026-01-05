/**
 * Analyze Code Quality Tool
 * 
 * Comprehensive code quality analysis focusing on AI-generated anti-patterns
 */

import { ToolDefinition } from '../types/tools.js';
import { analyzeComplexity } from '../analyzers/complexity.js';
import { detectAIAntiPatterns } from '../analyzers/aiPatterns.js';
import { detectAntiPatterns, calculateQualityScore as calcAntiPatternScore, getAntiPatternSummary } from '../analyzers/antiPatternDetector.js';
import { logger } from '../utils/logger.js';

export const analyzeCodeQualityTool: ToolDefinition = {
  definition: {
    name: 'analyze_code_quality',
    description: 'Comprehensive code quality analysis focusing on AI-generated anti-patterns, complexity, and maintainability',
    inputSchema: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'Code to analyze',
        },
        language: {
          type: 'string',
          enum: ['javascript', 'typescript', 'python', 'go', 'java'],
          description: 'Programming language',
        },
        filePath: {
          type: 'string',
          description: 'File path for context (optional)',
        },
        options: {
          type: 'object',
          properties: {
            checkComplexity: { type: 'boolean' },
            checkMaintainability: { type: 'boolean' },
            checkAIPatterns: { type: 'boolean' },
            severityLevel: {
              type: 'string',
              enum: ['error', 'warning', 'info'],
            },
          },
        },
      },
      required: ['code', 'language'],
    },
  },

  async handler(args: any) {
    const startTime = Date.now();
    logger.info('Starting code quality analysis...');

    const {
      code,
      language,
      filePath = 'untitled',
      options = {},
    } = args;

    const opts = {
      checkComplexity: true,
      checkMaintainability: true,
      checkAIPatterns: true,
      severityLevel: 'warning',
      ...options,
    };

    try {
      const issues: any[] = [];

      // Check complexity
      if (opts.checkComplexity) {
        logger.debug('Analyzing complexity...');
        const complexityIssues = await analyzeComplexity(code, language);
        issues.push(...complexityIssues);
      }

      // Check AI anti-patterns
      if (opts.checkAIPatterns) {
        logger.debug('Detecting AI anti-patterns...');
        const aiPatternIssues = await detectAIAntiPatterns(code, language);
        issues.push(...aiPatternIssues);
        
        // Also run new anti-pattern detector
        const antiPatterns = await detectAntiPatterns(code, language);
        issues.push(...antiPatterns.map(ap => ({
          severity: ap.severity === 'high' ? 'error' : ap.severity === 'medium' ? 'warning' : 'info',
          message: ap.description,
          line: ap.line,
          column: ap.column,
          code: ap.code,
          fix: ap.fix,
          example: ap.example,
          category: ap.category,
          autoFixable: false,
        })));
      }

      // Calculate metrics
      const metrics = {
        complexity: calculateComplexityScore(code, language),
        maintainability: calculateMaintainabilityScore(issues),
        readability: calculateReadabilityScore(code),
        coverage: 0, // Placeholder
      };

      // Calculate overall quality score
      const score = calculateQualityScore(metrics, issues);

      // Categorize issues by severity
      const summary = {
        totalIssues: issues.length,
        bySeverity: {
          errors: issues.filter((i) => i.severity === 'error').length,
          warnings: issues.filter((i) => i.severity === 'warning').length,
          info: issues.filter((i) => i.severity === 'info').length,
        },
        autoFixableIssues: issues.filter((i) => i.autoFixable).length,
      };

      // Estimate fix time
      const estimatedFixTime = estimateFixTime(issues);

      const elapsedTime = Date.now() - startTime;
      logger.info(`Code quality analysis completed in ${elapsedTime}ms`);

      const result = {
        success: true,
        score,
        issues,
        metrics,
        summary,
        estimatedFixTime,
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
      logger.error('Error in code quality analysis:', error);
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

function calculateComplexityScore(code: string, language: string): number {
  // Simplified complexity calculation
  const lines = code.split('\n').length;
  return Math.max(0, 100 - lines / 10);
}

function calculateMaintainabilityScore(issues: any[]): number {
  const errorCount = issues.filter((i) => i.severity === 'error').length;
  return Math.max(0, 100 - errorCount * 10);
}

function calculateReadabilityScore(code: string): number {
  // Simplified readability calculation
  const avgLineLength = code.split('\n').reduce((sum, line) => sum + line.length, 0) / code.split('\n').length;
  return Math.max(0, 100 - avgLineLength / 2);
}

function calculateQualityScore(metrics: any, issues: any[]): number {
  const weights = {
    complexity: 0.3,
    maintainability: 0.4,
    readability: 0.3,
  };

  let score = 0;
  score += metrics.complexity * weights.complexity;
  score += metrics.maintainability * weights.maintainability;
  score += metrics.readability * weights.readability;

  // Penalize for critical issues
  const criticalPenalty = issues.filter((i) => i.severity === 'error').length * 5;
  return Math.max(0, score - criticalPenalty);
}

function estimateFixTime(issues: any[]): string {
  const minutes = issues.length * 3; // 3 minutes per issue on average
  if (minutes < 60) return `${minutes} minutes`;
  const hours = Math.floor(minutes / 60);
  return `${hours} hour${hours > 1 ? 's' : ''}`;
}
