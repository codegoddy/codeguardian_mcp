/**
 * Code Complexity Analyzer
 * 
 * Calculates cyclomatic complexity and identifies complex code patterns
 */

import { Issue } from '../types/tools.js';
import { logger } from '../utils/logger.js';

/**
 * Analyze code complexity
 */
export async function analyzeComplexity(
  code: string,
  language: string
): Promise<Issue[]> {
  logger.debug('Analyzing complexity...');

  const issues: Issue[] = [];
  const lines = code.split('\n');

  // Calculate cyclomatic complexity for each function
  const functions = extractFunctions(code, language);

  for (const func of functions) {
    const complexity = calculateCyclomaticComplexity(func.body);

    if (complexity > 10) {
      issues.push({
        type: 'highComplexity',
        severity: complexity > 20 ? 'high' : 'medium',
        message: `Function '${func.name}' has high cyclomatic complexity (${complexity})`,
        line: func.line,
        column: 0,
        code: func.signature,
        suggestion: 'Consider breaking this function into smaller functions',
        autoFixable: false,
        confidence: 95,
      });
    }
  }

  // Check for long functions
  for (const func of functions) {
    const lineCount = func.body.split('\n').length;
    if (lineCount > 50) {
      issues.push({
        type: 'longFunction',
        severity: 'medium',
        message: `Function '${func.name}' is too long (${lineCount} lines)`,
        line: func.line,
        column: 0,
        code: func.signature,
        suggestion: 'Functions should typically be under 50 lines',
        autoFixable: false,
        confidence: 90,
      });
    }
  }

  // Check for deeply nested code (only flag if level > 5)
  lines.forEach((line, index) => {
    const indentLevel = countIndentation(line);
    if (indentLevel > 5 && line.trim().length > 0) {
      issues.push({
        type: 'deepNesting',
        severity: 'low',
        message: `Code is deeply nested (level ${indentLevel})`,
        line: index + 1,
        column: 0,
        code: line.trim(),
        suggestion: 'Consider extracting nested logic into separate functions',
        autoFixable: false,
        confidence: 85,
      });
    }
  });

  logger.debug(`Found ${issues.length} complexity issues`);
  return issues;
}

/**
 * Extract functions from code
 */
function extractFunctions(code: string, language: string): Array<{
  name: string;
  signature: string;
  body: string;
  line: number;
}> {
  const functions: Array<{ name: string; signature: string; body: string; line: number }> = [];
  
  // Simple function extraction (can be enhanced)
  const lines = code.split('\n');
  let currentFunction: { name: string; signature: string; body: string; line: number } | null = null;
  let braceCount = 0;

  lines.forEach((line, index) => {
    if (language === 'javascript' || language === 'typescript') {
      const funcMatch = line.match(/function\s+(\w+)\s*\(|const\s+(\w+)\s*=.*=>/);
      if (funcMatch) {
        currentFunction = {
          name: funcMatch[1] || funcMatch[2],
          signature: line.trim(),
          body: '',
          line: index + 1,
        };
        braceCount = 0;
      }

      if (currentFunction) {
        currentFunction.body += line + '\n';
        braceCount += (line.match(/{/g) || []).length;
        braceCount -= (line.match(/}/g) || []).length;

        if (braceCount === 0 && currentFunction.body.includes('{')) {
          functions.push(currentFunction);
          currentFunction = null;
        }
      }
    }
  });

  return functions;
}

/**
 * Calculate cyclomatic complexity
 */
function calculateCyclomaticComplexity(code: string): number {
  let complexity = 1; // Base complexity

  // Count decision points
  const decisionKeywords = ['if', 'else if', 'for', 'while', 'case', '&&', '||'];
  
  for (const keyword of decisionKeywords) {
    // Escape special regex characters
    const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escapedKeyword}\\b`, 'g');
    const matches = code.match(regex);
    if (matches) {
      complexity += matches.length;
    }
  }

  // Count ternary operators separately (no word boundary needed)
  const ternaryMatches = code.match(/\?/g);
  if (ternaryMatches) {
    complexity += ternaryMatches.length;
  }

  return complexity;
}

/**
 * Count indentation level
 */
function countIndentation(line: string): number {
  const match = line.match(/^(\s+)/);
  if (!match) return 0;
  
  const spaces = match[1].length;
  // Assume 2 spaces per indent level, but also handle tabs
  const tabs = (match[1].match(/\t/g) || []).length;
  return Math.floor(spaces / 2) + (tabs * 2);
}
