/**
 * Prevent Hallucinations Tool
 * 
 * WINNING FEATURE: Detect and prevent AI hallucinations during long coding sessions
 * Addresses the "70% wall" where AI references non-existent functions, wrong imports, etc.
 */

import { ToolDefinition } from '../types/tools.js';
import { buildSymbolTable } from '../analyzers/symbolTable.js';
import { validateReferences } from '../analyzers/referenceValidator.js';
import { checkTypeConsistency } from '../analyzers/typeChecker.js';
import { detectContradictions } from '../analyzers/contradictionDetector.js';
import { validateImports } from '../analyzers/importValidator.js';
import { logger } from '../utils/logger.js';
import { promises as fs } from 'fs';
import { promisify } from 'util';
import { exec } from 'child_process';
const execPromise = promisify(exec);

export const preventHallucinationsTool: ToolDefinition = {
  definition: {
    name: 'prevent_hallucinations',
    description: 'Detect and prevent AI hallucinations in generated code by validating references, imports, types, and logic consistency',
    inputSchema: {
      type: 'object',
      properties: {
        codebase: {
          type: 'string',
          description: 'Current state of the codebase to validate against',
        },
        newCode: {
          type: 'string',
          description: 'AI-generated code to validate for hallucinations',
        },
        language: {
          type: 'string',
          enum: ['javascript', 'typescript', 'python', 'go', 'java'],
          description: 'Programming language of the code',
        },
        sessionHistory: {
          type: 'array',
          description: 'Previous AI generations in this session (optional)',
          items: {
            type: 'object',
            properties: {
              timestamp: { type: 'string' },
              code: { type: 'string' },
              context: { type: 'string' },
            },
          },
        },
        options: {
          type: 'object',
          properties: {
            checkNonExistentReferences: { type: 'boolean' },
            checkImportConsistency: { type: 'boolean' },
            checkTypeConsistency: { type: 'boolean' },
            checkLogicContradictions: { type: 'boolean' },
            checkParameterMismatches: { type: 'boolean' },
            checkReturnValueConsistency: { type: 'boolean' },
          },
        },
      },
      required: ['codebase', 'newCode', 'language'],
    },
  },

  async handler(args: any) {
    const startTime = Date.now();
    logger.info('Starting hallucination detection...');

    const {
      codebase,
      newCode,
      language,
      sessionHistory = [],
      options = {},
    } = args;

    // Default options
    const opts = {
      checkNonExistentReferences: true,
      checkImportConsistency: true,
      checkTypeConsistency: true,
      checkLogicContradictions: true,
      checkParameterMismatches: true,
      checkReturnValueConsistency: true,
      ...options,
    };

    try {
      // Step 1: Build symbol table from codebase
      logger.debug('Building symbol table from existing codebase...');
      const existingSymbols = await buildSymbolTable(codebase, language);

      // Step 1.5: Build symbol table from new code to avoid false positives
      logger.debug('Building symbol table from new code...');
      const newSymbols = await buildSymbolTable(newCode, language);

      // Combine symbol tables (new code symbols + existing symbols)
      const symbolTable = {
        functions: [...new Set([...existingSymbols.functions, ...newSymbols.functions])],
        classes: [...new Set([...existingSymbols.classes, ...newSymbols.classes])],
        interfaces: [...new Set([...(existingSymbols.interfaces || []), ...(newSymbols.interfaces || [])])],
        variables: [...new Set([...existingSymbols.variables, ...newSymbols.variables])],
        imports: [...new Set([...existingSymbols.imports, ...newSymbols.imports])],
        dependencies: [...new Set([...(existingSymbols.dependencies || []), ...(newSymbols.dependencies || [])])],
      };

      logger.debug(`Combined symbol table: ${symbolTable.functions.length} functions, ${symbolTable.classes.length} classes`);

      // Step 2: Validate references in new code
      logger.debug('Validating references...');
      const referenceIssues = opts.checkNonExistentReferences
        ? await validateReferences(newCode, symbolTable, language)
        : [];

      // Step 2.5: Validate imports (unused import detection)
      logger.debug('Validating imports...');
      const importIssues = opts.checkImportConsistency
        ? await validateImports(newCode, language)
        : [];

      // Step 3: Check type consistency
      logger.debug('Checking type consistency...');
      const typeIssues = opts.checkTypeConsistency
        ? await checkTypeConsistency(newCode, symbolTable, language)
        : [];

      // Step 4: Detect logic contradictions
      logger.debug('Detecting contradictions...');
      const contradictionIssues = opts.checkLogicContradictions
        ? await detectContradictions(newCode, sessionHistory, language)
        : [];

      // Combine all issues
      const allIssues = [
        ...referenceIssues,
        ...importIssues,
        ...typeIssues,
        ...contradictionIssues,
      ];

      // Additional static analysis for Python
      if (language === 'python') {
        let tempPath;
        try {
          tempPath = `/tmp/halluc_${Date.now()}.py`;
          await fs.writeFile(tempPath, newCode);

          // Run Pylint
          const { stdout: pylintOut } = await execPromise(`PYTHONPATH=src pylint --disable=C0114,C0115,C0116,W0613,W0612,R0903,C0303 --msg-template="{line}:{msg_id}:{msg}" -sn -rn ${tempPath}`);
          const pylintIssues = pylintOut.split('\n').filter(line => line.trim()).map(line => {
            const parts = line.split(':');
            if (parts.length < 3) return null;
            const [lineNum, id, ...msgParts] = parts;
            const msg = msgParts.join(':').trim();
            return {
              type: 'pylint',
              severity: (id.startsWith('E') ? 'critical' : 'medium') as 'critical' | 'high' | 'medium' | 'low',
              message: msg,
              line: parseInt(lineNum.trim()),
              column: 0,
              confidence: 95,
            };
          }).filter(issue => issue !== null);
          allIssues.push(...pylintIssues);

          // Run mypy
          const { stdout: mypyOut } = await execPromise(`mypy --show-error-codes --no-color-output --no-error-summary ${tempPath}`);
          const mypyIssues = mypyOut.split('\n').filter(line => line.trim()).map(line => {
            const parts = line.split(':');
            if (parts.length < 3) return null;
            const [ , lineNum, ...msgParts] = parts; // file is first, ignore since temp
            const msg = msgParts.join(':').trim();
            return {
              type: 'mypy',
              severity: 'high' as 'critical' | 'high' | 'medium' | 'low',
              message: msg,
              line: parseInt(lineNum.trim()),
              column: 0,
              confidence: 90,
            };
          }).filter(issue => issue !== null);
          allIssues.push(...mypyIssues);
        } catch (err) {
          logger.error('Static analysis check failed:', err);
        } finally {
          if (tempPath) {
            await fs.unlink(tempPath).catch(() => {});
          }
        }
      }

      // Calculate hallucination score (0-100, higher = more hallucinations)
      const hallucinationScore = calculateHallucinationScore(allIssues, symbolTable);
      const hallucinationDetected = hallucinationScore > 30; // Threshold

      // Build consistency analysis
      const consistencyAnalysis = {
        namingConsistency: calculateNamingConsistency(allIssues),
        typeConsistency: calculateTypeConsistency(typeIssues, symbolTable),
        apiConsistency: calculateAPIConsistency(referenceIssues, symbolTable),
      };

      // Generate recommendation
      const recommendation = generateRecommendation(
        hallucinationScore,
        allIssues
      );

      // Build context summary
      const contextSummary = {
        totalFiles: 1, // Simplified for now
        totalFunctions: symbolTable.functions.length,
        totalClasses: symbolTable.classes.length,
        referencedFromAI: referenceIssues.length + typeIssues.length,
        matchedReferences: symbolTable.functions.length - referenceIssues.length,
        unmatchedReferences: referenceIssues.length,
      };

      const elapsedTime = Date.now() - startTime;
      logger.info(`Hallucination detection completed in ${elapsedTime}ms`);

      const result = {
        success: true,
        hallucinationScore,
        hallucinationDetected,
        issues: allIssues,
        symbolTable: {
          functions: symbolTable.functions,
          classes: symbolTable.classes,
          variables: symbolTable.variables,
          imports: symbolTable.imports,
          dependencies: symbolTable.dependencies || [],
        },
        consistencyAnalysis,
        recommendation,
        contextSummary,
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
      logger.error('Error in hallucination detection:', error);
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
 * Calculate overall hallucination score (0-100)
 */
function calculateHallucinationScore(issues: any[], symbolTable: any): number {
  if (issues.length === 0) return 0;

  const weights = {
    critical: 25,
    high: 15,
    medium: 8,
    low: 3,
  };

  let totalScore = 0;
  for (const issue of issues) {
    totalScore += weights[issue.severity as keyof typeof weights] || 5;
  }

  // Normalize to 0-100 scale (cap at 100)
  return Math.min(100, totalScore);
}

/**
 * Calculate naming consistency (0-100)
 */
function calculateNamingConsistency(issues: any[]): number {
  const namingIssues = issues.filter(
    (i) => i.type === 'inconsistentNaming'
  ).length;
  return Math.max(0, 100 - namingIssues * 10);
}

/**
 * Calculate type consistency (0-100)
 */
function calculateTypeConsistency(typeIssues: any[], symbolTable: any): number {
  if (symbolTable.functions.length === 0) return 100;
  const typeErrorRate = typeIssues.length / symbolTable.functions.length;
  return Math.max(0, 100 - typeErrorRate * 100);
}

/**
 * Calculate API consistency (0-100)
 */
function calculateAPIConsistency(referenceIssues: any[], symbolTable: any): number {
  if (symbolTable.functions.length === 0) return 100;
  const referenceErrorRate = referenceIssues.length / symbolTable.functions.length;
  return Math.max(0, 100 - referenceErrorRate * 100);
}

/**
 * Generate recommendation based on analysis
 */
function generateRecommendation(score: number, issues: any[]) {
  const criticalIssues = issues.filter((i) => i.severity === 'critical');
  const highIssues = issues.filter((i) => i.severity === 'high');

  if (criticalIssues.length > 0) {
    return {
      accept: false,
      requiresReview: true,
      riskLevel: 'critical' as const,
      action: `❌ DO NOT USE - ${criticalIssues.length} critical hallucination(s) detected. Fix all critical issues before proceeding.`,
    };
  }

  if (score > 50 || highIssues.length > 2) {
    return {
      accept: false,
      requiresReview: true,
      riskLevel: 'high' as const,
      action: `⚠️ HIGH RISK - ${issues.length} issue(s) detected. Manual review required before use.`,
    };
  }

  if (score > 30 || issues.length > 0) {
    return {
      accept: true,
      requiresReview: true,
      riskLevel: 'medium' as const,
      action: `⚡ REVIEW RECOMMENDED - ${issues.length} issue(s) detected. Code can be used with caution.`,
    };
  }

  return {
    accept: true,
    requiresReview: false,
    riskLevel: 'low' as const,
    action: '✅ SAFE TO USE - No hallucinations detected. Code appears consistent with codebase.',
  };
}
