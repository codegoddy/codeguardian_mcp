/**
 * Run Security Scan Tool
 * 
 * Detects security vulnerabilities in code
 * Covers OWASP Top 10 and AI-specific security risks
 */

import { ToolDefinition } from '../types/tools.js';
import { 
  scanForVulnerabilities, 
  calculateSecurityScore,
  groupByCategory,
  getVulnerabilitySummary 
} from '../analyzers/security/securityScanner.js';
import { logger } from '../utils/logger.js';

export const runSecurityScanTool: ToolDefinition = {
  definition: {
    name: 'run_security_scan',
    description: 'Scan code for security vulnerabilities including OWASP Top 10 and AI-specific security risks',
    inputSchema: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'Code to scan for security vulnerabilities',
        },
        language: {
          type: 'string',
          enum: ['javascript', 'typescript', 'python', 'go', 'java'],
          description: 'Programming language of the code',
        },
        scanType: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['secrets', 'injection', 'xss', 'crypto', 'auth', 'all'],
          },
          description: 'Types of security scans to perform',
          default: ['all'],
        },
        severityLevel: {
          type: 'string',
          enum: ['critical', 'high', 'medium', 'low'],
          description: 'Minimum severity level to report',
          default: 'medium',
        },
      },
      required: ['code', 'language'],
    },
  },

  async handler(args: any) {
    const startTime = Date.now();
    logger.info('Starting security scan...');

    const {
      code,
      language,
      scanType = ['all'],
      severityLevel = 'medium',
    } = args;

    try {
      // Determine categories to scan
      const categories = scanType.includes('all') 
        ? undefined 
        : scanType;

      // Scan for vulnerabilities
      logger.debug('Scanning for vulnerabilities...');
      const vulnerabilities = await scanForVulnerabilities(code, language, {
        severityLevel,
        categories,
      });

      // Calculate security score
      const securityScore = calculateSecurityScore(vulnerabilities);

      // Get summary
      const summary = getVulnerabilitySummary(vulnerabilities);

      // Group by category
      const groupedVulnerabilities = groupByCategory(vulnerabilities);

      const elapsedTime = Date.now() - startTime;
      logger.info(`Security scan completed in ${elapsedTime}ms`);

      const result = {
        success: true,
        securityScore,
        vulnerabilities: vulnerabilities.map(v => ({
          id: v.id,
          severity: v.severity,
          category: v.category,
          title: v.name,
          description: v.description,
          line: v.line,
          column: v.column,
          code: v.code,
          cveId: v.cwe,
          owaspCategory: v.owaspCategory,
          fixRecommendation: v.fixRecommendation,
          references: v.references,
          confidence: v.confidence,
        })),
        summary,
        groupedByCategory: Object.keys(groupedVulnerabilities).map(category => ({
          category,
          count: groupedVulnerabilities[category].length,
          vulnerabilities: groupedVulnerabilities[category].map(v => v.id),
        })),
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
      logger.error('Error in security scan:', error);
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
