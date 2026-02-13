/**
 * Code Complexity Analyzer (AST-based)
 *
 * Calculates cyclomatic complexity and identifies complex code patterns
 * using proper AST parsing instead of regex-based indentation counting
 *
 * @format
 */

import { Issue } from "../types/tools.js";
import { logger } from "../utils/logger.js";
import { getParser } from "../tools/validation/parser.js";

/**
 * Analyze code complexity using AST
 */
export async function analyzeComplexity(
  code: string,
  language: string,
): Promise<Issue[]> {
  logger.debug("Analyzing complexity with AST...");

  try {
    if (language === "javascript" || language === "typescript") {
      return await analyzeJavaScriptComplexityAST(
        code,
        language as "javascript" | "typescript",
      );
    } else if (language === "python") {
      return await analyzePythonComplexity(code);
    } else {
      // Fallback to simple analysis for unsupported languages
      return await analyzeComplexityFallback(code, language);
    }
  } catch (error) {
    logger.error(
      "Error in AST-based complexity analysis, falling back:",
      error,
    );
    return await analyzeComplexityFallback(code, language);
  }
}

/**
 * Analyze JavaScript/TypeScript complexity using Tree-sitter AST.
 */
async function analyzeJavaScriptComplexityAST(
  code: string,
  language: "javascript" | "typescript",
): Promise<Issue[]> {
  const issues: Issue[] = [];

  try {
    const parser = getParser(language);
    const tree = parser.parse(code)!;
    const root = tree.rootNode;

    // Track functions and their complexity
    const functions: Array<{
      name: string;
      line: number;
      complexity: number;
      nestingLevel: number;
      lineCount: number;
    }> = [];

    const getText = (node: { startIndex: number; endIndex: number }) =>
      code.substring(node.startIndex, node.endIndex);

    const isFunctionLikeNode = (type: string) =>
      type === "function_declaration" ||
      type === "function" ||
      type === "function_expression" ||
      type === "arrow_function" ||
      type === "method_definition";

    const isNestedDefNode = (type: string) =>
      isFunctionLikeNode(type) ||
      type === "class_declaration" ||
      type === "class";

    const isBlockNestingNode = (type: string) =>
      type === "if_statement" ||
      type === "for_statement" ||
      type === "for_in_statement" ||
      type === "for_of_statement" ||
      type === "while_statement" ||
      type === "do_statement" ||
      type === "switch_statement" ||
      type === "try_statement" ||
      type === "catch_clause";

    const resolveFunctionName = (node: any): string => {
      const nameNode = node.childForFieldName?.("name");
      if (nameNode) return getText(nameNode);

      if (node.type === "arrow_function") {
        const parent = node.parent;

        if (parent?.type === "variable_declarator") {
          const n = parent.childForFieldName?.("name");
          if (n) return getText(n);
        }

        if (parent?.type === "pair") {
          const key = parent.childForFieldName?.("key");
          if (key) return getText(key);
        }

        if (parent?.type === "assignment_expression") {
          const left = parent.childForFieldName?.("left");
          if (left?.type === "identifier") return getText(left);
        }
      }

      return "anonymous";
    };

    const computeFunctionComplexity = (
      bodyNode: any,
      functionNodeId: number,
    ): { complexity: number; nestingLevel: number } => {
      let complexity = 1;
      let maxNesting = 0;

      const traverse = (node: any, nesting: number) => {
        if (!node) return;

        // Do not include nested defs in the parent function's complexity.
        if (node.id !== functionNodeId && isNestedDefNode(node.type)) {
          return;
        }

        switch (node.type) {
          case "if_statement":
            complexity++;
            break;
          case "for_statement":
          case "for_in_statement":
          case "for_of_statement":
          case "while_statement":
          case "do_statement":
            complexity++;
            break;
          case "catch_clause":
            complexity++;
            break;
          case "conditional_expression":
          case "ternary_expression":
            complexity++;
            break;
          case "switch_case":
            complexity++;
            break;
          case "binary_expression":
          case "logical_expression": {
            for (const child of node.children || []) {
              const t = child?.type;
              if (t === "&&" || t === "||") complexity++;
            }
            break;
          }
        }

        const nextNesting = isBlockNestingNode(node.type) ? nesting + 1 : nesting;
        maxNesting = Math.max(maxNesting, nextNesting);

        for (const child of node.children || []) {
          traverse(child, nextNesting);
        }
      };

      traverse(bodyNode, 0);
      return { complexity, nestingLevel: maxNesting };
    };

    const collectFunctions = (node: any) => {
      if (!node) return;

      if (isFunctionLikeNode(node.type)) {
        const bodyNode = node.childForFieldName?.("body");
        const name = resolveFunctionName(node);
        const line = node.startPosition?.row + 1 || 0;
        const lineCount =
          node.endPosition && node.startPosition
            ? node.endPosition.row - node.startPosition.row + 1
            : 0;

        const { complexity, nestingLevel } = bodyNode
          ? computeFunctionComplexity(bodyNode, node.id)
          : { complexity: 1, nestingLevel: 0 };

        functions.push({ name, line, complexity, nestingLevel, lineCount });
      }

      for (const child of node.children || []) {
        collectFunctions(child);
      }
    };

    collectFunctions(root);

    // Generate issues from function analysis
    for (const func of functions) {
      // High cyclomatic complexity
      if (func.complexity > 10) {
        issues.push({
          type: "highComplexity",
          severity: func.complexity > 20 ? "high" : "medium",
          message: `Function '${func.name}' has high cyclomatic complexity (${func.complexity})`,
          line: func.line,
          column: 0,
          code: `function ${func.name}`,
          suggestion: "Consider breaking this function into smaller functions",
          autoFixable: false,
          confidence: 95,
        });
      }

      // Long functions
      if (func.lineCount > 50) {
        issues.push({
          type: "longFunction",
          severity: "medium",
          message: `Function '${func.name}' is too long (${func.lineCount} lines)`,
          line: func.line,
          column: 0,
          code: `function ${func.name}`,
          suggestion: "Functions should typically be under 50 lines",
          autoFixable: false,
          confidence: 90,
        });
      }

      // Deep nesting (only flag if > 4 levels, which is reasonable)
      if (func.nestingLevel > 4) {
        issues.push({
          type: "deepNesting",
          severity: "medium",
          message: `Function '${func.name}' has deep nesting (level ${func.nestingLevel})`,
          line: func.line,
          column: 0,
          code: `function ${func.name}`,
          suggestion:
            "Consider extracting nested logic into separate functions or using early returns",
          autoFixable: false,
          confidence: 85,
        });
      }
    }

    logger.debug(`Found ${issues.length} complexity issues (JS/TS AST-based)`);
  } catch (error) {
    logger.error("Error parsing JavaScript/TypeScript Tree-sitter AST:", error);
  }

  return issues;
}

/**
 * Analyze Python complexity using Tree-sitter AST.
 */
async function analyzePythonComplexity(code: string): Promise<Issue[]> {
  try {
    return analyzePythonComplexityAST(code);
  } catch (error) {
    logger.error(
      "Error analyzing Python complexity with Tree-sitter AST; falling back to heuristics:",
      error,
    );
    return analyzePythonComplexityHeuristic(code);
  }
}

function analyzePythonComplexityAST(code: string): Issue[] {
  const issues: Issue[] = [];
  const parser = getParser("python");
  const tree = parser.parse(code)!;

  const functions: Array<{
    name: string;
    line: number;
    complexity: number;
    nestingLevel: number;
    lineCount: number;
  }> = [];

  const root = tree.rootNode;

  const getText = (node: { startIndex: number; endIndex: number }) =>
    code.substring(node.startIndex, node.endIndex);

  const isBlockNestingNode = (type: string) =>
    type === "if_statement" ||
    type === "for_statement" ||
    type === "while_statement" ||
    type === "try_statement" ||
    type === "with_statement" ||
    type === "match_statement";

  const computeFunctionComplexity = (bodyNode: any, functionNodeId: number) => {
    let complexity = 1;
    let maxNesting = 0;

    const traverse = (node: any, nesting: number) => {
      if (!node) return;

      // Do not include nested defs in the parent function's complexity.
      if (
        node.id !== functionNodeId &&
        (node.type === "function_definition" || node.type === "class_definition")
      ) {
        return;
      }

      // Decision points
      switch (node.type) {
        case "if_statement":
          complexity++;
          break;
        case "elif_clause":
          complexity++;
          break;
        case "for_statement":
        case "while_statement":
          complexity++;
          break;
        case "except_clause":
          complexity++;
          break;
        case "conditional_expression":
          complexity++;
          break;
        case "case_clause":
          // Count each case as a decision point (similar to switch cases)
          complexity++;
          break;
        case "boolean_operator": {
          // Count boolean operator occurrences (and/or). Tree-sitter represents these as nodes.
          // The operator itself is usually a child token.
          for (const child of node.children || []) {
            const t = child.type;
            if (t === "and" || t === "or") complexity++;
          }
          break;
        }
      }

      const nextNesting = isBlockNestingNode(node.type) ? nesting + 1 : nesting;
      maxNesting = Math.max(maxNesting, nextNesting);

      for (const child of node.children || []) {
        traverse(child, nextNesting);
      }
    };

    traverse(bodyNode, 0);
    return { complexity, nestingLevel: maxNesting };
  };

  const collectFunctions = (node: any) => {
    if (!node) return;

    if (node.type === "function_definition") {
      const nameNode = node.childForFieldName?.("name");
      const bodyNode = node.childForFieldName?.("body");
      const name = nameNode ? getText(nameNode) : "anonymous";
      const line = node.startPosition?.row + 1 || 0;
      const lineCount =
        node.endPosition && node.startPosition
          ? node.endPosition.row - node.startPosition.row + 1
          : 0;

      const { complexity, nestingLevel } = bodyNode
        ? computeFunctionComplexity(bodyNode, node.id)
        : { complexity: 1, nestingLevel: 0 };

      functions.push({ name, line, complexity, nestingLevel, lineCount });

      // Still recurse to find nested functions (each will be analyzed independently)
      for (const child of node.children || []) {
        collectFunctions(child);
      }
      return;
    }

    for (const child of node.children || []) {
      collectFunctions(child);
    }
  };

  collectFunctions(root);

  for (const func of functions) {
    if (func.complexity > 10) {
      issues.push({
        type: "highComplexity",
        severity: func.complexity > 20 ? "high" : "medium",
        message: `Function '${func.name}' has high cyclomatic complexity (${func.complexity})`,
        line: func.line,
        column: 0,
        code: `def ${func.name}(...)`,
        suggestion: "Consider breaking this function into smaller functions",
        autoFixable: false,
        confidence: 90,
      });
    }

    if (func.lineCount > 50) {
      issues.push({
        type: "longFunction",
        severity: "medium",
        message: `Function '${func.name}' is too long (${func.lineCount} lines)`,
        line: func.line,
        column: 0,
        code: `def ${func.name}(...)`,
        suggestion: "Functions should typically be under 50 lines",
        autoFixable: false,
        confidence: 90,
      });
    }

    if (func.nestingLevel > 4) {
      issues.push({
        type: "deepNesting",
        severity: "medium",
        message: `Function '${func.name}' has deep nesting (level ${func.nestingLevel})`,
        line: func.line,
        column: 0,
        code: `def ${func.name}(...)`,
        suggestion:
          "Consider extracting nested logic into separate functions or using early returns",
        autoFixable: false,
        confidence: 85,
      });
    }
  }

  logger.debug(`Found ${issues.length} complexity issues (Python AST-based)`);
  return issues;
}

function analyzePythonComplexityHeuristic(code: string): Issue[] {
  const issues: Issue[] = [];
  const functions = extractPythonFunctions(code);

  for (const func of functions) {
    const complexity = calculatePythonComplexity(func.body);

    if (complexity > 10) {
      issues.push({
        type: "highComplexity",
        severity: complexity > 20 ? "high" : "medium",
        message: `Function '${func.name}' has high cyclomatic complexity (${complexity})`,
        line: func.line,
        column: 0,
        code: func.signature,
        suggestion: "Consider breaking this function into smaller functions",
        autoFixable: false,
        confidence: 75,
      });
    }

    const lineCount = func.body.split("\n").length;
    if (lineCount > 50) {
      issues.push({
        type: "longFunction",
        severity: "medium",
        message: `Function '${func.name}' is too long (${lineCount} lines)`,
        line: func.line,
        column: 0,
        code: func.signature,
        suggestion: "Functions should typically be under 50 lines",
        autoFixable: false,
        confidence: 80,
      });
    }

    const maxNesting = calculatePythonNesting(func.body);
    if (maxNesting > 4) {
      issues.push({
        type: "deepNesting",
        severity: "medium",
        message: `Function '${func.name}' has deep nesting (level ${maxNesting})`,
        line: func.line,
        column: 0,
        code: func.signature,
        suggestion:
          "Consider extracting nested logic into separate functions or using early returns",
        autoFixable: false,
        confidence: 75,
      });
    }
  }

  logger.debug(`Found ${issues.length} complexity issues (Python heuristic)`);
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
  const functions: Array<{
    name: string;
    signature: string;
    body: string;
    line: number;
  }> = [];
  const lines = code.split("\n");

  let currentFunction: {
    name: string;
    signature: string;
    body: string;
    line: number;
  } | null = null;
  let functionIndent = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith("#")) continue;

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
        body: "",
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
        currentFunction.body += line + "\n";
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
  const lines = code.split("\n");
  let maxNesting = 0;
  let baseIndent = -1;

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines, comments, and docstrings
    if (
      !trimmed ||
      trimmed.startsWith("#") ||
      trimmed.startsWith('"""') ||
      trimmed.startsWith("'''")
    ) {
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
async function analyzeComplexityFallback(
  code: string,
  language: string,
): Promise<Issue[]> {
  const issues: Issue[] = [];

  // Simple line-based analysis as fallback
  const functions = extractFunctions(code, language);

  for (const func of functions) {
    const complexity = calculateCyclomaticComplexity(func.body);

    if (complexity > 10) {
      issues.push({
        type: "highComplexity",
        severity: complexity > 20 ? "high" : "medium",
        message: `Function '${func.name}' has high cyclomatic complexity (${complexity})`,
        line: func.line,
        column: 0,
        code: func.signature,
        suggestion: "Consider breaking this function into smaller functions",
        autoFixable: false,
        confidence: 75,
      });
    }

    const lineCount = func.body.split("\n").length;
    if (lineCount > 50) {
      issues.push({
        type: "longFunction",
        severity: "medium",
        message: `Function '${func.name}' is too long (${lineCount} lines)`,
        line: func.line,
        column: 0,
        code: func.signature,
        suggestion: "Functions should typically be under 50 lines",
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
function extractFunctions(
  code: string,
  language: string,
): Array<{
  name: string;
  signature: string;
  body: string;
  line: number;
}> {
  const functions: Array<{
    name: string;
    signature: string;
    body: string;
    line: number;
  }> = [];
  const lines = code.split("\n");
  let currentFunction: {
    name: string;
    signature: string;
    body: string;
    line: number;
  } | null = null;
  let braceCount = 0;

  lines.forEach((line, index) => {
    if (language === "javascript" || language === "typescript") {
      const funcMatch = line.match(
        /function\s+(\w+)\s*\(|const\s+(\w+)\s*=.*=>/,
      );
      if (funcMatch) {
        currentFunction = {
          name: funcMatch[1] || funcMatch[2],
          signature: line.trim(),
          body: "",
          line: index + 1,
        };
        braceCount = 0;
      }

      if (currentFunction) {
        currentFunction.body += line + "\n";
        braceCount += (line.match(/{/g) || []).length;
        braceCount -= (line.match(/}/g) || []).length;

        if (braceCount === 0 && currentFunction.body.includes("{")) {
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

  const decisionKeywords = [
    "if",
    "else if",
    "for",
    "while",
    "case",
    "&&",
    "||",
  ];

  for (const keyword of decisionKeywords) {
    const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`\\b${escapedKeyword}\\b`, "g");
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
