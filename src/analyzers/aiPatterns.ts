/**
 * AI Anti-Pattern Detector
 * 
 * Detects common anti-patterns in AI-generated code
 */

import { Issue } from '../types/tools.js';
import { logger } from '../utils/logger.js';

/**
 * Detect AI-specific anti-patterns
 */
export async function detectAIAntiPatterns(
  code: string,
  language: string
): Promise<Issue[]> {
  logger.debug('Detecting AI anti-patterns...');

  const issues: Issue[] = [];
  const lines = code.split('\n');

  // Pattern 1: Generic error handling
  // Look for catch blocks followed by console.log in the next few lines
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/catch\s*\(\w+\)/.test(line)) {
      // Check next few lines for console.log
      for (let j = i; j < Math.min(i + 5, lines.length); j++) {
        if (lines[j].includes('console.log')) {
          issues.push({
            type: 'genericErrorHandling',
            severity: 'medium',
            message: 'Generic error handling without proper error management',
            line: i + 1,
            column: 0,
            code: line.trim(),
            suggestion: 'Implement specific error handling with proper error types',
            autoFixable: false,
            confidence: 90,
          });
          break;
        }
      }
    }
  }

  // Pattern 2: Unused interfaces (common AI over-abstraction)
  // Match interface declarations across multiple lines
  const interfacePattern = /interface\s+(\w+)/g;
  const interfaces = [...code.matchAll(interfacePattern)].map(m => m[1]);
  
  for (const iface of interfaces) {
    // Count how many times the interface name appears in the code
    const usagePattern = new RegExp(`\\b${iface}\\b`, 'g');
    const usageCount = (code.match(usagePattern) || []).length;
    
    // If used only twice (declaration + one implementation), flag it
    if (usageCount <= 2) {
      issues.push({
        type: 'unnecessaryAbstraction',
        severity: 'low',
        message: `Interface '${iface}' appears to be used only once`,
        line: 0,
        column: 0,
        suggestion: 'Consider removing this interface if it only has one implementation',
        autoFixable: false,
        confidence: 75,
      });
    }
  }

  // Pattern 3: Missing input validation
  const functionPattern = /function\s+\w+\s*\([^)]+\)|const\s+\w+\s*=\s*\([^)]+\)\s*=>/g;
  let match;
  while ((match = functionPattern.exec(code)) !== null) {
    const funcStart = match.index;
    const funcBody = code.slice(funcStart, funcStart + 500);
    
    if (!funcBody.includes('if') && !funcBody.includes('throw') && !funcBody.includes('validate')) {
      issues.push({
        type: 'missingValidation',
        severity: 'medium',
        message: 'Function may be missing input validation',
        line: code.slice(0, funcStart).split('\n').length,
        column: 0,
        suggestion: 'Add input validation to prevent unexpected behavior',
        autoFixable: false,
        confidence: 60,
      });
    }
  }

  logger.debug(`Found ${issues.length} AI anti-pattern issues`);
  return issues;
}
