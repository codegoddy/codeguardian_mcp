/**
 * Logic Contradiction Detector
 * 
 * Detects contradictions between new code and previous AI generations
 */

import { SessionHistoryEntry, Issue } from '../types/tools.js';
import { logger } from '../utils/logger.js';

/**
 * Detect logic contradictions across session history
 */
export async function detectContradictions(
  newCode: string,
  sessionHistory: SessionHistoryEntry[],
  language: string
): Promise<Issue[]> {
  logger.debug('Detecting logic contradictions...');

  const issues: Issue[] = [];

  if (!sessionHistory || sessionHistory.length === 0) {
    logger.debug('No session history provided, skipping contradiction detection');
    return issues;
  }

  try {
    // Extract key logic patterns from new code
    const newPatterns = extractLogicPatterns(newCode, language);

    // Compare with each historical entry
    for (const entry of sessionHistory) {
      const historicalPatterns = extractLogicPatterns(entry.code, language);

      // Check for contradicting variable assignments
      for (const newVar of newPatterns.assignments) {
        for (const oldVar of historicalPatterns.assignments) {
          if (newVar.name === oldVar.name && newVar.value !== oldVar.value) {
            issues.push({
              type: 'logicContradiction',
              severity: 'medium',
              message: `Variable '${newVar.name}' assigned different value than in previous code`,
              line: newVar.line,
              column: 0,
              code: newVar.code,
              suggestion: `Previously: ${oldVar.value}, Now: ${newVar.value}. Verify this change is intentional.`,
              confidence: 70,
            });
          }
        }
      }

      // Check for contradicting return values
      for (const newFunc of newPatterns.functions) {
        for (const oldFunc of historicalPatterns.functions) {
          if (newFunc.name === oldFunc.name && 
              newFunc.returnType && oldFunc.returnType &&
              newFunc.returnType !== oldFunc.returnType) {
            issues.push({
              type: 'returnValueMismatch',
              severity: 'high',
              message: `Function '${newFunc.name}' returns different type than previously defined`,
              line: newFunc.line,
              column: 0,
              code: newFunc.code,
              suggestion: `Previously returned ${oldFunc.returnType}, now returns ${newFunc.returnType}`,
              confidence: 80,
            });
          }
        }
      }
    }

    // Check for tautology conditions
    for (const cond of newPatterns.conditions) {
      if (isTautology(cond.condition, language)) {
        issues.push({
          type: 'tautologyCondition',
          severity: 'medium',
          message: 'Condition is always true, potential logic error or AI hallucination',
          line: cond.line,
          column: 0,
          code: cond.code,
          suggestion: 'Verify if this always-true condition is intentional',
          confidence: 90,
        });
      }
    }

    logger.debug(`Found ${issues.length} logic contradictions`);
  } catch (error) {
    logger.error('Error detecting contradictions:', error);
  }

  return issues;
}

/**
 * Extract logic patterns from code
 */
function extractLogicPatterns(code: string, language: string) {
  const patterns = {
    assignments: [] as Array<{ name: string; value: string; line: number; code: string }>,
    functions: [] as Array<{ name: string; returnType?: string; line: number; code: string }>,
    conditions: [] as Array<{ condition: string; line: number; code: string }>,
  };

  const lines = code.split('\n');

  lines.forEach((line, index) => {
    // Extract variable assignments
    const assignmentPattern = /(\w+)\s*=\s*(.+)/;
    const assignMatch = line.match(assignmentPattern);
    if (assignMatch) {
      patterns.assignments.push({
        name: assignMatch[1],
        value: assignMatch[2].trim(),
        line: index + 1,
        code: line.trim(),
      });
    }

    // Extract function definitions (simplified)
    if (language === 'javascript' || language === 'typescript') {
      const funcPattern = /function\s+(\w+)|const\s+(\w+)\s*=/;
      const funcMatch = line.match(funcPattern);
      if (funcMatch) {
        patterns.functions.push({
          name: funcMatch[1] || funcMatch[2],
          line: index + 1,
          code: line.trim(),
        });
      }
    } else if (language === 'python') {
      const funcPattern = /def\s+(\w+)/;
      const funcMatch = line.match(funcPattern);
      if (funcMatch) {
        patterns.functions.push({
          name: funcMatch[1],
          line: index + 1,
          code: line.trim(),
        });
      }
    }
  });

  // Extract conditions
  let conditionPattern;
  if (language === 'python') {
    conditionPattern = /if\s+([^:]+):/g;
  } else {
    conditionPattern = /if\s*\(([^)]+)\)/g;
  }
  let condMatch;
  lines.forEach((line, index) => {
    while ((condMatch = conditionPattern.exec(line)) !== null) {
      patterns.conditions.push({
        condition: condMatch[1].trim(),
        line: index + 1,
        code: line.trim(),
      });
    }
  });

  return patterns;
}

/**
 * Check if a condition is a tautology (always true)
 */
function isTautology(condition: string, language: string): boolean {
  const lower = condition.toLowerCase();
  const tautologies = [
    'true', '1 == 1', '1 === 1', 'true == true', 'true === true',
    '0 != 1', '0 !== 1', 'false != true', 'false !== true'
  ];
  return tautologies.some(t => lower.includes(t));
}
