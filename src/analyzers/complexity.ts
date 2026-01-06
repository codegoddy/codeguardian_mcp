/**
 * Code Complexity Analyzer (AST-based)
 * 
 * Calculates cyclomatic complexity and identifies complex code patterns
 * using proper AST parsing instead of regex-based indentation counting
 */

import { Issue } from '../types/tools.js';
import { logger } from '../utils/logger.js';
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';

/**
 * Analyze code complexity using AST
 */
export async function analyzeComplexity(
  code: string,
  language: string
): Promise<Issue[]> {
  logger.debug('Analyzing complexity with AST...');

  const issues: Issue[] = [];

  try {
    if (language === 'javascript' || language === 'typescript') {
      return await analyzeJavaScriptComplexity(code);
    } else if (language === 'python') {
      return await analyzePythonComplexity(code);
    } else {
      // Fallback to simple analysis for unsupported languages
      return await analyzeComplexityFallback(code, language);
    }
  } catch (error) {
    logger.error('Error in AST-based complexity analysis, falling back:', error);
    return await analyzeComplexityFallback(code, language);
  }
}

/**
 * Analyze JavaScript/TypeScript complexity using Acorn AST
 */
async function analyzeJavaScriptComplexity(code: string): Promise<Issue[]> {
  const issues: Issue[] = [];

  try {
    // Parse code into AST
    const ast = acorn.parse(code, {
      ecmaVersion: 2022,
      sourceType: 'module',
      locations: true,
    });

    // Track functions and their complexity
    const functions: Array<{
      name: string;
      line: number;
      complexity: number;
      nestingLevel: number;
      lineCount: number;
    }> = [];

    // Walk the AST
    walk.ancestor(ast as any, {
      FunctionDeclaration(node: any, ancestors: any[]) {
        const funcInfo = analyzeFunctionNode(node, ancestors);
        functions.push(funcInfo);
      },
      FunctionExpression(node: any, ancestors: any[]) {
        const funcInfo = analyzeFunctionNode(node, ancestors);
        functions.push(funcInfo);
      },
      ArrowFunctionExpression(node: any, ancestors: any[]) {
        const funcInfo = analyzeFunctionNode(node, ancestors);
        functions.push(funcInfo);
      },
    });

    // Generate issues from function analysis
    for (const func of functions) {
      // High cyclomatic complexity
      if (func.complexity > 10) {
        issues.push({
          type: 'highComplexity',
          severity: func.complexity > 20 ? 'high' : 'medium',
          message: `Function '${func.name}' has high cyclomatic complexity (${func.complexity})`,
          line: func.line,
          column: 0,
          code: `function ${func.name}`,
          suggestion: 'Consider breaking this function into smaller functions',
          autoFixable: false,
          confidence: 95,
        });
      }

      // Long functions
      if (func.lineCount > 50) {
        issues.push({
          type: 'longFunction',
          severity: 'medium',
          message: `Function '${func.name}' is too long (${func.lineCount} lines)`,
          line: func.line,
          column: 0,
          code: `function ${func.name}`,
          suggestion: 'Functions should typically be under 50 lines',
          autoFixable: false,
          confidence: 90,
        });
      }

      // Deep nesting (only flag if > 4 levels, which is reasonable)
      if (func.nestingLevel > 4) {
        issues.push({
          type: 'deepNesting',
          severity: 'medium',
          message: `Function '${func.name}' has deep nesting (level ${func.nestingLevel})`,
          line: func.line,
          column: 0,
          code: `function ${func.name}`,
          suggestion: 'Consider extracting nested logic into separate functions or using early returns',
          autoFixable: false,
          confidence: 85,
        });
      }
    }

    logger.debug(`Found ${issues.length} complexity issues (AST-based)`);
  } catch (error) {
    logger.error('Error parsing JavaScript AST:', error);
  }

  return issues;
}

/**
 * Analyze a function node from AST
 */
function analyzeFunctionNode(node: any, ancestors: any[]): {
  name: string;
  line: number;
  complexity: number;
  nestingLevel: number;
  lineCount: number;
} {
  const name = node.id?.name || node.key?.name || 'anonymous';
  const line = node.loc?.start.line || 0;
  
  // Calculate cyclomatic complexity
  let complexity = 1; // Base complexity
  
  walk.simple(node, {
    IfStatement() { complexity++; },
    ConditionalExpression() { complexity++; },
    ForStatement() { complexity++; },
    ForInStatement() { complexity++; },
    ForOfStatement() { complexity++; },
    WhileStatement() { complexity++; },
    DoWhileStatement() { complexity++; },
    SwitchCase(caseNode: any) {
      if (caseNode.test) complexity++; // Don't count default case
    },
    LogicalExpression(logicalNode: any) {
      if (logicalNode.operator === '&&' || logicalNode.operator === '||') {
        complexity++;
      }
    },
    CatchClause() { complexity++; },
  });

  // Calculate maximum nesting level
  const nestingLevel = calculateMaxNesting(node);

  // Calculate line count
  const lineCount = node.loc ? (node.loc.end.line - node.loc.start.line + 1) : 0;

  return { name, line, complexity, nestingLevel, lineCount };
}

/**
 * Calculate maximum nesting level in a node
 */
function calculateMaxNesting(node: any): number {
  let maxNesting = 0;

  function traverse(n: any, currentLevel: number) {
    maxNesting = Math.max(maxNesting, currentLevel);

    // Increment level for nesting constructs
    const nestingNodes = [
      'IfStatement',
      'ForStatement',
      'ForInStatement',
      'ForOfStatement',
      'WhileStatement',
      'DoWhileStatement',
      'SwitchStatement',
      'TryStatement',
      'FunctionDeclaration',
      'FunctionExpression',
      'ArrowFunctionExpression',
    ];

    if (nestingNodes.includes(n.type)) {
      currentLevel++;
    }

    // Traverse children
    for (const key in n) {
      if (key === 'loc' || key === 'range' || key === 'start' || key === 'end') continue;
      
      const child = n[key];
      if (child && typeof child === 'object') {
        if (Array.isArray(child)) {
          child.forEach(c => {
            if (c && typeof c === 'object') traverse(c, currentLevel);
          });
        } else {
          traverse(child, currentLevel);
        }
      }
    }
  }

  traverse(node, 0);
  return maxNesting;
}

/**
 * Analyze Python complexity (using external Python script)
 */
async function analyzePythonComplexity(code: string): Promise<Issue[]> {
  const issues: Issue[] = [];

  try {
    // For Python, we'll use a simple heuristic-based approach
    // since we can't easily parse Python AST in Node.js
    // In production, you'd want to use a Python subprocess or service
    
    const lines = code.split('\n');
    const functions = extractPythonFunctions(code);

    for (const func of functions) {
      // Calculate complexity heuristically
      const complexity = calculatePythonComplexity(func.body);
      
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
          confidence: 85,
        });
      }

      // Check function length
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

      // Check nesting level (count indentation in function body)
      const maxNesting = calculatePythonNesting(func.body);
      if (maxNesting > 4) {
        issues.push({
          type: 'deepNesting',
          severity: 'medium',
          message: `Function '${func.name}' has deep nesting (level ${maxNesting})`,
          line: func.line,
          column: 0,
          code: func.signature,
          suggestion: 'Consider extracting nested logic into separate functions or using early returns',
          autoFixable: false,
          confidence: 85,
        });
      }
    }

    logger.debug(`Found ${issues.length} complexity issues (Python heuristic)`);
  } catch (error) {
    logger.error('Error analyzing Python complexity:', error);
  }

  return issues;
}

/**
 * Extract Python functions from code
 */
function extractPythonFunctions(code: string): Array<{
  name: string;
  signature: string;
  body: string;
  line: number;
}> {
  const functions: Array<{ name: string; signature: string; body: string; line: number }> = [];
  const lines = code.split('\n');
  
  let currentFunction: { name: string; signature: string; body: string; line: number } | null = null;
  let functionIndent = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Detect function definition
    const funcMatch = trimmed.match(/^(?:async\s+)?def\s+(\w+)\s*\(/);
    if (funcMatch) {
      // Save previous function if exists
      if (currentFunction) {
        functions.push(currentFunction);
      }

      // Start new function
      const indent = line.match(/^(\s*)/)?.[1].length || 0;
      currentFunction = {
        name: funcMatch[1],
        signature: trimmed,
        body: '',
        line: i + 1,
      };
      functionIndent = indent;
      continue;
    }

    // Add to current function body
    if (currentFunction) {
      const indent = line.match(/^(\s*)/)?.[1].length || 0;
      
      // If we're back to the same or less indentation, function ended
      if (trimmed && indent <= functionIndent) {
        functions.push(currentFunction);
        currentFunction = null;
      } else {
        currentFunction.body += line + '\n';
      }
    }
  }

  // Don't forget the last function
  if (currentFunction) {
    functions.push(currentFunction);
  }

  return functions;
}

/**
 * Calculate Python complexity heuristically
 */
function calculatePythonComplexity(code: string): number {
  let complexity = 1; // Base complexity

  // Count decision points
  const patterns = [
    /\bif\b/g,
    /\belif\b/g,
    /\bfor\b/g,
    /\bwhile\b/g,
    /\band\b/g,
    /\bor\b/g,
    /\bexcept\b/g,
  ];

  for (const pattern of patterns) {
    const matches = code.match(pattern);
    if (matches) {
      complexity += matches.length;
    }
  }

  return complexity;
}

/**
 * Calculate Python nesting level (relative to function body)
 */
function calculatePythonNesting(code: string): number {
  const lines = code.split('\n');
  let maxNesting = 0;
  let baseIndent = -1;

  for (const line of lines) {
    const trimmed = line.trim();
    
    // Skip empty lines, comments, and docstrings
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('"""') || trimmed.startsWith("'''")) {
      continue;
    }

    const indent = line.match(/^(\s*)/)?.[1].length || 0;
    
    // Set base indent from first non-empty line
    if (baseIndent === -1 && trimmed) {
      baseIndent = indent;
    }

    // Calculate nesting relative to base
    if (baseIndent >= 0) {
      const relativeIndent = indent - baseIndent;
      const nestingLevel = Math.floor(relativeIndent / 4); // Python uses 4-space indent
      maxNesting = Math.max(maxNesting, nestingLevel);
    }
  }

  return maxNesting;
}

/**
 * Fallback complexity analysis for unsupported languages
 */
async function analyzeComplexityFallback(code: string, language: string): Promise<Issue[]> {
  const issues: Issue[] = [];
  
  // Simple line-based analysis as fallback
  const lines = code.split('\n');
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
        confidence: 75,
      });
    }

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
        confidence: 80,
      });
    }
  }

  return issues;
}

/**
 * Extract functions from code (fallback method)
 */
function extractFunctions(code: string, language: string): Array<{
  name: string;
  signature: string;
  body: string;
  line: number;
}> {
  const functions: Array<{ name: string; signature: string; body: string; line: number }> = [];
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
 * Calculate cyclomatic complexity (fallback method)
 */
function calculateCyclomaticComplexity(code: string): number {
  let complexity = 1;

  const decisionKeywords = ['if', 'else if', 'for', 'while', 'case', '&&', '||'];
  
  for (const keyword of decisionKeywords) {
    const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escapedKeyword}\\b`, 'g');
    const matches = code.match(regex);
    if (matches) {
      complexity += matches.length;
    }
  }

  const ternaryMatches = code.match(/\?/g);
  if (ternaryMatches) {
    complexity += ternaryMatches.length;
  }

  return complexity;
}
