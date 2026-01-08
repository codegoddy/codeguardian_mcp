/**
 * Get Test Coverage Gaps Tool
 *
 * Identifies functions, branches, and code paths that have no test coverage.
 * LLMs can write tests, but they can't know what's NOT tested without
 * analyzing the actual test files against the source.
 *
 * Now integrates with shared project context for faster analysis.
 *
 * @format
 */

import { ToolDefinition } from "../types/tools.js";
import { logger } from "../utils/logger.js";
import {
  filterExcludedFiles,
  getExcludePatternsForPath,
} from "../utils/fileFilter.js";
import { glob } from "glob";
import * as fs from "fs/promises";
import * as path from "path";
import {
  getProjectContext,
  ProjectContext,
} from "../context/projectContext.js";

const EXTENSIONS: Record<string, string[]> = {
  javascript: [".js", ".jsx", ".mjs"],
  typescript: [".ts", ".tsx", ".mts"],
  python: [".py"],
};

const TEST_PATTERNS: Record<string, string[]> = {
  javascript: [
    "**/*.test.js",
    "**/*.spec.js",
    "**/test/**/*.js",
    "**/__tests__/**/*.js",
  ],
  typescript: [
    "**/*.test.ts",
    "**/*.spec.ts",
    "**/test/**/*.ts",
    "**/__tests__/**/*.ts",
  ],
  python: ["**/test_*.py", "**/*_test.py", "**/tests/**/*.py"],
};

const DEFAULT_EXCLUDES = [
  "**/node_modules/**",
  "**/venv/**",
  "**/dist/**",
  "**/build/**",
];

interface FunctionInfo {
  name: string;
  file: string;
  line: number;
  params: string[];
  isAsync: boolean;
  isExported: boolean;
  complexity: number; // Simple cyclomatic complexity estimate
}

interface CoverageGap {
  type: "function" | "branch" | "errorHandler" | "edgeCase";
  name: string;
  file: string;
  line: number;
  reason: string;
  priority: "high" | "medium" | "low";
  suggestedTest?: string;
}

export const getTestCoverageGapsTool: ToolDefinition = {
  definition: {
    name: "get_test_coverage_gaps",
    description: `Identify functions and code paths that have no test coverage.
Unlike "generate tests", this tells you WHAT is not tested so you can prioritize.

Returns:
- untestedFunctions: functions with no corresponding test
- untestedBranches: if/else branches not covered
- missingEdgeCases: error handlers, null checks without tests
- priority: ranked by importance (exported functions, complex logic first)`,
    inputSchema: {
      type: "object",
      properties: {
        sourceDir: {
          type: "string",
          description: "Directory containing source files",
        },
        testDir: {
          type: "string",
          description:
            "Directory containing test files (auto-detected if not specified)",
        },
        language: {
          type: "string",
          enum: ["javascript", "typescript", "python"],
          description: "Programming language",
        },
        focusFile: {
          type: "string",
          description: "Specific file to analyze (optional)",
        },
      },
      required: ["sourceDir", "language"],
    },
  },

  async handler(args: any) {
    const startTime = Date.now();
    const { sourceDir, testDir, language, focusFile } = args;

    logger.info(`Analyzing test coverage gaps in: ${sourceDir}`);

    try {
      // Try to use shared project context
      let projectContext: ProjectContext | null = null;
      try {
        projectContext = await getProjectContext(sourceDir, {
          language: language === "all" ? "all" : language,
          includeTests: true, // Need tests for coverage analysis
        });
        logger.info(
          `Using shared context for coverage analysis (${projectContext.files.size} files)`
        );
      } catch (err) {
        logger.debug(`Could not use context: ${err}`);
      }

      // Find source files
      const sourceExtensions = EXTENSIONS[language] || EXTENSIONS.typescript;
      const sourcePatterns = sourceExtensions.map(
        (ext) => `${sourceDir}/**/*${ext}`
      );

      // Get exclude patterns adjusted for absolute paths
      const excludes = [
        ...DEFAULT_EXCLUDES,
        ...getExcludePatternsForPath(sourceDir),
        "**/*.test.*",
        "**/*.spec.*",
        "**/test/**",
        "**/__tests__/**",
      ];

      let sourceFiles = await glob(sourcePatterns, {
        ignore: excludes,
        nodir: true,
        absolute: true, // Use absolute paths for better ignore matching
      });

      // Additional filtering to catch any excluded directories that glob missed
      sourceFiles = filterExcludedFiles(sourceFiles);

      if (focusFile) {
        sourceFiles = sourceFiles.filter(
          (f) => f.includes(focusFile) || f.endsWith(focusFile)
        );
      }

      // Find test files
      const testPatterns = TEST_PATTERNS[language] || TEST_PATTERNS.typescript;
      const testSearchDir = testDir || sourceDir;
      const testExcludes = [
        ...DEFAULT_EXCLUDES,
        ...getExcludePatternsForPath(testSearchDir),
      ];

      let testFiles = await glob(
        testPatterns.map((p) => `${testSearchDir}/${p}`),
        {
          ignore: testExcludes,
          nodir: true,
          absolute: true, // Use absolute paths for better ignore matching
        }
      );

      // Additional filtering for test files
      testFiles = filterExcludedFiles(testFiles);

      // Extract all functions from source
      const allFunctions: FunctionInfo[] = [];
      for (const file of sourceFiles) {
        try {
          const content = await fs.readFile(file, "utf-8");
          const functions = extractFunctions(content, file, language);
          allFunctions.push(...functions);
        } catch (err) {
          // Skip unreadable files
        }
      }

      // Extract tested function names from test files
      const testedFunctions = new Set<string>();
      for (const testFile of testFiles) {
        try {
          const content = await fs.readFile(testFile, "utf-8");
          const tested = extractTestedFunctions(content, language);
          tested.forEach((t) => testedFunctions.add(t));
        } catch (err) {
          // Skip unreadable files
        }
      }

      // Find gaps
      const gaps: CoverageGap[] = [];

      // 1. Untested functions
      for (const func of allFunctions) {
        const isTested =
          testedFunctions.has(func.name) ||
          testedFunctions.has(`test_${func.name}`) ||
          testedFunctions.has(`test${capitalize(func.name)}`);

        if (!isTested) {
          gaps.push({
            type: "function",
            name: func.name,
            file: path.relative(sourceDir, func.file),
            line: func.line,
            reason:
              func.isExported ?
                "Exported function has no test"
              : "Internal function has no test",
            priority:
              func.isExported || func.complexity > 3 ? "high" : "medium",
            suggestedTest: generateTestSuggestion(func, language),
          });
        }
      }

      // 2. Find untested branches and edge cases
      for (const file of sourceFiles) {
        try {
          const content = await fs.readFile(file, "utf-8");
          const branchGaps = findUntestedBranches(
            content,
            file,
            sourceDir,
            testedFunctions,
            language
          );
          gaps.push(...branchGaps);
        } catch (err) {
          // Skip
        }
      }

      // Sort by priority
      gaps.sort((a, b) => {
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      });

      const elapsed = Date.now() - startTime;

      // Calculate coverage estimate - cap at 100%
      const untestedCount = gaps.filter((g) => g.type === "function").length;
      const testedCount = allFunctions.length - untestedCount;
      const coverageEstimate =
        allFunctions.length > 0 ?
          Math.min(100, Math.round((testedCount / allFunctions.length) * 100))
        : 0;

      return formatResponse({
        success: true,
        gaps: gaps.slice(0, 50), // Limit output
        summary: {
          totalFunctions: allFunctions.length,
          testedFunctions: testedCount,
          untestedFunctions: untestedCount,
          untestedBranches: gaps.filter((g) => g.type === "branch").length,
          missingEdgeCases: gaps.filter((g) => g.type === "edgeCase").length,
          coverageEstimate,
        },
        testFiles: {
          found: testFiles.length,
          paths: testFiles.map((f) => path.relative(sourceDir, f)),
        },
        stats: {
          sourceFiles: sourceFiles.length,
          analysisTime: `${elapsed}ms`,
        },
        recommendation: generateRecommendation(gaps, allFunctions.length),
      });
    } catch (error) {
      logger.error("Error analyzing test coverage:", error);
      return formatResponse({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
};

function extractFunctions(
  content: string,
  file: string,
  language: string
): FunctionInfo[] {
  const functions: FunctionInfo[] = [];
  const lines = content.split("\n");

  if (language === "javascript" || language === "typescript") {
    lines.forEach((line, idx) => {
      // function name()
      let match = line.match(
        /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)/
      );
      if (match) {
        functions.push({
          name: match[1],
          file,
          line: idx + 1,
          params: parseParams(match[2]),
          isAsync: line.includes("async"),
          isExported: line.includes("export"),
          complexity: estimateComplexity(content, idx),
        });
      }

      // const name = () => or const name = function
      match = line.match(
        /(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(?([^)=]*)\)?\s*=>/
      );
      if (match) {
        functions.push({
          name: match[1],
          file,
          line: idx + 1,
          params: parseParams(match[2]),
          isAsync: line.includes("async"),
          isExported: line.includes("export"),
          complexity: estimateComplexity(content, idx),
        });
      }

      // React forwardRef components: const Name = forwardRef((props, ref) => ...)
      match = line.match(
        /(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:React\.)?forwardRef\s*\(/
      );
      if (match) {
        functions.push({
          name: match[1],
          file,
          line: idx + 1,
          params: ["props", "ref"],
          isAsync: false,
          isExported: line.includes("export"),
          complexity: estimateComplexity(content, idx),
        });
      }

      // React memo components: const Name = memo((props) => ...)
      match = line.match(
        /(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:React\.)?memo\s*\(/
      );
      if (match) {
        functions.push({
          name: match[1],
          file,
          line: idx + 1,
          params: ["props"],
          isAsync: false,
          isExported: line.includes("export"),
          complexity: estimateComplexity(content, idx),
        });
      }

      // Class methods
      match = line.match(
        /^\s+(?:async\s+)?(\w+)\s*\(([^)]*)\)\s*(?::\s*\w+)?\s*{/
      );
      if (
        match &&
        !["if", "for", "while", "switch", "constructor"].includes(match[1])
      ) {
        functions.push({
          name: match[1],
          file,
          line: idx + 1,
          params: parseParams(match[2]),
          isAsync: line.includes("async"),
          isExported: false,
          complexity: estimateComplexity(content, idx),
        });
      }

      // React class components: class Name extends Component/PureComponent
      match = line.match(
        /(?:export\s+)?class\s+(\w+)\s+extends\s+(?:React\.)?(?:Component|PureComponent)/
      );
      if (match) {
        functions.push({
          name: match[1],
          file,
          line: idx + 1,
          params: ["props"],
          isAsync: false,
          isExported: line.includes("export"),
          complexity: estimateComplexity(content, idx),
        });
      }
    });
  } else if (language === "python") {
    lines.forEach((line, idx) => {
      const match = line.match(/^(?:async\s+)?def\s+(\w+)\s*\(([^)]*)\)/);
      if (match && !match[1].startsWith("_")) {
        functions.push({
          name: match[1],
          file,
          line: idx + 1,
          params: parseParams(match[2]),
          isAsync: line.includes("async"),
          isExported: !match[1].startsWith("_"),
          complexity: estimateComplexity(content, idx),
        });
      }
    });
  }

  return functions;
}

function parseParams(paramStr: string): string[] {
  if (!paramStr.trim()) return [];
  return paramStr
    .split(",")
    .map((p) => p.trim().split(":")[0].split("=")[0].trim())
    .filter((p) => p && p !== "self" && p !== "cls");
}

function estimateComplexity(content: string, startLine: number): number {
  const lines = content.split("\n").slice(startLine, startLine + 50);
  let complexity = 1;

  for (const line of lines) {
    if (/\b(if|else|elif|for|while|switch|case|catch|\?\s*:)\b/.test(line)) {
      complexity++;
    }
    if (/&&|\|\|/.test(line)) {
      complexity++;
    }
  }

  return complexity;
}

function extractTestedFunctions(content: string, language: string): string[] {
  const tested: string[] = [];

  if (language === "javascript" || language === "typescript") {
    // Jest/Mocha: describe('functionName', ...) or it('should test functionName', ...)
    const describes = content.matchAll(
      /(?:describe|it|test)\s*\(\s*['"`]([^'"`]+)['"`]/g
    );
    for (const match of describes) {
      // Extract function names from test descriptions
      const words = match[1].split(/\s+/);
      words.forEach((word) => {
        if (/^[a-z][a-zA-Z0-9]+$/.test(word) && word.length > 2) {
          tested.push(word);
        }
      });
    }

    // Direct function calls in tests
    const calls = content.matchAll(/(\w+)\s*\(/g);
    for (const match of calls) {
      if (
        ![
          "describe",
          "it",
          "test",
          "expect",
          "beforeEach",
          "afterEach",
          "jest",
        ].includes(match[1])
      ) {
        tested.push(match[1]);
      }
    }
  } else if (language === "python") {
    // pytest: def test_function_name or test_functionName
    const testFuncs = content.matchAll(/def\s+(test_?\w+)/g);
    for (const match of testFuncs) {
      const funcName = match[1].replace(/^test_?/, "").replace(/_/g, "");
      tested.push(funcName);
      tested.push(match[1].replace(/^test_?/, ""));
    }

    // Function calls in tests
    const calls = content.matchAll(/(\w+)\s*\(/g);
    for (const match of calls) {
      if (!["def", "class", "assert", "pytest", "mock"].includes(match[1])) {
        tested.push(match[1]);
      }
    }
  }

  return [...new Set(tested)];
}

function findUntestedBranches(
  content: string,
  file: string,
  sourceDir: string,
  testedFunctions: Set<string>,
  language: string
): CoverageGap[] {
  const gaps: CoverageGap[] = [];
  const lines = content.split("\n");

  lines.forEach((line, idx) => {
    // Error handlers
    if (/catch\s*\(|except\s+/.test(line)) {
      gaps.push({
        type: "errorHandler",
        name: `Error handler at line ${idx + 1}`,
        file: path.relative(sourceDir, file),
        line: idx + 1,
        reason: "Error handling code path may not be tested",
        priority: "medium",
      });
    }

    // Null/undefined checks
    if (
      /===?\s*null|===?\s*undefined|is\s+None|\?\?|!\w+\s*\)|==\s*null/.test(
        line
      )
    ) {
      gaps.push({
        type: "edgeCase",
        name: `Null check at line ${idx + 1}`,
        file: path.relative(sourceDir, file),
        line: idx + 1,
        reason: "Null/undefined edge case may not be tested",
        priority: "low",
      });
    }

    // Complex conditionals - any line with && or || in a conditional context
    if (
      /\bif\s*\([^)]*(?:&&|\|\|)[^)]*\)/.test(line) ||
      /&&.*&&|\|\|.*\|\||&&.*\|\||\|\|.*&&/.test(line)
    ) {
      gaps.push({
        type: "branch",
        name: `Complex condition at line ${idx + 1}`,
        file: path.relative(sourceDir, file),
        line: idx + 1,
        reason: "Complex conditional with multiple branches",
        priority: "medium",
      });
    }
  });

  return gaps.slice(0, 10); // Limit per file
}

function generateTestSuggestion(func: FunctionInfo, language: string): string {
  const params = func.params.join(", ");

  if (language === "python") {
    return `def test_${func.name}():\n    result = ${func.name}(${params || "# add args"})\n    assert result is not None`;
  }

  return `test('${func.name} should work correctly', () => {\n  const result = ${func.name}(${params || "/* add args */"});\n  expect(result).toBeDefined();\n});`;
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function generateRecommendation(
  gaps: CoverageGap[],
  totalFunctions: number
): string {
  const highPriority = gaps.filter((g) => g.priority === "high").length;
  const untestedFuncs = gaps.filter((g) => g.type === "function").length;

  if (untestedFuncs === 0) {
    return "✅ All functions appear to have tests. Consider adding edge case tests.";
  }

  if (highPriority > 5) {
    return `⚠️ ${highPriority} high-priority functions need tests. Focus on exported functions first.`;
  }

  const coverage = Math.round(
    ((totalFunctions - untestedFuncs) / totalFunctions) * 100
  );
  return `📊 Estimated ${coverage}% function coverage. Add tests for ${untestedFuncs} untested functions.`;
}

function formatResponse(data: any) {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };
}
